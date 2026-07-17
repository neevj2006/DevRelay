import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { CreateOrganizationInput, OrganizationRole } from "@devrelay/contracts";
import type { DatabaseTransaction } from "@devrelay/database";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DatabaseService } from "./database.service.js";

type MembershipContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
};

type OrganizationMutation = {
  name?: string | undefined;
  slug?: string | undefined;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? databaseErrorCode(error.cause) : undefined;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listForUser(userId: string) {
    const result = await this.databaseService.database.execute<{
      id: string;
      name: string;
      role: OrganizationRole;
      slug: string;
    }>(sql`
      SELECT organization.id, organization.name, organization.slug, membership.role
      FROM organization_memberships AS membership
      JOIN organizations AS organization ON organization.id = membership.organization_id
      WHERE membership.user_id = ${userId} AND organization.deleted_at IS NULL
      ORDER BY lower(organization.name), organization.id
    `);
    return result.rows;
  }

  async create(userId: string, input: CreateOrganizationInput) {
    try {
      return await this.databaseService.database.transaction(async (transaction) => {
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
        const count = await transaction.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count
          FROM organization_memberships AS membership
          JOIN organizations AS organization ON organization.id = membership.organization_id
          WHERE membership.user_id = ${userId} AND organization.deleted_at IS NULL
        `);
        if ((count.rows[0]?.count ?? 0) >= 3) {
          throw new ConflictException("A user can belong to at most three organizations");
        }

        const organizationId = randomUUID();
        await transaction.execute(sql`
          INSERT INTO organizations (id, name, slug, owner_user_id)
          VALUES (${organizationId}, ${input.name}, ${input.slug}, ${userId})
        `);
        await transaction.execute(sql`
          INSERT INTO status_pages (organization_id, slug, title, description)
          VALUES (${organizationId}, ${input.slug}, ${input.name + " status"}, ${`Current availability and incident updates for ${input.name}.`})
        `);
        const membership = await transaction.execute<{ id: string }>(sql`
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES (${organizationId}, ${userId}, 'owner')
          RETURNING id
        `);
        await this.audit(transaction, {
          action: "organization.created",
          actorUserId: userId,
          organizationId,
          payload: { name: input.name, slug: input.slug },
          targetId: organizationId,
          targetType: "organization",
        });
        return {
          id: organizationId,
          membershipId: membership.rows[0]!.id,
          name: input.name,
          role: "owner" as const,
          slug: input.slug,
        };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException("Organization slug is already in use");
      }
      throw error;
    }
  }

  async update(userId: string, organizationSlug: string, input: OrganizationMutation) {
    const context = await this.requireRole(userId, organizationSlug, ["owner"]);
    try {
      return await this.databaseService.database.transaction(async (transaction) => {
        const updated = await transaction.execute<{ id: string; name: string; slug: string }>(sql`
          UPDATE organizations
          SET
            name = COALESCE(${input.name ?? null}, name),
            slug = COALESCE(${input.slug ?? null}, slug),
            updated_at = now()
          WHERE id = ${context.organizationId} AND deleted_at IS NULL
          RETURNING id, name, slug
        `);
        await transaction.execute(sql`
          UPDATE status_pages SET slug = COALESCE(${input.slug ?? null}, slug),
            title = CASE WHEN ${input.name === undefined} THEN title ELSE ${input.name ? input.name + " status" : null} END,
            updated_at = now()
          WHERE organization_id = ${context.organizationId} AND deleted_at IS NULL
        `);
        await this.audit(transaction, {
          action: "organization.updated",
          actorUserId: userId,
          organizationId: context.organizationId,
          payload: { changedFields: Object.keys(input) },
          targetId: context.organizationId,
          targetType: "organization",
        });
        return updated.rows[0]!;
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new ConflictException("Organization slug is already in use");
      }
      throw error;
    }
  }

  async invite(
    userId: string,
    organizationSlug: string,
    input: { email: string; role: Exclude<OrganizationRole, "owner"> },
  ) {
    const context = await this.requireRole(userId, organizationSlug, ["owner", "admin"]);
    const token = randomBytes(32).toString("base64url");
    return this.databaseService.database.transaction(async (transaction) => {
      const existing = await transaction.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM organization_invitations
          WHERE organization_id = ${context.organizationId}
            AND lower(email) = lower(${input.email})
            AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        ) AS exists
      `);
      if (existing.rows[0]?.exists) {
        throw new ConflictException("A pending invitation already exists for this email");
      }
      const invitation = await transaction.execute<{
        expiresAt: Date;
        id: string;
      }>(sql`
        INSERT INTO organization_invitations (
          organization_id, email, role, token_hash, invited_by_user_id, expires_at
        ) VALUES (
          ${context.organizationId}, ${input.email}, ${input.role}, ${tokenHash(token)},
          ${userId}, now() + interval '7 days'
        )
        RETURNING id, expires_at AS "expiresAt"
      `);
      await this.audit(transaction, {
        action: "organization.invitation_created",
        actorUserId: userId,
        organizationId: context.organizationId,
        payload: { email: input.email, role: input.role },
        targetId: invitation.rows[0]!.id,
        targetType: "organization_invitation",
      });
      return {
        ...invitation.rows[0]!,
        email: input.email,
        organizationId: context.organizationId,
        role: input.role,
        token,
      };
    });
  }

  async acceptInvitation(userId: string, userEmail: string, token: string) {
    return this.databaseService.database.transaction(async (transaction) => {
      const invitation = await transaction.execute<{
        acceptedAt: Date | null;
        email: string;
        expiresAt: Date;
        id: string;
        organizationId: string;
        organizationSlug: string;
        revokedAt: Date | null;
        role: Exclude<OrganizationRole, "owner">;
      }>(sql`
        SELECT
          invitation.id, invitation.organization_id AS "organizationId",
          organization.slug AS "organizationSlug", invitation.email, invitation.role,
          expires_at AS "expiresAt", accepted_at AS "acceptedAt", revoked_at AS "revokedAt"
        FROM organization_invitations AS invitation
        JOIN organizations AS organization ON organization.id = invitation.organization_id
        WHERE invitation.token_hash = ${tokenHash(token)} AND organization.deleted_at IS NULL
        FOR UPDATE
      `);
      const record = invitation.rows[0];
      if (!record) throw new NotFoundException("Invitation not found");
      if (record.acceptedAt || record.revokedAt || record.expiresAt <= new Date()) {
        throw new ConflictException("Invitation is no longer valid");
      }
      if (record.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ForbiddenException("Invitation belongs to a different account");
      }
      await transaction.execute(sql`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES (${record.organizationId}, ${userId}, ${record.role})
        ON CONFLICT (organization_id, user_id) DO NOTHING
      `);
      await transaction.execute(sql`
        UPDATE organization_invitations SET accepted_at = now(), updated_at = now()
        WHERE id = ${record.id} AND accepted_at IS NULL AND revoked_at IS NULL
      `);
      await this.audit(transaction, {
        action: "organization.invitation_accepted",
        actorUserId: userId,
        organizationId: record.organizationId,
        payload: { role: record.role },
        targetId: record.id,
        targetType: "organization_invitation",
      });
      return {
        organizationId: record.organizationId,
        organizationSlug: record.organizationSlug,
        role: record.role,
      };
    });
  }

  async revokeInvitation(userId: string, organizationSlug: string, invitationId: string) {
    const context = await this.requireRole(userId, organizationSlug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const revoked = await transaction.execute<{ id: string }>(sql`
        UPDATE organization_invitations
        SET revoked_at = now(), updated_at = now()
        WHERE id = ${invitationId} AND organization_id = ${context.organizationId}
          AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        RETURNING id
      `);
      if (!revoked.rows[0]) throw new NotFoundException("Active invitation not found");
      await this.audit(transaction, {
        action: "organization.invitation_revoked",
        actorUserId: userId,
        organizationId: context.organizationId,
        payload: {},
        targetId: invitationId,
        targetType: "organization_invitation",
      });
      return { revoked: true };
    });
  }

  async updateMemberRole(
    userId: string,
    organizationSlug: string,
    memberId: string,
    role: Exclude<OrganizationRole, "owner">,
  ) {
    const context = await this.requireRole(userId, organizationSlug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const member = await transaction.execute<{ id: string; role: OrganizationRole }>(sql`
        UPDATE organization_memberships
        SET role = ${role}, updated_at = now()
        WHERE id = ${memberId} AND organization_id = ${context.organizationId} AND role <> 'owner'
        RETURNING id, role
      `);
      if (!member.rows[0]) throw new NotFoundException("Mutable member not found");
      await this.audit(transaction, {
        action: "organization.member_role_updated",
        actorUserId: userId,
        organizationId: context.organizationId,
        payload: { role },
        targetId: memberId,
        targetType: "organization_membership",
      });
      return member.rows[0];
    });
  }

  async removeMember(userId: string, organizationSlug: string, memberId: string) {
    const context = await this.requireRole(userId, organizationSlug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const removed = await transaction.execute<{ id: string }>(sql`
        DELETE FROM organization_memberships
        WHERE id = ${memberId} AND organization_id = ${context.organizationId} AND role <> 'owner'
        RETURNING id
      `);
      if (!removed.rows[0]) throw new NotFoundException("Removable member not found");
      await this.audit(transaction, {
        action: "organization.member_removed",
        actorUserId: userId,
        organizationId: context.organizationId,
        payload: {},
        targetId: memberId,
        targetType: "organization_membership",
      });
      return { removed: true };
    });
  }

  async leave(userId: string, organizationSlug: string) {
    const context = await this.requireRole(userId, organizationSlug, ["admin", "member", "owner"]);
    if (context.role === "owner") {
      throw new ConflictException("Transfer ownership before leaving the organization");
    }
    return this.databaseService.database.transaction(async (transaction) => {
      const membership = await transaction.execute<{ id: string }>(sql`
        DELETE FROM organization_memberships
        WHERE organization_id = ${context.organizationId} AND user_id = ${userId}
        RETURNING id
      `);
      await this.audit(transaction, {
        action: "organization.member_left",
        actorUserId: userId,
        organizationId: context.organizationId,
        payload: {},
        targetId: membership.rows[0]!.id,
        targetType: "organization_membership",
      });
      return { left: true };
    });
  }

  async transferOwnership(userId: string, organizationSlug: string, memberId: string) {
    const context = await this.requireRole(userId, organizationSlug, ["owner"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const target = await transaction.execute<{ userId: string }>(sql`
        SELECT user_id AS "userId" FROM organization_memberships
        WHERE id = ${memberId} AND organization_id = ${context.organizationId} AND role <> 'owner'
        FOR UPDATE
      `);
      if (!target.rows[0]) throw new NotFoundException("Ownership target not found");
      await transaction.execute(sql`
        UPDATE organization_memberships SET role = 'admin', updated_at = now()
        WHERE organization_id = ${context.organizationId} AND user_id = ${userId} AND role = 'owner'
      `);
      await transaction.execute(sql`
        UPDATE organization_memberships SET role = 'owner', updated_at = now()
        WHERE id = ${memberId} AND organization_id = ${context.organizationId}
      `);
      await transaction.execute(sql`
        UPDATE organizations SET owner_user_id = ${target.rows[0].userId}, updated_at = now()
        WHERE id = ${context.organizationId}
      `);
      await this.audit(transaction, {
        action: "organization.ownership_transferred",
        actorUserId: userId,
        organizationId: context.organizationId,
        payload: { newOwnerUserId: target.rows[0].userId },
        targetId: memberId,
        targetType: "organization_membership",
      });
      return { ownerUserId: target.rows[0].userId };
    });
  }

  async requireRole(
    userId: string,
    organizationSlug: string,
    allowedRoles: readonly OrganizationRole[],
  ): Promise<MembershipContext> {
    const result = await this.databaseService.database.execute<MembershipContext>(sql`
      SELECT
        organization.id AS "organizationId", organization.name AS "organizationName",
        organization.slug AS "organizationSlug", membership.role
      FROM organizations AS organization
      JOIN organization_memberships AS membership
        ON membership.organization_id = organization.id AND membership.user_id = ${userId}
      WHERE lower(organization.slug) = lower(${organizationSlug}) AND organization.deleted_at IS NULL
    `);
    const context = result.rows[0];
    if (!context) throw new NotFoundException("Organization not found");
    if (!allowedRoles.includes(context.role)) throw new ForbiddenException("Insufficient role");
    return context;
  }

  private async audit(
    transaction: DatabaseTransaction,
    event: {
      action: string;
      actorUserId: string;
      organizationId: string;
      payload: Record<string, unknown>;
      targetId: string;
      targetType: string;
    },
  ) {
    const eventId = randomUUID();
    await transaction.execute(sql`
      INSERT INTO audit_events (
        id, organization_id, actor_type, actor_user_id, action, target_type, target_id,
        source, correlation_id, idempotency_key, safe_payload, occurred_at
      ) VALUES (
        ${eventId}, ${event.organizationId}, 'user', ${event.actorUserId}, ${event.action},
        ${event.targetType}, ${event.targetId}, 'api', ${eventId}, ${event.action + ":" + eventId},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `);
  }
}
