import { z } from "zod";

import { idempotencyKeySchema, slugSchema, utcDateTimeSchema, uuidSchema } from "./common.js";
import {
  incidentLifecycleValues,
  incidentOutcomeValues,
  incidentSeverityValues,
  incidentSourceValues,
  monitorImpactValues,
  monitorMethodValues,
  monitorStatusValues,
  organizationRoleValues,
  serviceStateValues,
} from "./enums.js";

const displayNameSchema = z.string().trim().min(1).max(120);
const httpEndpointSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP and HTTPS endpoints are supported");

export const createOrganizationInputSchema = z.strictObject({
  name: displayNameSchema,
  slug: slugSchema,
});

export const updateOrganizationInputSchema = z
  .strictObject({
    name: displayNameSchema.optional(),
    slug: slugSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.slug !== undefined, {
    message: "At least one organization field must be provided",
  });

export const organizationInvitationTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const createOrganizationInvitationInputSchema = z.strictObject({
  email: z
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  role: z.enum(organizationRoleValues).exclude(["owner"]),
});

export const updateOrganizationMemberRoleInputSchema = z.strictObject({
  role: z.enum(organizationRoleValues).exclude(["owner"]),
});

export const transferOrganizationOwnershipInputSchema = z.strictObject({
  memberId: uuidSchema,
});

export const createServiceInputSchema = z.strictObject({
  displayOrder: z.number().int().nonnegative().default(0),
  isPublic: z.boolean().default(true),
  name: displayNameSchema,
  publicDescription: z.string().trim().min(1).max(1000).optional(),
});

export const updateServiceInputSchema = z.strictObject({
  displayOrder: z.number().int().nonnegative().optional(),
  isPublic: z.boolean().optional(),
  name: displayNameSchema.optional(),
  publicDescription: z.string().trim().min(1).max(1000).nullable().optional(),
});

export const acceptedStatusCodeRangeSchema = z
  .strictObject({
    from: z.number().int().min(100).max(599),
    to: z.number().int().min(100).max(599),
  })
  .refine((range) => range.from <= range.to, { message: "from must be less than or equal to to" });

export const monitorPolicyInputSchema = z.strictObject({
  acceptedStatusCodes: z.array(acceptedStatusCodeRangeSchema).min(1).max(20),
  failureImpact: z.enum(monitorImpactValues).default("major_outage"),
  failureThreshold: z.number().int().min(1).max(10).default(3),
  intervalSeconds: z.number().int().min(10).max(86_400),
  recoveryThreshold: z.number().int().min(1).max(10).default(2),
  requestHeaders: z.record(z.string().min(1).max(80), z.string().max(1000)).default({}),
  timeoutMilliseconds: z.number().int().min(100).max(30_000),
});

export const createMonitorInputSchema = z
  .strictObject({
    endpointUrl: httpEndpointSchema,
    method: z.enum(monitorMethodValues).default("GET"),
    name: displayNameSchema,
    policy: monitorPolicyInputSchema,
    serviceId: uuidSchema,
  })
  .refine((input) => input.policy.timeoutMilliseconds < input.policy.intervalSeconds * 1000, {
    message: "timeout must be shorter than the monitor interval",
    path: ["policy"],
  });

export const updateMonitorInputSchema = z.strictObject({
  endpointUrl: httpEndpointSchema.optional(),
  method: z.enum(monitorMethodValues).optional(),
  name: displayNameSchema.optional(),
  policy: monitorPolicyInputSchema.optional(),
});

export const createManualIncidentInputSchema = z.strictObject({
  affectedServiceIds: z.array(uuidSchema).min(1).max(50),
  idempotencyKey: idempotencyKeySchema,
  initialLifecycle: z.literal("investigating").default("investigating"),
  privateSummary: z.string().trim().min(1).max(5000),
  publicTitle: z.string().trim().min(1).max(240).optional(),
  publicUpdate: z.string().trim().min(1).max(5000).optional(),
  severity: z.enum(incidentSeverityValues),
  title: z.string().trim().min(1).max(240),
});

export const transitionIncidentInputSchema = z.strictObject({
  canonicalIncidentId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
  outcome: z.enum(incidentOutcomeValues).optional(),
  reason: z.string().trim().min(1).max(2000),
  toLifecycle: z.enum(incidentLifecycleValues),
});

export const createPublicIncidentUpdateInputSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
  idempotencyKey: idempotencyKeySchema,
  lifecycle: z.enum(incidentLifecycleValues),
  publicationConfirmed: z.literal(true),
});

export const createPrivateIncidentNoteInputSchema = z.strictObject({
  body: z.string().trim().min(1).max(10_000),
  idempotencyKey: idempotencyKeySchema,
});

