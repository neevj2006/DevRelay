CREATE TYPE "public"."monitor_policy_state" AS ENUM('unknown', 'healthy', 'failing', 'unhealthy', 'recovering', 'stale', 'maintenance');--> statement-breakpoint
CREATE TABLE "monitor_policy_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"state" "monitor_policy_state" DEFAULT 'unknown' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"latest_scheduled_at" timestamp (3) with time zone,
	"latest_outcome" "check_outcome",
	"fresh_until" timestamp (3) with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitor_policy_evaluations_counters_nonnegative" CHECK ("monitor_policy_evaluations"."consecutive_failures" >= 0 AND "monitor_policy_evaluations"."consecutive_successes" >= 0),
	CONSTRAINT "monitor_policy_evaluations_evidence_limit" CHECK (octet_length("monitor_policy_evaluations"."evidence"::text) <= 8192)
);
--> statement-breakpoint
CREATE TABLE "service_state_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"declared_state" "service_state" NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"cancelled_at" timestamp (3) with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_state_overrides_allowed_state" CHECK ("service_state_overrides"."declared_state" IN ('operational','degraded_performance','partial_outage','major_outage')),
	CONSTRAINT "service_state_overrides_time_order" CHECK ("service_state_overrides"."expires_at" > "service_state_overrides"."starts_at"),
	CONSTRAINT "service_state_overrides_max_duration" CHECK ("service_state_overrides"."expires_at" <= "service_state_overrides"."starts_at" + interval '24 hours'),
	CONSTRAINT "service_state_overrides_reason_length" CHECK (length(trim("service_state_overrides"."reason")) BETWEEN 1 AND 500),
	CONSTRAINT "service_state_overrides_cancellation_consistent" CHECK (("service_state_overrides"."cancelled_at" IS NULL AND "service_state_overrides"."cancelled_by_user_id" IS NULL) OR ("service_state_overrides"."cancelled_at" IS NOT NULL AND "service_state_overrides"."cancelled_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "service_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"from_state" "service_state" NOT NULL,
	"to_state" "service_state" NOT NULL,
	"evidence_state" "service_state" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_state_transitions_actor_consistent" CHECK (("service_state_transitions"."actor_type" = 'user' AND "service_state_transitions"."actor_user_id" IS NOT NULL) OR ("service_state_transitions"."actor_type" IN ('worker','system') AND "service_state_transitions"."actor_user_id" IS NULL)),
	CONSTRAINT "service_state_transitions_reason_length" CHECK (length("service_state_transitions"."reason") BETWEEN 1 AND 500),
	CONSTRAINT "service_state_transitions_evidence_limit" CHECK (octet_length("service_state_transitions"."evidence"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "monitor_policy_evaluations" ADD CONSTRAINT "monitor_policy_evaluations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_policy_evaluations" ADD CONSTRAINT "monitor_policy_evaluations_organization_monitor_fk" FOREIGN KEY ("organization_id","monitor_id") REFERENCES "public"."monitors"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_policy_evaluations" ADD CONSTRAINT "monitor_policy_evaluations_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_overrides" ADD CONSTRAINT "service_state_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_overrides" ADD CONSTRAINT "service_state_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_overrides" ADD CONSTRAINT "service_state_overrides_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_overrides" ADD CONSTRAINT "service_state_overrides_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_transitions" ADD CONSTRAINT "service_state_transitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_transitions" ADD CONSTRAINT "service_state_transitions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_state_transitions" ADD CONSTRAINT "service_state_transitions_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_policy_evaluations_monitor_unique" ON "monitor_policy_evaluations" USING btree ("organization_id","monitor_id");--> statement-breakpoint
CREATE INDEX "monitor_policy_evaluations_service_idx" ON "monitor_policy_evaluations" USING btree ("organization_id","service_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "service_state_overrides_one_uncancelled_unique" ON "service_state_overrides" USING btree ("organization_id","service_id") WHERE "service_state_overrides"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "service_state_overrides_expiry_idx" ON "service_state_overrides" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_state_transitions_idempotency_unique" ON "service_state_transitions" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "service_state_transitions_timeline_idx" ON "service_state_transitions" USING btree ("organization_id","service_id","occurred_at" DESC NULLS LAST,"id");