CREATE TYPE "public"."monitor_type" AS ENUM('http', 'tls', 'dns');--> statement-breakpoint
ALTER TABLE "monitors" DROP CONSTRAINT "monitors_endpoint_length";--> statement-breakpoint
ALTER TABLE "monitors" ALTER COLUMN "endpoint_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "protocol" "monitor_type" DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "monitor_type" "monitor_type" DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "protocol_config" jsonb DEFAULT '{"type":"http"}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "monitors" SET "protocol_config" = jsonb_build_object(
  'type', 'http', 'endpointUrl', "endpoint_url", 'method', "method"
);--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_protocol_configuration_valid" CHECK (jsonb_typeof("monitors"."protocol_config") = 'object' AND "monitors"."protocol_config"->>'type' = "monitors"."monitor_type"::text);--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_endpoint_configuration_consistent" CHECK (("monitors"."monitor_type" IN ('http', 'tls') AND length("monitors"."endpoint_url") BETWEEN 1 AND 2048) OR ("monitors"."monitor_type" = 'dns' AND "monitors"."endpoint_url" IS NULL));
