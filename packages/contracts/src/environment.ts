import { z } from "zod";

import { workerQueueAdapterValues } from "./enums.js";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const databaseUrlSchema = z.url().refine((value) => value.startsWith("postgresql://"), {
  message: "DATABASE_URL must use PostgreSQL",
});
const redisUrlSchema = z.url().refine((value) => value.startsWith("redis://"), {
  message: "REDIS_URL must use Redis",
});
const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32).optional(),
);

export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NODE_ENV: nodeEnvironmentSchema.default("development"),
});

export const apiEnvironmentSchema = z
  .object({
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    AUTH_BASE_URL: z.url().default("http://localhost:4000"),
    AUTH_SECRET: z.string().min(32).optional(),
    DATABASE_URL: databaseUrlSchema,
    GITHUB_CLIENT_ID: optionalNonEmptyString,
    GITHUB_CLIENT_SECRET: optionalNonEmptyString,
    NODE_ENV: nodeEnvironmentSchema.default("development"),
    NOTIFICATION_ENCRYPTION_KEY: optionalSecret,
    RESEND_API_KEY: optionalNonEmptyString,
    RESEND_WEBHOOK_SECRET: optionalNonEmptyString,
    SMTP_HOST: z.string().min(1).default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    EMAIL_FROM: z.string().min(3).max(320).default("DevRelay <notifications@localhost>"),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_DELIVERY_BASE_URL: z.url().default("http://localhost:4000"),
    QSTASH_DAILY_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(1_000).default(250),
    QSTASH_DISPATCH_BATCH_SIZE: z.coerce.number().int().min(1).max(25).default(5),
    QSTASH_HOSTED_SCHEDULER_PAUSED: z.enum(["true", "false"]).default("false"),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_TOKEN: z.string().min(1).optional(),
    QUEUE_ADAPTER: z.enum(workerQueueAdapterValues).default("bullmq"),
    REDIS_URL: redisUrlSchema.optional(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && environment.AUTH_SECRET === undefined) {
      context.addIssue({
        code: "custom",
        message: "AUTH_SECRET is required in production",
        path: ["AUTH_SECRET"],
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      environment.NOTIFICATION_ENCRYPTION_KEY === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "NOTIFICATION_ENCRYPTION_KEY is required in production",
        path: ["NOTIFICATION_ENCRYPTION_KEY"],
      });
    }
    if (
      (environment.GITHUB_CLIENT_ID === undefined) !==
      (environment.GITHUB_CLIENT_SECRET === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "GitHub OAuth client ID and secret must be configured together",
        path: ["GITHUB_CLIENT_ID"],
      });
    }
    if (environment.QUEUE_ADAPTER === "bullmq" && environment.REDIS_URL === undefined) {
      context.addIssue({
        code: "custom",
        message: "REDIS_URL is required for the BullMQ adapter",
        path: ["REDIS_URL"],
      });
    }
    if (
      environment.QUEUE_ADAPTER === "qstash" &&
      (environment.QSTASH_CURRENT_SIGNING_KEY === undefined ||
        environment.QSTASH_NEXT_SIGNING_KEY === undefined ||
        environment.QSTASH_TOKEN === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "The QStash token and both signing keys are required for the QStash adapter",
        path: ["QSTASH_CURRENT_SIGNING_KEY"],
      });
    }
  });

export const workerEnvironmentSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    NODE_ENV: nodeEnvironmentSchema.default("development"),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    EMAIL_FROM: z.string().min(3).max(320).default("DevRelay <notifications@localhost>"),
    NOTIFICATION_ENCRYPTION_KEY: optionalSecret,
    RESEND_API_KEY: optionalNonEmptyString,
    SMTP_HOST: z.string().min(1).default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    QUEUE_ADAPTER: z.enum(workerQueueAdapterValues).default("bullmq"),
    REDIS_URL: redisUrlSchema.optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    WORKER_ID: z.string().min(1).max(200).default("local-worker"),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.NOTIFICATION_ENCRYPTION_KEY === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "NOTIFICATION_ENCRYPTION_KEY is required in production",
        path: ["NOTIFICATION_ENCRYPTION_KEY"],
      });
    }
    if (environment.QUEUE_ADAPTER === "bullmq" && environment.REDIS_URL === undefined) {
      context.addIssue({
        code: "custom",
        message: "REDIS_URL is required for the BullMQ adapter",
        path: ["REDIS_URL"],
      });
    }
  });

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