export const createSubscriptionInputSchema = z.strictObject({
  email: z
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  incidentNotifications: z.boolean().default(true),
  maintenanceNotifications: z.boolean().default(true),
  serviceIds: z.array(uuidSchema).max(100).default([]),
});

export const updateSubscriberPreferencesInputSchema = z.strictObject({
  incidentNotifications: z.boolean(),
  maintenanceNotifications: z.boolean(),
  serviceIds: z.array(uuidSchema).max(100),
});

export const createWebhookDestinationInputSchema = z.strictObject({
  endpointUrl: httpEndpointSchema,
  name: displayNameSchema,
});

export const createStatusPageInputSchema = z.strictObject({
  description: z.string().trim().min(1).max(2000).optional(),
  serviceIds: z.array(uuidSchema).max(100).default([]),
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
});

export const updateStatusPageInputSchema = z.strictObject({
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  serviceIds: z.array(uuidSchema).max(100).optional(),
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(160).optional(),
});

export const createMaintenanceWindowInputSchema = z
  .strictObject({
    endsAt: utcDateTimeSchema,
    internalNote: z.string().trim().min(1).max(5000).optional(),
    notifySubscribers: z.boolean().default(false),
    publicDescription: z.string().trim().min(1).max(2000).optional(),
    serviceIds: z.array(uuidSchema).min(1).max(100),
    startsAt: utcDateTimeSchema,
    title: z.string().trim().min(1).max(200),
  })
  .refine((input) => new Date(input.endsAt) > new Date(input.startsAt), {
    message: "endsAt must be later than startsAt",
    path: ["endsAt"],
  });

export const cancelMaintenanceWindowInputSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000),
});

export const publishPostmortemInputSchema = z.strictObject({
  actionItems: z
    .array(
      z.strictObject({
        description: z.string().trim().min(1).max(1000),
        dueAt: utcDateTimeSchema.optional(),
        owner: z.string().trim().min(1).max(160).optional(),
      }),
    )
    .max(100),
  impact: z.string().trim().min(1).max(10_000),
  resolution: z.string().trim().min(1).max(10_000),
  rootCause: z.string().trim().min(1).max(10_000),
  summary: z.string().trim().min(1).max(5000),
  timeline: z.string().trim().min(1).max(20_000),
});

export const createApiKeyInputSchema = z.strictObject({
  expiresAt: utcDateTimeSchema.optional(),
  label: displayNameSchema,
  scopes: z.array(z.string().min(1).max(120)).min(1).max(32),
});

export const serviceResponseSchema = z.strictObject({
  currentState: z.enum(serviceStateValues),
  displayOrder: z.number().int().nonnegative(),
  id: uuidSchema,
  isPublic: z.boolean(),
  name: z.string(),
  organizationId: uuidSchema,
  publicDescription: z.string().nullable(),
  updatedAt: utcDateTimeSchema,
});

export const monitorResponseSchema = z.strictObject({
  endpointUrl: z.string(),
  id: uuidSchema,
  method: z.enum(monitorMethodValues),
  name: z.string(),
  organizationId: uuidSchema,
  serviceId: uuidSchema,
  status: z.enum(monitorStatusValues),
  updatedAt: utcDateTimeSchema,
});

export const incidentResponseSchema = z.strictObject({
  id: uuidSchema,
  lifecycle: z.enum(incidentLifecycleValues),
  organizationId: uuidSchema,
  outcome: z.enum(incidentOutcomeValues).nullable(),
  publicTitle: z.string().nullable(),
  resolvedAt: utcDateTimeSchema.nullable(),
  severity: z.enum(incidentSeverityValues),
  slug: slugSchema,
  source: z.enum(incidentSourceValues),
  startedAt: utcDateTimeSchema,
  title: z.string(),
  updatedAt: utcDateTimeSchema,
});

export const publicStatusPageResponseSchema = z.strictObject({
  description: z.string().nullable(),
  services: z.array(
    z.strictObject({
      currentState: z.enum(serviceStateValues),
      id: uuidSchema,
      name: z.string(),
      publicDescription: z.string().nullable(),
      updatedAt: utcDateTimeSchema,
    }),
  ),
  slug: slugSchema,
  title: z.string(),
  updatedAt: utcDateTimeSchema,
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;
export type CreateServiceInput = z.infer<typeof createServiceInputSchema>;
export type CreateMonitorInput = z.infer<typeof createMonitorInputSchema>;
export type CreateManualIncidentInput = z.infer<typeof createManualIncidentInputSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionInputSchema>;
export type ServiceResponse = z.infer<typeof serviceResponseSchema>;
export type MonitorResponse = z.infer<typeof monitorResponseSchema>;
export type IncidentResponse = z.infer<typeof incidentResponseSchema>;
export type PublicStatusPageResponse = z.infer<typeof publicStatusPageResponseSchema>;
