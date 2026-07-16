import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseService } from "../apps/api/src/database.service.js";
import { OrganizationService } from "../apps/api/src/organization.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolatedDatabase: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
let databaseService: DatabaseService;
let organizations: OrganizationService;

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolatedDatabase = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolatedDatabase.connectionString, { max: 3 });
  databaseService = new DatabaseService(isolatedDatabase.connectionString);
  organizations = new OrganizationService(databaseService);
});

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await client?.close();
  await isolatedDatabase?.drop();
});

async function createUser(email = `${randomUUID()}@example.test`) {
  const result = await client.database.execute<{ email: string; id: string }>(sql`
    INSERT INTO users (name, email, email_verified)
    VALUES ('Organization Test User', ${email}, true)
    RETURNING id, email
  `);
  return result.rows[0]!;
}

async function expectHttpStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error(`Expected HTTP status ${status}`);
  } catch (error) {
    expect(error).toHaveProperty("getStatus");
    expect((error as { getStatus(): number }).getStatus()).toBe(status);
  }
}

describe("organization lifecycle and authorization", () => {
  it("creates tenant ownership and immutable audit evidence atomically", async () => {
    const owner = await createUser();
    const slug = `audit-${randomUUID()}`;
    const organization = await organizations.create(owner.id, { name: "Audit Org", slug });

    expect(await organizations.listForUser(owner.id)).toEqual([
      expect.objectContaining({ id: organization.id, role: "owner", slug }),
    ]);
    const audit = await client.database.execute<{ action: string; actorUserId: string }>(sql`
      SELECT action, actor_user_id AS "actorUserId"
      FROM audit_events WHERE organization_id = ${organization.id}
    `);
    expect(audit.rows).toEqual([{ action: "organization.created", actorUserId: owner.id }]);
  });

  it("accepts an invitation once, for only the invited account", async () => {
    const owner = await createUser();
    const invited = await createUser();
    const wrongAccount = await createUser();
    const slug = `invite-${randomUUID()}`;
    await organizations.create(owner.id, { name: "Invitation Org", slug });
    const invitation = await organizations.invite(owner.id, slug, {
      email: invited.email,
      role: "member",
    });

    await expectHttpStatus(
      organizations.acceptInvitation(wrongAccount.id, wrongAccount.email, invitation.token),
      403,
    );
    await expect(
      organizations.acceptInvitation(invited.id, invited.email, invitation.token),
    ).resolves.toMatchObject({ role: "member" });
    const evidence = await client.database.execute<{
      action: string;
      safePayload: Record<string, unknown>;
      tokenHash: string;
    }>(sql`
      SELECT audit.action, audit.safe_payload AS "safePayload", invitation.token_hash AS "tokenHash"
      FROM organization_invitations AS invitation
      JOIN audit_events AS audit ON audit.organization_id = invitation.organization_id
      WHERE invitation.id = ${invitation.id}
      ORDER BY audit.occurred_at
    `);
    expect(evidence.rows.map((row) => row.action)).toEqual([
      "organization.created",
      "organization.invitation_created",
      "organization.invitation_accepted",
    ]);
    expect(evidence.rows[0]!.tokenHash).not.toBe(invitation.token);
    expect(JSON.stringify(evidence.rows.map((row) => row.safePayload))).not.toContain(
      invitation.token,
    );
    await expectHttpStatus(
      organizations.acceptInvitation(invited.id, invited.email, invitation.token),
      409,
    );
    await expectHttpStatus(organizations.update(invited.id, slug, { name: "Forbidden" }), 403);
  });

  it("revokes invitations without exposing reusable membership paths", async () => {
    const owner = await createUser();
    const invited = await createUser();
    const slug = `revoke-${randomUUID()}`;
    await organizations.create(owner.id, { name: "Revocation Org", slug });
    const invitation = await organizations.invite(owner.id, slug, {
      email: invited.email,
      role: "admin",
    });

    await organizations.revokeInvitation(owner.id, slug, invitation.id);
    await expectHttpStatus(
      organizations.acceptInvitation(invited.id, invited.email, invitation.token),
      409,
    );
  });

  it("protects ownership while supporting transfer, leave, and removal", async () => {
    const owner = await createUser();
    const successor = await createUser();
    const removable = await createUser();
    const slug = `transfer-${randomUUID()}`;
    await organizations.create(owner.id, { name: "Transfer Org", slug });

    const successorInvite = await organizations.invite(owner.id, slug, {
      email: successor.email,
      role: "admin",
    });
    await organizations.acceptInvitation(successor.id, successor.email, successorInvite.token);
    const removableInvite = await organizations.invite(owner.id, slug, {
      email: removable.email,
      role: "member",
    });
    await organizations.acceptInvitation(removable.id, removable.email, removableInvite.token);

    const memberships = await client.database.execute<{ id: string; userId: string }>(sql`
      SELECT id, user_id AS "userId" FROM organization_memberships
      WHERE organization_id = ${successorInvite.organizationId}
    `);
    const successorMembership = memberships.rows.find((row) => row.userId === successor.id)!;
    const removableMembership = memberships.rows.find((row) => row.userId === removable.id)!;

    await expectHttpStatus(organizations.leave(owner.id, slug), 409);
    await expectHttpStatus(
      organizations.transferOwnership(successor.id, slug, removableMembership.id),
      403,
    );
    await organizations.removeMember(owner.id, slug, removableMembership.id);
    await organizations.transferOwnership(owner.id, slug, successorMembership.id);
    await expect(organizations.leave(owner.id, slug)).resolves.toEqual({ left: true });
    await expectHttpStatus(organizations.leave(successor.id, slug), 409);
  });

  it("does not allow a tenant actor to target another tenant's resources", async () => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const memberB = await createUser();
    const slugA = `tenant-a-${randomUUID()}`;
    const slugB = `tenant-b-${randomUUID()}`;
    await organizations.create(ownerA.id, { name: "Tenant A", slug: slugA });
    await organizations.create(ownerB.id, { name: "Tenant B", slug: slugB });
    const invitation = await organizations.invite(ownerB.id, slugB, {
      email: memberB.email,
      role: "member",
    });
    await organizations.acceptInvitation(memberB.id, memberB.email, invitation.token);
    const membership = await client.database.execute<{ id: string }>(sql`
      SELECT id FROM organization_memberships
      WHERE organization_id = ${invitation.organizationId} AND user_id = ${memberB.id}
    `);

    await expectHttpStatus(
      organizations.removeMember(ownerA.id, slugA, membership.rows[0]!.id),
      404,
    );
    await expectHttpStatus(organizations.update(ownerA.id, slugB, { name: "Cross tenant" }), 404);
  });

  it("enforces the three-organization product limit", async () => {
    const owner = await createUser();
    for (let index = 0; index < 3; index += 1) {
      await organizations.create(owner.id, {
        name: `Limited Org ${index}`,
        slug: `limit-${index}-${randomUUID()}`,
      });
    }
    await expectHttpStatus(
      organizations.create(owner.id, { name: "Fourth Org", slug: `fourth-${randomUUID()}` }),
      409,
    );
  });
});
