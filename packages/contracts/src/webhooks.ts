import { z } from "zod";

import { utcDateTimeSchema, uuidSchema } from "./common.js";
import { incidentLifecycleValues, incidentSeverityValues, serviceStateValues } from "./enums.js";

export const webhookEventTypeValues = [
  "incident.created",
  "incident.updated",
  "incident.resolved",
] as const;

export const incidentWebhookPayloadV1Schema = z.strictObject({
  affectedServices: z.array(
    z.strictObject({
      id: uuidSchema,
      name: z.string().min(1).max(120),
      state: z.enum(serviceStateValues),
    }),
  ),
  eventId: uuidSchema,
  eventType: z.enum(webhookEventTypeValues),
  incident: z.strictObject({
    id: uuidSchema,
    lifecycle: z.enum(incidentLifecycleValues),
    publicTitle: z.string().min(1).max(240),
    severity: z.enum(incidentSeverityValues),
    startedAt: utcDateTimeSchema,
  }),
  occurredAt: utcDateTimeSchema,
  organizationId: uuidSchema,
  publicUpdate: z
    .strictObject({
      body: z.string().min(1).max(5000),
      publishedAt: utcDateTimeSchema,
    })
    .optional(),
  version: z.literal(1),
});

export const webhookHeadersSchema = z.strictObject({
  "devrelay-delivery-id": uuidSchema,
  "devrelay-signature": z.string().regex(/^v1=[a-f0-9]{64}$/),
  "devrelay-timestamp": z.string().regex(/^\d{10,13}$/),
  "devrelay-version": z.literal("1"),
});

export type IncidentWebhookPayloadV1 = z.infer<typeof incidentWebhookPayloadV1Schema>;
export type WebhookHeaders = z.infer<typeof webhookHeadersSchema>;
