import { z } from "zod";

import {
  correlationIdSchema,
  idempotencyKeySchema,
  utcDateTimeSchema,
  uuidSchema,
} from "./common.js";

const jobEnvelopeFields = {
  correlationId: correlationIdSchema,
  createdAt: utcDateTimeSchema,
  id: idempotencyKeySchema,
  organizationId: uuidSchema,
} as const;

export const monitorCheckJobSchema = z.strictObject({
  ...jobEnvelopeFields,
  name: z.literal("monitor.check"),
  payload: z.strictObject({
    monitorId: uuidSchema,
    scheduledAt: utcDateTimeSchema,
  }),
  version: z.literal(1),
});

export const outboxDispatchJobSchema = z.strictObject({
  ...jobEnvelopeFields,
  name: z.literal("outbox.dispatch"),
  payload: z.strictObject({
    outboxEventId: uuidSchema,
  }),
  version: z.literal(1),
});

export const notificationDeliveryJobSchema = z.strictObject({
  ...jobEnvelopeFields,
  name: z.literal("notification.deliver"),
  payload: z.strictObject({
    deliveryId: uuidSchema,
  }),
  version: z.literal(1),
});

export const availabilityAggregateJobSchema = z.strictObject({
  ...jobEnvelopeFields,
  name: z.literal("availability.aggregate"),
  payload: z.strictObject({
    day: z.iso.date(),
    serviceId: uuidSchema,
  }),
  version: z.literal(1),
});

export const queueJobSchema = z.discriminatedUnion("name", [
  monitorCheckJobSchema,
  outboxDispatchJobSchema,
  notificationDeliveryJobSchema,
  availabilityAggregateJobSchema,
]);

export const queueJobNameValues = queueJobSchema.options.map(
  (option) => option.shape.name.value,
) as ["monitor.check", "outbox.dispatch", "notification.deliver", "availability.aggregate"];

export type MonitorCheckJob = z.infer<typeof monitorCheckJobSchema>;
export type OutboxDispatchJob = z.infer<typeof outboxDispatchJobSchema>;
export type NotificationDeliveryJob = z.infer<typeof notificationDeliveryJobSchema>;
export type AvailabilityAggregateJob = z.infer<typeof availabilityAggregateJobSchema>;
export type QueueJob = z.infer<typeof queueJobSchema>;
