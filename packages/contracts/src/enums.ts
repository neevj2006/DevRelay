export const organizationRoleValues = ["owner", "admin", "member"] as const;
export const serviceStateValues = [
  "unknown",
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
  "under_maintenance",
] as const;
export const monitorStatusValues = ["pending", "active", "paused", "archived"] as const;
export const monitorMethodValues = ["GET", "HEAD"] as const;
export const monitorImpactValues = [
  "degraded_performance",
  "partial_outage",
  "major_outage",
] as const;
export const checkOutcomeValues = [
  "success",
  "failure",
  "timeout",
  "rejected_target",
  "execution_error",
] as const;
export const checkWindowStatusValues = ["pending", "claimed", "completed", "expired"] as const;
export const monitorPolicyStateValues = [
  "unknown",
  "healthy",
  "failing",
  "unhealthy",
  "recovering",
  "stale",
  "maintenance",
] as const;
export const workerDeploymentModeValues = ["local", "hosted"] as const;
export const workerQueueAdapterValues = ["bullmq", "qstash"] as const;
export const incidentLifecycleValues = [
  "detected",
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "postmortem_published",
] as const;
export const incidentSourceValues = [
  "automatic_monitor",
  "manual_responder",
  "external_report",
  "maintenance",
  "system_health",
] as const;
export const incidentSeverityValues = monitorImpactValues;
export const incidentOutcomeValues = [
  "resolved",
  "duplicate",
  "merged",
  "false_alarm",
  "maintenance_related",
] as const;
export const incidentActorTypeValues = ["user", "monitor", "worker", "system"] as const;
export const subscriberStateValues = [
  "pending_verification",
  "active",
  "unsubscribed",
  "suppressed",
] as const;
export const subscriberTokenPurposeValues = ["verify", "preferences", "unsubscribe"] as const;
export const webhookDestinationStateValues = ["active", "disabled"] as const;
export const notificationChannelValues = ["email", "webhook"] as const;
export const notificationKindValues = [
  "subscription_verification",
  "incident_update",
  "maintenance",
] as const;
export const notificationDeliveryStatusValues = [
  "pending",
  "sending",
  "succeeded",
  "retry_scheduled",
  "permanently_failed",
  "suppressed",
] as const;
export const deliveryAttemptStatusValues = [
  "started",
  "succeeded",
  "retryable_failure",
  "permanent_failure",
] as const;
export const outboxEventStatusValues = ["pending", "claimed", "published", "failed"] as const;
export const maintenanceStatusValues = ["scheduled", "cancelled"] as const;
export const auditActorTypeValues = ["user", "worker", "system", "oauth"] as const;
export const postmortemStatusValues = ["draft", "published"] as const;
export const retentionResourceValues = [
  "check_results",
  "delivery_attempts",
  "completed_outbox_events",
  "subscriber_tokens",
] as const;
export const retentionRunStatusValues = ["running", "succeeded", "failed"] as const;

export type OrganizationRole = (typeof organizationRoleValues)[number];
export type ServiceState = (typeof serviceStateValues)[number];
export type MonitorStatus = (typeof monitorStatusValues)[number];
export type MonitorMethod = (typeof monitorMethodValues)[number];
export type MonitorImpact = (typeof monitorImpactValues)[number];
export type CheckOutcome = (typeof checkOutcomeValues)[number];
export type CheckWindowStatus = (typeof checkWindowStatusValues)[number];
export type MonitorPolicyState = (typeof monitorPolicyStateValues)[number];
export type WorkerDeploymentMode = (typeof workerDeploymentModeValues)[number];
export type WorkerQueueAdapter = (typeof workerQueueAdapterValues)[number];
export type IncidentLifecycle = (typeof incidentLifecycleValues)[number];
export type IncidentSource = (typeof incidentSourceValues)[number];
export type IncidentSeverity = (typeof incidentSeverityValues)[number];
export type IncidentOutcome = (typeof incidentOutcomeValues)[number];
export type IncidentActorType = (typeof incidentActorTypeValues)[number];
export type SubscriberState = (typeof subscriberStateValues)[number];
export type SubscriberTokenPurpose = (typeof subscriberTokenPurposeValues)[number];
export type WebhookDestinationState = (typeof webhookDestinationStateValues)[number];
export type NotificationChannel = (typeof notificationChannelValues)[number];
export type NotificationKind = (typeof notificationKindValues)[number];
export type NotificationDeliveryStatus = (typeof notificationDeliveryStatusValues)[number];
export type DeliveryAttemptStatus = (typeof deliveryAttemptStatusValues)[number];
export type OutboxEventStatus = (typeof outboxEventStatusValues)[number];
export type MaintenanceStatus = (typeof maintenanceStatusValues)[number];
export type AuditActorType = (typeof auditActorTypeValues)[number];
export type PostmortemStatus = (typeof postmortemStatusValues)[number];
export type RetentionResource = (typeof retentionResourceValues)[number];
export type RetentionRunStatus = (typeof retentionRunStatusValues)[number];
