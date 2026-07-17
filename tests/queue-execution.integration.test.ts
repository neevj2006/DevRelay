import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type QueueJob } from "../packages/contracts/src/index.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  MonitorCheckExecutor,
  MonitorScheduler,
  OutboxDispatcher,
  updateWorkerHeartbeat,
  writeOutboxEvent,
} from "../packages/execution/src/index.js";
import {
  BullMqJobQueue,
  type EnqueueOptions,
  type EnqueueResult,
  type JobQueue,
  monitorWindowId,
  QStashJobQueue,
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

class MemoryQueue implements JobQueue {
  jobs: QueueJob[] = [];
  async cancel(): Promise<boolean> {
    return false;
  }
  async close(): Promise<void> {}
  async enqueue(job: QueueJob): Promise<EnqueueResult> {
    const duplicate = this.jobs.some((existing) => existing.id === job.id);
    if (!duplicate) this.jobs.push(job);
    return { accepted: !duplicate, jobId: job.id };
  }
  async inspectHealth(): Promise<QueueHealth> {
    return {
      adapter: "qstash",
      deadLettered: 0,
      delayed: 0,
      failed: 0,
      lagMilliseconds: 0,
      paused: false,
      pending: this.jobs.length,
    };
  }
  schedule(job: QueueJob, _runAt: Date, _options?: EnqueueOptions): Promise<EnqueueResult> {
    return this.enqueue(job);
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

async function seedMonitor() {
  const userId = randomUUID();
  const organizationId = randomUUID();
  const serviceId = randomUUID();
  const monitorId = randomUUID();
  await client.database.transaction(async (transaction) => {
    await transaction.execute(
      sql`INSERT INTO users (id, name, email) VALUES (${userId}, 'Queue Owner', ${`${userId}@example.test`})`,
    );
    await transaction.execute(
      sql`INSERT INTO organizations (id, name, slug, owner_user_id) VALUES (${organizationId}, 'Queue Org', ${`queue-${organizationId}`}, ${userId})`,
    );
    await transaction.execute(
      sql`INSERT INTO organization_memberships (organization_id, user_id, role) VALUES (${organizationId}, ${userId}, 'owner')`,
    );
    await transaction.execute(
      sql`INSERT INTO services (id, organization_id, name) VALUES (${serviceId}, ${organizationId}, 'API')`,
    );
    await transaction.execute(sql`INSERT INTO monitors (id, organization_id, service_id, name, endpoint_url, status, next_due_at)
        VALUES (${monitorId}, ${organizationId}, ${serviceId}, 'Health', 'https://example.test/health', 'active', '2026-07-17T12:00:00Z')`);
    await transaction.execute(sql`INSERT INTO monitor_policies (organization_id, monitor_id, interval_seconds, timeout_milliseconds, accepted_status_codes)
        VALUES (${organizationId}, ${monitorId}, 300, 5000, '[{"from":200,"to":299}]')`);
  });
  return { monitorId, organizationId, serviceId };
}

describe("scheduler and check execution", () => {
  it("records one expected window and one result under duplicate delivery", async () => {
    const ids = await seedMonitor();
    const queue = new MemoryQueue();
    const scheduler = new MonitorScheduler(client, queue, { deploymentMode: "local" });
    await expect(scheduler.dispatchDue(new Date("2026-07-17T12:00:01Z"))).resolves.toEqual({
      claimed: 1,
      paused: false,
    });
    await expect(scheduler.dispatchDue(new Date("2026-07-17T12:00:01Z"))).resolves.toEqual({
      claimed: 0,
      paused: false,
    });
    const checkJob = queue.jobs[0]!;
    const executor = new MonitorCheckExecutor(client, queue, "test-worker", "test", async () => ({
      code: "http_response",
      durationMilliseconds: 12,
      finalOrigin: "https://example.test",
      httpStatusCode: 204,
      ok: true,
      redirectCount: 0,
      summary: "Endpoint returned HTTP 204",
    }));
    await expect(executor.execute(checkJob)).resolves.toEqual({
      duplicate: false,
      outcome: "success",
    });
    await expect(executor.execute(checkJob)).resolves.toEqual({ duplicate: true });
    const counts = await client.database.execute<{ results: string; windows: string }>(sql`
      SELECT (SELECT count(*)::text FROM expected_check_windows WHERE monitor_id = ${ids.monitorId}) AS windows,
             (SELECT count(*)::text FROM check_results WHERE monitor_id = ${ids.monitorId}) AS results
    `);
    expect(counts.rows[0]).toEqual({ results: "1", windows: "1" });
    expect(queue.jobs.map((job) => job.name)).toEqual(["monitor.check", "policy.evaluate"]);
  });

  it("updates inspectable heartbeat and scheduler health", async () => {
    await updateWorkerHeartbeat(client, {
      deploymentMode: "local",
      queueAdapter: "bullmq",
      startedAt: new Date(),
      workerId: "test-worker",
    });
    const heartbeat = await client.database.execute<{ workerKey: string }>(
      sql`SELECT worker_key AS "workerKey" FROM worker_heartbeats WHERE worker_key = 'test-worker'`,
    );
    expect(heartbeat.rows[0]?.workerKey).toBe("test-worker");
    const health = await new MonitorScheduler(client, new MemoryQueue(), {
      deploymentMode: "local",
    }).inspectHealth();
    expect(health).toMatchObject({ paused: false });
  });

  it("honors hosted pause and daily free-tier controls", async () => {
    await seedMonitor();
    const queue = new MemoryQueue();
    const paused = new MonitorScheduler(client, queue, {
      deploymentMode: "hosted",
      paused: true,
    });
    await expect(paused.dispatchDue(new Date("2026-07-17T12:00:01Z"))).resolves.toEqual({
      claimed: 0,
      paused: true,
    });
    const usage = await client.database.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM expected_check_windows WHERE created_at >= date_trunc('day', now())`,
    );
    const scheduler = new MonitorScheduler(client, queue, {
      batchSize: 5,
      dailyMessageLimit: Number(usage.rows[0]!.count) + 1,
      deploymentMode: "hosted",
    });
    await expect(scheduler.dispatchDue(new Date("2026-07-17T12:00:01Z"))).resolves.toMatchObject({
      claimed: 1,
      paused: false,
    });
  });
});

describe("outbox dispatch", () => {
  it("claims, publishes idempotently, recovers state, and retains completed rows", async () => {
    const ids = await seedMonitor();
    await client.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`UPDATE services SET public_description = 'Updated' WHERE id = ${ids.serviceId}`,
      );
      await writeOutboxEvent(transaction, {
        aggregateId: ids.serviceId,
        aggregateType: "service",
        eventType: "service.updated",
        idempotencyKey: `service:${ids.serviceId}:updated`,
        organizationId: ids.organizationId,
        payload: { serviceId: ids.serviceId },
      });
    });
    const stored = await client.database.execute<{ id: string }>(
      sql`SELECT id FROM outbox_events WHERE organization_id = ${ids.organizationId}`,
    );
    const eventId = stored.rows[0]!.id;
    const queue = new MemoryQueue();
    const dispatcher = new OutboxDispatcher(client, queue, "outbox-test");
    const dispatchAt = new Date(Date.now() + 1_000);
    expect(await dispatcher.dispatch(25, dispatchAt)).toBe(1);
    expect(await dispatcher.dispatch(25, dispatchAt)).toBe(0);
    expect(queue.jobs).toHaveLength(1);
    await client.database.execute(
      sql`UPDATE outbox_events SET published_at = '2020-01-01' WHERE id = ${eventId}`,
    );
    expect(await dispatcher.retainCompleted(new Date("2021-01-01"))).toBe(1);
  });
});

describe("queue adapters", () => {
  it("finds a delayed BullMQ job after the queue client is restarted", async () => {
    const prefix = `restart-${randomUUID()}`;
    const connection = { url: process.env.TEST_REDIS_URL ?? "redis://localhost:6379" };
    const job: QueueJob = {
      correlationId: "restart",
      createdAt: new Date().toISOString(),
      id: `restart-${randomUUID()}`,
      name: "monitor.check",
      organizationId: randomUUID(),
      payload: {
        monitorId: randomUUID(),
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      },
      version: 1,
    };
    const firstClient = new BullMqJobQueue({ connection, prefix });
    const scheduled = await firstClient.schedule(job, new Date(Date.now() + 60_000));
    await firstClient.close();

    const restartedClient = new BullMqJobQueue({ connection, prefix });
    expect((await restartedClient.schedule(job, new Date(Date.now() + 60_000))).accepted).toBe(
      false,
    );
    expect((await restartedClient.inspectHealth()).delayed).toBe(1);
    expect(await restartedClient.cancel(scheduled.jobId)).toBe(true);
    await restartedClient.close();
  });

  const contract = (name: string, factory: () => JobQueue) => {
    it(`${name} satisfies idempotency, scheduling, health, cancellation, and shutdown`, async () => {
      const queue = factory();
      const monitorId = randomUUID();
      const scheduledAt = new Date(Date.now() + 60_000).toISOString();
      const job: QueueJob = {
        correlationId: "contract",
        createdAt: new Date().toISOString(),
        id: monitorWindowId(monitorId, scheduledAt),
        name: "monitor.check",
        organizationId: randomUUID(),
        payload: { monitorId, scheduledAt },
        version: 1,
      };
      const first = await queue.schedule(job, new Date(scheduledAt));
      expect(first.accepted).toBe(true);
      expect((await queue.schedule(job, new Date(scheduledAt))).accepted).toBe(false);
      expect((await queue.inspectHealth()).adapter).toBe(name);
      expect(await queue.cancel(first.jobId)).toBe(true);
      await expect(queue.close()).resolves.toBeUndefined();
    });
  };

  contract(
    "bullmq",
    () =>
      new BullMqJobQueue({
        connection: { url: process.env.TEST_REDIS_URL ?? "redis://localhost:6379" },
        prefix: `test-${randomUUID()}`,
      }),
  );
  contract(
    "qstash",
    () =>
      new QStashJobQueue({
        client: {
          messages: { delete: async () => undefined },
          publishJSON: async () => ({ messageId: randomUUID() }),
        },
        deliveryUrl: "https://example.test/jobs",
      }),
  );
});
