import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  incidentLifecycleValues,
  organizationRoleValues,
  serviceStateValues,
} from "../packages/contracts/src/index.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
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

const tenantOwnedTables = [
  "api_keys",
  "audit_events",
  "check_results",
  "daily_availability_aggregates",
  "delivery_attempts",
  "expected_check_windows",
  "incident_private_notes",
  "incident_public_updates",
  "incident_services",
  "incident_transitions",
  "incidents",
  "maintenance_window_services",
  "maintenance_windows",
  "monitor_policies",
  "monitors",
  "notification_deliveries",
  "organization_invitations",
  "organization_memberships",
  "outbox_events",
  "postmortems",
  "retention_cleanup_runs",
  "services",
  "status_page_services",
  "status_pages",
  "subscriber_preferences",
  "subscriber_verification_tokens",
  "subscribers",
  "webhook_destinations",
] as const;

describe("Phase 2 schema completion", () => {
  it("gives every tenant-owned table explicit organization ownership", async () => {
    const result = await client.database.execute<{ tableName: string }>(`
      SELECT table_name AS "tableName"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organization_id'
      ORDER BY table_name
    `);

    expect(result.rows.map((row) => row.tableName)).toEqual(tenantOwnedTables);
  });

  it("uses the shared contract values for persisted enums", async () => {
    const enumValues = await client.database.execute<{ enumName: string; enumValue: string }>(`
      SELECT type.typname AS "enumName", enum.enumlabel AS "enumValue"
      FROM pg_type AS type
      JOIN pg_enum AS enum ON enum.enumtypid = type.oid
      WHERE type.typname IN ('organization_role', 'service_state', 'incident_lifecycle')
      ORDER BY type.typname, enum.enumsortorder
    `);

    const valuesByEnum = Object.groupBy(enumValues.rows, (row) => row.enumName);
    expect(valuesByEnum.organization_role?.map((row) => row.enumValue)).toEqual(
      organizationRoleValues,
    );
    expect(valuesByEnum.service_state?.map((row) => row.enumValue)).toEqual(serviceStateValues);
    expect(valuesByEnum.incident_lifecycle?.map((row) => row.enumValue)).toEqual(
      incidentLifecycleValues,
    );
  });
});
