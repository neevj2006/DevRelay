import {
  type ApiEnvironment,
  apiEnvironmentSchema,
  type WebEnvironment,
  webEnvironmentSchema,
  type WorkerEnvironment,
  workerEnvironmentSchema,
} from "@devrelay/contracts";

export type { ApiEnvironment, WebEnvironment, WorkerEnvironment };

export function parseApiEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}

export function parseWebEnvironment(environment: NodeJS.ProcessEnv): WebEnvironment {
  return webEnvironmentSchema.parse(environment);
}

export function parseWorkerEnvironment(environment: NodeJS.ProcessEnv): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}
