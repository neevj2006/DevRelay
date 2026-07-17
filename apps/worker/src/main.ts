import { parseWorkerEnvironment } from "@devrelay/config";
import { createDatabaseClient } from "@devrelay/database";
import {
  MonitorCheckExecutor,
  MonitoringFreshnessDetector,
  MonitorScheduler,
  OutboxDispatcher,
  PolicyEngine,
  updateWorkerHeartbeat,
} from "@devrelay/execution";
import { BullMqJobQueue } from "@devrelay/queue";

import { BullMqWorkerRuntime } from "./bullmq-runtime.js";

const environment = parseWorkerEnvironment(process.env);
if (environment.QUEUE_ADAPTER !== "bullmq") {
  throw new Error(
    "The persistent worker supports the BullMQ adapter; QStash executes through signed API routes",
  );
}
const startedAt = new Date();
const database = createDatabaseClient(environment.DATABASE_URL, { max: 10 });
const queue = new BullMqJobQueue({ connection: { url: environment.REDIS_URL! } });
const executor = new MonitorCheckExecutor(database, queue, environment.WORKER_ID);
const policyEngine = new PolicyEngine(database);
const runtime = new BullMqWorkerRuntime(environment, executor, policyEngine);
const scheduler = new MonitorScheduler(database, queue, { deploymentMode: "local" });
const outbox = new OutboxDispatcher(database, queue, environment.WORKER_ID);
const freshness = new MonitoringFreshnessDetector(database, queue);

async function runMaintenance(): Promise<void> {
  await updateWorkerHeartbeat(database, {
    deploymentMode: "local",
    queueAdapter: "bullmq",
    startedAt,
    workerId: environment.WORKER_ID,
  });
  const [scheduled, dispatched, health] = await Promise.all([
    scheduler.dispatchDue(),
    outbox.dispatch(),
    freshness.inspect(),
  ]);
  console.log(JSON.stringify({ dispatched, event: "worker.heartbeat", health, scheduled }));
}

await runMaintenance();
const timer = setInterval(
  () => void runMaintenance().catch(reportFatal),
  environment.WORKER_HEARTBEAT_INTERVAL_MS,
);

async function shutdown(signal: string): Promise<void> {
  clearInterval(timer);
  console.log(JSON.stringify({ event: "worker.shutdown", signal }));
  await runtime.close();
  await queue.close();
  await database.close();
  process.exitCode = 0;
}

function reportFatal(error: unknown): void {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "unknown",
      event: "worker.failure",
    }),
  );
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
