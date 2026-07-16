import { type OrganizationRole, organizationRoleValues } from "@devrelay/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditTimestamps,
  primaryKeyColumn,
  softDeleteColumn,
  tenantOrganizationColumn,
} from "../conventions.js";
import { users } from "./auth.js";

export const organizationPermissions = [
  "organization:manage",
  "members:manage",
  "services:manage",
  "incidents:manage",
  "status:publish",
  "audit:read",
] as const;
export type OrganizationPermission = (typeof organizationPermissions)[number];

export const permissionsByRole = {
  owner: organizationPermissions,
  admin: ["members:manage", "services:manage", "incidents:manage", "status:publish", "audit:read"],
  member: ["incidents:manage", "audit:read"],
} as const satisfies Record<OrganizationRole, readonly OrganizationPermission[]>;

export const organizationRole = pgEnum("organization_role", organizationRoleValues);

export const organizations = pgTable(
  "organizations",
  {
    id: primaryKeyColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...auditTimestamps(),
    deletedAt: softDeleteColumn(),
  },
  (table) => [
    uniqueIndex("organizations_slug_unique").on(sql`lower(${table.slug})`),
    index("organizations_owner_user_id_idx").on(table.ownerUserId),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationRole("role").notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex("organization_memberships_organization_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    uniqueIndex("organization_memberships_one_owner_unique")
      .on(table.organizationId)
      .where(sql`${table.role} = 'owner'`),
    index("organization_memberships_user_id_idx").on(table.userId),
  ],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    role: organizationRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull(),
    acceptedAt: timestamp("accepted_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    revokedAt: timestamp("revoked_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    ...auditTimestamps(),
  },
  (table) => [
    check("organization_invitations_non_owner_role", sql`${table.role} <> 'owner'`),
    check(
      "organization_invitations_single_terminal_state",
      sql`NOT (${table.acceptedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`,
    ),
    uniqueIndex("organization_invitations_token_hash_unique").on(table.tokenHash),
    index("organization_invitations_organization_email_idx").on(
      table.organizationId,
      sql`lower(${table.email})`,
    ),
    index("organization_invitations_expires_at_idx").on(table.expiresAt),
  ],
);
