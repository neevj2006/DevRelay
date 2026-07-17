import { parseApiEnvironment } from "@devrelay/config";
import { Client } from "@upstash/qstash";

const environment = parseApiEnvironment(process.env);
if (environment.QUEUE_ADAPTER !== "qstash" || !environment.QSTASH_TOKEN) {
  throw new Error("Configure the QStash adapter before creating its dispatcher schedule");
}

const destination = `${environment.QSTASH_DELIVERY_BASE_URL}/internal/qstash/dispatch`;
const client = new Client({ token: environment.QSTASH_TOKEN });
const schedules = await client.schedules.list();
const matching = schedules.filter((schedule) => schedule.destination === destination);
if (matching.length > 1) {
  throw new Error(`Expected one dispatcher schedule for ${destination}, found ${matching.length}`);
}

const scheduleId =
  matching[0]?.scheduleId ??
  (
    await client.schedules.create({
      body: "{}",
      cron: "*/5 * * * *",
      destination,
      headers: { "Content-Type": "application/json" },
      retries: 3,
    })
  ).scheduleId;

if (environment.QSTASH_HOSTED_SCHEDULER_PAUSED === "true") {
  await client.schedules.pause({ schedule: scheduleId });
} else {
  await client.schedules.resume({ schedule: scheduleId });
}

console.log(
  JSON.stringify({
    destination,
    paused: environment.QSTASH_HOSTED_SCHEDULER_PAUSED === "true",
    scheduleId,
  }),
);
