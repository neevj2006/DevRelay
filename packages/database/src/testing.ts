import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { createDatabaseClient } from "./client.js";

const TEST_DATABASE_NAME_PATTERN = /^devrelay_test_[0-9a-f]{32}$/;
const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface IsolatedTestDatabase {
  connectionString: string;
  drop(): Promise<void>;
  name: string;
}

export interface TestDatabaseOptions {
  adminConnectionString?: string;
  migrationsFolder?: string;
}

export function createTestDatabaseName(): string {
  return `devrelay_test_${randomUUID().replaceAll("-", "")}`;
}

export function assertSafeTestDatabaseName(databaseName: string): void {
  if (!TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(`Refusing to manage unsafe test database name: ${databaseName}`);
  }
}

export async function createIsolatedTestDatabase(
  options: TestDatabaseOptions = {},
): Promise<IsolatedTestDatabase> {
  const sourceConnectionString =
    options.adminConnectionString ??
    process.env.TEST_DATABASE_ADMIN_URL ??
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL;

  if (sourceConnectionString === undefined) {
    throw new Error(
      "A test database connection is required via options, TEST_DATABASE_ADMIN_URL, TEST_DATABASE_URL, or DATABASE_URL.",
    );
  }

  assertSafeDatabaseServer(sourceConnectionString);

  const name = createTestDatabaseName();
  const adminConnectionString = replaceDatabaseName(sourceConnectionString, "postgres");
  const connectionString = replaceDatabaseName(sourceConnectionString, name);
  const admin = new Client({ connectionString: adminConnectionString });

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  } finally {
    await admin.end();
  }

  const databaseClient = createDatabaseClient(connectionString, { max: 1 });
  try {
    await migrate(databaseClient.database, {
      migrationsFolder: options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
    });
  } catch (error) {
    await databaseClient.close();
    await dropTestDatabase(adminConnectionString, name);
    throw error;
  }
  await databaseClient.close();

  return {
    connectionString,
    drop: () => dropTestDatabase(adminConnectionString, name),
    name,
  };
}

async function dropTestDatabase(
  adminConnectionString: string,
  databaseName: string,
): Promise<void> {
  assertSafeTestDatabaseName(databaseName);
  const admin = new Client({ connectionString: adminConnectionString });

  await admin.connect();
  try {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } finally {
    await admin.end();
  }
}

function assertSafeDatabaseServer(connectionString: string): void {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isExplicitTestDatabase = databaseName.endsWith("_test");

  if (!isLocal && !isExplicitTestDatabase) {
    throw new Error(
      "Test database utilities require a local server or a database ending in _test.",
    );
  }
}

function replaceDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
