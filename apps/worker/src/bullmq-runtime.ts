import { type WorkerEnvironment } from "@devrelay/config";
import { type QueueJob } from "@devrelay/contracts";
import { MonitorCheckExecutor } from "@devrelay/execution";
import { bullMqQueueName, classifyJobError, validateQueueJob } from "@devrelay/queue";
import { type ConnectionOptions, type Processor, UnrecoverableError, Worker } from "bullmq";

export class BullMqWorkerRuntime {
  private readonly workers: Worker<QueueJob>[];

  constructor(environment: WorkerEnvironment, executor: MonitorCheckExecutor) {
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
      create("policy.evaluate", async (bullJob) => validateQueueJob(bullJob.data)),
      create("notification.deliver", async (bullJob) => validateQueueJob(bullJob.data)),
      create("outbox.dispatch", async (bullJob) => validateQueueJob(bullJob.data)),
      create("availability.aggregate", async (bullJob) => validateQueueJob(bullJob.data)),
    ];
    for (const worker of this.workers) {
      worker.on("error", (error) =>
        console.error(JSON.stringify({ error: error.message, event: "worker.error" })),
      );
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
