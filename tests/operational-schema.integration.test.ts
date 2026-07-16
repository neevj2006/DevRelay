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
      VALUES (${userId}, 'Operations Owner', ${`${userId}@example.test`})
    `);
    await transaction.execute(sql`
      INSERT INTO organizations (id, name, slug, owner_user_id)
      VALUES (${organizationId}, 'Operations Organization', ${`ops-${organizationId}`}, ${userId})
    `);
    await transaction.execute(sql`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (${organizationId}, ${userId}, 'owner')
    `);
  });

  return { organizationId, userId };
}

async function createService(organizationId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO services (organization_id, name)
    VALUES (${organizationId}, ${`Operations Service ${randomUUID()}`})
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createResolvedIncident(organizationId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO incidents (
      organization_id, slug, title, source, severity, lifecycle, outcome,
      creation_idempotency_key, started_at, resolved_at
    ) VALUES (
      ${organizationId}, ${`incident-${randomUUID()}`}, 'Resolved incident',
      'manual_responder', 'partial_outage', 'resolved', 'resolved',
      ${randomUUID()}, now() - interval '1 hour', now()
    )
    RETURNING id
  `);
  return result.rows[0]!.id;
}

describe("maintenance windows", () => {
  it("enforces time and tenant-safe service relationships", async () => {
    const first = await createOrganization();
    const second = await createOrganization();
    const otherServiceId = await createService(second.organizationId);
    const maintenance = await client.database.execute<{ id: string }>(sql`
      INSERT INTO maintenance_windows (
        organization_id, title, starts_at, ends_at, created_by_user_id
      ) VALUES (
        ${first.organizationId}, 'Database upgrade', now() + interval '1 day',
        now() + interval '2 days', ${first.userId}
      )
      RETURNING id
    `);

    await expect(
      client.database.execute(sql`
        INSERT INTO maintenance_window_services (
          organization_id, maintenance_window_id, service_id
        ) VALUES (${first.organizationId}, ${maintenance.rows[0]!.id}, ${otherServiceId})
      `),
    ).rejects.toMatchObject({ cause: { code: "23503" } });

    await expect(
      client.database.execute(sql`
        INSERT INTO maintenance_windows (
          organization_id, title, starts_at, ends_at, created_by_user_id
        ) VALUES (
          ${first.organizationId}, 'Invalid window', now() + interval '2 days',
          now() + interval '1 day', ${first.userId}
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});

describe("audit evidence", () => {
  it("deduplicates events and enforces actor identity", async () => {
    const { organizationId, userId } = await createOrganization();
    const idempotencyKey = randomUUID();

    await client.database.execute(sql`
      INSERT INTO audit_events (
        organization_id, actor_type, actor_user_id, action, target_type,
        source, correlation_id, idempotency_key, occurred_at
      ) VALUES (
        ${organizationId}, 'user', ${userId}, 'service.created', 'service',
        'api', ${randomUUID()}, ${idempotencyKey}, now()
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO audit_events (
          organization_id, actor_type, actor_user_id, action, target_type,
          source, correlation_id, idempotency_key, occurred_at
        ) VALUES (
          ${organizationId}, 'user', ${userId}, 'service.created', 'service',
          'api', ${randomUUID()}, ${idempotencyKey}, now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await expect(
      client.database.execute(sql`
        INSERT INTO audit_events (
          organization_id, actor_type, action, target_type,
          source, correlation_id, idempotency_key, occurred_at
        ) VALUES (
          ${organizationId}, 'user', 'service.updated', 'service',
          'api', ${randomUUID()}, ${randomUUID()}, now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});

describe("postmortems", () => {
  it("requires complete content before publication and one record per incident", async () => {
    const { organizationId, userId } = await createOrganization();
    const incidentId = await createResolvedIncident(organizationId);

    await expect(
      client.database.execute(sql`
        INSERT INTO postmortems (
          organization_id, incident_id, slug, status, summary,
          published_at, published_by_user_id
        ) VALUES (
          ${organizationId}, ${incidentId}, ${`postmortem-${randomUUID()}`}, 'published',
          'Summary only', now(), ${userId}
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });

    await client.database.execute(sql`
      INSERT INTO postmortems (organization_id, incident_id, slug)
      VALUES (${organizationId}, ${incidentId}, ${`postmortem-${randomUUID()}`})
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO postmortems (organization_id, incident_id, slug)
        VALUES (${organizationId}, ${incidentId}, ${`postmortem-${randomUUID()}`})
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("API key storage", () => {
  it("stores a unique hash and exposes no plaintext secret column", async () => {
    const { organizationId, userId } = await createOrganization();
    const secretHash = `sha256:${"b".repeat(64)}`;

    await client.database.execute(sql`
      INSERT INTO api_keys (
        organization_id, label, prefix, secret_hash, scopes, created_by_user_id
      ) VALUES (
        ${organizationId}, 'Automation', ${`dr_${randomUUID().slice(0, 12)}`},
        ${secretHash}, '["services:read"]'::jsonb, ${userId}
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO api_keys (
          organization_id, label, prefix, secret_hash, scopes, created_by_user_id
        ) VALUES (
          ${organizationId}, 'Duplicate', ${`dr_${randomUUID().slice(0, 12)}`},
          ${secretHash}, '["services:read"]'::jsonb, ${userId}
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    const columns = await client.database.execute<{ columnName: string }>(sql`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'api_keys'
    `);
    expect(columns.rows.map((row) => row.columnName)).toContain("secret_hash");
    expect(columns.rows.map((row) => row.columnName)).not.toContain("secret");
  });
});

describe("availability aggregates", () => {
  it("enforces internally consistent daily counts", async () => {
    const { organizationId } = await createOrganization();
    const serviceId = await createService(organizationId);

    await client.database.execute(sql`
      INSERT INTO daily_availability_aggregates (
        organization_id, service_id, day, expected_checks, completed_checks,
        successful_checks, failed_checks, missing_checks, availability_basis_points
      ) VALUES (${organizationId}, ${serviceId}, '2026-07-17', 10, 9, 8, 1, 1, 8000)
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO daily_availability_aggregates (
          organization_id, service_id, day, expected_checks, completed_checks,
          successful_checks, failed_checks, missing_checks
        ) VALUES (${organizationId}, ${serviceId}, '2026-07-18', 10, 9, 8, 0, 1)
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});

describe("retention cleanup tracking", () => {
  it("deduplicates cleanup work and requires completion evidence", async () => {
    const { organizationId } = await createOrganization();
    const idempotencyKey = randomUUID();

    await client.database.execute(sql`
      INSERT INTO retention_cleanup_runs (
        organization_id, resource, cutoff_at, status, idempotency_key, started_at
      ) VALUES (
        ${organizationId}, 'check_results', now() - interval '30 days',
        'running', ${idempotencyKey}, now()
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO retention_cleanup_runs (
          organization_id, resource, cutoff_at, status, idempotency_key, started_at
        ) VALUES (
          ${organizationId}, 'check_results', now() - interval '30 days',
          'running', ${idempotencyKey}, now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await expect(
      client.database.execute(sql`
        INSERT INTO retention_cleanup_runs (
          organization_id, resource, cutoff_at, status, idempotency_key, started_at
        ) VALUES (
          ${organizationId}, 'delivery_attempts', now() - interval '30 days',
          'succeeded', ${randomUUID()}, now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
