import {
  checkOutcomeValues,
  checkWindowStatusValues,
  monitorImpactValues,
  monitorMethodValues,
  monitorPolicyStateValues,
  monitorStatusValues,
  monitorTypeValues,
  serviceStateValues,
  workerDeploymentModeValues,
  workerQueueAdapterValues,
} from "@devrelay/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

import {
  auditTimestamps,
  primaryKeyColumn,
  softDeleteColumn,
  tenantOrganizationColumn,
} from "../conventions.js";
import { users } from "./auth.js";
import { organizations } from "./tenancy.js";

const instant = {
  mode: "date",
  precision: 3,
  withTimezone: true,
} as const;

export const serviceState = pgEnum("service_state", serviceStateValues);

export const monitorStatus = pgEnum("monitor_status", monitorStatusValues);

export const monitorMethod = pgEnum("monitor_method", monitorMethodValues);

export const monitorType = pgEnum("monitor_type", monitorTypeValues);

export const monitorImpact = pgEnum("monitor_impact", monitorImpactValues);

export const checkOutcome = pgEnum("check_outcome", checkOutcomeValues);

export const checkWindowStatus = pgEnum("check_window_status", checkWindowStatusValues);

export const monitorPolicyState = pgEnum("monitor_policy_state", monitorPolicyStateValues);

export const workerDeploymentMode = pgEnum("worker_deployment_mode", workerDeploymentModeValues);

export const workerQueueAdapter = pgEnum("worker_queue_adapter", workerQueueAdapterValues);

