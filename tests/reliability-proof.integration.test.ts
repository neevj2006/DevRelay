import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";
import { RetentionCleaner } from "../packages/execution/src/index.js";

let isolated: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolated = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolated.connectionString, { max: 4 });
});

afterAll(async () => {
  await client?.close();
  await isolated?.drop();
});

async function seedVolume() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  const serviceId = randomUUID();
  const monitorId = randomUUID();
  const setup = await client.pool.connect();
  try {
    await setup.query("BEGIN");
    await setup.query("INSERT INTO users (id,name,email) VALUES ($1,'Load Owner',$2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await setup.query(
      "INSERT INTO organizations (id,name,slug,owner_user_id) VALUES ($1,'Load Org',$2,$3)",
      [organizationId, `load-${organizationId}`, userId],
    );
    await setup.query(
      "INSERT INTO organization_memberships (organization_id,user_id,role) VALUES ($1,$2,'owner')",
      [organizationId, userId],
    );
    await setup.query("INSERT INTO services (id,organization_id,name) VALUES ($1,$2,'API')", [
      serviceId,
      organizationId,
    ]);
    await setup.query(
      `INSERT INTO monitors (id,organization_id,service_id,name,endpoint_url,status,next_due_at)
       VALUES ($1,$2,$3,'Health','https://example.test/health','active',now())`,
      [monitorId, organizationId, serviceId],
    );
    await setup.query("COMMIT");
  } catch (error) {
    await setup.query("ROLLBACK");
    throw error;
  } finally {
    setup.release();
  }
  await client.pool.query(
    `INSERT INTO expected_check_windows
       (organization_id,monitor_id,scheduled_at,status,completed_at)
     SELECT $1,$2,now() - value * interval '30 minutes','completed',now() - value * interval '30 minutes'
     FROM generate_series(1,6000) AS value`,
    [organizationId, monitorId],
  );
  await client.pool.query(
    `INSERT INTO check_results
       (organization_id,monitor_id,scheduled_at,outcome,started_at,finished_at,latency_milliseconds,
        http_status_code,region,evidence_code,evidence_summary)
     SELECT $1,$2,scheduled_at,'success',scheduled_at,completed_at,20,200,'load','http_response','HTTP 200'
     FROM expected_check_windows WHERE organization_id=$1 AND monitor_id=$2`,
    [organizationId, monitorId],
  );
  await client.pool.query(
    `INSERT INTO audit_events
       (organization_id,actor_type,action,target_type,source,correlation_id,idempotency_key,occurred_at)
     SELECT $1,'system','load.test','monitor','reliability-proof',value::text,'load:' || value,
            now() - value * interval '1 minute'
     FROM generate_series(1,2000) AS value`,
    [organizationId],
  );
  return { monitorId, organizationId };
}

describe("fault injection and representative load", () => {
  it("rolls back an in-flight write when a worker database connection is killed", async () => {
    const userId = randomUUID();
    const connection = await client.pool.connect();
    await connection.query("BEGIN");
    await connection.query(
      "INSERT INTO users (id,name,email) VALUES ($1,'Interrupted Worker',$2)",
      [userId, `${userId}@example.test`],
    );
    connection.release(true);

    const stored = await client.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE id=$1",
      [userId],
    );
    expect(stored.rows[0]?.count).toBe("0");
  });

  it("keeps recent-state and audit queries indexed and cleans retained volume without blocking", async () => {
    const ids = await seedVolume();
    await client.pool.query("ANALYZE check_results");
    await client.pool.query("ANALYZE audit_events");
    await client.pool.query("SET enable_seqscan=off");
    const recent = await client.pool.query(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
       SELECT * FROM check_results
       WHERE organization_id=$1 AND monitor_id=$2
       ORDER BY finished_at DESC NULLS LAST,id LIMIT 50`,
      [ids.organizationId, ids.monitorId],
    );
    const audit = await client.pool.query(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
       SELECT * FROM audit_events
       WHERE organization_id=$1
       ORDER BY occurred_at DESC NULLS LAST,id LIMIT 50`,
      [ids.organizationId],
    );
    const recentPlan = JSON.stringify(recent.rows[0]);
    const auditPlan = JSON.stringify(audit.rows[0]);
    expect(recentPlan).toContain("check_results_recent_monitor_idx");
    expect(auditPlan).toContain("audit_events_organization_timeline_idx");

    const startedAt = performance.now();
    const cleaned = await new RetentionCleaner(client, {
      checkResultDays: 90,
      deliveryAttemptDays: 90,
      tokenDays: 7,
    }).run(new Date());
    const durationMilliseconds = performance.now() - startedAt;
    expect(cleaned.deleted).toBeGreaterThan(1_000);
    expect(durationMilliseconds).toBeLessThan(5_000);
    const recentCount = await client.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM check_results WHERE organization_id=$1",
      [ids.organizationId],
    );
    expect(Number(recentCount.rows[0]?.count)).toBeLessThan(4_500);
  });
});
