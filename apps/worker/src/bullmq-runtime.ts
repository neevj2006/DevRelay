import { type WorkerEnvironment } from "@devrelay/config";
import { type QueueJob } from "@devrelay/contracts";
import {
  AvailabilityAggregator,
  MonitorCheckExecutor,
  NotificationDeliveryProcessor,
  NotificationFanoutProcessor,
  PolicyEngine,
  structuredLog,
} from "@devrelay/execution";
import { bullMqQueueName, classifyJobError, validateQueueJob } from "@devrelay/queue";
import { type ConnectionOptions, type Processor, UnrecoverableError, Worker } from "bullmq";

export class BullMqWorkerRuntime {
  private readonly workers: Worker<QueueJob>[];

  constructor(
    environment: WorkerEnvironment,
    executor: MonitorCheckExecutor,
    policyEngine: PolicyEngine,
    fanout: NotificationFanoutProcessor,
    notifications: NotificationDeliveryProcessor,
    availability: AvailabilityAggregator,
  ) {
    const connection: ConnectionOptions = { url: environment.REDIS_URL! };
    const create = (name: QueueJob["name"], processor: Processor<QueueJob>) =>
      new Worker<QueueJob>(bullMqQueueName(name), processor, {
        concurrency: environment.WORKER_CONCURRENCY,
        connection,
        lockDuration: 45_000,
        maxStalledCount: 2,
        prefix: "devrelay",
      });
    this.workers = [
      create("monitor.check", async (bullJob) => {
        try {
          return await executor.execute(validateQueueJob(bullJob.data));
        } catch (error) {
          if (classifyJobError(error) === "permanent") {
            throw new UnrecoverableError(
              error instanceof Error ? error.message : "Permanent job failure",
            );
          }
          throw error;
        }
      }),
      create("policy.evaluate", async (bullJob) => policyEngine.evaluate(bullJob.data)),
      create("notification.deliver", async (bullJob) => {
        const job = validateQueueJob(bullJob.data);
        if (job.name !== "notification.deliver") throw new UnrecoverableError("Unexpected job");
        return notifications.execute(job);
      }),
      create("outbox.dispatch", async (bullJob) => {
        const job = validateQueueJob(bullJob.data);
        if (job.name !== "outbox.dispatch") throw new UnrecoverableError("Unexpected job");
        return fanout.execute(job);
      }),
      create("availability.aggregate", async (bullJob) => {
        const job = validateQueueJob(bullJob.data);
        if (job.name !== "availability.aggregate") throw new UnrecoverableError("Unexpected job");
        return availability.execute(job);
      }),
    ];
    for (const worker of this.workers) {
      worker.on("error", (error) =>
        structuredLog("error", "queue.worker.error", {
          reason: error.name,
          status: "failed",
        }),
      );
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
