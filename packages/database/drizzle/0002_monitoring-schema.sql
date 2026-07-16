CREATE TYPE "public"."check_outcome" AS ENUM('success', 'failure', 'timeout', 'rejected_target', 'execution_error');--> statement-breakpoint
CREATE TYPE "public"."check_window_status" AS ENUM('pending', 'claimed', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."monitor_impact" AS ENUM('degraded_performance', 'partial_outage', 'major_outage');--> statement-breakpoint
CREATE TYPE "public"."monitor_method" AS ENUM('GET', 'HEAD');--> statement-breakpoint
CREATE TYPE "public"."monitor_status" AS ENUM('pending', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."service_state" AS ENUM('unknown', 'operational', 'degraded_performance', 'partial_outage', 'major_outage', 'under_maintenance');--> statement-breakpoint
CREATE TYPE "public"."worker_deployment_mode" AS ENUM('local', 'hosted');--> statement-breakpoint
CREATE TYPE "public"."worker_queue_adapter" AS ENUM('bullmq', 'qstash');--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"scheduled_at" timestamp (3) with time zone NOT NULL,
	"outcome" "check_outcome" NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone NOT NULL,
	"latency_milliseconds" integer,
	"http_status_code" integer,
	"region" text NOT NULL,
	"evidence_code" text NOT NULL,
	"evidence_summary" text NOT NULL,
	"safe_evidence" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_results_time_order" CHECK ("check_results"."finished_at" >= "check_results"."started_at"),
	CONSTRAINT "check_results_latency_nonnegative" CHECK ("check_results"."latency_milliseconds" IS NULL OR "check_results"."latency_milliseconds" >= 0),
	CONSTRAINT "check_results_http_status_range" CHECK ("check_results"."http_status_code" IS NULL OR "check_results"."http_status_code" BETWEEN 100 AND 599),
	CONSTRAINT "check_results_region_length" CHECK (length("check_results"."region") BETWEEN 1 AND 64),
	CONSTRAINT "check_results_evidence_code_length" CHECK (length("check_results"."evidence_code") BETWEEN 1 AND 100),
	CONSTRAINT "check_results_evidence_summary_limit" CHECK (length("check_results"."evidence_summary") BETWEEN 1 AND 1000),
	CONSTRAINT "check_results_safe_evidence_limit" CHECK ("check_results"."safe_evidence" IS NULL OR octet_length("check_results"."safe_evidence"::text) <= 8192)
);
--> statement-breakpoint
CREATE TABLE "expected_check_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"scheduled_at" timestamp (3) with time zone NOT NULL,
	"status" "check_window_status" DEFAULT 'pending' NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp (3) with time zone,
	"claimed_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expected_check_windows_logical_unique" UNIQUE("organization_id","monitor_id","scheduled_at"),
	CONSTRAINT "expected_check_windows_attempt_count_nonnegative" CHECK ("expected_check_windows"."attempt_count" >= 0),
	CONSTRAINT "expected_check_windows_claim_consistent" CHECK ("expected_check_windows"."status" <> 'claimed' OR ("expected_check_windows"."lease_owner" IS NOT NULL AND "expected_check_windows"."lease_expires_at" IS NOT NULL AND "expected_check_windows"."claimed_at" IS NOT NULL)),
	CONSTRAINT "expected_check_windows_completion_consistent" CHECK ("expected_check_windows"."status" <> 'completed' OR "expected_check_windows"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "monitor_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"interval_seconds" integer NOT NULL,
	"timeout_milliseconds" integer NOT NULL,
	"failure_threshold" integer DEFAULT 3 NOT NULL,
	"recovery_threshold" integer DEFAULT 2 NOT NULL,
	"failure_impact" "monitor_impact" DEFAULT 'major_outage' NOT NULL,
	"accepted_status_codes" jsonb DEFAULT '[{"from": 200, "to": 399}]'::jsonb NOT NULL,
	"request_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitor_policies_interval_range" CHECK ("monitor_policies"."interval_seconds" BETWEEN 10 AND 86400),
	CONSTRAINT "monitor_policies_timeout_range" CHECK ("monitor_policies"."timeout_milliseconds" BETWEEN 100 AND 30000),
	CONSTRAINT "monitor_policies_timeout_before_interval" CHECK ("monitor_policies"."timeout_milliseconds" < "monitor_policies"."interval_seconds" * 1000),
	CONSTRAINT "monitor_policies_failure_threshold_range" CHECK ("monitor_policies"."failure_threshold" BETWEEN 1 AND 10),
	CONSTRAINT "monitor_policies_recovery_threshold_range" CHECK ("monitor_policies"."recovery_threshold" BETWEEN 1 AND 10),
	CONSTRAINT "monitor_policies_status_codes_array" CHECK (jsonb_typeof("monitor_policies"."accepted_status_codes") = 'array' AND jsonb_array_length("monitor_policies"."accepted_status_codes") BETWEEN 1 AND 20),
	CONSTRAINT "monitor_policies_request_headers_object" CHECK (jsonb_typeof("monitor_policies"."request_headers") = 'object')
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"method" "monitor_method" DEFAULT 'GET' NOT NULL,
	"status" "monitor_status" DEFAULT 'pending' NOT NULL,
	"next_due_at" timestamp (3) with time zone,
	"last_completed_scheduled_at" timestamp (3) with time zone,
	"paused_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "monitors_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "monitors_pause_state_consistent" CHECK (("monitors"."status" = 'paused' AND "monitors"."paused_at" IS NOT NULL) OR ("monitors"."status" <> 'paused' AND "monitors"."paused_at" IS NULL)),
	CONSTRAINT "monitors_name_nonempty" CHECK (length(trim("monitors"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "monitors_endpoint_length" CHECK (length("monitors"."endpoint_url") BETWEEN 1 AND 2048)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"current_state" "service_state" DEFAULT 'unknown' NOT NULL,
	"evidence_state" "service_state" DEFAULT 'unknown' NOT NULL,
	"state_changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"state_evidence" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "services_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "services_display_order_nonnegative" CHECK ("services"."display_order" >= 0),
	CONSTRAINT "services_name_nonempty" CHECK (length(trim("services"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "services_version_positive" CHECK ("services"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_key" text NOT NULL,
	"deployment_mode" "worker_deployment_mode" NOT NULL,
	"queue_adapter" "worker_queue_adapter" NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"heartbeat_at" timestamp (3) with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_heartbeats_worker_key_length" CHECK (length("worker_heartbeats"."worker_key") BETWEEN 1 AND 200),
	CONSTRAINT "worker_heartbeats_time_order" CHECK ("worker_heartbeats"."heartbeat_at" >= "worker_heartbeats"."started_at")
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_expected_window_fk" FOREIGN KEY ("organization_id","monitor_id","scheduled_at") REFERENCES "public"."expected_check_windows"("organization_id","monitor_id","scheduled_at") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_check_windows" ADD CONSTRAINT "expected_check_windows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_check_windows" ADD CONSTRAINT "expected_check_windows_organization_monitor_fk" FOREIGN KEY ("organization_id","monitor_id") REFERENCES "public"."monitors"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_policies" ADD CONSTRAINT "monitor_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_policies" ADD CONSTRAINT "monitor_policies_organization_monitor_fk" FOREIGN KEY ("organization_id","monitor_id") REFERENCES "public"."monitors"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_results_logical_unique" ON "check_results" USING btree ("organization_id","monitor_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "check_results_organization_id_id_unique" ON "check_results" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "check_results_recent_monitor_idx" ON "check_results" USING btree ("organization_id","monitor_id","finished_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "expected_check_windows_claimable_idx" ON "expected_check_windows" USING btree ("scheduled_at","id") WHERE "expected_check_windows"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "expected_check_windows_expired_lease_idx" ON "expected_check_windows" USING btree ("lease_expires_at","id") WHERE "expected_check_windows"."status" = 'claimed';--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_policies_organization_monitor_unique" ON "monitor_policies" USING btree ("organization_id","monitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitors_active_service_name_unique" ON "monitors" USING btree ("organization_id","service_id",lower("name")) WHERE "monitors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "monitors_due_idx" ON "monitors" USING btree ("next_due_at","id") WHERE "monitors"."status" = 'active' AND "monitors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "monitors_service_id_idx" ON "monitors" USING btree ("organization_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_active_name_unique" ON "services" USING btree ("organization_id",lower("name")) WHERE "services"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "services_organization_display_order_idx" ON "services" USING btree ("organization_id","display_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_heartbeats_worker_key_unique" ON "worker_heartbeats" USING btree ("worker_key");--> statement-breakpoint
CREATE INDEX "worker_heartbeats_heartbeat_at_idx" ON "worker_heartbeats" USING btree ("heartbeat_at");