import { z } from "zod";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const portSchema = z.coerce.number().int().min(1).max(65_535);

const sharedServerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  NODE_ENV: nodeEnvironmentSchema.default("development"),
  REDIS_URL: z.string().url().startsWith("redis://"),
});

const apiEnvironmentSchema = sharedServerEnvironmentSchema.extend({
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: portSchema.default(4000),
});

const workerEnvironmentSchema = sharedServerEnvironmentSchema.extend({
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
});

const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NODE_ENV: nodeEnvironmentSchema.default("development"),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function parseApiEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}

export function parseWebEnvironment(environment: NodeJS.ProcessEnv): WebEnvironment {
  return webEnvironmentSchema.parse(environment);
}

export function parseWorkerEnvironment(environment: NodeJS.ProcessEnv): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}
