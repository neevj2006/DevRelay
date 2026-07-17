import { randomUUID } from "node:crypto";

import {
  type CheckOutcome,
  type MonitorCheckJob,
  type PolicyEvaluationJob,
} from "@devrelay/contracts";
import { type DatabaseClient } from "@devrelay/database";
import {
  EndpointPolicyError,
  type MonitorTestEvidence,
  runSafeMonitorTest,
} from "@devrelay/monitoring";
import { type JobQueue, PermanentJobError, validateQueueJob } from "@devrelay/queue";

import { runtimeMetrics, structuredLog, withTrace } from "./observability.js";

type MonitorExecutionConfig = {
  accepted_status_codes: readonly { from: number; to: number }[];
  endpoint_url: string;
  method: "GET" | "HEAD";
  request_headers: Readonly<Record<string, string>>;
  timeout_milliseconds: number;
};

export type CheckRunner = typeof runSafeMonitorTest;

export class MonitorCheckExecutor {
  constructor(
    private readonly database: DatabaseClient,
    private readonly queue: JobQueue,
    private readonly workerId: string,
    private readonly region = "local",
    private readonly runner: CheckRunner = runSafeMonitorTest,
  ) {}

  async execute(value: unknown): Promise<{ duplicate: boolean; outcome?: CheckOutcome }> {
    const parsed = validateQueueJob(value);
    if (parsed.name !== "monitor.check") throw new PermanentJobError("Expected monitor.check job");
    return withTrace(
      "monitor.check",
      {
        correlationId: parsed.correlationId,
        jobId: parsed.id,
        jobName: parsed.name,
        monitorId: parsed.payload.monitorId,
        organizationId: parsed.organizationId,
      },
      () => this.executeCheck(parsed),
    );
  }

