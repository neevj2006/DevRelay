ALTER TABLE "monitors" ADD COLUMN "configuration_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "tested_configuration_version" integer;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "last_tested_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "last_test_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_configuration_version_positive" CHECK ("monitors"."configuration_version" > 0);--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_tested_version_valid" CHECK ("monitors"."tested_configuration_version" IS NULL OR ("monitors"."tested_configuration_version" > 0 AND "monitors"."tested_configuration_version" <= "monitors"."configuration_version"));