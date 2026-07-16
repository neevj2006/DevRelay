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
      VALUES (${userId}, 'Incident Owner', ${`${userId}@example.test`})
    `);
    await transaction.execute(sql`
      INSERT INTO organizations (id, name, slug, owner_user_id)
      VALUES (${organizationId}, 'Incident Organization', ${`incident-${organizationId}`}, ${userId})
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
    VALUES (${organizationId}, ${`Incident Service ${randomUUID()}`})
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createManualIncident(organizationId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO incidents (
      organization_id, slug, title, source, severity, lifecycle,
      creation_idempotency_key, started_at
    ) VALUES (
      ${organizationId}, ${`incident-${randomUUID()}`}, 'Investigating elevated errors',
      'manual_responder', 'partial_outage', 'investigating', ${randomUUID()}, now()
    )
    RETURNING id
  `);
  return result.rows[0]!.id;
}

describe("automatic incident uniqueness", () => {
  it("permits one active automatic incident per organization and fingerprint", async () => {
    const { organizationId } = await createOrganization();
    const fingerprint = `monitor:${randomUUID()}`;
    const firstIncident = await client.database.execute<{ id: string }>(sql`
      INSERT INTO incidents (
        organization_id, slug, title, source, severity, lifecycle,
        automatic_fingerprint, creation_idempotency_key, started_at
      ) VALUES (
        ${organizationId}, ${`incident-${randomUUID()}`}, 'API unavailable',
        'automatic_monitor', 'major_outage', 'detected', ${fingerprint}, ${randomUUID()}, now()
      )
      RETURNING id
    `);

    await expect(
      client.database.execute(sql`
        INSERT INTO incidents (
          organization_id, slug, title, source, severity, lifecycle,
          automatic_fingerprint, creation_idempotency_key, started_at
        ) VALUES (
          ${organizationId}, ${`incident-${randomUUID()}`}, 'Duplicate API outage',
          'automatic_monitor', 'major_outage', 'detected', ${fingerprint}, ${randomUUID()}, now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await client.database.execute(sql`
      UPDATE incidents
      SET lifecycle = 'resolved', outcome = 'resolved', resolved_at = now(), updated_at = now()
      WHERE id = ${firstIncident.rows[0]!.id}
    `);
    await client.database.execute(sql`
      INSERT INTO incidents (
        organization_id, slug, title, source, severity, lifecycle,
        automatic_fingerprint, creation_idempotency_key, started_at
      ) VALUES (
        ${organizationId}, ${`incident-${randomUUID()}`}, 'Later API outage',
        'automatic_monitor', 'major_outage', 'detected', ${fingerprint}, ${randomUUID()}, now()
      )
    `);
  });

  it("allows active maintenance-related incidents and requires canonical duplicate targets", async () => {
    const { organizationId } = await createOrganization();

    await client.database.execute(sql`
      INSERT INTO incidents (
        organization_id, slug, title, source, severity, lifecycle, outcome,
        creation_idempotency_key, started_at
      ) VALUES (
        ${organizationId}, ${`incident-${randomUUID()}`}, 'Maintenance impact',
        'maintenance', 'partial_outage', 'investigating', 'maintenance_related',
        ${randomUUID()}, now()
      )
    `);

    await expect(
      client.database.execute(sql`
        INSERT INTO incidents (
          organization_id, slug, title, source, severity, lifecycle, outcome,
          creation_idempotency_key, started_at, resolved_at
        ) VALUES (
          ${organizationId}, ${`incident-${randomUUID()}`}, 'Unlinked duplicate',
          'manual_responder', 'partial_outage', 'resolved', 'duplicate',
          ${randomUUID()}, now(), now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("deduplicates incident creation commands", async () => {
    const { organizationId } = await createOrganization();
    const idempotencyKey = randomUUID();

    await client.database.execute(sql`
      INSERT INTO incidents (
        organization_id, slug, title, source, severity, lifecycle,
        creation_idempotency_key, started_at
      ) VALUES (
        ${organizationId}, ${`incident-${randomUUID()}`}, 'First command',
        'manual_responder', 'degraded_performance', 'investigating', ${idempotencyKey}, now()
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO incidents (
          organization_id, slug, title, source, severity, lifecycle,
          creation_idempotency_key, started_at
        ) VALUES (
          ${organizationId}, ${`incident-${randomUUID()}`}, 'Retried command',
          'manual_responder', 'degraded_performance', 'investigating', ${idempotencyKey}, now()
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("incident tenant boundaries", () => {
  it("rejects cross-tenant service relationships", async () => {
    const first = await createOrganization();
    const second = await createOrganization();
    const incidentId = await createManualIncident(first.organizationId);
    const otherServiceId = await createService(second.organizationId);

    await expect(
      client.database.execute(sql`
        INSERT INTO incident_services (organization_id, incident_id, service_id, impact)
        VALUES (${first.organizationId}, ${incidentId}, ${otherServiceId}, 'partial_outage')
      `),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});

describe("incident timeline separation", () => {
  it("stores public updates and private responder notes in separate tables", async () => {
    const { organizationId, userId } = await createOrganization();
    const incidentId = await createManualIncident(organizationId);
    const privateBody = `private-${randomUUID()}`;
    const publicBody = `public-${randomUUID()}`;

    await client.database.execute(sql`
      INSERT INTO incident_public_updates (
        organization_id, incident_id, author_user_id, lifecycle, body,
        idempotency_key, published_at
      ) VALUES (
        ${organizationId}, ${incidentId}, ${userId}, 'investigating', ${publicBody},
        ${randomUUID()}, now()
      )
    `);
    await client.database.execute(sql`
      INSERT INTO incident_private_notes (
        organization_id, incident_id, author_user_id, body, idempotency_key
      ) VALUES (${organizationId}, ${incidentId}, ${userId}, ${privateBody}, ${randomUUID()})
    `);

    const publicRows = await client.database.execute<{ body: string }>(sql`
      SELECT body FROM incident_public_updates WHERE incident_id = ${incidentId}
    `);
    const privateRows = await client.database.execute<{ body: string }>(sql`
      SELECT body FROM incident_private_notes WHERE incident_id = ${incidentId}
    `);
    expect(publicRows.rows).toEqual([{ body: publicBody }]);
    expect(privateRows.rows).toEqual([{ body: privateBody }]);
    expect(publicRows.rows).not.toContainEqual({ body: privateBody });
  });

  it("deduplicates transitions and enforces actor identity", async () => {
    const { organizationId, userId } = await createOrganization();
    const incidentId = await createManualIncident(organizationId);
    const idempotencyKey = randomUUID();

    await client.database.execute(sql`
      INSERT INTO incident_transitions (
        organization_id, incident_id, from_lifecycle, to_lifecycle,
        actor_type, actor_user_id, reason, idempotency_key
      ) VALUES (
        ${organizationId}, ${incidentId}, 'investigating', 'identified',
        'user', ${userId}, 'Root cause identified', ${idempotencyKey}
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO incident_transitions (
          organization_id, incident_id, from_lifecycle, to_lifecycle,
          actor_type, actor_user_id, reason, idempotency_key
        ) VALUES (
          ${organizationId}, ${incidentId}, 'investigating', 'identified',
          'user', ${userId}, 'Retried transition', ${idempotencyKey}
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await expect(
      client.database.execute(sql`
        INSERT INTO incident_transitions (
          organization_id, incident_id, from_lifecycle, to_lifecycle,
          actor_type, reason, idempotency_key
        ) VALUES (
          ${organizationId}, ${incidentId}, 'investigating', 'monitoring',
          'user', 'Missing user identity', ${randomUUID()}
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
