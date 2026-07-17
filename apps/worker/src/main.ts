import { parseWorkerEnvironment } from "@devrelay/config";
import { createDatabaseClient } from "@devrelay/database";
import {
  AvailabilityAggregationScheduler,
  AvailabilityAggregator,
  MaintenanceReconciler,
  MonitorCheckExecutor,
  MonitoringFreshnessDetector,
  MonitorScheduler,
  NotificationDeliveryDispatcher,
  NotificationDeliveryProcessor,
  NotificationFanoutProcessor,
  OutboxDispatcher,
  PolicyEngine,
  RetentionCleaner,
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
const notificationOptions = {
  appOrigin: environment.APP_ORIGIN,
  emailFrom: environment.EMAIL_FROM,
  encryptionKey: environment.NOTIFICATION_ENCRYPTION_KEY,
  resendApiKey: environment.RESEND_API_KEY,
  smtpHost: environment.SMTP_HOST,
  smtpPort: environment.SMTP_PORT,
  workerId: environment.WORKER_ID,
};
const fanout = new NotificationFanoutProcessor(database, environment.APP_ORIGIN);
const notificationProcessor = new NotificationDeliveryProcessor(database, notificationOptions);
const availabilityAggregator = new AvailabilityAggregator(database);
const runtime = new BullMqWorkerRuntime(
  environment,
  executor,
  policyEngine,
  fanout,
  notificationProcessor,
  availabilityAggregator,
);
const scheduler = new MonitorScheduler(database, queue, { deploymentMode: "local" });
const outbox = new OutboxDispatcher(database, queue, environment.WORKER_ID);
const deliveries = new NotificationDeliveryDispatcher(database, queue);
const freshness = new MonitoringFreshnessDetector(database, queue);
const availability = new AvailabilityAggregationScheduler(database, queue);
const maintenance = new MaintenanceReconciler(database);
const retention = new RetentionCleaner(database, {
  checkResultDays: environment.CHECK_RESULT_RETENTION_DAYS,
  deliveryAttemptDays: environment.DELIVERY_ATTEMPT_RETENTION_DAYS,
  tokenDays: environment.TOKEN_RETENTION_DAYS,
});
let lastAggregationDay: string | undefined;
let lastRetentionDay: string | undefined;

async function runMaintenance(): Promise<void> {
  await updateWorkerHeartbeat(database, {
    deploymentMode: "local",
    queueAdapter: "bullmq",
    startedAt,
    workerId: environment.WORKER_ID,
  });
  const aggregationDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [scheduled, dispatched, deliveryJobs, health, maintenanceState] = await Promise.all([
    scheduler.dispatchDue(),
    outbox.dispatch(),
    deliveries.dispatchDue(),
    freshness.inspect(),
    maintenance.reconcile(),
  ]);
  const aggregationJobs =
    lastAggregationDay === aggregationDay ? 0 : await availability.dispatch(aggregationDay);
  lastAggregationDay = aggregationDay;
  const retentionDay = new Date().toISOString().slice(0, 10);
  const retentionResult = lastRetentionDay === retentionDay ? null : await retention.run();
  lastRetentionDay = retentionDay;
  console.log(
    JSON.stringify({
      aggregationJobs,
      deliveryJobs,
      dispatched,
      event: "worker.heartbeat",
      health,
      maintenanceState,
      retentionResult,
      scheduled,
    }),
  );
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