export const services = pgTable(
  "services",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    publicDescription: text("public_description"),
    displayOrder: integer("display_order").default(0).notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    currentState: serviceState("current_state").default("unknown").notNull(),
    evidenceState: serviceState("evidence_state").default("unknown").notNull(),
    stateChangedAt: timestamp("state_changed_at", instant).defaultNow().notNull(),
    stateEvidence: jsonb("state_evidence").$type<Record<string, unknown>>(),
    version: integer("version").default(1).notNull(),
    ...auditTimestamps(),
    deletedAt: softDeleteColumn(),
  },
  (table) => [
    unique("services_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("services_active_name_unique")
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index("services_organization_display_order_idx").on(
      table.organizationId,
      table.displayOrder,
      table.id,
    ),
    check("services_display_order_nonnegative", sql`${table.displayOrder} >= 0`),
    check("services_name_nonempty", sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
    check("services_version_positive", sql`${table.version} > 0`),
  ],
);

export const monitors = pgTable(
  "monitors",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    serviceId: uuid("service_id").notNull(),
    name: text("name").notNull(),
    monitorType: monitorType("monitor_type").default("http").notNull(),
    endpointUrl: text("endpoint_url"),
    method: monitorMethod("method").default("GET").notNull(),
    protocolConfig: jsonb("protocol_config")
      .$type<Record<string, unknown>>()
      .default(sql`'{"type":"http"}'::jsonb`)
      .notNull(),
    status: monitorStatus("status").default("pending").notNull(),
    configurationVersion: integer("configuration_version").default(1).notNull(),
    testedConfigurationVersion: integer("tested_configuration_version"),
    lastTestedAt: timestamp("last_tested_at", instant),
    lastTestEvidence: jsonb("last_test_evidence").$type<Record<string, unknown>>(),
    nextDueAt: timestamp("next_due_at", instant),
    lastCompletedScheduledAt: timestamp("last_completed_scheduled_at", instant),
    pausedAt: timestamp("paused_at", instant),
    ...auditTimestamps(),
    deletedAt: softDeleteColumn(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "monitors_organization_service_fk",
    }).onDelete("cascade"),
    unique("monitors_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("monitors_active_service_name_unique")
      .on(table.organizationId, table.serviceId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index("monitors_due_idx")
      .on(table.nextDueAt, table.id)
      .where(sql`${table.status} = 'active' AND ${table.deletedAt} IS NULL`),
    index("monitors_service_id_idx").on(table.organizationId, table.serviceId),
    check(
      "monitors_pause_state_consistent",
      sql`(${table.status} = 'paused' AND ${table.pausedAt} IS NOT NULL) OR (${table.status} <> 'paused' AND ${table.pausedAt} IS NULL)`,
    ),
    check("monitors_name_nonempty", sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
    check(
      "monitors_protocol_configuration_valid",
      sql`jsonb_typeof(${table.protocolConfig}) = 'object' AND ${table.protocolConfig}->>'type' = ${table.monitorType}::text`,
    ),
    check(
      "monitors_endpoint_configuration_consistent",
      sql`(${table.monitorType} IN ('http', 'tls') AND length(${table.endpointUrl}) BETWEEN 1 AND 2048) OR (${table.monitorType} = 'dns' AND ${table.endpointUrl} IS NULL)`,
    ),
    check("monitors_configuration_version_positive", sql`${table.configurationVersion} > 0`),
    check(
      "monitors_tested_version_valid",
      sql`${table.testedConfigurationVersion} IS NULL OR (${table.testedConfigurationVersion} > 0 AND ${table.testedConfigurationVersion} <= ${table.configurationVersion})`,
    ),
  ],
);

export const monitorPolicies = pgTable(
  "monitor_policies",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    monitorId: uuid("monitor_id").notNull(),
    intervalSeconds: integer("interval_seconds").notNull(),
    timeoutMilliseconds: integer("timeout_milliseconds").notNull(),
    failureThreshold: integer("failure_threshold").default(3).notNull(),
    recoveryThreshold: integer("recovery_threshold").default(2).notNull(),
    failureImpact: monitorImpact("failure_impact").default("major_outage").notNull(),
    acceptedStatusCodes: jsonb("accepted_status_codes")
      .$type<readonly { from: number; to: number }[]>()
      .default(sql`'[{"from": 200, "to": 399}]'::jsonb`)
      .notNull(),
    requestHeaders: jsonb("request_headers")
      .$type<Readonly<Record<string, string>>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.monitorId],
      foreignColumns: [monitors.organizationId, monitors.id],
      name: "monitor_policies_organization_monitor_fk",
    }).onDelete("cascade"),
    uniqueIndex("monitor_policies_organization_monitor_unique").on(
      table.organizationId,
      table.monitorId,
    ),
    check("monitor_policies_interval_range", sql`${table.intervalSeconds} BETWEEN 10 AND 86400`),
    check(
      "monitor_policies_timeout_range",
      sql`${table.timeoutMilliseconds} BETWEEN 100 AND 30000`,
    ),
    check(
      "monitor_policies_timeout_before_interval",
      sql`${table.timeoutMilliseconds} < ${table.intervalSeconds} * 1000`,
    ),
    check(
      "monitor_policies_failure_threshold_range",
      sql`${table.failureThreshold} BETWEEN 1 AND 10`,
    ),
    check(
      "monitor_policies_recovery_threshold_range",
      sql`${table.recoveryThreshold} BETWEEN 1 AND 10`,
    ),
    check(
      "monitor_policies_status_codes_array",
      sql`jsonb_typeof(${table.acceptedStatusCodes}) = 'array' AND jsonb_array_length(${table.acceptedStatusCodes}) BETWEEN 1 AND 20`,
    ),
    check(
      "monitor_policies_request_headers_object",
      sql`jsonb_typeof(${table.requestHeaders}) = 'object'`,
    ),
  ],
);

