import {
  deliveryAttemptStatusValues,
  notificationChannelValues,
  notificationDeliveryStatusValues,
  notificationKindValues,
  outboxEventStatusValues,
  subscriberStateValues,
  subscriberTokenPurposeValues,
  webhookDestinationStateValues,
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
import { incidentPublicUpdates } from "./incidents.js";
import { services } from "./monitoring.js";
import { organizations } from "./tenancy.js";

const instant = {
  mode: "date",
  precision: 3,
  withTimezone: true,
} as const;

export const subscriberState = pgEnum("subscriber_state", subscriberStateValues);

export const subscriberTokenPurpose = pgEnum(
  "subscriber_token_purpose",
  subscriberTokenPurposeValues,
);

export const webhookDestinationState = pgEnum(
  "webhook_destination_state",
  webhookDestinationStateValues,
);

export const notificationChannel = pgEnum("notification_channel", notificationChannelValues);

export const notificationKind = pgEnum("notification_kind", notificationKindValues);

export const notificationDeliveryStatus = pgEnum(
  "notification_delivery_status",
  notificationDeliveryStatusValues,
);

export const deliveryAttemptStatus = pgEnum("delivery_attempt_status", deliveryAttemptStatusValues);

export const outboxEventStatus = pgEnum("outbox_event_status", outboxEventStatusValues);

export const statusPages = pgTable(
  "status_pages",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ...auditTimestamps(),
    deletedAt: softDeleteColumn(),
  },
  (table) => [
    unique("status_pages_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("status_pages_slug_unique").on(sql`lower(${table.slug})`),
    uniqueIndex("status_pages_one_active_per_organization_unique")
      .on(table.organizationId)
      .where(sql`${table.deletedAt} IS NULL`),
    check("status_pages_slug_length", sql`length(${table.slug}) BETWEEN 1 AND 160`),
    check("status_pages_title_length", sql`length(trim(${table.title})) BETWEEN 1 AND 160`),
  ],
);

export const statusPageServices = pgTable(
  "status_page_services",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    statusPageId: uuid("status_page_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.statusPageId],
      foreignColumns: [statusPages.organizationId, statusPages.id],
      name: "status_page_services_organization_status_page_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "status_page_services_organization_service_fk",
    }).onDelete("restrict"),
    uniqueIndex("status_page_services_page_service_unique").on(
      table.organizationId,
      table.statusPageId,
      table.serviceId,
    ),
    uniqueIndex("status_page_services_page_order_unique").on(
      table.organizationId,
      table.statusPageId,
      table.displayOrder,
    ),
    check("status_page_services_display_order_nonnegative", sql`${table.displayOrder} >= 0`),
  ],
);