  private async executeCheck(
    job: MonitorCheckJob,
  ): Promise<{ duplicate: boolean; outcome?: CheckOutcome }> {
    const scheduledAt = new Date(job.payload.scheduledAt);
    const leaseExpiresAt = new Date(Date.now() + 180_000);
    const claim = await this.database.pool.query<MonitorExecutionConfig>(
      `UPDATE expected_check_windows w SET status = 'claimed', lease_owner = $1,
       lease_expires_at = $2, claimed_at = COALESCE(claimed_at, now()), attempt_count = attempt_count + 1, updated_at = now()
       FROM monitors m JOIN monitor_policies p ON p.monitor_id = m.id AND p.organization_id = m.organization_id
       WHERE w.organization_id = $3 AND w.monitor_id = $4 AND w.scheduled_at = $5
       AND w.organization_id = m.organization_id AND w.monitor_id = m.id
       AND (w.status = 'pending' OR (w.status = 'claimed' AND w.lease_expires_at < now()))
       RETURNING m.endpoint_url, m.method, p.timeout_milliseconds, p.accepted_status_codes, p.request_headers`,
      [this.workerId, leaseExpiresAt, job.organizationId, job.payload.monitorId, scheduledAt],
    );
    const configuration = claim.rows[0];
    if (!configuration) {
      const existing = await this.database.pool.query(
        "SELECT 1 FROM check_results WHERE organization_id = $1 AND monitor_id = $2 AND scheduled_at = $3",
        [job.organizationId, job.payload.monitorId, scheduledAt],
      );
      if (existing.rowCount) {
        await this.enqueuePolicy(job);
        runtimeMetrics.record("check.duplicate");
        structuredLog("info", "monitor.check.duplicate", {
          correlationId: job.correlationId,
          jobId: job.id,
          monitorId: job.payload.monitorId,
          organizationId: job.organizationId,
        });
        return { duplicate: true };
      }
      throw new Error("Check window is currently claimed or unavailable");
    }

    const startedAt = new Date();
    let evidence: MonitorTestEvidence | undefined;
    let outcome: CheckOutcome;
    let evidenceCode: string;
    let evidenceSummary: string;
    try {
      evidence = await this.runner({
        endpointUrl: configuration.endpoint_url,
        headers: configuration.request_headers,
        method: configuration.method,
        timeoutMilliseconds: configuration.timeout_milliseconds,
      });
      const accepted =
        evidence.httpStatusCode !== null &&
        configuration.accepted_status_codes.some(
          ({ from, to }) => evidence!.httpStatusCode! >= from && evidence!.httpStatusCode! <= to,
        );
      outcome =
        evidence.code === "network_error"
          ? evidence.durationMilliseconds >= configuration.timeout_milliseconds - 50
            ? "timeout"
            : "failure"
          : evidence.ok && accepted
            ? "success"
            : "failure";
      evidenceCode = accepted ? evidence.code : "unexpected_http_status";
      evidenceSummary = accepted ? evidence.summary : `Endpoint returned an unaccepted HTTP status`;
    } catch (error) {
      outcome = error instanceof EndpointPolicyError ? "rejected_target" : "execution_error";
      evidenceCode = error instanceof EndpointPolicyError ? error.code : "execution_error";
      evidenceSummary =
        error instanceof EndpointPolicyError
          ? "Endpoint destination was rejected by the network safety policy"
          : "The check could not be executed";
    }
    const finishedAt = new Date();
    const client = await this.database.pool.connect();
    let insertedNew = false;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO check_results
         (organization_id, monitor_id, scheduled_at, outcome, started_at, finished_at, latency_milliseconds,
          http_status_code, region, evidence_code, evidence_summary, safe_evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (organization_id, monitor_id, scheduled_at) DO NOTHING RETURNING id`,
        [
          job.organizationId,
          job.payload.monitorId,
          scheduledAt,
          outcome,
          startedAt,
          finishedAt,
          evidence?.durationMilliseconds ?? Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          evidence?.httpStatusCode ?? null,
          this.region,
          evidenceCode,
          evidenceSummary.slice(0, 1_000),
          evidence
            ? { finalOrigin: evidence.finalOrigin, redirectCount: evidence.redirectCount }
            : null,
        ],
      );
      await client.query(
        `UPDATE expected_check_windows SET status = 'completed', completed_at = $1, lease_owner = NULL,
         lease_expires_at = NULL, updated_at = now() WHERE organization_id = $2 AND monitor_id = $3 AND scheduled_at = $4`,
        [finishedAt, job.organizationId, job.payload.monitorId, scheduledAt],
      );
      await client.query(
        `UPDATE monitors SET last_completed_scheduled_at = GREATEST(COALESCE(last_completed_scheduled_at, $1), $1), updated_at = now()
         WHERE organization_id = $2 AND id = $3`,
        [scheduledAt, job.organizationId, job.payload.monitorId],
      );
      await client.query("COMMIT");
      insertedNew = !!inserted.rowCount;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await this.enqueuePolicy(job);
    const latency =
      evidence?.durationMilliseconds ?? Math.max(0, finishedAt.getTime() - startedAt.getTime());
    runtimeMetrics.record("check.completed", 1, { outcome });
    runtimeMetrics.record("check.latency", latency, { outcome });
    if (!insertedNew) runtimeMetrics.record("check.duplicate");
    structuredLog("info", "monitor.check.completed", {
      correlationId: job.correlationId,
      durationMilliseconds: latency,
      jobId: job.id,
      monitorId: job.payload.monitorId,
      organizationId: job.organizationId,
      outcome,
      status: insertedNew ? "recorded" : "duplicate",
    });
    return insertedNew ? { duplicate: false, outcome } : { duplicate: true };
  }

  private async enqueuePolicy(job: MonitorCheckJob): Promise<void> {
    const policyJob: PolicyEvaluationJob = {
      correlationId: job.correlationId,
      createdAt: new Date().toISOString(),
      id: `policy:${job.id}`,
      name: "policy.evaluate",
      organizationId: job.organizationId,
      payload: job.payload,
      version: 1,
    };
    await this.queue.enqueue(policyJob);
  }
}

export async function updateWorkerHeartbeat(
  database: DatabaseClient,
  options: {
    deploymentMode: "hosted" | "local";
    queueAdapter: "bullmq" | "qstash";
    startedAt: Date;
    workerId: string;
  },
  now = new Date(),
): Promise<void> {
  await database.pool.query(
    `INSERT INTO worker_heartbeats (id, worker_key, deployment_mode, queue_adapter, started_at, heartbeat_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (worker_key) DO UPDATE SET heartbeat_at = excluded.heartbeat_at,
       deployment_mode = excluded.deployment_mode, queue_adapter = excluded.queue_adapter,
       metadata = excluded.metadata, updated_at = now()`,
    [
      randomUUID(),
      options.workerId,
      options.deploymentMode,
      options.queueAdapter,
      options.startedAt,
      now,
      { pid: process.pid },
    ],
  );
}
