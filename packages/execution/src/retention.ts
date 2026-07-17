import { randomUUID } from "node:crypto";

import type { RetentionResource } from "@devrelay/contracts";
import type { DatabaseClient } from "@devrelay/database";
import type { PoolClient } from "pg";

export type RetentionPolicy = {
  checkResultDays: number;
  deliveryAttemptDays: number;
  tokenDays: number;
};

export class RetentionCleaner {
  constructor(
    private readonly database: DatabaseClient,
    private readonly policy: RetentionPolicy,
  ) {}

  async run(now = new Date()) {
    const organizations = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM organizations WHERE deleted_at IS NULL ORDER BY id",
    );
    let deleted = 0;
    for (const organization of organizations.rows) {
      deleted += await this.clean(
        organization.id,
        "check_results",
        this.policy.checkResultDays,
        now,
      );
      deleted += await this.clean(
        organization.id,
        "delivery_attempts",
        this.policy.deliveryAttemptDays,
        now,
      );
      deleted += await this.clean(
        organization.id,
        "completed_outbox_events",
        this.policy.deliveryAttemptDays,
        now,
      );
      deleted += await this.clean(organization.id, "subscriber_tokens", this.policy.tokenDays, now);
    }
    return { deleted, organizations: organizations.rowCount ?? organizations.rows.length };
  }

  private async clean(
    organizationId: string,
    resource: RetentionResource,
    retentionDays: number,
    now: Date,
  ): Promise<number> {
    const day = now.toISOString().slice(0, 10);
    const idempotencyKey = `retention:${resource}:${day}:${retentionDays}`;
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      const run = await client.query<{ id: string }>(
        `INSERT INTO retention_cleanup_runs
          (id,organization_id,resource,cutoff_at,status,idempotency_key,started_at)
         VALUES ($1,$2,$3,$4,'running',$5,$6)
         ON CONFLICT (organization_id,idempotency_key) DO NOTHING RETURNING id`,
        [randomUUID(), organizationId, resource, cutoff, idempotencyKey, now],
      );
      if (!run.rows[0]) {
        await client.query("COMMIT");
        return 0;
      }
      const result = await deleteExpired(client, organizationId, resource, cutoff, now);
      await client.query(
        `UPDATE retention_cleanup_runs SET status='succeeded',deleted_count=$1,
         completed_at=$2,updated_at=now() WHERE id=$3`,
        [result, now, run.rows[0].id],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function deleteExpired(
  client: PoolClient,
  organizationId: string,
  resource: RetentionResource,
  cutoff: Date,
  now: Date,
): Promise<number> {
  if (resource === "check_results") {
    return (
      (
        await client.query(
          "DELETE FROM check_results WHERE organization_id=$1 AND finished_at<$2",
          [organizationId, cutoff],
        )
      ).rowCount ?? 0
    );
  }
  if (resource === "delivery_attempts") {
    return (
      (
        await client.query(
          "DELETE FROM delivery_attempts WHERE organization_id=$1 AND finished_at IS NOT NULL AND finished_at<$2",
          [organizationId, cutoff],
        )
      ).rowCount ?? 0
    );
  }
  if (resource === "completed_outbox_events") {
    return (
      (
        await client.query(
          "DELETE FROM outbox_events WHERE organization_id=$1 AND status='published' AND published_at<$2",
          [organizationId, cutoff],
        )
      ).rowCount ?? 0
    );
  }
  return (
    (
      await client.query(
        `DELETE FROM subscriber_verification_tokens
       WHERE organization_id=$1 AND expires_at<$2
         AND (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at<$3)`,
        [organizationId, cutoff, now],
      )
    ).rowCount ?? 0
  );
}
