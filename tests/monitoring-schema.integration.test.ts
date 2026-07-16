import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient, runInTransaction } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolatedDatabase: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolatedDatabase = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolatedDatabase.connectionString, { max: 2 });
});

afterAll(async () => {
  await client?.close();
  await isolatedDatabase?.drop();
});

async function createOrganization() {
  const userId = randomUUID();
  const organizationId = randomUUID();

  await runInTransaction(client.database, async (transaction) => {
    await transaction.execute(sql`
      INSERT INTO users (id, name, email)
      VALUES (${userId}, 'Monitoring Owner', ${`${userId}@example.test`})
    `);
    await transaction.execute(sql`
      INSERT INTO organizations (id, name, slug, owner_user_id)
      VALUES (
        ${organizationId}, 'Monitoring Organization', ${`monitoring-${organizationId}`}, ${userId}
      )
    `);
    await transaction.execute(sql`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (${organizationId}, ${userId}, 'owner')
    `);
  });

  return organizationId;
}

async function createService(organizationId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO services (organization_id, name)
    VALUES (${organizationId}, ${`API ${randomUUID()}`})
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createMonitor(organizationId: string, serviceId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO monitors (
      organization_id, service_id, name, endpoint_url, status, next_due_at
    ) VALUES (
      ${organizationId}, ${serviceId}, ${`HTTP ${randomUUID()}`},
      'https://example.test/health', 'active', now()
    )
    RETURNING id
  `);
  return result.rows[0]!.id;
}

describe("monitoring tenant boundaries", () => {
  it("adds explicit organization ownership to every tenant-owned monitoring table", async () => {
    const result = await client.database.execute<{ tableName: string }>(sql`
      SELECT table_name AS "tableName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'organization_id'
        AND table_name IN (
          'services', 'monitors', 'monitor_policies', 'expected_check_windows', 'check_results'
        )
      ORDER BY table_name
    `);

    expect(result.rows.map((row) => row.tableName)).toEqual([
      "check_results",
      "expected_check_windows",
      "monitor_policies",
      "monitors",
      "services",
    ]);
  });

  it("rejects a monitor that points to another organization's service", async () => {
    const firstOrganizationId = await createOrganization();
    const secondOrganizationId = await createOrganization();
    const firstServiceId = await createService(firstOrganizationId);

    await expect(
      client.database.execute(sql`
        INSERT INTO monitors (organization_id, service_id, name, endpoint_url)
        VALUES (
          ${secondOrganizationId}, ${firstServiceId}, 'Cross tenant', 'https://example.test'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});

describe("monitor policies and scheduling", () => {
  it("enforces bounded monitor policy values", async () => {
    const organizationId = await createOrganization();
    const serviceId = await createService(organizationId);
    const monitorId = await createMonitor(organizationId, serviceId);

    await expect(
      client.database.execute(sql`
        INSERT INTO monitor_policies (
          organization_id, monitor_id, interval_seconds, timeout_milliseconds
        ) VALUES (${organizationId}, ${monitorId}, 5, 1000)
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });

    await client.database.execute(sql`
      INSERT INTO monitor_policies (
        organization_id, monitor_id, interval_seconds, timeout_milliseconds
      ) VALUES (${organizationId}, ${monitorId}, 300, 5000)
    `);
  });

  it("deduplicates expected windows and logical check results", async () => {
    const organizationId = await createOrganization();
    const serviceId = await createService(organizationId);
    const monitorId = await createMonitor(organizationId, serviceId);
    const scheduledAt = new Date("2026-07-17T00:00:00.000Z");

    await client.database.execute(sql`
      INSERT INTO expected_check_windows (organization_id, monitor_id, scheduled_at)
      VALUES (${organizationId}, ${monitorId}, ${scheduledAt})
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO expected_check_windows (organization_id, monitor_id, scheduled_at)
        VALUES (${organizationId}, ${monitorId}, ${scheduledAt})
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await client.database.execute(sql`
      INSERT INTO check_results (
        organization_id, monitor_id, scheduled_at, outcome, started_at, finished_at,
        latency_milliseconds, http_status_code, region, evidence_code, evidence_summary
      ) VALUES (
        ${organizationId}, ${monitorId}, ${scheduledAt}, 'success',
        ${scheduledAt}, ${new Date(scheduledAt.getTime() + 120)}, 120, 204,
        'local', 'http_success', 'HTTP 204 in 120 ms'
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO check_results (
          organization_id, monitor_id, scheduled_at, outcome, started_at, finished_at,
          region, evidence_code, evidence_summary
        ) VALUES (
          ${organizationId}, ${monitorId}, ${scheduledAt}, 'failure',
          ${scheduledAt}, ${scheduledAt}, 'local', 'duplicate', 'Duplicate result'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("requires a matching expected window before storing a result", async () => {
    const organizationId = await createOrganization();
    const serviceId = await createService(organizationId);
    const monitorId = await createMonitor(organizationId, serviceId);
    const scheduledAt = new Date("2026-07-17T01:00:00.000Z");

    await expect(
      client.database.execute(sql`
        INSERT INTO check_results (
          organization_id, monitor_id, scheduled_at, outcome, started_at, finished_at,
          region, evidence_code, evidence_summary
        ) VALUES (
          ${organizationId}, ${monitorId}, ${scheduledAt}, 'execution_error',
          ${scheduledAt}, ${scheduledAt}, 'local', 'missing_window', 'Missing expected window'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("creates indexes for due monitors and recent results", async () => {
    const result = await client.database.execute<{ indexName: string }>(sql`
      SELECT indexname AS "indexName"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('monitors_due_idx', 'check_results_recent_monitor_idx')
      ORDER BY indexname
    `);

    expect(result.rows.map((row) => row.indexName)).toEqual([
      "check_results_recent_monitor_idx",
      "monitors_due_idx",
    ]);
  });
});

describe("worker heartbeats", () => {
  it("rejects a heartbeat earlier than the worker start time", async () => {
    await expect(
      client.database.execute(sql`
        INSERT INTO worker_heartbeats (
          worker_key, deployment_mode, queue_adapter, started_at, heartbeat_at
        ) VALUES (
          ${`worker-${randomUUID()}`}, 'local', 'bullmq',
          '2026-07-17T02:00:00Z', '2026-07-17T01:59:59Z'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
