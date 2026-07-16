import { parseWorkerEnvironment } from "@devrelay/config";

import { createWorkerHeartbeat } from "./heartbeat.js";

const environment = parseWorkerEnvironment(process.env);

function reportHeartbeat(): void {
  const heartbeat = createWorkerHeartbeat(new Date());
  console.log(JSON.stringify(heartbeat));
}

reportHeartbeat();
setInterval(reportHeartbeat, environment.WORKER_HEARTBEAT_INTERVAL_MS);
