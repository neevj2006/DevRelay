import { randomUUID } from "node:crypto";

import { type QueueJob } from "@devrelay/contracts";
import { describe, expect, it } from "vitest";

import {
  deterministicJobId,
  monitorWindowId,
  QStashJobQueue,
  retryDelay,
  validateQueueJob,
} from "./index.js";

function job(): QueueJob {
  const monitorId = randomUUID();
  const scheduledAt = "2026-07-17T12:00:00.000Z";
  return {
    correlationId: "request-1",
    createdAt: scheduledAt,
    id: monitorWindowId(monitorId, scheduledAt),
    name: "monitor.check",
    organizationId: randomUUID(),
    payload: { monitorId, scheduledAt },
    version: 1,
  };
}

describe("queue contract", () => {
  it("creates stable transport-safe identifiers and bounded backoff", () => {
    const value = job();
    expect(deterministicJobId(value)).toBe(deterministicJobId(value));
    expect(deterministicJobId(value)).toMatch(/^monitor-check-[a-f0-9]{32}$/);
    expect(retryDelay(1)).toBe(1_000);
    expect(retryDelay(20)).toBe(60_000);
  });

  it("strictly validates every versioned payload", () => {
    expect(validateQueueJob(job()).name).toBe("monitor.check");
    expect(() => validateQueueJob({ ...job(), version: 2 })).toThrow();
    expect(() => validateQueueJob({ ...job(), unexpected: true })).toThrow();
  });

  it("applies the adapter contract to QStash with idempotent publication and cancellation", async () => {
    const published: unknown[] = [];
    const deleted: string[] = [];
    const queue = new QStashJobQueue({
      client: {
        messages: { delete: async (id) => void deleted.push(id) },
        publishJSON: async (options) => {
          published.push(options);
          return { messageId: "message-1" };
        },
      },
      deliveryUrl: "https://api.example.test/internal/qstash/jobs",
    });
    const value = job();
    const first = await queue.enqueue(value);
    const duplicate = await queue.enqueue(value);
    expect(first.accepted).toBe(true);
    expect(duplicate).toEqual({ accepted: false, jobId: first.jobId });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ deduplicationId: first.jobId, retries: 4 });
    expect((await queue.inspectHealth()).pending).toBe(1);
    expect(await queue.cancel(first.jobId)).toBe(true);
    expect(deleted).toEqual(["message-1"]);
  });
});
