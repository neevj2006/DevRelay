import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CheckOutcome, type PolicyEvaluationJob } from "../packages/contracts/src/index.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import { MonitoringFreshnessDetector, PolicyEngine } from "../packages/execution/src/index.js";
import {
  type EnqueueResult,
  type JobQueue,
  type QueueHealth,
} from "../packages/queue/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolatedDatabase: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

class HealthyQueue implements JobQueue {
  async cancel(): Promise<boolean> {
    return false;
  }
  async close(): Promise<void> {}
  async enqueue(): Promise<EnqueueResult> {
    return { accepted: true, jobId: "unused" };
  }
  async inspectHealth(): Promise<QueueHealth> {
    return {
      adapter: "bullmq",
      deadLettered: 0,
      delayed: 0,
      failed: 0,
      lagMilliseconds: 0,
      paused: false,
      pending: 0,
    };
  }
  schedule(): Promise<EnqueueResult> {
    return this.enqueue();
  }
}

beforeAll(async () => {
  isolatedDatabase = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolatedDatabase.connectionString, { max: 4 });
});

afterAll(async () => {
  await client?.close();
  await isolatedDatabase?.drop();
});

async function seedPolicy(
  options: { failureImpact?: string; failureThreshold?: number; recoveryThreshold?: number } = {},
) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  const serviceId = randomUUID();
  const monitorId = randomUUID();
  await client.database.transaction(async (transaction) => {
    await transaction.execute(
      sql`INSERT INTO users (id, name, email) VALUES (${userId}, 'Policy Owner', ${`${userId}@example.test`})`,
    );
    await transaction.execute(
      sql`INSERT INTO organizations (id, name, slug, owner_user_id) VALUES (${organizationId}, 'Policy Org', ${`policy-${organizationId}`}, ${userId})`,
    );
    await transaction.execute(
      sql`INSERT INTO organization_memberships (organization_id, user_id, role) VALUES (${organizationId}, ${userId}, 'owner')`,
    );
    await transaction.execute(
      sql`INSERT INTO services (id, organization_id, name) VALUES (${serviceId}, ${organizationId}, 'API')`,
    );
    await transaction.execute(sql`INSERT INTO monitors (id, organization_id, service_id, name, endpoint_url, status, next_due_at)
      VALUES (${monitorId}, ${organizationId}, ${serviceId}, 'Health', 'https://example.test', 'active', now())`);
    await transaction.execute(sql`INSERT INTO monitor_policies
      (organization_id, monitor_id, interval_seconds, timeout_milliseconds, failure_threshold, recovery_threshold, failure_impact)
      VALUES (${organizationId}, ${monitorId}, 300, 5000, ${options.failureThreshold ?? 3}, ${options.recoveryThreshold ?? 2}, ${options.failureImpact ?? "major_outage"})`);
  });
  return { monitorId, organizationId, serviceId, userId };
}

async function addResult(
  ids: Awaited<ReturnType<typeof seedPolicy>>,
  scheduledAt: Date,
  outcome: CheckOutcome,
) {
  await client.database.execute(sql`INSERT INTO expected_check_windows
    (organization_id, monitor_id, scheduled_at, status, completed_at)
    VALUES (${ids.organizationId}, ${ids.monitorId}, ${scheduledAt}, 'completed', ${scheduledAt})`);
  await client.database.execute(sql`INSERT INTO check_results
    (organization_id, monitor_id, scheduled_at, outcome, started_at, finished_at, latency_milliseconds,
     http_status_code, region, evidence_code, evidence_summary)
    VALUES (${ids.organizationId}, ${ids.monitorId}, ${scheduledAt}, ${outcome}, ${scheduledAt}, ${scheduledAt}, 10,
      ${outcome === "success" ? 200 : null}, 'test', ${outcome}, ${`Result ${outcome}`})`);
  const job: PolicyEvaluationJob = {
    correlationId: `policy-${scheduledAt.toISOString()}`,
    createdAt: scheduledAt.toISOString(),
    id: `policy:${ids.monitorId}:${scheduledAt.toISOString()}`,
    name: "policy.evaluate",
    organizationId: ids.organizationId,
    payload: { monitorId: ids.monitorId, scheduledAt: scheduledAt.toISOString() },
    version: 1,
  };
  return job;
}

async function serviceState(serviceId: string) {
  const result = await client.database.execute<{
    currentState: string;
    evidenceState: string;
  }>(
    sql`SELECT current_state AS "currentState", evidence_state AS "evidenceState" FROM services WHERE id = ${serviceId}`,
  );
  return result.rows[0]!;
}

