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

describe("database foundation", () => {
  it("applies the migration journal to a new isolated database", async () => {
    const result = await client.database.execute<{ migrationTable: string | null }>(
      `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS "migrationTable"`,
    );

    expect(result.rows).toEqual([{ migrationTable: "drizzle.__drizzle_migrations" }]);
  });

  it("rolls back failed transaction work", async () => {
    await client.database.execute("CREATE TABLE transaction_probe (value integer NOT NULL)");

    await expect(
      runInTransaction(client.database, async (transaction) => {
        await transaction.execute("INSERT INTO transaction_probe (value) VALUES (1)");
        throw new Error("rollback probe");
      }),
    ).rejects.toThrow("rollback probe");

    const result = await client.database.execute<{ count: number }>(
      "SELECT count(*)::int AS count FROM transaction_probe",
    );
    expect(result.rows).toEqual([{ count: 0 }]);
  });
});
