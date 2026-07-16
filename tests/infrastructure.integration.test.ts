import { Client } from "pg";
import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";

const database = new Client({ connectionString: databaseUrl });
const redis = createClient({ url: redisUrl });

beforeAll(async () => {
  await database.connect();
  await redis.connect();
});

afterAll(async () => {
  await Promise.all([database.end(), redis.quit()]);
});

describe("local infrastructure", () => {
  it("connects to PostgreSQL", async () => {
    const result = await database.query<{ value: number }>("SELECT 1::int AS value");

    expect(result.rows).toEqual([{ value: 1 }]);
  });

  it("round-trips an isolated Redis value", async () => {
    const key = `devrelay:integration:${crypto.randomUUID()}`;

    await redis.set(key, "ready", { EX: 30 });
    expect(await redis.get(key)).toBe("ready");
    await redis.del(key);
  });
});
