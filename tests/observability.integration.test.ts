import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseService } from "../apps/api/src/database.service.js";
import { SystemHealthService } from "../apps/api/src/system-health.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolated: IsolatedTestDatabase;
let database: DatabaseService;
let client: ReturnType<typeof createDatabaseClient>;
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  process.env.QUEUE_ADAPTER = "bullmq";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  isolated = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  process.env.DATABASE_URL = isolated.connectionString;
  process.env.NODE_ENV = "test";
  database = new DatabaseService(isolated.connectionString);
  client = createDatabaseClient(isolated.connectionString);
});

afterAll(async () => {
  await database.onModuleDestroy();
  await client.close();
  await isolated.drop();
});

describe("dependency-aware self-monitoring", () => {
  it("surfaces a missing worker heartbeat and recovers without generating recursive incidents", async () => {
    const health = new SystemHealthService(database);
    const missing = await health.inspect();
    expect(missing.status).toBe("degraded");
    expect(missing.checks.worker.status).toBe("degraded");

    const now = new Date();
    await client.database.execute(sql`INSERT INTO worker_heartbeats
      (id,worker_key,deployment_mode,queue_adapter,started_at,heartbeat_at)
      VALUES (${randomUUID()},'observability-test','local','bullmq',${now},${now})`);
    const recovered = await health.inspect(now);
    expect(recovered.checks.database.status).toBe("ok");
    expect(recovered.checks.queue.status).toBe("ok");
    expect(recovered.checks.worker.status).toBe("ok");
    expect(recovered.status).toBe("ok");

    const incidents = await client.database.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM incidents`,
    );
    expect(incidents.rows[0]?.count).toBe(0);
  });
});
