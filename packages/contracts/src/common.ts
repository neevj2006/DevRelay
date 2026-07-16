import { z } from "zod";

export const uuidSchema = z.uuid();
export const utcDateTimeSchema = z.iso.datetime({ offset: true });
export const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const idempotencyKeySchema = z.string().min(1).max(240);
export const correlationIdSchema = z.string().min(1).max(200);

export const entityReferenceSchema = z.strictObject({
  id: uuidSchema,
  organizationId: uuidSchema,
});
export type EntityReference = z.infer<typeof entityReferenceSchema>;
