import { z } from "zod";

import { workerQueueAdapterValues } from "./enums.js";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const databaseUrlSchema = z.url().refine((value) => value.startsWith("postgresql://"), {
  message: "DATABASE_URL must use PostgreSQL",
});
const redisUrlSchema = z.url().refine((value) => value.startsWith("redis://"), {
  message: "REDIS_URL must use Redis",
});

export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NODE_ENV: nodeEnvironmentSchema.default("development"),
});

export const apiEnvironmentSchema = z
  .object({
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    AUTH_SECRET: z.string().min(32).optional(),
    DATABASE_URL: databaseUrlSchema,
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    NODE_ENV: nodeEnvironmentSchema.default("development"),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    QUEUE_ADAPTER: z.enum(workerQueueAdapterValues).default("bullmq"),
    REDIS_URL: redisUrlSchema.optional(),
  })
  .superRefine((environment, context) => {
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
        environment.QSTASH_NEXT_SIGNING_KEY === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Both QStash signing keys are required for the QStash adapter",
        path: ["QSTASH_CURRENT_SIGNING_KEY"],
      });
    }
  });

export const workerEnvironmentSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    NODE_ENV: nodeEnvironmentSchema.default("development"),
    QUEUE_ADAPTER: z.enum(workerQueueAdapterValues).default("bullmq"),
    REDIS_URL: redisUrlSchema.optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    WORKER_ID: z.string().min(1).max(200).default("local-worker"),
  })
  .superRefine((environment, context) => {
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
