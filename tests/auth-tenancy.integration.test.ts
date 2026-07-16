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

async function createUser(email = `${randomUUID()}@example.test`) {
  const result = await client.database.execute<{ id: string }>(sql`
    INSERT INTO users (name, email)
    VALUES ('Test User', ${email})
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function createOrganizationWithOwner(ownerUserId: string) {
  const organizationId = randomUUID();

  await runInTransaction(client.database, async (transaction) => {
    await transaction.execute(sql`
      INSERT INTO organizations (id, name, slug, owner_user_id)
      VALUES (${organizationId}, 'Acme Reliability', ${`acme-${organizationId}`}, ${ownerUserId})
    `);
    await transaction.execute(sql`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (${organizationId}, ${ownerUserId}, 'owner')
    `);
  });

  return organizationId;
}

describe("authentication schema", () => {
  it("enforces case-insensitive user email uniqueness", async () => {
    await createUser("Owner@Example.test");

    await expect(createUser("owner@example.test")).rejects.toMatchObject({
      cause: { code: "23505" },
    });
  });

  it("deduplicates session tokens and provider accounts", async () => {
    const userId = await createUser();
    const sessionToken = randomUUID();
    const accountId = randomUUID();

    await client.database.execute(sql`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (${userId}, ${sessionToken}, now() + interval '1 day')
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (${userId}, ${sessionToken}, now() + interval '1 day')
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await client.database.execute(sql`
      INSERT INTO accounts (user_id, account_id, provider_id)
      VALUES (${userId}, ${accountId}, 'github')
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO accounts (user_id, account_id, provider_id)
        VALUES (${userId}, ${accountId}, 'github')
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("organization ownership", () => {
  it("requires the designated owner to have the owner membership", async () => {
    const userId = await createUser();

    await expect(
      runInTransaction(client.database, async (transaction) => {
        await transaction.execute(sql`
          INSERT INTO organizations (name, slug, owner_user_id)
          VALUES ('Ownerless', ${`ownerless-${randomUUID()}`}, ${userId})
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("allows exactly one owner and prevents removing the designated owner role", async () => {
    const ownerUserId = await createUser();
    const secondUserId = await createUser();
    const organizationId = await createOrganizationWithOwner(ownerUserId);

    await expect(
      client.database.execute(sql`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES (${organizationId}, ${secondUserId}, 'owner')
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    await expect(
      runInTransaction(client.database, async (transaction) => {
        await transaction.execute(sql`
          UPDATE organization_memberships
          SET role = 'admin', updated_at = now()
          WHERE organization_id = ${organizationId} AND user_id = ${ownerUserId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });

    const result = await client.database.execute<{ role: string }>(sql`
      SELECT role
      FROM organization_memberships
      WHERE organization_id = ${organizationId} AND user_id = ${ownerUserId}
    `);
    expect(result.rows).toEqual([{ role: "owner" }]);
  });

  it("enforces case-insensitive organization slug uniqueness", async () => {
    const firstOwnerId = await createUser();
    const secondOwnerId = await createUser();
    const slug = `reliability-${randomUUID()}`;

    await runInTransaction(client.database, async (transaction) => {
      const firstOrganization = await transaction.execute<{ id: string }>(sql`
        INSERT INTO organizations (name, slug, owner_user_id)
        VALUES ('First', ${slug.toUpperCase()}, ${firstOwnerId})
        RETURNING id
      `);
      await transaction.execute(sql`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES (${firstOrganization.rows[0]!.id}, ${firstOwnerId}, 'owner')
      `);
    });

    await expect(
      runInTransaction(client.database, async (transaction) => {
        const secondOrganization = await transaction.execute<{ id: string }>(sql`
          INSERT INTO organizations (name, slug, owner_user_id)
          VALUES ('Second', ${slug.toLowerCase()}, ${secondOwnerId})
          RETURNING id
        `);
        await transaction.execute(sql`
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES (${secondOrganization.rows[0]!.id}, ${secondOwnerId}, 'owner')
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("organization invitations", () => {
  it("stores only token hashes and rejects owner invitations", async () => {
    const ownerUserId = await createUser();
    const organizationId = await createOrganizationWithOwner(ownerUserId);
    const tokenHash = `sha256:${randomUUID()}`;

    await expect(
      client.database.execute(sql`
        INSERT INTO organization_invitations (
          organization_id, email, role, token_hash, invited_by_user_id, expires_at
        ) VALUES (
          ${organizationId}, 'future-owner@example.test', 'owner', ${tokenHash},
          ${ownerUserId}, now() + interval '1 day'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });

    await client.database.execute(sql`
      INSERT INTO organization_invitations (
        organization_id, email, role, token_hash, invited_by_user_id, expires_at
      ) VALUES (
        ${organizationId}, 'member@example.test', 'member', ${tokenHash},
        ${ownerUserId}, now() + interval '1 day'
      )
    `);
    await expect(
      client.database.execute(sql`
        INSERT INTO organization_invitations (
          organization_id, email, role, token_hash, invited_by_user_id, expires_at
        ) VALUES (
          ${organizationId}, 'other@example.test', 'admin', ${tokenHash},
          ${ownerUserId}, now() + interval '1 day'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});
