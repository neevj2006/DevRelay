export interface WorkerHeartbeat {
  recordedAt: string;
  service: "worker";
}

export function createWorkerHeartbeat(now: Date): WorkerHeartbeat {
  return {
    recordedAt: now.toISOString(),
    service: "worker",
  };
}
