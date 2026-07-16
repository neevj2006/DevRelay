import { z } from "zod";

import { correlationIdSchema } from "./common.js";

export const apiErrorCodeValues = [
  "validation_failed",
  "authentication_required",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "quota_reached",
  "unsafe_target",
  "invalid_transition",
  "dependency_unavailable",
  "internal_error",
] as const;

export const apiErrorDetailSchema = z.strictObject({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(500),
  path: z
    .array(z.union([z.string(), z.number().int()]))
    .max(20)
    .optional(),
});

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(apiErrorCodeValues),
    message: z.string().min(1).max(1000),
    correlationId: correlationIdSchema,
    details: z.array(apiErrorDetailSchema).max(100).optional(),
    retryable: z.boolean(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
