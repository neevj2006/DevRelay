import { parseApiEnvironment } from "@devrelay/config";
import { runtimeMetrics } from "@devrelay/execution";
import { BullMqJobQueue } from "@devrelay/queue";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "./database.service.js";

type HealthState = "degraded" | "ok";

@Injectable()
export class SystemHealthService {
  private readonly environment = parseApiEnvironment(process.env);

  constructor(private readonly database: DatabaseService) {}

  metrics() {
    return {
      metrics: runtimeMetrics.snapshot(),
      retention: "process lifetime; export before restart",
    };
  }

  async inspect(now = new Date()) {
    let database: HealthState = "ok";
    let row = {
      expiredChecks: 0,
      oldestDueAt: null as Date | null,
      oldestOutboxAt: null as Date | null,
      outboxBacklog: 0,
      workerHeartbeatAt: null as Date | null,
    };
    try {
      const result = await this.database.client.pool.query<{
        expired_checks: number;
        oldest_due_at: Date | null;
        oldest_outbox_at: Date | null;
        outbox_backlog: number;
        worker_heartbeat_at: Date | null;
      }>(
        `SELECT
          (SELECT count(*)::int FROM expected_check_windows WHERE status='expired') AS expired_checks,
          (SELECT min(next_due_at) FROM monitors WHERE status='active' AND deleted_at IS NULL AND next_due_at<=now()) AS oldest_due_at,
          (SELECT min(created_at) FROM outbox_events WHERE status IN ('pending','failed','claimed')) AS oldest_outbox_at,
          (SELECT count(*)::int FROM outbox_events WHERE status IN ('pending','failed','claimed')) AS outbox_backlog,
          (SELECT max(heartbeat_at) FROM worker_heartbeats) AS worker_heartbeat_at`,
      );
      const value = result.rows[0]!;
      row = {
        expiredChecks: value.expired_checks,
        oldestDueAt: value.oldest_due_at,
        oldestOutboxAt: value.oldest_outbox_at,
        outboxBacklog: value.outbox_backlog,
        workerHeartbeatAt: value.worker_heartbeat_at,
      };
    } catch {
      database = "degraded";
    }

    const schedulerLagMilliseconds = row.oldestDueAt
      ? Math.max(0, now.getTime() - row.oldestDueAt.getTime())
      : 0;
    const outboxLagMilliseconds = row.oldestOutboxAt
      ? Math.max(0, now.getTime() - row.oldestOutboxAt.getTime())
      : 0;
    const workerHeartbeatAgeMilliseconds = row.workerHeartbeatAt
      ? Math.max(0, now.getTime() - row.workerHeartbeatAt.getTime())
      : null;

    let queue: Record<string, unknown> = {
      adapter: this.environment.QUEUE_ADAPTER,
      status: "ok",
    };
    if (this.environment.QUEUE_ADAPTER === "bullmq") {
      if (!this.environment.REDIS_URL) queue = { adapter: "bullmq", status: "degraded" };
      else {
        const client = new BullMqJobQueue({ connection: { url: this.environment.REDIS_URL } });
        try {
          queue = { ...(await client.inspectHealth()), status: "ok" };
        } catch {
          queue = { adapter: "bullmq", status: "degraded" };
        } finally {
          await client.close().catch(() => undefined);
        }
      }
    }

    const workerStatus: HealthState =
      this.environment.QUEUE_ADAPTER === "bullmq" &&
      (workerHeartbeatAgeMilliseconds === null || workerHeartbeatAgeMilliseconds > 90_000)
        ? "degraded"
        : "ok";
    const schedulerStatus: HealthState = schedulerLagMilliseconds > 120_000 ? "degraded" : "ok";
    const outboxStatus: HealthState =
      outboxLagMilliseconds > 120_000 || row.outboxBacklog > 100 ? "degraded" : "ok";
    const missedCheckStatus: HealthState = row.expiredChecks > 0 ? "degraded" : "ok";
    const status: HealthState = [
      database,
      queue.status,
      workerStatus,
      schedulerStatus,
      outboxStatus,
      missedCheckStatus,
    ].includes("degraded")
      ? "degraded"
      : "ok";

    return {
      checks: {
        database: { status: database },
        missedChecks: { count: row.expiredChecks, status: missedCheckStatus },
        outbox: {
          backlog: row.outboxBacklog,
          lagMilliseconds: outboxLagMilliseconds,
          status: outboxStatus,
        },
        queue,
        scheduler: { lagMilliseconds: schedulerLagMilliseconds, status: schedulerStatus },
        worker: { heartbeatAgeMilliseconds: workerHeartbeatAgeMilliseconds, status: workerStatus },
      },
      service: "api" as const,
      status,
      timestamp: now.toISOString(),
    };
  }
}
