import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { primaryKeyColumn, tenantOrganizationColumn } from "../conventions.js";
import { users } from "./auth.js";
import { checkResults, monitorImpact, services } from "./monitoring.js";
import { organizations } from "./tenancy.js";

const instant = {
  mode: "date",
  precision: 3,
  withTimezone: true,
} as const;

export const incidentLifecycleValues = [
  "detected",
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "postmortem_published",
] as const;
export type IncidentLifecycle = (typeof incidentLifecycleValues)[number];
export const incidentLifecycle = pgEnum("incident_lifecycle", incidentLifecycleValues);

export const incidentSourceValues = [
  "automatic_monitor",
  "manual_responder",
  "external_report",
  "maintenance",
  "system_health",
] as const;
export type IncidentSource = (typeof incidentSourceValues)[number];
export const incidentSource = pgEnum("incident_source", incidentSourceValues);

export const incidentSeverityValues = [
  "degraded_performance",
  "partial_outage",
  "major_outage",
] as const;
export type IncidentSeverity = (typeof incidentSeverityValues)[number];
export const incidentSeverity = pgEnum("incident_severity", incidentSeverityValues);

export const incidentOutcomeValues = [
  "resolved",
  "duplicate",
  "merged",
  "false_alarm",
  "maintenance_related",
] as const;
export type IncidentOutcome = (typeof incidentOutcomeValues)[number];
export const incidentOutcome = pgEnum("incident_outcome", incidentOutcomeValues);

export const incidentActorTypeValues = ["user", "monitor", "worker", "system"] as const;
export type IncidentActorType = (typeof incidentActorTypeValues)[number];
export const incidentActorType = pgEnum("incident_actor_type", incidentActorTypeValues);

export const incidents = pgTable(
  "incidents",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    publicTitle: text("public_title"),
    source: incidentSource("source").notNull(),
    severity: incidentSeverity("severity").notNull(),
    lifecycle: incidentLifecycle("lifecycle").notNull(),
    outcome: incidentOutcome("outcome"),
    automaticFingerprint: text("automatic_fingerprint"),
    creationIdempotencyKey: text("creation_idempotency_key").notNull(),
    canonicalIncidentId: uuid("canonical_incident_id"),
    startedAt: timestamp("started_at", instant).notNull(),
    resolvedAt: timestamp("resolved_at", instant),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", instant).defaultNow().notNull(),
  },
  (table) => [
    unique("incidents_organization_id_id_unique").on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.canonicalIncidentId],
      foreignColumns: [table.organizationId, table.id],
      name: "incidents_organization_canonical_incident_fk",
    }).onDelete("restrict"),
    uniqueIndex("incidents_organization_slug_unique").on(
      table.organizationId,
      sql`lower(${table.slug})`,
    ),
    uniqueIndex("incidents_creation_idempotency_unique").on(
      table.organizationId,
      table.creationIdempotencyKey,
    ),
    uniqueIndex("incidents_one_active_automatic_unique")
      .on(table.organizationId, table.automaticFingerprint)
      .where(sql`${table.source} = 'automatic_monitor' AND ${table.resolvedAt} IS NULL`),
    index("incidents_active_organization_idx")
      .on(table.organizationId, table.startedAt.desc(), table.id)
      .where(sql`${table.resolvedAt} IS NULL`),
    check("incidents_slug_length", sql`length(${table.slug}) BETWEEN 1 AND 160`),
    check("incidents_title_length", sql`length(trim(${table.title})) BETWEEN 1 AND 240`),
    check(
      "incidents_public_title_length",
      sql`${table.publicTitle} IS NULL OR length(trim(${table.publicTitle})) BETWEEN 1 AND 240`,
    ),
    check(
      "incidents_automatic_fingerprint_required",
      sql`${table.source} <> 'automatic_monitor' OR length(${table.automaticFingerprint}) BETWEEN 16 AND 200`,
    ),
    check(
      "incidents_terminal_fields_consistent",
      sql`(
        ${table.lifecycle} IN ('resolved', 'postmortem_published')
        AND ${table.resolvedAt} IS NOT NULL
        AND ${table.outcome} IS NOT NULL
      ) OR (
        ${table.lifecycle} NOT IN ('resolved', 'postmortem_published')
        AND ${table.resolvedAt} IS NULL
        AND (${table.outcome} IS NULL OR ${table.outcome} = 'maintenance_related')
      )`,
    ),
    check(
      "incidents_canonical_relationship_consistent",
      sql`(
        ${table.outcome} IN ('duplicate', 'merged') AND ${table.canonicalIncidentId} IS NOT NULL
      ) OR (
        (${table.outcome} IS NULL OR ${table.outcome} NOT IN ('duplicate', 'merged'))
        AND ${table.canonicalIncidentId} IS NULL
      )`,
    ),
    check(
      "incidents_canonical_not_self",
      sql`${table.canonicalIncidentId} IS NULL OR ${table.canonicalIncidentId} <> ${table.id}`,
    ),
    check(
      "incidents_resolution_time_order",
      sql`${table.resolvedAt} IS NULL OR ${table.resolvedAt} >= ${table.startedAt}`,
    ),
    check(
      "incidents_creation_idempotency_length",
      sql`length(${table.creationIdempotencyKey}) BETWEEN 1 AND 200`,
    ),
    check("incidents_version_positive", sql`${table.version} > 0`),
  ],
);

