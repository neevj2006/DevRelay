CREATE TYPE "public"."incident_actor_type" AS ENUM('user', 'monitor', 'worker', 'system');--> statement-breakpoint
CREATE TYPE "public"."incident_lifecycle" AS ENUM('detected', 'investigating', 'identified', 'monitoring', 'resolved', 'postmortem_published');--> statement-breakpoint
CREATE TYPE "public"."incident_outcome" AS ENUM('resolved', 'duplicate', 'merged', 'false_alarm', 'maintenance_related');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('degraded_performance', 'partial_outage', 'major_outage');--> statement-breakpoint
CREATE TYPE "public"."incident_source" AS ENUM('automatic_monitor', 'manual_responder', 'external_report', 'maintenance', 'system_health');--> statement-breakpoint
CREATE TABLE "incident_private_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_private_notes_body_length" CHECK (length(trim("incident_private_notes"."body")) BETWEEN 1 AND 10000),
	CONSTRAINT "incident_private_notes_idempotency_length" CHECK (length("incident_private_notes"."idempotency_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "incident_public_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_user_id" uuid,
	"lifecycle" "incident_lifecycle" NOT NULL,
	"body" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"published_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_public_updates_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "incident_public_updates_body_length" CHECK (length(trim("incident_public_updates"."body")) BETWEEN 1 AND 5000),
	CONSTRAINT "incident_public_updates_idempotency_length" CHECK (length("incident_public_updates"."idempotency_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "incident_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"impact" "monitor_impact" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"from_lifecycle" "incident_lifecycle",
	"to_lifecycle" "incident_lifecycle" NOT NULL,
	"outcome" "incident_outcome",
	"actor_type" "incident_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"evidence_check_result_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_transitions_lifecycle_changes" CHECK ("incident_transitions"."from_lifecycle" IS NULL OR "incident_transitions"."from_lifecycle" <> "incident_transitions"."to_lifecycle"),
	CONSTRAINT "incident_transitions_actor_consistent" CHECK (("incident_transitions"."actor_type" = 'user' AND "incident_transitions"."actor_user_id" IS NOT NULL) OR ("incident_transitions"."actor_type" <> 'user' AND "incident_transitions"."actor_user_id" IS NULL)),
	CONSTRAINT "incident_transitions_reason_length" CHECK (length(trim("incident_transitions"."reason")) BETWEEN 1 AND 2000),
	CONSTRAINT "incident_transitions_idempotency_length" CHECK (length("incident_transitions"."idempotency_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"public_title" text,
	"source" "incident_source" NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"lifecycle" "incident_lifecycle" NOT NULL,
	"outcome" "incident_outcome",
	"automatic_fingerprint" text,
	"creation_idempotency_key" text NOT NULL,
	"canonical_incident_id" uuid,
	"started_at" timestamp (3) with time zone NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "incidents_slug_length" CHECK (length("incidents"."slug") BETWEEN 1 AND 160),
	CONSTRAINT "incidents_title_length" CHECK (length(trim("incidents"."title")) BETWEEN 1 AND 240),
	CONSTRAINT "incidents_public_title_length" CHECK ("incidents"."public_title" IS NULL OR length(trim("incidents"."public_title")) BETWEEN 1 AND 240),
	CONSTRAINT "incidents_automatic_fingerprint_required" CHECK ("incidents"."source" <> 'automatic_monitor' OR length("incidents"."automatic_fingerprint") BETWEEN 16 AND 200),
	CONSTRAINT "incidents_terminal_fields_consistent" CHECK ((
        "incidents"."lifecycle" IN ('resolved', 'postmortem_published')
        AND "incidents"."resolved_at" IS NOT NULL
        AND "incidents"."outcome" IS NOT NULL
      ) OR (
        "incidents"."lifecycle" NOT IN ('resolved', 'postmortem_published')
        AND "incidents"."resolved_at" IS NULL
        AND ("incidents"."outcome" IS NULL OR "incidents"."outcome" = 'maintenance_related')
      )),
	CONSTRAINT "incidents_canonical_relationship_consistent" CHECK ((
        "incidents"."outcome" IN ('duplicate', 'merged') AND "incidents"."canonical_incident_id" IS NOT NULL
      ) OR (
        ("incidents"."outcome" IS NULL OR "incidents"."outcome" NOT IN ('duplicate', 'merged'))
        AND "incidents"."canonical_incident_id" IS NULL
      )),
	CONSTRAINT "incidents_canonical_not_self" CHECK ("incidents"."canonical_incident_id" IS NULL OR "incidents"."canonical_incident_id" <> "incidents"."id"),
	CONSTRAINT "incidents_resolution_time_order" CHECK ("incidents"."resolved_at" IS NULL OR "incidents"."resolved_at" >= "incidents"."started_at"),
	CONSTRAINT "incidents_creation_idempotency_length" CHECK (length("incidents"."creation_idempotency_key") BETWEEN 1 AND 200),
	CONSTRAINT "incidents_version_positive" CHECK ("incidents"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "incident_private_notes" ADD CONSTRAINT "incident_private_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_private_notes" ADD CONSTRAINT "incident_private_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_private_notes" ADD CONSTRAINT "incident_private_notes_organization_incident_fk" FOREIGN KEY ("organization_id","incident_id") REFERENCES "public"."incidents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_public_updates" ADD CONSTRAINT "incident_public_updates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_public_updates" ADD CONSTRAINT "incident_public_updates_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_public_updates" ADD CONSTRAINT "incident_public_updates_organization_incident_fk" FOREIGN KEY ("organization_id","incident_id") REFERENCES "public"."incidents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_organization_incident_fk" FOREIGN KEY ("organization_id","incident_id") REFERENCES "public"."incidents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_organization_service_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_transitions" ADD CONSTRAINT "incident_transitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_transitions" ADD CONSTRAINT "incident_transitions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_transitions" ADD CONSTRAINT "incident_transitions_organization_incident_fk" FOREIGN KEY ("organization_id","incident_id") REFERENCES "public"."incidents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_transitions" ADD CONSTRAINT "incident_transitions_organization_check_result_fk" FOREIGN KEY ("organization_id","evidence_check_result_id") REFERENCES "public"."check_results"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_canonical_incident_fk" FOREIGN KEY ("organization_id","canonical_incident_id") REFERENCES "public"."incidents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_private_notes_idempotency_unique" ON "incident_private_notes" USING btree ("organization_id","incident_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "incident_private_notes_timeline_idx" ON "incident_private_notes" USING btree ("organization_id","incident_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_public_updates_idempotency_unique" ON "incident_public_updates" USING btree ("organization_id","incident_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "incident_public_updates_timeline_idx" ON "incident_public_updates" USING btree ("organization_id","incident_id","published_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_services_organization_incident_service_unique" ON "incident_services" USING btree ("organization_id","incident_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_services_one_primary_unique" ON "incident_services" USING btree ("organization_id","incident_id") WHERE "incident_services"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "incident_services_service_id_idx" ON "incident_services" USING btree ("organization_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_transitions_idempotency_unique" ON "incident_transitions" USING btree ("organization_id","incident_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "incident_transitions_timeline_idx" ON "incident_transitions" USING btree ("organization_id","incident_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_organization_slug_unique" ON "incidents" USING btree ("organization_id",lower("slug"));--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_creation_idempotency_unique" ON "incidents" USING btree ("organization_id","creation_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_one_active_automatic_unique" ON "incidents" USING btree ("organization_id","automatic_fingerprint") WHERE "incidents"."source" = 'automatic_monitor' AND "incidents"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "incidents_active_organization_idx" ON "incidents" USING btree ("organization_id","started_at" DESC NULLS LAST,"id") WHERE "incidents"."resolved_at" IS NULL;