describe("policy thresholds and service health", () => {
  it("keeps transient failures operational, confirms outage, and confirms recovery", async () => {
    const ids = await seedPolicy();
    const engine = new PolicyEngine(client);
    const base = new Date("2026-07-17T10:00:00Z");
    await engine.evaluate(await addResult(ids, base, "success"), new Date(base.getTime() + 1_000));
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "unknown",
      evidenceState: "unknown",
    });
    const secondSuccess = new Date(base.getTime() + 300_000);
    await engine.evaluate(
      await addResult(ids, secondSuccess, "success"),
      new Date(secondSuccess.getTime() + 1_000),
    );
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "operational",
      evidenceState: "operational",
    });

    for (let index = 1; index <= 2; index += 1) {
      const at = new Date(secondSuccess.getTime() + index * 300_000);
      await engine.evaluate(await addResult(ids, at, "failure"), new Date(at.getTime() + 1_000));
      expect((await serviceState(ids.serviceId)).currentState).toBe("operational");
    }
    const outageAt = new Date(secondSuccess.getTime() + 900_000);
    await engine.evaluate(
      await addResult(ids, outageAt, "timeout"),
      new Date(outageAt.getTime() + 1_000),
    );
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "major_outage",
      evidenceState: "major_outage",
    });

    const recoveryOne = new Date(outageAt.getTime() + 300_000);
    await engine.evaluate(
      await addResult(ids, recoveryOne, "success"),
      new Date(recoveryOne.getTime() + 1_000),
    );
    expect((await serviceState(ids.serviceId)).currentState).toBe("major_outage");
    const recoveryTwo = new Date(recoveryOne.getTime() + 300_000);
    await engine.evaluate(
      await addResult(ids, recoveryTwo, "success"),
      new Date(recoveryTwo.getTime() + 1_000),
    );
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "operational",
      evidenceState: "operational",
    });
  });

  it("ignores duplicates and out-of-order evaluation and treats safety rejection as unknown", async () => {
    const ids = await seedPolicy({ failureThreshold: 1, recoveryThreshold: 1 });
    const engine = new PolicyEngine(client);
    const firstAt = new Date("2026-07-17T11:00:00Z");
    const first = await addResult(ids, firstAt, "success");
    await engine.evaluate(first, new Date(firstAt.getTime() + 1_000));
    await engine.evaluate(first, new Date(firstAt.getTime() + 2_000));
    const laterAt = new Date(firstAt.getTime() + 300_000);
    await engine.evaluate(
      await addResult(ids, laterAt, "rejected_target"),
      new Date(laterAt.getTime() + 1_000),
    );
    await expect(engine.evaluate(first, new Date(laterAt.getTime() + 2_000))).resolves.toEqual({
      ignored: true,
      reason: "out_of_order",
    });
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "unknown",
      evidenceState: "unknown",
    });
    const counts = await client.database.execute<{ evaluations: string; transitions: string }>(sql`
      SELECT (SELECT count(*)::text FROM monitor_policy_evaluations WHERE monitor_id = ${ids.monitorId}) AS evaluations,
        (SELECT count(*)::text FROM service_state_transitions WHERE service_id = ${ids.serviceId}) AS transitions
    `);
    expect(counts.rows[0]).toEqual({ evaluations: "1", transitions: "2" });
  });

  it("keeps underlying evidence during maintenance and exposes maintenance presentation", async () => {
    const ids = await seedPolicy({ failureThreshold: 1, recoveryThreshold: 1 });
    const windowId = randomUUID();
    await client.database.transaction(async (transaction) => {
      await transaction.execute(sql`INSERT INTO maintenance_windows
        (id, organization_id, title, starts_at, ends_at, created_by_user_id)
        VALUES (${windowId}, ${ids.organizationId}, 'Deploy', '2026-07-17T11:55:00Z', '2026-07-17T12:30:00Z', ${ids.userId})`);
      await transaction.execute(sql`INSERT INTO maintenance_window_services
        (organization_id, maintenance_window_id, service_id) VALUES (${ids.organizationId}, ${windowId}, ${ids.serviceId})`);
    });
    const at = new Date("2026-07-17T12:00:00Z");
    await new PolicyEngine(client).evaluate(
      await addResult(ids, at, "failure"),
      new Date(at.getTime() + 1_000),
    );
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "under_maintenance",
      evidenceState: "major_outage",
    });
  });

  it("maps confirmed monitor impact to degraded and partial outage service states", async () => {
    for (const impact of ["degraded_performance", "partial_outage"] as const) {
      const ids = await seedPolicy({
        failureImpact: impact,
        failureThreshold: 1,
        recoveryThreshold: 1,
      });
      const at = new Date(
        impact === "degraded_performance" ? "2026-07-17T12:40:00Z" : "2026-07-17T12:45:00Z",
      );
      await new PolicyEngine(client).evaluate(
        await addResult(ids, at, "failure"),
        new Date(at.getTime() + 1_000),
      );
      expect(await serviceState(ids.serviceId)).toEqual({
        currentState: impact,
        evidenceState: impact,
      });
    }
  });

  it("does not advance policy state for a paused monitor", async () => {
    const ids = await seedPolicy({ failureThreshold: 1, recoveryThreshold: 1 });
    await client.database.execute(
      sql`UPDATE monitors SET status = 'paused', paused_at = now(), next_due_at = NULL WHERE id = ${ids.monitorId}`,
    );
    const at = new Date("2026-07-17T12:50:00Z");
    const result = await new PolicyEngine(client).evaluate(
      await addResult(ids, at, "failure"),
      new Date(at.getTime() + 1_000),
    );
    expect(result).toMatchObject({ monitorState: "unknown" });
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "unknown",
      evidenceState: "unknown",
    });
  });

  it("marks stale or missed evidence unknown and emits a deduplicated operational alert", async () => {
    const ids = await seedPolicy({ recoveryThreshold: 1 });
    const at = new Date("2026-07-17T13:00:00Z");
    await new PolicyEngine(client).evaluate(
      await addResult(ids, at, "success"),
      new Date(at.getTime() + 1_000),
    );
    const detector = new MonitoringFreshnessDetector(client, new HealthyQueue());
    const staleAt = new Date(at.getTime() + 500_000);
    const inspection = await detector.inspect(staleAt);
    expect(inspection.affectedServices).toBeGreaterThanOrEqual(1);
    expect(inspection.workerStale).toBe(true);
    await detector.inspect(new Date(staleAt.getTime() + 1_000));
    expect(await serviceState(ids.serviceId)).toEqual({
      currentState: "unknown",
      evidenceState: "unknown",
    });
    const alerts = await client.database.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM audit_events
      WHERE organization_id = ${ids.organizationId} AND action = 'system.monitoring_evidence_stale'
    `);
    expect(alerts.rows[0]?.count).toBe("1");
  });
});
