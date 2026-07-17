import { createHash } from "node:crypto";

import { type QueueJob, queueJobSchema } from "@devrelay/contracts";

export type RetryCategory = "permanent" | "transient";

export interface EnqueueOptions {
  attempts?: number;
  idempotencyKey?: string;
}

export interface EnqueueResult {
  accepted: boolean;
  jobId: string;
}

export interface QueueHealth {
  adapter: "bullmq" | "qstash";
  deadLettered: number;
  delayed: number;
  failed: number;
  lagMilliseconds: number;
  paused: boolean;
  pending: number;
}

export interface JobQueue {
  cancel(scheduleId: string): Promise<boolean>;
  close(): Promise<void>;
  enqueue(job: QueueJob, options?: EnqueueOptions): Promise<EnqueueResult>;
  inspectHealth(): Promise<QueueHealth>;
  schedule(job: QueueJob, runAt: Date, options?: EnqueueOptions): Promise<EnqueueResult>;
}

export const queueRetryPolicy = {
  attempts: 5,
  baseDelayMilliseconds: 1_000,
  maximumDelayMilliseconds: 60_000,
} as const;

export function validateQueueJob(value: unknown): QueueJob {
  return queueJobSchema.parse(value);
}

export function deterministicJobId(job: QueueJob, idempotencyKey = job.id): string {
  return `${job.name.replaceAll(".", "-")}-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

export function monitorWindowId(monitorId: string, scheduledAt: Date | string): string {
  const instant = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  return `monitor-window:${monitorId}:${instant.toISOString()}`;
}

export function retryDelay(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(
    queueRetryPolicy.maximumDelayMilliseconds,
    queueRetryPolicy.baseDelayMilliseconds * 2 ** exponent,
  );
}

export class PermanentJobError extends Error {
  readonly category = "permanent" as const;
}

export class TransientJobError extends Error {
  readonly category = "transient" as const;
}

export function classifyJobError(error: unknown): RetryCategory {
  return error instanceof PermanentJobError ? "permanent" : "transient";
}
