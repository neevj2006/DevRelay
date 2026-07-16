import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  close(): Promise<void>;
  database: Database;
  pool: Pool;
}

export function createDatabasePool(
  connection: string | PoolConfig,
  overrides: PoolConfig = {},
): Pool {
  const configuration =
    typeof connection === "string"
      ? { ...overrides, connectionString: connection }
      : { ...connection, ...overrides };

  return new Pool(configuration);
}

export function createDatabaseClient(
  connection: string | PoolConfig,
  overrides: PoolConfig = {},
): DatabaseClient {
  const pool = createDatabasePool(connection, overrides);
  const database = drizzle(pool, { schema });

  return {
    close: () => pool.end(),
    database,
    pool,
  };
}
