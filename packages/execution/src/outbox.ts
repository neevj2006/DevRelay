import { type OutboxDispatchJob } from "@devrelay/contracts";
import { type DatabaseClient } from "@devrelay/database";
import { type DatabaseTransaction } from "@devrelay/database";
import { type JobQueue } from "@devrelay/queue";
import { sql } from "drizzle-orm";

import { structuredLog } from "./observability.js";

export async function writeOutboxEvent(
  transaction: DatabaseTransaction,
  event: {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    idempotencyKey: string;
    organizationId: string;
    payload: Record<string, unknown>;
    payloadVersion?: number;
  },
): Promise<string> {
  const result = await transaction.execute<{ id: string }>(
    sql`INSERT INTO outbox_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload_version, payload, idempotency_key)
      VALUES (${event.organizationId}, ${event.aggregateType}, ${event.aggregateId}, ${event.eventType},
        ${event.payloadVersion ?? 1}, ${event.payload}, ${event.idempotencyKey})
      ON CONFLICT (organization_id, idempotency_key) DO UPDATE SET idempotency_key = excluded.idempotency_key
      RETURNING id`,
  );
  return result.rows[0]!.id;
}

type ClaimedOutboxEvent = {
  id: string;
  organization_id: string;
};

export class OutboxDispatcher {
  constructor(
    private readonly database: DatabaseClient,
    private readonly queue: JobQueue,
    private readonly workerId: string,
  ) {}

  async dispatch(batchSize = 25, now = new Date()): Promise<number> {
    const leaseExpiresAt = new Date(now.getTime() + 60_000);
    const claimed = await this.database.pool.query<ClaimedOutboxEvent>(
      `UPDATE outbox_events SET status = 'claimed', lease_owner = $1, lease_expires_at = $2,
       attempt_count = attempt_count + 1, updated_at = now()
       WHERE id IN (SELECT id FROM outbox_events WHERE available_at <= $3
         AND (status IN ('pending','failed') OR (status = 'claimed' AND lease_expires_at < $3))
         ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $4)
       RETURNING id, organization_id`,
      [this.workerId, leaseExpiresAt, now, Math.max(1, Math.min(batchSize, 100))],
    );
    for (const event of claimed.rows) {
      const job: OutboxDispatchJob = {
        correlationId: `outbox:${event.id}`,
        createdAt: now.toISOString(),
        id: `outbox:${event.id}`,
        name: "outbox.dispatch",
        organizationId: event.organization_id,
        payload: { outboxEventId: event.id },
        version: 1,
      };
      try {
        await this.queue.enqueue(job);
        await this.database.pool.query(
          `UPDATE outbox_events SET status = 'published', published_at = now(), lease_owner = NULL,
           lease_expires_at = NULL, last_error_code = NULL, updated_at = now() WHERE id = $1 AND lease_owner = $2`,
          [event.id, this.workerId],
        );
        structuredLog("info", "queue.outbox.published", {
          correlationId: job.correlationId,
          jobId: job.id,
          jobName: job.name,
          organizationId: job.organizationId,
          status: "published",
          workerId: this.workerId,
        });
      } catch (error) {
        await this.database.pool.query(
          `UPDATE outbox_events SET status = 'failed', available_at = now() + interval '1 minute',
           lease_owner = NULL, lease_expires_at = NULL, last_error_code = 'queue_publication_failed', updated_at = now()
           WHERE id = $1 AND lease_owner = $2`,
          [event.id, this.workerId],
        );
        structuredLog("warn", "queue.outbox.failed", {
          correlationId: job.correlationId,
          jobId: job.id,
          jobName: job.name,
          organizationId: job.organizationId,
          reason: error instanceof Error ? error.name : "unknown",
          status: "retry_scheduled",
          workerId: this.workerId,
        });
      }
    }
    return claimed.rowCount ?? 0;
  }

  async retainCompleted(olderThan: Date): Promise<number> {
    const result = await this.database.pool.query(
      "DELETE FROM outbox_events WHERE status = 'published' AND published_at < $1",
      [olderThan],
    );
    return result.rowCount ?? 0;
  }
}
