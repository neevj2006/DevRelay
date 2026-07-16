export * from "./common.js";
export * from "./enums.js";
export * from "./environment.js";
export * from "./errors.js";
export * from "./http.js";
export * from "./pagination.js";
export * from "./queue.js";
export * from "./webhooks.js";

export interface VersionedJob<TPayload> {
  correlationId: string;
  createdAt: string;
  id: string;
  name: string;
  organizationId: string;
  payload: TPayload;
  version: number;
}
