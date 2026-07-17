import { type QueueJob } from "@devrelay/contracts";
import { Client } from "@upstash/qstash";

import {
  deterministicJobId,
  type EnqueueOptions,
  type EnqueueResult,
  type JobQueue,
  type QueueHealth,
  queueRetryPolicy,
  validateQueueJob,
} from "./contract.js";

export interface QStashPublisher {
  messages: {
    delete(messageId: string): Promise<unknown>;
  };
  publishJSON(options: {
    body: QueueJob;
    deduplicationId?: string;
    delay?: number;
    failureCallback?: string;
    headers?: Record<string, string>;
    retries?: number;
    url: string;
  }): Promise<{ deduplicated?: boolean; messageId: string }>;
}

export type QStashQueueOptions = {
  client?: QStashPublisher;
  deliveryUrl: string;
  failureCallbackUrl?: string;
  paused?: boolean;
  token?: string;
};

export class QStashJobQueue implements JobQueue {
  private readonly client: QStashPublisher;
  private readonly messageIds = new Map<string, string>();

  constructor(private readonly options: QStashQueueOptions) {
    if (!options.client && !options.token) throw new Error("A QStash token is required");
    this.client = options.client ?? (new Client({ token: options.token! }) as QStashPublisher);
  }

  enqueue(job: QueueJob, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    return this.publish(job, undefined, options);
  }

  schedule(job: QueueJob, runAt: Date, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    return this.publish(job, Math.max(0, runAt.getTime() - Date.now()), options);
  }

  async cancel(scheduleId: string): Promise<boolean> {
    const messageId = this.messageIds.get(scheduleId);
    if (!messageId) return false;
    await this.client.messages.delete(messageId);
    this.messageIds.delete(scheduleId);
    return true;
  }

  async inspectHealth(): Promise<QueueHealth> {
    return {
      adapter: "qstash",
      deadLettered: 0,
      delayed: this.messageIds.size,
      failed: 0,
      lagMilliseconds: 0,
      paused: this.options.paused ?? false,
      pending: this.messageIds.size,
    };
  }

  async close(): Promise<void> {}

  private async publish(jobValue: QueueJob, delay: number | undefined, options: EnqueueOptions) {
    if (this.options.paused) throw new Error("The hosted scheduler is paused");
    const job = validateQueueJob(jobValue);
    const jobId = deterministicJobId(job, options.idempotencyKey);
    if (this.messageIds.has(jobId)) return { accepted: false, jobId };
    const result = await this.client.publishJSON({
      body: job,
      deduplicationId: jobId,
      ...(delay === undefined ? {} : { delay: Math.ceil(delay / 1_000) }),
      ...(this.options.failureCallbackUrl
        ? { failureCallback: this.options.failureCallbackUrl }
        : {}),
      retries: Math.max(0, (options.attempts ?? queueRetryPolicy.attempts) - 1),
      url: this.options.deliveryUrl,
    });
    this.messageIds.set(jobId, result.messageId);
    return { accepted: !result.deduplicated, jobId };
  }
}