export const expectedCheckWindows = pgTable(
  "expected_check_windows",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    monitorId: uuid("monitor_id").notNull(),
    scheduledAt: timestamp("scheduled_at", instant).notNull(),
    status: checkWindowStatus("status").default("pending").notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", instant),
    claimedAt: timestamp("claimed_at", instant),
    completedAt: timestamp("completed_at", instant),
    attemptCount: integer("attempt_count").default(0).notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.monitorId],
      foreignColumns: [monitors.organizationId, monitors.id],
      name: "expected_check_windows_organization_monitor_fk",
    }).onDelete("cascade"),
    unique("expected_check_windows_logical_unique").on(
      table.organizationId,
      table.monitorId,
      table.scheduledAt,
    ),
    index("expected_check_windows_claimable_idx")
      .on(table.scheduledAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("expected_check_windows_expired_lease_idx")
      .on(table.leaseExpiresAt, table.id)
      .where(sql`${table.status} = 'claimed'`),
    check("expected_check_windows_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "expected_check_windows_claim_consistent",
      sql`${table.status} <> 'claimed' OR (${table.leaseOwner} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL AND ${table.claimedAt} IS NOT NULL)`,
    ),
    check(
      "expected_check_windows_completion_consistent",
      sql`${table.status} <> 'completed' OR ${table.completedAt} IS NOT NULL`,
    ),
  ],
);

export const checkResults = pgTable(
  "check_results",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    monitorId: uuid("monitor_id").notNull(),
    scheduledAt: timestamp("scheduled_at", instant).notNull(),
    outcome: checkOutcome("outcome").notNull(),
    startedAt: timestamp("started_at", instant).notNull(),
    finishedAt: timestamp("finished_at", instant).notNull(),
    latencyMilliseconds: integer("latency_milliseconds"),
    httpStatusCode: integer("http_status_code"),
    protocol: monitorType("protocol").default("http").notNull(),
    region: text("region").notNull(),
    evidenceCode: text("evidence_code").notNull(),
    evidenceSummary: text("evidence_summary").notNull(),
    safeEvidence: jsonb("safe_evidence").$type<Record<string, unknown>>(),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.monitorId, table.scheduledAt],
      foreignColumns: [
        expectedCheckWindows.organizationId,
        expectedCheckWindows.monitorId,
        expectedCheckWindows.scheduledAt,
      ],
      name: "check_results_expected_window_fk",
    }).onDelete("cascade"),
    uniqueIndex("check_results_logical_unique").on(
      table.organizationId,
      table.monitorId,
      table.scheduledAt,
    ),
    uniqueIndex("check_results_organization_id_id_unique").on(table.organizationId, table.id),
    index("check_results_recent_monitor_idx").on(
      table.organizationId,
      table.monitorId,
      table.finishedAt.desc(),
      table.id,
    ),
    check("check_results_time_order", sql`${table.finishedAt} >= ${table.startedAt}`),
    check(
      "check_results_latency_nonnegative",
      sql`${table.latencyMilliseconds} IS NULL OR ${table.latencyMilliseconds} >= 0`,
    ),
    check(
      "check_results_http_status_range",
      sql`${table.httpStatusCode} IS NULL OR ${table.httpStatusCode} BETWEEN 100 AND 599`,
    ),
    check("check_results_region_length", sql`length(${table.region}) BETWEEN 1 AND 64`),
    check(
      "check_results_evidence_code_length",
      sql`length(${table.evidenceCode}) BETWEEN 1 AND 100`,
    ),
    check(
      "check_results_evidence_summary_limit",
      sql`length(${table.evidenceSummary}) BETWEEN 1 AND 1000`,
    ),
    check(
      "check_results_safe_evidence_limit",
      sql`${table.safeEvidence} IS NULL OR octet_length(${table.safeEvidence}::text) <= 8192`,
    ),
  ],
);

export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: primaryKeyColumn(),
    workerKey: text("worker_key").notNull(),
    deploymentMode: workerDeploymentMode("deployment_mode").notNull(),
    queueAdapter: workerQueueAdapter("queue_adapter").notNull(),
    startedAt: timestamp("started_at", instant).notNull(),
    heartbeatAt: timestamp("heartbeat_at", instant).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex("worker_heartbeats_worker_key_unique").on(table.workerKey),
    index("worker_heartbeats_heartbeat_at_idx").on(table.heartbeatAt),
    check("worker_heartbeats_worker_key_length", sql`length(${table.workerKey}) BETWEEN 1 AND 200`),
    check("worker_heartbeats_time_order", sql`${table.heartbeatAt} >= ${table.startedAt}`),
  ],
);

