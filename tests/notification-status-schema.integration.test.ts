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
      VALUES (${userId}, 'Notification Owner', ${`${userId}@example.test`})
    `);
    await transaction.execute(sql`
      INSERT INTO organizations (id, name, slug, owner_user_id)
      VALUES (${organizationId}, 'Notification Organization', ${`notify-${organizationId}`}, ${userId})
    `);
    await transaction.execute(sql`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (${organizationId}, ${userId}, 'owner')
    `);
  });

  return { organizationId, userId };
}

async function createStatusPage(organizationId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO status_pages (organization_id, slug, title)
    VALUES (${organizationId}, ${`status-${randomUUID()}`}, 'DevRelay Status')
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createService(organizationId: string) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO services (organization_id, name)
    VALUES (${organizationId}, ${`Status Service ${randomUUID()}`})
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createActiveSubscriber(organizationId: string, statusPageId: string) {
  const email = `${randomUUID()}@example.test`;
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO subscribers (
      organization_id, status_page_id, email, normalized_email, state,
      consented_at, verified_at
    ) VALUES (
      ${organizationId}, ${statusPageId}, ${email}, ${email}, 'active', now(), now()
    )
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createIncidentPublicUpdate(organizationId: string, userId: string) {
  const incident = await client.database.execute<{ id: string }>(sql`
    INSERT INTO incidents (
      organization_id, slug, title, public_title, source, severity, lifecycle,
      creation_idempotency_key, started_at
    ) VALUES (
      ${organizationId}, ${`incident-${randomUUID()}`}, 'API errors', 'API errors',
      'manual_responder', 'partial_outage', 'investigating', ${randomUUID()}, now()
    )
    RETURNING id
  `);
  const update = await client.database.execute<{ id: string }>(sql`
    INSERT INTO incident_public_updates (
      organization_id, incident_id, author_user_id, lifecycle, body,
      idempotency_key, published_at
    ) VALUES (
      ${organizationId}, ${incident.rows[0]!.id}, ${userId}, 'investigating',
      'We are investigating elevated errors.', ${randomUUID()}, now()
    )
    RETURNING id
  `);
  return update.rows[0]!.id;
}

describe("public status schema", () => {
  it("allows one active status page per organization", async () => {
    const { organizationId } = await createOrganization();
    await createStatusPage(organizationId);

    await expect(createStatusPage(organizationId)).rejects.toMatchObject({
      cause: { code: "23505" },
    });
  });

  it("rejects cross-tenant service ordering", async () => {
    const first = await createOrganization();
    const second = await createOrganization();
    const statusPageId = await createStatusPage(first.organizationId);
    const otherServiceId = await createService(second.organizationId);

    await expect(
      client.database.execute(sql`
        INSERT INTO status_page_services (
          organization_id, status_page_id, service_id, display_order
        ) VALUES (${first.organizationId}, ${statusPageId}, ${otherServiceId}, 0)
      `),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});

describe("subscriber lifecycle", () => {
  it("deduplicates normalized destinations and stores only hashed verification tokens", async () => {
    const { organizationId } = await createOrganization();
    const statusPageId = await createStatusPage(organizationId);
    const email = "subscriber@example.test";
    const subscriber = await client.database.execute<{ id: string }>(sql`
      INSERT INTO subscribers (
        organization_id, status_page_id, email, normalized_email, consented_at
      ) VALUES (${organizationId}, ${statusPageId}, 'Subscriber@Example.test', ${email}, now())
      RETURNING id
    `);

    await expect(
      client.database.execute(sql`
        INSERT INTO subscribers (
          organization_id, status_page_id, email, normalized_email, consented_at
        ) VALUES (${organizationId}, ${statusPageId}, ${email}, ${email}, now())
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    const tokenHash = `sha256:${"a".repeat(64)}`;
    await client.database.execute(sql`
      INSERT INTO subscriber_verification_tokens (
        organization_id, subscriber_id, purpose, token_hash, expires_at
      ) VALUES (${organizationId}, ${subscriber.rows[0]!.id}, 'verify', ${tokenHash}, now() + interval '1 day')
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO subscriber_verification_tokens (
          organization_id, subscriber_id, purpose, token_hash, expires_at
        ) VALUES (${organizationId}, ${subscriber.rows[0]!.id}, 'verify', ${tokenHash}, now() + interval '1 day')
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("deduplicates all-services subscriber preferences", async () => {
    const { organizationId } = await createOrganization();
    const statusPageId = await createStatusPage(organizationId);
    const subscriberId = await createActiveSubscriber(organizationId, statusPageId);

    await client.database.execute(sql`
      INSERT INTO subscriber_preferences (organization_id, subscriber_id)
      VALUES (${organizationId}, ${subscriberId})
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO subscriber_preferences (organization_id, subscriber_id)
        VALUES (${organizationId}, ${subscriberId})
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("notification delivery reliability", () => {
  it("creates one logical incident email delivery and unique numbered attempts", async () => {
    const { organizationId, userId } = await createOrganization();
    const statusPageId = await createStatusPage(organizationId);
    const subscriberId = await createActiveSubscriber(organizationId, statusPageId);
    const publicUpdateId = await createIncidentPublicUpdate(organizationId, userId);
    const delivery = await client.database.execute<{ id: string }>(sql`
      INSERT INTO notification_deliveries (
        organization_id, kind, channel, incident_public_update_id, subscriber_id,
        idempotency_key, safe_payload
      ) VALUES (
        ${organizationId}, 'incident_update', 'email', ${publicUpdateId}, ${subscriberId},
        ${randomUUID()}, '{"template":"incident-update"}'::jsonb
      )
      RETURNING id
    `);

    await expect(
      client.database.execute(sql`
        INSERT INTO notification_deliveries (
          organization_id, kind, channel, incident_public_update_id, subscriber_id,
          idempotency_key, safe_payload
        ) VALUES (
          ${organizationId}, 'incident_update', 'email', ${publicUpdateId}, ${subscriberId},
          ${randomUUID()}, '{}'::jsonb
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await client.database.execute(sql`
      INSERT INTO delivery_attempts (
        organization_id, delivery_id, attempt_number, status, started_at
      ) VALUES (${organizationId}, ${delivery.rows[0]!.id}, 1, 'started', now())
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO delivery_attempts (
          organization_id, delivery_id, attempt_number, status, started_at
        ) VALUES (${organizationId}, ${delivery.rows[0]!.id}, 1, 'started', now())
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("requires exactly one destination matching the selected channel", async () => {
    const { organizationId, userId } = await createOrganization();
    const publicUpdateId = await createIncidentPublicUpdate(organizationId, userId);

    await expect(
      client.database.execute(sql`
        INSERT INTO notification_deliveries (
          organization_id, kind, channel, incident_public_update_id,
          idempotency_key, safe_payload
        ) VALUES (
          ${organizationId}, 'incident_update', 'email', ${publicUpdateId},
          ${randomUUID()}, '{}'::jsonb
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});

describe("transactional outbox", () => {
  it("deduplicates events and requires complete lease evidence for claims", async () => {
    const { organizationId } = await createOrganization();
    const idempotencyKey = randomUUID();

    await client.database.execute(sql`
      INSERT INTO outbox_events (
        organization_id, aggregate_type, aggregate_id, event_type,
        payload, idempotency_key
      ) VALUES (
        ${organizationId}, 'incident', ${randomUUID()}, 'incident.public-update.created',
        '{}'::jsonb, ${idempotencyKey}
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO outbox_events (
          organization_id, aggregate_type, aggregate_id, event_type,
          payload, idempotency_key
        ) VALUES (
          ${organizationId}, 'incident', ${randomUUID()}, 'incident.public-update.created',
          '{}'::jsonb, ${idempotencyKey}
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await expect(
      client.database.execute(sql`
        INSERT INTO outbox_events (
          organization_id, aggregate_type, aggregate_id, event_type,
          payload, idempotency_key, status
        ) VALUES (
          ${organizationId}, 'incident', ${randomUUID()}, 'incident.created',
          '{}'::jsonb, ${randomUUID()}, 'claimed'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
