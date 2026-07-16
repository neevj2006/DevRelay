import {
  auditActorTypeValues,
  maintenanceStatusValues,
  postmortemStatusValues,
  retentionResourceValues,
  retentionRunStatusValues,
} from "@devrelay/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { auditTimestamps, primaryKeyColumn, tenantOrganizationColumn } from "../conventions.js";
import { users } from "./auth.js";
import { incidents } from "./incidents.js";
import { services } from "./monitoring.js";
import { organizations } from "./tenancy.js";

const instant = {
  mode: "date",
  precision: 3,
  withTimezone: true,
} as const;

export const maintenanceStatus = pgEnum("maintenance_status", maintenanceStatusValues);

export const auditActorType = pgEnum("audit_actor_type", auditActorTypeValues);

export const postmortemStatus = pgEnum("postmortem_status", postmortemStatusValues);

export const retentionResource = pgEnum("retention_resource", retentionResourceValues);

export const retentionRunStatus = pgEnum("retention_run_status", retentionRunStatusValues);

export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    publicDescription: text("public_description"),
    internalNote: text("internal_note"),
    startsAt: timestamp("starts_at", instant).notNull(),
    endsAt: timestamp("ends_at", instant).notNull(),
    status: maintenanceStatus("status").default("scheduled").notNull(),
    notifySubscribers: boolean("notify_subscribers").default(false).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    cancelledAt: timestamp("cancelled_at", instant),
    version: integer("version").default(1).notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    unique("maintenance_windows_organization_id_id_unique").on(table.organizationId, table.id),
    index("maintenance_windows_organization_time_idx").on(
      table.organizationId,
      table.startsAt,
      table.endsAt,
      table.id,
    ),
    check("maintenance_windows_title_length", sql`length(trim(${table.title})) BETWEEN 1 AND 200`),
    check("maintenance_windows_time_order", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "maintenance_windows_cancellation_consistent",
      sql`(
        ${table.status} = 'scheduled'
        AND ${table.cancelledAt} IS NULL
        AND ${table.cancelledByUserId} IS NULL
      ) OR (
        ${table.status} = 'cancelled'
        AND ${table.cancelledAt} IS NOT NULL
        AND ${table.cancelledByUserId} IS NOT NULL
      )`,
    ),
    check("maintenance_windows_version_positive", sql`${table.version} > 0`),
  ],
);

export const maintenanceWindowServices = pgTable(
  "maintenance_window_services",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    maintenanceWindowId: uuid("maintenance_window_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.maintenanceWindowId],
      foreignColumns: [maintenanceWindows.organizationId, maintenanceWindows.id],
      name: "maintenance_window_services_organization_window_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "maintenance_window_services_organization_service_fk",
    }).onDelete("restrict"),
    uniqueIndex("maintenance_window_services_window_service_unique").on(
      table.organizationId,
      table.maintenanceWindowId,
      table.serviceId,
    ),
    index("maintenance_window_services_service_idx").on(table.organizationId, table.serviceId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorType: auditActorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    source: text("source").notNull(),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    safePayload: jsonb("safe_payload").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", instant).notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("audit_events_idempotency_unique").on(table.organizationId, table.idempotencyKey),
    index("audit_events_organization_timeline_idx").on(
      table.organizationId,
      table.occurredAt.desc(),
      table.id,
    ),
    index("audit_events_organization_target_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId,
    ),
    check(
      "audit_events_actor_consistent",
      sql`(${table.actorType} = 'user' AND ${table.actorUserId} IS NOT NULL)
        OR (${table.actorType} <> 'user' AND ${table.actorUserId} IS NULL)`,
    ),
    check("audit_events_action_length", sql`length(${table.action}) BETWEEN 1 AND 160`),
    check("audit_events_target_type_length", sql`length(${table.targetType}) BETWEEN 1 AND 120`),
    check("audit_events_source_length", sql`length(${table.source}) BETWEEN 1 AND 120`),
    check(
      "audit_events_correlation_id_length",
      sql`length(${table.correlationId}) BETWEEN 1 AND 200`,
    ),
    check(
      "audit_events_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 240`,
    ),
    check("audit_events_payload_limit", sql`octet_length(${table.safePayload}::text) <= 32768`),
  ],
);

