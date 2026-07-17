import { type QueueJob } from "@devrelay/contracts";
import { type ConnectionOptions, Queue } from "bullmq";

import {
  deterministicJobId,
  type EnqueueOptions,
  type EnqueueResult,
  type JobQueue,
  type QueueHealth,
  queueRetryPolicy,
  validateQueueJob,
} from "./contract.js";

const queueNames = {
  "availability.aggregate": "availability-aggregate",
  "monitor.check": "monitor-check",
  "notification.deliver": "notification-delivery",
  "outbox.dispatch": "outbox-dispatch",
  "policy.evaluate": "policy-evaluation",
} as const;

export type BullMqQueueOptions = {
  connection: ConnectionOptions;
  prefix?: string;
};

export class BullMqJobQueue implements JobQueue {
  private readonly queues = new Map<string, Queue<QueueJob>>();

  constructor(private readonly options: BullMqQueueOptions) {}

  enqueue(job: QueueJob, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    return this.add(job, 0, options);
  }

  schedule(job: QueueJob, runAt: Date, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    return this.add(job, Math.max(0, runAt.getTime() - Date.now()), options);
  }

  async cancel(scheduleId: string): Promise<boolean> {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(scheduleId);
      if (job) {
        await job.remove();
        return true;
      }
    }
    return false;
  }

  async inspectHealth(): Promise<QueueHealth> {
    const health: QueueHealth = {
      adapter: "bullmq",
      deadLettered: 0,
      delayed: 0,
      failed: 0,
      lagMilliseconds: 0,
      paused: false,
      pending: 0,
    };
    const now = Date.now();
    for (const queue of this.queues.values()) {
      const counts = await queue.getJobCounts("waiting", "delayed", "failed");
      health.pending += counts.waiting ?? 0;
      health.delayed += counts.delayed ?? 0;
      health.failed += counts.failed ?? 0;
      health.deadLettered += counts.failed ?? 0;
      health.paused ||= await queue.isPaused();
      const [oldest] = await queue.getJobs(["waiting"], 0, 0, true);
      if (oldest) health.lagMilliseconds = Math.max(health.lagMilliseconds, now - oldest.timestamp);
    }
    return health;
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }

  private async add(jobValue: QueueJob, delay: number, options: EnqueueOptions) {
    const job = validateQueueJob(jobValue);
    const queue = this.getQueue(job.name);
    const jobId = deterministicJobId(job, options.idempotencyKey);
    const existing = await queue.getJob(jobId);
    if (existing) return { accepted: false, jobId };
    await queue.add(job.name, job, {
      attempts: options.attempts ?? queueRetryPolicy.attempts,
      backoff: { delay: queueRetryPolicy.baseDelayMilliseconds, type: "exponential" },
      delay,
      jobId,
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 5_000 },
    });
    return { accepted: true, jobId };
  }

  private getQueue(jobName: QueueJob["name"]): Queue<QueueJob> {
    const name = queueNames[jobName];
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue<QueueJob>(name, {
        connection: this.options.connection,
        prefix: this.options.prefix ?? "devrelay",
      });
      this.queues.set(name, queue);
    }
    return queue;
  }
}

export function bullMqQueueName(jobName: QueueJob["name"]): string {
  return queueNames[jobName];
}
