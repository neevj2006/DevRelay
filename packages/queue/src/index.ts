export interface EnqueueOptions {
  delayMs?: number;
  idempotencyKey: string;
}

export interface EnqueueResult {
  accepted: boolean;
  jobId: string;
}

export interface JobQueue {
  enqueue(jobName: string, payload: unknown, options: EnqueueOptions): Promise<EnqueueResult>;
}