export const postmortems = pgTable(
  "postmortems",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").notNull(),
    slug: text("slug").notNull(),
    status: postmortemStatus("status").default("draft").notNull(),
    summary: text("summary"),
    impact: text("impact"),
    timeline: text("timeline"),
    rootCause: text("root_cause"),
    resolution: text("resolution"),
    actionItems: jsonb("action_items")
      .$type<readonly { description: string; owner?: string; dueAt?: string }[]>()
      .default([])
      .notNull(),
    publishedAt: timestamp("published_at", instant),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.incidentId],
      foreignColumns: [incidents.organizationId, incidents.id],
      name: "postmortems_organization_incident_fk",
    }).onDelete("restrict"),
    unique("postmortems_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("postmortems_organization_incident_unique").on(
      table.organizationId,
      table.incidentId,
    ),
    uniqueIndex("postmortems_slug_unique").on(sql`lower(${table.slug})`),
    check("postmortems_slug_length", sql`length(${table.slug}) BETWEEN 1 AND 160`),
    check(
      "postmortems_publication_consistent",
      sql`(
        ${table.status} = 'draft'
        AND ${table.publishedAt} IS NULL
        AND ${table.publishedByUserId} IS NULL
      ) OR (
        ${table.status} = 'published'
        AND ${table.publishedAt} IS NOT NULL
        AND ${table.publishedByUserId} IS NOT NULL
        AND ${table.summary} IS NOT NULL
        AND ${table.impact} IS NOT NULL
        AND ${table.timeline} IS NOT NULL
        AND ${table.rootCause} IS NOT NULL
        AND ${table.resolution} IS NOT NULL
        AND length(trim(${table.summary})) > 0
        AND length(trim(${table.impact})) > 0
        AND length(trim(${table.timeline})) > 0
        AND length(trim(${table.rootCause})) > 0
        AND length(trim(${table.resolution})) > 0
      )`,
    ),
    check(
      "postmortems_action_items_array",
      sql`jsonb_typeof(${table.actionItems}) = 'array' AND jsonb_array_length(${table.actionItems}) <= 100`,
    ),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(),
    prefix: text("prefix").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: jsonb("scopes").$type<readonly string[]>().notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastUsedAt: timestamp("last_used_at", instant),
    expiresAt: timestamp("expires_at", instant),
    revokedAt: timestamp("revoked_at", instant),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex("api_keys_secret_hash_unique").on(table.secretHash),
    uniqueIndex("api_keys_prefix_unique").on(table.prefix),
    index("api_keys_organization_active_idx")
      .on(table.organizationId, table.createdAt, table.id)
      .where(sql`${table.revokedAt} IS NULL`),
    check("api_keys_label_length", sql`length(trim(${table.label})) BETWEEN 1 AND 120`),
    check("api_keys_prefix_length", sql`length(${table.prefix}) BETWEEN 8 AND 32`),
    check("api_keys_secret_hash_length", sql`length(${table.secretHash}) BETWEEN 32 AND 200`),
    check(
      "api_keys_scopes_array",
      sql`jsonb_typeof(${table.scopes}) = 'array' AND jsonb_array_length(${table.scopes}) BETWEEN 1 AND 32`,
    ),
    check(
      "api_keys_revocation_consistent",
      sql`(${table.revokedAt} IS NULL AND ${table.revokedByUserId} IS NULL)
        OR (${table.revokedAt} IS NOT NULL AND ${table.revokedByUserId} IS NOT NULL)`,
    ),
  ],
);

export const dailyAvailabilityAggregates = pgTable(
  "daily_availability_aggregates",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    serviceId: uuid("service_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    expectedChecks: integer("expected_checks").notNull(),
    completedChecks: integer("completed_checks").notNull(),
    successfulChecks: integer("successful_checks").notNull(),
    failedChecks: integer("failed_checks").notNull(),
    missingChecks: integer("missing_checks").notNull(),
    availabilityBasisPoints: integer("availability_basis_points"),
    latencyP50Milliseconds: integer("latency_p50_milliseconds"),
    latencyP95Milliseconds: integer("latency_p95_milliseconds"),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "daily_availability_aggregates_organization_service_fk",
    }).onDelete("cascade"),
    uniqueIndex("daily_availability_aggregates_service_day_unique").on(
      table.organizationId,
      table.serviceId,
      table.day,
    ),
    index("daily_availability_aggregates_organization_day_idx").on(
      table.organizationId,
      table.day.desc(),
      table.serviceId,
    ),
    check(
      "daily_availability_aggregates_counts_nonnegative",
      sql`${table.expectedChecks} >= 0
        AND ${table.completedChecks} >= 0
        AND ${table.successfulChecks} >= 0
        AND ${table.failedChecks} >= 0
        AND ${table.missingChecks} >= 0`,
    ),
    check(
      "daily_availability_aggregates_counts_consistent",
      sql`${table.completedChecks} = ${table.successfulChecks} + ${table.failedChecks}
        AND ${table.expectedChecks} = ${table.completedChecks} + ${table.missingChecks}`,
    ),
    check(
      "daily_availability_aggregates_availability_range",
      sql`${table.availabilityBasisPoints} IS NULL OR ${table.availabilityBasisPoints} BETWEEN 0 AND 10000`,
    ),
    check(
      "daily_availability_aggregates_latency_nonnegative",
      sql`(${table.latencyP50Milliseconds} IS NULL OR ${table.latencyP50Milliseconds} >= 0)
        AND (${table.latencyP95Milliseconds} IS NULL OR ${table.latencyP95Milliseconds} >= 0)`,
    ),
    check(
      "daily_availability_aggregates_latency_order",
      sql`${table.latencyP50Milliseconds} IS NULL
        OR ${table.latencyP95Milliseconds} IS NULL
        OR ${table.latencyP95Milliseconds} >= ${table.latencyP50Milliseconds}`,
    ),
  ],
);

export const retentionCleanupRuns = pgTable(
  "retention_cleanup_runs",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    resource: retentionResource("resource").notNull(),
    cutoffAt: timestamp("cutoff_at", instant).notNull(),
    status: retentionRunStatus("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    deletedCount: integer("deleted_count").default(0).notNull(),
    safeErrorCode: text("safe_error_code"),
    startedAt: timestamp("started_at", instant).notNull(),
    completedAt: timestamp("completed_at", instant),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("retention_cleanup_runs_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("retention_cleanup_runs_organization_timeline_idx").on(
      table.organizationId,
      table.startedAt.desc(),
      table.id,
    ),
    check("retention_cleanup_runs_deleted_count_nonnegative", sql`${table.deletedCount} >= 0`),
    check(
      "retention_cleanup_runs_completion_consistent",
      sql`(${table.status} = 'running' AND ${table.completedAt} IS NULL)
        OR (${table.status} IN ('succeeded', 'failed') AND ${table.completedAt} IS NOT NULL)`,
    ),
    check(
      "retention_cleanup_runs_time_order",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`,
    ),
    check(
      "retention_cleanup_runs_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 240`,
    ),
  ],
);