export const subscribers = pgTable(
  "subscribers",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    statusPageId: uuid("status_page_id").notNull(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    state: subscriberState("state").default("pending_verification").notNull(),
    consentedAt: timestamp("consented_at", instant).notNull(),
    consentSource: text("consent_source").default("public_status_page").notNull(),
    verifiedAt: timestamp("verified_at", instant),
    unsubscribedAt: timestamp("unsubscribed_at", instant),
    suppressedAt: timestamp("suppressed_at", instant),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.statusPageId],
      foreignColumns: [statusPages.organizationId, statusPages.id],
      name: "subscribers_organization_status_page_fk",
    }).onDelete("cascade"),
    unique("subscribers_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("subscribers_status_page_email_unique").on(
      table.organizationId,
      table.statusPageId,
      table.normalizedEmail,
    ),
    index("subscribers_status_page_state_idx").on(
      table.organizationId,
      table.statusPageId,
      table.state,
    ),
    check("subscribers_email_length", sql`length(${table.email}) BETWEEN 3 AND 320`),
    check(
      "subscribers_normalized_email_length",
      sql`length(${table.normalizedEmail}) BETWEEN 3 AND 320`,
    ),
    check(
      "subscribers_state_timestamps_consistent",
      sql`(
        ${table.state} = 'pending_verification'
        AND ${table.verifiedAt} IS NULL
        AND ${table.unsubscribedAt} IS NULL
        AND ${table.suppressedAt} IS NULL
      ) OR (
        ${table.state} = 'active'
        AND ${table.verifiedAt} IS NOT NULL
        AND ${table.unsubscribedAt} IS NULL
        AND ${table.suppressedAt} IS NULL
      ) OR (
        ${table.state} = 'unsubscribed'
        AND ${table.unsubscribedAt} IS NOT NULL
        AND ${table.suppressedAt} IS NULL
      ) OR (
        ${table.state} = 'suppressed'
        AND ${table.suppressedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const subscriberVerificationTokens = pgTable(
  "subscriber_verification_tokens",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    subscriberId: uuid("subscriber_id").notNull(),
    purpose: subscriberTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", instant).notNull(),
    usedAt: timestamp("used_at", instant),
    revokedAt: timestamp("revoked_at", instant),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.subscriberId],
      foreignColumns: [subscribers.organizationId, subscribers.id],
      name: "subscriber_tokens_organization_subscriber_fk",
    }).onDelete("cascade"),
    uniqueIndex("subscriber_verification_tokens_hash_unique").on(table.tokenHash),
    index("subscriber_verification_tokens_expires_at_idx").on(table.expiresAt),
    check(
      "subscriber_verification_tokens_hash_length",
      sql`length(${table.tokenHash}) BETWEEN 32 AND 200`,
    ),
    check(
      "subscriber_verification_tokens_single_terminal_state",
      sql`NOT (${table.usedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);

export const subscriberPreferences = pgTable(
  "subscriber_preferences",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    subscriberId: uuid("subscriber_id").notNull(),
    serviceId: uuid("service_id"),
    incidentNotifications: boolean("incident_notifications").default(true).notNull(),
    maintenanceNotifications: boolean("maintenance_notifications").default(true).notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.subscriberId],
      foreignColumns: [subscribers.organizationId, subscribers.id],
      name: "subscriber_preferences_organization_subscriber_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "subscriber_preferences_organization_service_fk",
    }).onDelete("cascade"),
    uniqueIndex("subscriber_preferences_scope_unique").on(
      table.organizationId,
      table.subscriberId,
      sql`coalesce(${table.serviceId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

export const webhookDestinations = pgTable(
  "webhook_destinations",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    signingSecretCiphertext: text("signing_secret_ciphertext").notNull(),
    signingSecretPrefix: text("signing_secret_prefix").notNull(),
    state: webhookDestinationState("state").default("active").notNull(),
    ...auditTimestamps(),
    deletedAt: softDeleteColumn(),
  },
  (table) => [
    unique("webhook_destinations_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("webhook_destinations_active_name_unique")
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index("webhook_destinations_organization_state_idx").on(table.organizationId, table.state),
    check("webhook_destinations_name_length", sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
    check(
      "webhook_destinations_endpoint_length",
      sql`length(${table.endpointUrl}) BETWEEN 1 AND 2048`,
    ),
    check(
      "webhook_destinations_ciphertext_length",
      sql`length(${table.signingSecretCiphertext}) BETWEEN 16 AND 8192`,
    ),
    check(
      "webhook_destinations_prefix_length",
      sql`length(${table.signingSecretPrefix}) BETWEEN 4 AND 32`,
    ),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    kind: notificationKind("kind").notNull(),
    channel: notificationChannel("channel").notNull(),
    incidentPublicUpdateId: uuid("incident_public_update_id"),
    subscriberId: uuid("subscriber_id"),
    webhookDestinationId: uuid("webhook_destination_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadVersion: integer("payload_version").default(1).notNull(),
    safePayload: jsonb("safe_payload").$type<Record<string, unknown>>().notNull(),
    status: notificationDeliveryStatus("status").default("pending").notNull(),
    nextAttemptAt: timestamp("next_attempt_at", instant),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", instant),
    completedAt: timestamp("completed_at", instant),
    ...auditTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.incidentPublicUpdateId],
      foreignColumns: [incidentPublicUpdates.organizationId, incidentPublicUpdates.id],
      name: "notification_deliveries_organization_incident_update_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.subscriberId],
      foreignColumns: [subscribers.organizationId, subscribers.id],
      name: "notification_deliveries_organization_subscriber_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.webhookDestinationId],
      foreignColumns: [webhookDestinations.organizationId, webhookDestinations.id],
      name: "notification_deliveries_organization_webhook_fk",
    }).onDelete("restrict"),
    unique("notification_deliveries_organization_id_id_unique").on(table.organizationId, table.id),
    uniqueIndex("notification_deliveries_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("notification_deliveries_incident_email_unique")
      .on(table.organizationId, table.incidentPublicUpdateId, table.subscriberId)
      .where(sql`${table.kind} = 'incident_update' AND ${table.channel} = 'email'`),
    uniqueIndex("notification_deliveries_incident_webhook_unique")
      .on(table.organizationId, table.incidentPublicUpdateId, table.webhookDestinationId)
      .where(sql`${table.kind} = 'incident_update' AND ${table.channel} = 'webhook'`),
    index("notification_deliveries_due_idx")
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.status} IN ('pending', 'retry_scheduled')`),
    check(
      "notification_deliveries_destination_consistent",
      sql`(
        ${table.channel} = 'email'
        AND ${table.subscriberId} IS NOT NULL
        AND ${table.webhookDestinationId} IS NULL
      ) OR (
        ${table.channel} = 'webhook'
        AND ${table.webhookDestinationId} IS NOT NULL
        AND ${table.subscriberId} IS NULL
      )`,
    ),
    check(
      "notification_deliveries_source_consistent",
      sql`(${table.kind} = 'incident_update' AND ${table.incidentPublicUpdateId} IS NOT NULL)
        OR (${table.kind} <> 'incident_update' AND ${table.incidentPublicUpdateId} IS NULL)`,
    ),
    check(
      "notification_deliveries_completion_consistent",
      sql`${table.status} NOT IN ('succeeded', 'permanently_failed', 'suppressed') OR ${table.completedAt} IS NOT NULL`,
    ),
    check(
      "notification_deliveries_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 240`,
    ),
    check("notification_deliveries_payload_version_positive", sql`${table.payloadVersion} > 0`),
    check(
      "notification_deliveries_lease_consistent",
      sql`${table.status} <> 'sending' OR (${table.leaseOwner} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    check(
      "notification_deliveries_payload_limit",
      sql`octet_length(${table.safePayload}::text) <= 65536`,
    ),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    deliveryId: uuid("delivery_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: deliveryAttemptStatus("status").notNull(),
    providerMessageId: text("provider_message_id"),
    responseStatusCode: integer("response_status_code"),
    safeErrorCode: text("safe_error_code"),
    safeErrorSummary: text("safe_error_summary"),
    startedAt: timestamp("started_at", instant).notNull(),
    finishedAt: timestamp("finished_at", instant),
    nextRetryAt: timestamp("next_retry_at", instant),
    createdAt: timestamp("created_at", instant).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.deliveryId],
      foreignColumns: [notificationDeliveries.organizationId, notificationDeliveries.id],
      name: "delivery_attempts_organization_delivery_fk",
    }).onDelete("cascade"),
    uniqueIndex("delivery_attempts_delivery_number_unique").on(
      table.organizationId,
      table.deliveryId,
      table.attemptNumber,
    ),
    index("delivery_attempts_delivery_timeline_idx").on(
      table.organizationId,
      table.deliveryId,
      table.startedAt,
      table.id,
    ),
    check("delivery_attempts_number_positive", sql`${table.attemptNumber} > 0`),
    check(
      "delivery_attempts_time_order",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
    check(
      "delivery_attempts_response_status_range",
      sql`${table.responseStatusCode} IS NULL OR ${table.responseStatusCode} BETWEEN 100 AND 599`,
    ),
    check(
      "delivery_attempts_error_summary_limit",
      sql`${table.safeErrorSummary} IS NULL OR length(${table.safeErrorSummary}) <= 2000`,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: primaryKeyColumn(),
    organizationId: tenantOrganizationColumn().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadVersion: integer("payload_version").default(1).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: outboxEventStatus("status").default("pending").notNull(),
    availableAt: timestamp("available_at", instant).defaultNow().notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", instant),
    attemptCount: integer("attempt_count").default(0).notNull(),
    publishedAt: timestamp("published_at", instant),
    lastErrorCode: text("last_error_code"),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_unique").on(table.organizationId, table.idempotencyKey),
    index("outbox_events_pending_idx")
      .on(table.availableAt, table.id)
      .where(sql`${table.status} IN ('pending', 'failed')`),
    index("outbox_events_expired_lease_idx")
      .on(table.leaseExpiresAt, table.id)
      .where(sql`${table.status} = 'claimed'`),
    check("outbox_events_payload_version_positive", sql`${table.payloadVersion} > 0`),
    check("outbox_events_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "outbox_events_claim_consistent",
      sql`${table.status} <> 'claimed' OR (${table.leaseOwner} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    check(
      "outbox_events_publication_consistent",
      sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`,
    ),
    check(
      "outbox_events_aggregate_type_length",
      sql`length(${table.aggregateType}) BETWEEN 1 AND 120`,
    ),
    check("outbox_events_event_type_length", sql`length(${table.eventType}) BETWEEN 1 AND 160`),
    check(
      "outbox_events_idempotency_length",
      sql`length(${table.idempotencyKey}) BETWEEN 1 AND 240`,
    ),
    check("outbox_events_payload_limit", sql`octet_length(${table.payload}::text) <= 262144`),
  ],
);