export const incidentServices = pgTable(
  "incident_services",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    impact: monitorImpact("impact").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.incidentId],
      foreignColumns: [incidents.organizationId, incidents.id],
      name: "incident_services_organization_incident_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "incident_services_organization_service_fk",
    }).onDelete("restrict"),
    uniqueIndex("incident_services_organization_incident_service_unique").on(
      table.organizationId,
      table.incidentId,
      table.serviceId,
    ),
    uniqueIndex("incident_services_one_primary_unique")
      .on(table.organizationId, table.incidentId)
      .where(sql`${table.isPrimary} = true`),
    index("incident_services_service_id_idx").on(table.organizationId, table.serviceId),
  ],
);

export const incidentPublicUpdates = pgTable(
  "incident_public_updates",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "restrict" }),
    lifecycle: incidentLifecycle("lifecycle").notNull(),
    body: text("body").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    publishedAt: timestamp("published_at", instant).notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.incidentId],
      foreignColumns: [incidents.organizationId, incidents.id],
      name: "incident_public_updates_organization_incident_fk",
    }).onDelete("cascade"),
    uniqueIndex("incident_public_updates_idempotency_unique").on(
      table.organizationId,
      table.incidentId,
      table.idempotencyKey,
    ),
    unique("incident_public_updates_organization_id_id_unique").on(table.organizationId, table.id),
    index("incident_public_updates_timeline_idx").on(
      table.organizationId,
      table.incidentId,
      table.publishedAt,
      table.id,
    ),
    check(
      "incident_public_updates_body_length",
      sql`length(trim(${table.body})) BETWEEN 1 AND 5000`,
    ),
    check(
      "incident_public_updates_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 200`,
    ),
  ],
);

export const incidentPrivateNotes = pgTable(
  "incident_private_notes",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.incidentId],
      foreignColumns: [incidents.organizationId, incidents.id],
      name: "incident_private_notes_organization_incident_fk",
    }).onDelete("cascade"),
    uniqueIndex("incident_private_notes_idempotency_unique").on(
      table.organizationId,
      table.incidentId,
      table.idempotencyKey,
    ),
    index("incident_private_notes_timeline_idx").on(
      table.organizationId,
      table.incidentId,
      table.createdAt,
      table.id,
    ),
    check(
      "incident_private_notes_body_length",
      sql`length(trim(${table.body})) BETWEEN 1 AND 10000`,
    ),
    check(
      "incident_private_notes_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 200`,
    ),
  ],
);

export const incidentTransitions = pgTable(
  "incident_transitions",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").notNull(),
    fromLifecycle: incidentLifecycle("from_lifecycle"),
    toLifecycle: incidentLifecycle("to_lifecycle").notNull(),
    outcome: incidentOutcome("outcome"),
    actorType: incidentActorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    evidenceCheckResultId: uuid("evidence_check_result_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.incidentId],
      foreignColumns: [incidents.organizationId, incidents.id],
      name: "incident_transitions_organization_incident_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.evidenceCheckResultId],
      foreignColumns: [checkResults.organizationId, checkResults.id],
      name: "incident_transitions_organization_check_result_fk",
    }).onDelete("restrict"),
    uniqueIndex("incident_transitions_idempotency_unique").on(
      table.organizationId,
      table.incidentId,
      table.idempotencyKey,
    ),
    index("incident_transitions_timeline_idx").on(
      table.organizationId,
      table.incidentId,
      table.createdAt,
      table.id,
    ),
    check(
      "incident_transitions_lifecycle_changes",
      sql`${table.fromLifecycle} IS NULL OR ${table.fromLifecycle} <> ${table.toLifecycle}`,
    ),
    check(
      "incident_transitions_actor_consistent",
      sql`(${table.actorType} = 'user' AND ${table.actorUserId} IS NOT NULL) OR (${table.actorType} <> 'user' AND ${table.actorUserId} IS NULL)`,
    ),
    check(
      "incident_transitions_reason_length",
      sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
    check(
      "incident_transitions_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 200`,
    ),
  ],
);
