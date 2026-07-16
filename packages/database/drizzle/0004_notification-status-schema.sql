CREATE TYPE "public"."delivery_attempt_status" AS ENUM('started', 'succeeded', 'retryable_failure', 'permanent_failure');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'sending', 'succeeded', 'retry_scheduled', 'permanently_failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('subscription_verification', 'incident_update', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_status" AS ENUM('pending', 'claimed', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscriber_state" AS ENUM('pending_verification', 'active', 'unsubscribed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."subscriber_token_purpose" AS ENUM('verify', 'preferences', 'unsubscribe');--> statement-breakpoint
CREATE TYPE "public"."webhook_destination_state" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "delivery_attempt_status" NOT NULL,
	"provider_message_id" text,
	"response_status_code" integer,
	"safe_error_code" text,
	"safe_error_summary" text,
	"started_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone,
	"next_retry_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_attempts_number_positive" CHECK ("delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "delivery_attempts_time_order" CHECK ("delivery_attempts"."finished_at" IS NULL OR "delivery_attempts"."finished_at" >= "delivery_attempts"."started_at"),
	CONSTRAINT "delivery_attempts_response_status_range" CHECK ("delivery_attempts"."response_status_code" IS NULL OR "delivery_attempts"."response_status_code" BETWEEN 100 AND 599),
	CONSTRAINT "delivery_attempts_error_summary_limit" CHECK ("delivery_attempts"."safe_error_summary" IS NULL OR length("delivery_attempts"."safe_error_summary") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"incident_public_update_id" uuid,
	"subscriber_id" uuid,
	"webhook_destination_id" uuid,
	"idempotency_key" text NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"safe_payload" jsonb NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"next_attempt_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "notification_deliveries_destination_consistent" CHECK ((
        "notification_deliveries"."channel" = 'email'
        AND "notification_deliveries"."subscriber_id" IS NOT NULL
        AND "notification_deliveries"."webhook_destination_id" IS NULL
      ) OR (
        "notification_deliveries"."channel" = 'webhook'
        AND "notification_deliveries"."webhook_destination_id" IS NOT NULL
        AND "notification_deliveries"."subscriber_id" IS NULL
      )),
	CONSTRAINT "notification_deliveries_source_consistent" CHECK (("notification_deliveries"."kind" = 'incident_update' AND "notification_deliveries"."incident_public_update_id" IS NOT NULL)
        OR ("notification_deliveries"."kind" <> 'incident_update' AND "notification_deliveries"."incident_public_update_id" IS NULL)),
	CONSTRAINT "notification_deliveries_completion_consistent" CHECK ("notification_deliveries"."status" NOT IN ('succeeded', 'permanently_failed', 'suppressed') OR "notification_deliveries"."completed_at" IS NOT NULL),
	CONSTRAINT "notification_deliveries_idempotency_length" CHECK (length("notification_deliveries"."idempotency_key") BETWEEN 1 AND 240),
	CONSTRAINT "notification_deliveries_payload_version_positive" CHECK ("notification_deliveries"."payload_version" > 0),
	CONSTRAINT "notification_deliveries_payload_limit" CHECK (octet_length("notification_deliveries"."safe_payload"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "outbox_event_status" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp (3) with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp (3) with time zone,
	"last_error_code" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_payload_version_positive" CHECK ("outbox_events"."payload_version" > 0),
	CONSTRAINT "outbox_events_attempt_count_nonnegative" CHECK ("outbox_events"."attempt_count" >= 0),
	CONSTRAINT "outbox_events_claim_consistent" CHECK ("outbox_events"."status" <> 'claimed' OR ("outbox_events"."lease_owner" IS NOT NULL AND "outbox_events"."lease_expires_at" IS NOT NULL)),
	CONSTRAINT "outbox_events_publication_consistent" CHECK ("outbox_events"."status" <> 'published' OR "outbox_events"."published_at" IS NOT NULL),
	CONSTRAINT "outbox_events_aggregate_type_length" CHECK (length("outbox_events"."aggregate_type") BETWEEN 1 AND 120),
	CONSTRAINT "outbox_events_event_type_length" CHECK (length("outbox_events"."event_type") BETWEEN 1 AND 160),
	CONSTRAINT "outbox_events_idempotency_length" CHECK (length("outbox_events"."idempotency_key") BETWEEN 1 AND 240),
	CONSTRAINT "outbox_events_payload_limit" CHECK (octet_length("outbox_events"."payload"::text) <= 262144)
);
--> statement-breakpoint
CREATE TABLE "status_page_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status_page_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_page_services_display_order_nonnegative" CHECK ("status_page_services"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "status_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "status_pages_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "status_pages_slug_length" CHECK (length("status_pages"."slug") BETWEEN 1 AND 160),
	CONSTRAINT "status_pages_title_length" CHECK (length(trim("status_pages"."title")) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE "subscriber_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_id" uuid,
	"incident_notifications" boolean DEFAULT true NOT NULL,
	"maintenance_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"purpose" "subscriber_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_verification_tokens_hash_length" CHECK (length("subscriber_verification_tokens"."token_hash") BETWEEN 32 AND 200),
	CONSTRAINT "subscriber_verification_tokens_single_terminal_state" CHECK (NOT ("subscriber_verification_tokens"."used_at" IS NOT NULL AND "subscriber_verification_tokens"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status_page_id" uuid NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"state" "subscriber_state" DEFAULT 'pending_verification' NOT NULL,
	"consented_at" timestamp (3) with time zone NOT NULL,
	"verified_at" timestamp (3) with time zone,
	"unsubscribed_at" timestamp (3) with time zone,
	"suppressed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "subscribers_email_length" CHECK (length("subscribers"."email") BETWEEN 3 AND 320),
	CONSTRAINT "subscribers_normalized_email_length" CHECK (length("subscribers"."normalized_email") BETWEEN 3 AND 320),
	CONSTRAINT "subscribers_state_timestamps_consistent" CHECK ((
        "subscribers"."state" = 'pending_verification'
        AND "subscribers"."verified_at" IS NULL
        AND "subscribers"."unsubscribed_at" IS NULL
        AND "subscribers"."suppressed_at" IS NULL
      ) OR (
        "subscribers"."state" = 'active'
        AND "subscribers"."verified_at" IS NOT NULL
        AND "subscribers"."unsubscribed_at" IS NULL
        AND "subscribers"."suppressed_at" IS NULL
      ) OR (
        "subscribers"."state" = 'unsubscribed'
        AND "subscribers"."unsubscribed_at" IS NOT NULL
        AND "subscribers"."suppressed_at" IS NULL
      ) OR (
        "subscribers"."state" = 'suppressed'
        AND "subscribers"."suppressed_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "webhook_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"signing_secret_ciphertext" text NOT NULL,
	"signing_secret_prefix" text NOT NULL,
	"state" "webhook_destination_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "webhook_destinations_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "webhook_destinations_name_length" CHECK (length(trim("webhook_destinations"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "webhook_destinations_endpoint_length" CHECK (length("webhook_destinations"."endpoint_url") BETWEEN 1 AND 2048),
	CONSTRAINT "webhook_destinations_ciphertext_length" CHECK (length("webhook_destinations"."signing_secret_ciphertext") BETWEEN 16 AND 8192),
	CONSTRAINT "webhook_destinations_prefix_length" CHECK (length("webhook_destinations"."signing_secret_prefix") BETWEEN 4 AND 32)
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_organization_delivery_fk" FOREIGN KEY ("organization_id","delivery_id") REFERENCES "public"."notification_deliveries"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_incident_update_fk" FOREIGN KEY ("organization_id","incident_public_update_id") REFERENCES "public"."incident_public_updates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_subscriber_fk" FOREIGN KEY ("organization_id","subscriber_id") REFERENCES "public"."subscribers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_webhook_fk" FOREIGN KEY ("organization_id","webhook_destination_id") REFERENCES "public"."webhook_destinations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_services" ADD CONSTRAINT "status_page_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_services" ADD CONSTRAINT "status_page_services_organization_status_page_fk" FOREIGN KEY ("organization_id","status_page_id") REFERENCES "public"."status_pages"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_services" ADD CONSTRAINT "status_page_services_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_organization_subscriber_fk" FOREIGN KEY ("organization_id","subscriber_id") REFERENCES "public"."subscribers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_verification_tokens" ADD CONSTRAINT "subscriber_verification_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_verification_tokens" ADD CONSTRAINT "subscriber_tokens_organization_subscriber_fk" FOREIGN KEY ("organization_id","subscriber_id") REFERENCES "public"."subscribers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_organization_status_page_fk" FOREIGN KEY ("organization_id","status_page_id") REFERENCES "public"."status_pages"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_destinations" ADD CONSTRAINT "webhook_destinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_delivery_number_unique" ON "delivery_attempts" USING btree ("organization_id","delivery_id","attempt_number");--> statement-breakpoint
CREATE INDEX "delivery_attempts_delivery_timeline_idx" ON "delivery_attempts" USING btree ("organization_id","delivery_id","started_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_idempotency_unique" ON "notification_deliveries" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_incident_email_unique" ON "notification_deliveries" USING btree ("organization_id","incident_public_update_id","subscriber_id") WHERE "notification_deliveries"."kind" = 'incident_update' AND "notification_deliveries"."channel" = 'email';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_incident_webhook_unique" ON "notification_deliveries" USING btree ("organization_id","incident_public_update_id","webhook_destination_id") WHERE "notification_deliveries"."kind" = 'incident_update' AND "notification_deliveries"."channel" = 'webhook';--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("next_attempt_at","id") WHERE "notification_deliveries"."status" IN ('pending', 'retry_scheduled');--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_idempotency_unique" ON "outbox_events" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("available_at","id") WHERE "outbox_events"."status" IN ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "outbox_events_expired_lease_idx" ON "outbox_events" USING btree ("lease_expires_at","id") WHERE "outbox_events"."status" = 'claimed';--> statement-breakpoint
CREATE UNIQUE INDEX "status_page_services_page_service_unique" ON "status_page_services" USING btree ("organization_id","status_page_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "status_page_services_page_order_unique" ON "status_page_services" USING btree ("organization_id","status_page_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "status_pages_slug_unique" ON "status_pages" USING btree (lower("slug"));--> statement-breakpoint
CREATE UNIQUE INDEX "status_pages_one_active_per_organization_unique" ON "status_pages" USING btree ("organization_id") WHERE "status_pages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_preferences_scope_unique" ON "subscriber_preferences" USING btree ("organization_id","subscriber_id",coalesce("service_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_verification_tokens_hash_unique" ON "subscriber_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "subscriber_verification_tokens_expires_at_idx" ON "subscriber_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_status_page_email_unique" ON "subscribers" USING btree ("organization_id","status_page_id","normalized_email");--> statement-breakpoint
CREATE INDEX "subscribers_status_page_state_idx" ON "subscribers" USING btree ("organization_id","status_page_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_destinations_active_name_unique" ON "webhook_destinations" USING btree ("organization_id",lower("name")) WHERE "webhook_destinations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "webhook_destinations_organization_state_idx" ON "webhook_destinations" USING btree ("organization_id","state");