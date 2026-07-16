CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'worker', 'system', 'oauth');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."postmortem_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."retention_resource" AS ENUM('check_results', 'delivery_attempts', 'completed_outbox_events');--> statement-breakpoint
CREATE TYPE "public"."retention_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"last_used_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_label_length" CHECK (length(trim("api_keys"."label")) BETWEEN 1 AND 120),
	CONSTRAINT "api_keys_prefix_length" CHECK (length("api_keys"."prefix") BETWEEN 8 AND 32),
	CONSTRAINT "api_keys_secret_hash_length" CHECK (length("api_keys"."secret_hash") BETWEEN 32 AND 200),
	CONSTRAINT "api_keys_scopes_array" CHECK (jsonb_typeof("api_keys"."scopes") = 'array' AND jsonb_array_length("api_keys"."scopes") BETWEEN 1 AND 32),
	CONSTRAINT "api_keys_revocation_consistent" CHECK (("api_keys"."revoked_at" IS NULL AND "api_keys"."revoked_by_user_id" IS NULL)
        OR ("api_keys"."revoked_at" IS NOT NULL AND "api_keys"."revoked_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"source" text NOT NULL,
	"correlation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"safe_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_consistent" CHECK (("audit_events"."actor_type" = 'user' AND "audit_events"."actor_user_id" IS NOT NULL)
        OR ("audit_events"."actor_type" <> 'user' AND "audit_events"."actor_user_id" IS NULL)),
	CONSTRAINT "audit_events_action_length" CHECK (length("audit_events"."action") BETWEEN 1 AND 160),
	CONSTRAINT "audit_events_target_type_length" CHECK (length("audit_events"."target_type") BETWEEN 1 AND 120),
	CONSTRAINT "audit_events_source_length" CHECK (length("audit_events"."source") BETWEEN 1 AND 120),
	CONSTRAINT "audit_events_correlation_id_length" CHECK (length("audit_events"."correlation_id") BETWEEN 1 AND 200),
	CONSTRAINT "audit_events_idempotency_length" CHECK (length("audit_events"."idempotency_key") BETWEEN 1 AND 240),
	CONSTRAINT "audit_events_payload_limit" CHECK (octet_length("audit_events"."safe_payload"::text) <= 32768)
);
--> statement-breakpoint
CREATE TABLE "daily_availability_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"day" date NOT NULL,
	"expected_checks" integer NOT NULL,
	"completed_checks" integer NOT NULL,
	"successful_checks" integer NOT NULL,
	"failed_checks" integer NOT NULL,
	"missing_checks" integer NOT NULL,
	"availability_basis_points" integer,
	"latency_p50_milliseconds" integer,
	"latency_p95_milliseconds" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_availability_aggregates_counts_nonnegative" CHECK ("daily_availability_aggregates"."expected_checks" >= 0
        AND "daily_availability_aggregates"."completed_checks" >= 0
        AND "daily_availability_aggregates"."successful_checks" >= 0
        AND "daily_availability_aggregates"."failed_checks" >= 0
        AND "daily_availability_aggregates"."missing_checks" >= 0),
	CONSTRAINT "daily_availability_aggregates_counts_consistent" CHECK ("daily_availability_aggregates"."completed_checks" = "daily_availability_aggregates"."successful_checks" + "daily_availability_aggregates"."failed_checks"
        AND "daily_availability_aggregates"."expected_checks" = "daily_availability_aggregates"."completed_checks" + "daily_availability_aggregates"."missing_checks"),
	CONSTRAINT "daily_availability_aggregates_availability_range" CHECK ("daily_availability_aggregates"."availability_basis_points" IS NULL OR "daily_availability_aggregates"."availability_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "daily_availability_aggregates_latency_nonnegative" CHECK (("daily_availability_aggregates"."latency_p50_milliseconds" IS NULL OR "daily_availability_aggregates"."latency_p50_milliseconds" >= 0)
        AND ("daily_availability_aggregates"."latency_p95_milliseconds" IS NULL OR "daily_availability_aggregates"."latency_p95_milliseconds" >= 0)),
	CONSTRAINT "daily_availability_aggregates_latency_order" CHECK ("daily_availability_aggregates"."latency_p50_milliseconds" IS NULL
        OR "daily_availability_aggregates"."latency_p95_milliseconds" IS NULL
        OR "daily_availability_aggregates"."latency_p95_milliseconds" >= "daily_availability_aggregates"."latency_p50_milliseconds")
);
--> statement-breakpoint
CREATE TABLE "maintenance_window_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"maintenance_window_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"public_description" text,
	"internal_note" text,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"status" "maintenance_status" DEFAULT 'scheduled' NOT NULL,
	"notify_subscribers" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"cancelled_by_user_id" uuid,
	"cancelled_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_windows_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "maintenance_windows_title_length" CHECK (length(trim("maintenance_windows"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "maintenance_windows_time_order" CHECK ("maintenance_windows"."ends_at" > "maintenance_windows"."starts_at"),
	CONSTRAINT "maintenance_windows_cancellation_consistent" CHECK ((
        "maintenance_windows"."status" = 'scheduled'
        AND "maintenance_windows"."cancelled_at" IS NULL
        AND "maintenance_windows"."cancelled_by_user_id" IS NULL
      ) OR (
        "maintenance_windows"."status" = 'cancelled'
        AND "maintenance_windows"."cancelled_at" IS NOT NULL
        AND "maintenance_windows"."cancelled_by_user_id" IS NOT NULL
      )),
	CONSTRAINT "maintenance_windows_version_positive" CHECK ("maintenance_windows"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "postmortems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "postmortem_status" DEFAULT 'draft' NOT NULL,
	"summary" text,
	"impact" text,
	"timeline" text,
	"root_cause" text,
	"resolution" text,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp (3) with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "postmortems_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "postmortems_slug_length" CHECK (length("postmortems"."slug") BETWEEN 1 AND 160),
	CONSTRAINT "postmortems_publication_consistent" CHECK ((
        "postmortems"."status" = 'draft'
        AND "postmortems"."published_at" IS NULL
        AND "postmortems"."published_by_user_id" IS NULL
      ) OR (
        "postmortems"."status" = 'published'
        AND "postmortems"."published_at" IS NOT NULL
        AND "postmortems"."published_by_user_id" IS NOT NULL
        AND "postmortems"."summary" IS NOT NULL
        AND "postmortems"."impact" IS NOT NULL
        AND "postmortems"."timeline" IS NOT NULL
        AND "postmortems"."root_cause" IS NOT NULL
        AND "postmortems"."resolution" IS NOT NULL
        AND length(trim("postmortems"."summary")) > 0
        AND length(trim("postmortems"."impact")) > 0
        AND length(trim("postmortems"."timeline")) > 0
        AND length(trim("postmortems"."root_cause")) > 0
        AND length(trim("postmortems"."resolution")) > 0
      )),
	CONSTRAINT "postmortems_action_items_array" CHECK (jsonb_typeof("postmortems"."action_items") = 'array' AND jsonb_array_length("postmortems"."action_items") <= 100)
);
--> statement-breakpoint
CREATE TABLE "retention_cleanup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"resource" "retention_resource" NOT NULL,
	"cutoff_at" timestamp (3) with time zone NOT NULL,
	"status" "retention_run_status" NOT NULL,
	"idempotency_key" text NOT NULL,
	"deleted_count" integer DEFAULT 0 NOT NULL,
	"safe_error_code" text,
	"started_at" timestamp (3) with time zone NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_cleanup_runs_deleted_count_nonnegative" CHECK ("retention_cleanup_runs"."deleted_count" >= 0),
	CONSTRAINT "retention_cleanup_runs_completion_consistent" CHECK (("retention_cleanup_runs"."status" = 'running' AND "retention_cleanup_runs"."completed_at" IS NULL)
        OR ("retention_cleanup_runs"."status" IN ('succeeded', 'failed') AND "retention_cleanup_runs"."completed_at" IS NOT NULL)),
	CONSTRAINT "retention_cleanup_runs_time_order" CHECK ("retention_cleanup_runs"."completed_at" IS NULL OR "retention_cleanup_runs"."completed_at" >= "retention_cleanup_runs"."started_at"),
	CONSTRAINT "retention_cleanup_runs_idempotency_length" CHECK (length("retention_cleanup_runs"."idempotency_key") BETWEEN 1 AND 240)
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_availability_aggregates" ADD CONSTRAINT "daily_availability_aggregates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_availability_aggregates" ADD CONSTRAINT "daily_availability_aggregates_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_services" ADD CONSTRAINT "maintenance_window_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_services" ADD CONSTRAINT "maintenance_window_services_organization_window_fk" FOREIGN KEY ("organization_id","maintenance_window_id") REFERENCES "public"."maintenance_windows"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_services" ADD CONSTRAINT "maintenance_window_services_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postmortems" ADD CONSTRAINT "postmortems_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postmortems" ADD CONSTRAINT "postmortems_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postmortems" ADD CONSTRAINT "postmortems_organization_incident_fk" FOREIGN KEY ("organization_id","incident_id") REFERENCES "public"."incidents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_cleanup_runs" ADD CONSTRAINT "retention_cleanup_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_secret_hash_unique" ON "api_keys" USING btree ("secret_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_unique" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "api_keys_organization_active_idx" ON "api_keys" USING btree ("organization_id","created_at","id") WHERE "api_keys"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_idempotency_unique" ON "audit_events" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "audit_events_organization_timeline_idx" ON "audit_events" USING btree ("organization_id","occurred_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "audit_events_organization_target_idx" ON "audit_events" USING btree ("organization_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_availability_aggregates_service_day_unique" ON "daily_availability_aggregates" USING btree ("organization_id","service_id","day");--> statement-breakpoint
CREATE INDEX "daily_availability_aggregates_organization_day_idx" ON "daily_availability_aggregates" USING btree ("organization_id","day" DESC NULLS LAST,"service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_window_services_window_service_unique" ON "maintenance_window_services" USING btree ("organization_id","maintenance_window_id","service_id");--> statement-breakpoint
CREATE INDEX "maintenance_window_services_service_idx" ON "maintenance_window_services" USING btree ("organization_id","service_id");--> statement-breakpoint
CREATE INDEX "maintenance_windows_organization_time_idx" ON "maintenance_windows" USING btree ("organization_id","starts_at","ends_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "postmortems_organization_incident_unique" ON "postmortems" USING btree ("organization_id","incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "postmortems_slug_unique" ON "postmortems" USING btree (lower("slug"));--> statement-breakpoint
CREATE UNIQUE INDEX "retention_cleanup_runs_idempotency_unique" ON "retention_cleanup_runs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "retention_cleanup_runs_organization_timeline_idx" ON "retention_cleanup_runs" USING btree ("organization_id","started_at" DESC NULLS LAST,"id");