export const monitorPolicyEvaluations = pgTable(
  "monitor_policy_evaluations",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    monitorId: uuid("monitor_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    state: monitorPolicyState("state").default("unknown").notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    consecutiveSuccesses: integer("consecutive_successes").default(0).notNull(),
    latestScheduledAt: timestamp("latest_scheduled_at", instant),
    latestOutcome: checkOutcome("latest_outcome"),
    freshUntil: timestamp("fresh_until", instant),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
    evaluatedAt: timestamp("evaluated_at", instant).defaultNow().notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.monitorId],
      foreignColumns: [monitors.organizationId, monitors.id],
      name: "monitor_policy_evaluations_organization_monitor_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "monitor_policy_evaluations_organization_service_fk",
    }).onDelete("cascade"),
    uniqueIndex("monitor_policy_evaluations_monitor_unique").on(
      table.organizationId,
      table.monitorId,
    ),
    index("monitor_policy_evaluations_service_idx").on(
      table.organizationId,
      table.serviceId,
      table.state,
    ),
    check(
      "monitor_policy_evaluations_counters_nonnegative",
      sql`${table.consecutiveFailures} >= 0 AND ${table.consecutiveSuccesses} >= 0`,
    ),
    check(
      "monitor_policy_evaluations_evidence_limit",
      sql`octet_length(${table.evidence}::text) <= 8192`,
    ),
  ],
);

export const serviceStateTransitions = pgTable(
  "service_state_transitions",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    serviceId: uuid("service_id").notNull(),
    fromState: serviceState("from_state").notNull(),
    toState: serviceState("to_state").notNull(),
    evidenceState: serviceState("evidence_state").notNull(),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", instant).defaultNow().notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "service_state_transitions_organization_service_fk",
    }).onDelete("cascade"),
    uniqueIndex("service_state_transitions_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("service_state_transitions_timeline_idx").on(
      table.organizationId,
      table.serviceId,
      table.occurredAt.desc(),
      table.id,
    ),
    check(
      "service_state_transitions_actor_consistent",
      sql`(${table.actorType} = 'user' AND ${table.actorUserId} IS NOT NULL) OR (${table.actorType} IN ('worker','system') AND ${table.actorUserId} IS NULL)`,
    ),
    check(
      "service_state_transitions_reason_length",
      sql`length(${table.reason}) BETWEEN 1 AND 500`,
    ),
    check(
      "service_state_transitions_evidence_limit",
      sql`octet_length(${table.evidence}::text) <= 16384`,
    ),
  ],
);

export const serviceStateOverrides = pgTable(
  "service_state_overrides",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    serviceId: uuid("service_id").notNull(),
    declaredState: serviceState("declared_state").notNull(),
    reason: text("reason").notNull(),
    startsAt: timestamp("starts_at", instant).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", instant).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cancelledAt: timestamp("cancelled_at", instant),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "service_state_overrides_organization_service_fk",
    }).onDelete("cascade"),
    uniqueIndex("service_state_overrides_one_uncancelled_unique")
      .on(table.organizationId, table.serviceId)
      .where(sql`${table.cancelledAt} IS NULL`),
    index("service_state_overrides_expiry_idx").on(table.expiresAt),
    check(
      "service_state_overrides_allowed_state",
      sql`${table.declaredState} IN ('operational','degraded_performance','partial_outage','major_outage')`,
    ),
    check("service_state_overrides_time_order", sql`${table.expiresAt} > ${table.startsAt}`),
    check(
      "service_state_overrides_max_duration",
      sql`${table.expiresAt} <= ${table.startsAt} + interval '24 hours'`,
    ),
    check(
      "service_state_overrides_reason_length",
      sql`length(trim(${table.reason})) BETWEEN 1 AND 500`,
    ),
    check(
      "service_state_overrides_cancellation_consistent",
      sql`(${table.cancelledAt} IS NULL AND ${table.cancelledByUserId} IS NULL) OR (${table.cancelledAt} IS NOT NULL AND ${table.cancelledByUserId} IS NOT NULL)`,
    ),
  ],
);
