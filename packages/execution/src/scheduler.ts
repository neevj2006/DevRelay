import { randomUUID } from "node:crypto";

import { type MonitorCheckJob } from "@devrelay/contracts";
import { type DatabaseClient } from "@devrelay/database";
import { type JobQueue, monitorWindowId } from "@devrelay/queue";

import { runtimeMetrics, structuredLog, withTrace } from "./observability.js";

export type SchedulerOptions = {
  batchSize?: number;
  dailyMessageLimit?: number;
  deploymentMode: "hosted" | "local";
  paused?: boolean;
};

type DueMonitor = {
  interval_seconds: number;
  monitor_id: string;
  next_due_at: Date;
  organization_id: string;
};

export function deriveScheduledWindow(at: Date, intervalSeconds: number): Date {
  const interval = intervalSeconds * 1_000;
  return new Date(Math.floor(at.getTime() / interval) * interval);
}

export class MonitorScheduler {
  constructor(
    private readonly database: DatabaseClient,
    private readonly queue: JobQueue,
    private readonly options: SchedulerOptions,
  ) {}

  async dispatchDue(now = new Date()): Promise<{ claimed: number; paused: boolean }> {
    return withTrace("scheduler.dispatch", { queueAdapter: this.options.deploymentMode }, () =>
      this.dispatchDueTraced(now),
    );
  }

  private async dispatchDueTraced(now: Date): Promise<{ claimed: number; paused: boolean }> {
    if (this.options.paused) {
      structuredLog("warn", "scheduler.paused", { status: "paused" });
      return { claimed: 0, paused: true };
    }
    const client = await this.database.pool.connect();
    const claimed: MonitorCheckJob[] = [];
    try {
      await client.query("BEGIN");
      let limit = Math.max(1, Math.min(this.options.batchSize ?? 25, 100));
      if (this.options.deploymentMode === "hosted") {
        const dailyLimit = Math.max(1, this.options.dailyMessageLimit ?? 250);
        const usage = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM expected_check_windows WHERE created_at >= date_trunc('day', $1::timestamptz)",
          [now],
        );
        const used = Number(usage.rows[0]?.count ?? 0);
        if (used >= dailyLimit) {
          await client.query("COMMIT");
          return { claimed: 0, paused: false };
        }
        limit = Math.min(limit, dailyLimit - used);
      }
      const due = await client.query<DueMonitor>(
        `SELECT m.id AS monitor_id, m.organization_id, m.next_due_at, p.interval_seconds
         FROM monitors m JOIN monitor_policies p ON p.monitor_id = m.id AND p.organization_id = m.organization_id
         WHERE m.status = 'active' AND m.deleted_at IS NULL AND m.next_due_at <= $1
         ORDER BY m.next_due_at, m.id FOR UPDATE OF m SKIP LOCKED LIMIT $2`,
        [now, limit],
      );
      for (const monitor of due.rows) {
        const scheduledAt = deriveScheduledWindow(monitor.next_due_at, monitor.interval_seconds);
        const id = monitorWindowId(monitor.monitor_id, scheduledAt);
        const inserted = await client.query(
          `INSERT INTO expected_check_windows (organization_id, monitor_id, scheduled_at)
           VALUES ($1, $2, $3) ON CONFLICT (organization_id, monitor_id, scheduled_at) DO NOTHING RETURNING id`,
          [monitor.organization_id, monitor.monitor_id, scheduledAt],
        );
        await client.query(
          "UPDATE monitors SET next_due_at = $1, updated_at = now() WHERE id = $2 AND organization_id = $3",
          [
            new Date(scheduledAt.getTime() + monitor.interval_seconds * 1_000),
            monitor.monitor_id,
            monitor.organization_id,
          ],
        );
        if (inserted.rowCount) {
          claimed.push({
            correlationId: id,
            createdAt: now.toISOString(),
            id,
            name: "monitor.check",
            organizationId: monitor.organization_id,
            payload: { monitorId: monitor.monitor_id, scheduledAt: scheduledAt.toISOString() },
            version: 1,
          });
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const recoverable = await this.database.pool.query<{
      monitor_id: string;
      organization_id: string;
      scheduled_at: Date;
    }>(
      `SELECT w.organization_id, w.monitor_id, w.scheduled_at
       FROM expected_check_windows w JOIN monitors m ON m.id = w.monitor_id AND m.organization_id = w.organization_id
       WHERE w.status = 'pending' AND w.scheduled_at <= $1 AND m.status = 'active' AND m.deleted_at IS NULL
       ORDER BY w.scheduled_at, w.id LIMIT $2`,
      [now, Math.max(1, Math.min(this.options.batchSize ?? 25, 100))],
    );
    const jobs = new Map(claimed.map((job) => [job.id, job]));
    for (const window of recoverable.rows) {
      const id = monitorWindowId(window.monitor_id, window.scheduled_at);
      jobs.set(id, {
        correlationId: id,
        createdAt: now.toISOString(),
        id,
        name: "monitor.check",
        organizationId: window.organization_id,
        payload: { monitorId: window.monitor_id, scheduledAt: window.scheduled_at.toISOString() },
        version: 1,
      });
    }
    const results = await Promise.allSettled(
      [...jobs.values()].map((job) => this.queue.enqueue(job, { idempotencyKey: job.id })),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const accepted = results.filter(
      (result) => result.status === "fulfilled" && result.value.accepted,
    ).length;
    runtimeMetrics.record("check.expected", jobs.size);
    structuredLog("info", "scheduler.dispatched", { count: accepted, status: "completed" });
    return {
      claimed: accepted,
      paused: false,
    };
  }

  async inspectHealth(now = new Date()) {
    const result = await this.database.pool.query<{
      due_count: string;
      expected_count: string;
      oldest_due_at: Date | null;
    }>(
      `SELECT
        (SELECT count(*)::text FROM monitors WHERE status = 'active' AND deleted_at IS NULL AND next_due_at <= $1) AS due_count,
        (SELECT count(*)::text FROM expected_check_windows WHERE status IN ('pending','claimed')) AS expected_count,
        (SELECT min(next_due_at) FROM monitors WHERE status = 'active' AND deleted_at IS NULL AND next_due_at <= $1) AS oldest_due_at`,
      [now],
    );
    const row = result.rows[0]!;
    const lagMilliseconds = row.oldest_due_at
      ? Math.max(0, now.getTime() - row.oldest_due_at.getTime())
      : 0;
    runtimeMetrics.record("queue.lag", lagMilliseconds, {
      adapter: this.options.deploymentMode,
    });
    return {
      dueMonitors: Number(row.due_count),
      expectedWindows: Number(row.expected_count),
      lagMilliseconds,
      paused: this.options.paused ?? false,
    };
  }
}

export function schedulerInvocationId(): string {
  return `scheduler:${randomUUID()}`;
}
