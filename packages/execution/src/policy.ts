import { randomUUID } from "node:crypto";

import {
  type CheckOutcome,
  type MonitorImpact,
  type MonitorPolicyState,
  type PolicyEvaluationJob,
  type ServiceState,
} from "@devrelay/contracts";
import { type DatabaseClient } from "@devrelay/database";
import { type JobQueue, PermanentJobError, validateQueueJob } from "@devrelay/queue";
import type { PoolClient } from "pg";

import { reconcileAutomaticIncident } from "./incident.js";
import { runtimeMetrics, structuredLog, withTrace } from "./observability.js";

type PolicyRow = {
  failure_impact: MonitorImpact;
  failure_threshold: number;
  interval_seconds: number;
  monitor_id: string;
  monitor_status: string;
  organization_id: string;
  previous_state: MonitorPolicyState | null;
  recovery_threshold: number;
  service_id: string;
};

type ResultRow = { outcome: CheckOutcome; scheduled_at: Date };

const severity: Record<ServiceState, number> = {
  unknown: 0,
  operational: 1,
  under_maintenance: 2,
  degraded_performance: 3,
  partial_outage: 4,
  major_outage: 5,
};

export class PolicyEngine {
  constructor(private readonly database: DatabaseClient) {}

  async evaluate(value: unknown, now = new Date()) {
    const parsed = validateQueueJob(value);
    if (parsed.name !== "policy.evaluate") {
      throw new PermanentJobError("Expected policy.evaluate job");
    }
    return withTrace(
      "policy.evaluate",
      {
        correlationId: parsed.correlationId,
        jobId: parsed.id,
        jobName: parsed.name,
        monitorId: parsed.payload.monitorId,
        organizationId: parsed.organizationId,
      },
      () => this.evaluatePolicy(parsed, now),
    );
  }

  private async evaluatePolicy(job: PolicyEvaluationJob, now: Date) {
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `monitor-policy:${job.organizationId}:${job.payload.monitorId}`,
      ]);
      const policyResult = await client.query<PolicyRow>(
        `SELECT m.id AS monitor_id, m.organization_id, m.service_id, m.status AS monitor_status,
          p.interval_seconds, p.failure_threshold, p.recovery_threshold, p.failure_impact,
          e.state AS previous_state
         FROM monitors m JOIN monitor_policies p ON p.monitor_id = m.id AND p.organization_id = m.organization_id
         LEFT JOIN monitor_policy_evaluations e ON e.monitor_id = m.id AND e.organization_id = m.organization_id
         WHERE m.id = $1 AND m.organization_id = $2 AND m.deleted_at IS NULL FOR UPDATE OF m`,
        [job.payload.monitorId, job.organizationId],
      );
      const policy = policyResult.rows[0];
      if (!policy) throw new PermanentJobError("Monitor policy not found");
      const prior = await client.query<{ latest_scheduled_at: Date | null }>(
        "SELECT latest_scheduled_at FROM monitor_policy_evaluations WHERE organization_id = $1 AND monitor_id = $2",
        [job.organizationId, job.payload.monitorId],
      );
      const incomingAt = new Date(job.payload.scheduledAt);
      if (prior.rows[0]?.latest_scheduled_at && prior.rows[0].latest_scheduled_at > incomingAt) {
        await client.query("COMMIT");
        return { ignored: true, reason: "out_of_order" as const };
      }

      const resultLimit = Math.max(policy.failure_threshold, policy.recovery_threshold) + 1;
      const results = await client.query<ResultRow>(
        `SELECT outcome, scheduled_at FROM check_results
         WHERE organization_id = $1 AND monitor_id = $2
         ORDER BY scheduled_at DESC, id DESC LIMIT $3`,
        [job.organizationId, job.payload.monitorId, resultLimit],
      );
      const evaluation = calculateMonitorPolicy(policy, results.rows, now);
      await client.query(
        `INSERT INTO monitor_policy_evaluations
          (organization_id, monitor_id, service_id, state, consecutive_failures, consecutive_successes,
           latest_scheduled_at, latest_outcome, fresh_until, evidence, evaluated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (organization_id, monitor_id) DO UPDATE SET
           state = excluded.state, consecutive_failures = excluded.consecutive_failures,
           consecutive_successes = excluded.consecutive_successes,
           latest_scheduled_at = excluded.latest_scheduled_at, latest_outcome = excluded.latest_outcome,
           fresh_until = excluded.fresh_until, evidence = excluded.evidence,
           evaluated_at = excluded.evaluated_at, updated_at = now()`,
        [
          policy.organization_id,
          policy.monitor_id,
          policy.service_id,
          evaluation.state,
          evaluation.consecutiveFailures,
          evaluation.consecutiveSuccesses,
          evaluation.latestScheduledAt,
          evaluation.latestOutcome,
          evaluation.freshUntil,
          evaluation.evidence,
          now,
        ],
      );
      const service = await calculateAndPersistServiceState(client, {
        organizationId: policy.organization_id,
        serviceId: policy.service_id,
        sourceId: job.id,
        now,
      });
      const incident = await reconcileAutomaticIncident(client, {
        evidenceState: service.evidenceState,
        monitorId: policy.monitor_id,
        now,
        organizationId: policy.organization_id,
        policyState: evaluation.state,
        scheduledAt: incomingAt,
        serviceId: policy.service_id,
        servicePresentationState: service.currentState,
      });
      await client.query("COMMIT");
      if (incident.action === "created") {
        runtimeMetrics.record("incident.created");
        runtimeMetrics.record(
          "incident.recovery.duration",
          Math.max(0, now.getTime() - incomingAt.getTime()),
          { status: "detection" },
        );
      } else if (incident.action === "linked") runtimeMetrics.record("incident.duplicate");
      if (incident.action === "resolved") {
        runtimeMetrics.record(
          "incident.recovery.duration",
          Math.max(0, now.getTime() - incomingAt.getTime()),
          { status: "recovery" },
        );
      }
      structuredLog("info", "policy.evaluated", {
        correlationId: job.correlationId,
        jobId: job.id,
        monitorId: job.payload.monitorId,
        organizationId: job.organizationId,
        outcome: evaluation.latestOutcome ?? "none",
        status: evaluation.state,
      });
      return { ignored: false, incident, monitorState: evaluation.state, service };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function calculateMonitorPolicy(
  policy: PolicyRow,
  results: readonly ResultRow[],
  now: Date,
): {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  evidence: Record<string, unknown>;
  freshUntil: Date | null;
  latestOutcome: CheckOutcome | null;
  latestScheduledAt: Date | null;
  state: MonitorPolicyState;
} {
  const latest = results[0];
  if (policy.monitor_status !== "active") {
    return emptyEvaluation("unknown", {
      reason: "monitor_inactive",
      status: policy.monitor_status,
    });
  }
  if (!latest) return emptyEvaluation("unknown", { reason: "no_check_evidence" });
  const freshUntil = new Date(
    latest.scheduled_at.getTime() + policy.interval_seconds * 1_000 + 120_000,
  );
  if (freshUntil < now) {
    return {
      ...emptyEvaluation("stale", { reason: "evidence_expired" }),
      freshUntil,
      latestOutcome: latest.outcome,
      latestScheduledAt: latest.scheduled_at,
    };
  }
  if (latest.outcome === "rejected_target" || latest.outcome === "execution_error") {
    return {
      ...emptyEvaluation("unknown", { reason: latest.outcome }),
      freshUntil,
      latestOutcome: latest.outcome,
      latestScheduledAt: latest.scheduled_at,
    };
  }
  const isFailure = (outcome: CheckOutcome) => outcome === "failure" || outcome === "timeout";
  const consecutiveFailures = isFailure(latest.outcome)
    ? countConsecutive(results, (result) => isFailure(result.outcome))
    : 0;
  const consecutiveSuccesses =
    latest.outcome === "success"
      ? countConsecutive(results, (result) => result.outcome === "success")
      : 0;
  let state: MonitorPolicyState;
  if (consecutiveFailures > 0) {
    state = consecutiveFailures >= policy.failure_threshold ? "unhealthy" : "failing";
  } else if (consecutiveSuccesses >= policy.recovery_threshold) {
    state = "healthy";
  } else {
    state = "recovering";
  }
  return {
    consecutiveFailures,
    consecutiveSuccesses,
    evidence: {
      failureThreshold: policy.failure_threshold,
      previousState: policy.previous_state,
      recoveryThreshold: policy.recovery_threshold,
    },
    freshUntil,
    latestOutcome: latest.outcome,
    latestScheduledAt: latest.scheduled_at,
    state,
  };
}

function emptyEvaluation(state: MonitorPolicyState, evidence: Record<string, unknown>) {
  return {
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    evidence,
    freshUntil: null,
    latestOutcome: null,
    latestScheduledAt: null,
    state,
  };
}

function countConsecutive(
  results: readonly ResultRow[],
  predicate: (result: ResultRow) => boolean,
): number {
  let count = 0;
  for (const result of results) {
    if (!predicate(result)) break;
    count += 1;
  }
  return count;
}

export async function calculateAndPersistServiceState(
  client: PoolClient,
  options: {
    forceUnknownReason?: string;
    now: Date;
    organizationId: string;
    serviceId: string;
    sourceId: string;
  },
) {
  const currentResult = await client.query<{
    current_state: ServiceState;
    evidence_state: ServiceState;
  }>(
    "SELECT current_state, evidence_state FROM services WHERE organization_id = $1 AND id = $2 FOR UPDATE",
    [options.organizationId, options.serviceId],
  );
  const current = currentResult.rows[0];
  if (!current) throw new PermanentJobError("Service not found");
  const evaluations = await client.query<{
    failure_impact: MonitorImpact;
    fresh_until: Date | null;
    monitor_id: string;
    state: MonitorPolicyState | null;
  }>(
    `SELECT m.id AS monitor_id, p.failure_impact, e.state, e.fresh_until
     FROM monitors m JOIN monitor_policies p ON p.monitor_id = m.id AND p.organization_id = m.organization_id
     LEFT JOIN monitor_policy_evaluations e ON e.monitor_id = m.id AND e.organization_id = m.organization_id
     WHERE m.organization_id = $1 AND m.service_id = $2 AND m.status = 'active' AND m.deleted_at IS NULL`,
    [options.organizationId, options.serviceId],
  );
  let evidenceState: ServiceState = current.evidence_state;
  let reason = "confirmed_monitor_policy";
  if (options.forceUnknownReason) {
    evidenceState = "unknown";
    reason = options.forceUnknownReason;
  } else if (evaluations.rows.length === 0) {
    evidenceState = "unknown";
    reason = "no_active_monitors";
  } else if (evaluations.rows.some((evaluation) => evaluation.state === "unhealthy")) {
    evidenceState = evaluations.rows
      .filter((evaluation) => evaluation.state === "unhealthy")
      .reduce<ServiceState>(
        (worst, evaluation) =>
          severity[evaluation.failure_impact] > severity[worst] ? evaluation.failure_impact : worst,
        "operational",
      );
  } else if (
    evaluations.rows.some(
      (evaluation) =>
        !evaluation.state ||
        evaluation.state === "unknown" ||
        evaluation.state === "stale" ||
        !evaluation.fresh_until ||
        evaluation.fresh_until < options.now,
    )
  ) {
    evidenceState = "unknown";
    reason = "monitor_evidence_stale_or_unknown";
  } else {
    if (evaluations.rows.some((evaluation) => evaluation.state === "recovering")) {
      evidenceState = current.evidence_state;
      reason = "recovery_confirmation_pending";
    } else if (
      evaluations.rows.every(
        (evaluation) => evaluation.state === "healthy" || evaluation.state === "failing",
      )
    ) {
      evidenceState =
        current.evidence_state === "unknown" &&
        evaluations.rows.some((row) => row.state === "failing")
          ? "unknown"
          : "operational";
      reason = evaluations.rows.some((row) => row.state === "failing")
        ? "failure_confirmation_pending"
        : reason;
    }
  }

  const maintenance = await client.query(
    `SELECT 1 FROM maintenance_windows w JOIN maintenance_window_services s
       ON s.maintenance_window_id = w.id AND s.organization_id = w.organization_id
     WHERE w.organization_id = $1 AND s.service_id = $2 AND w.status = 'scheduled'
       AND w.starts_at <= $3 AND w.ends_at > $3 LIMIT 1`,
    [options.organizationId, options.serviceId, options.now],
  );
  const override = await client.query<{ declared_state: ServiceState }>(
    `SELECT declared_state FROM service_state_overrides WHERE organization_id = $1 AND service_id = $2
     AND cancelled_at IS NULL AND starts_at <= $3 AND expires_at > $3 ORDER BY created_at DESC LIMIT 1`,
    [options.organizationId, options.serviceId, options.now],
  );
  const currentState: ServiceState = maintenance.rowCount
    ? "under_maintenance"
    : (override.rows[0]?.declared_state ?? evidenceState);
  const evidence = {
    evaluatedAt: options.now.toISOString(),
    monitors: evaluations.rows.map((row) => ({ id: row.monitor_id, state: row.state })),
    reason,
  };
  await client.query(
    `UPDATE services SET current_state = $1, evidence_state = $2, state_changed_at = CASE
       WHEN current_state <> $1 THEN $3 ELSE state_changed_at END, state_evidence = $4,
       version = version + 1, updated_at = now() WHERE organization_id = $5 AND id = $6`,
    [currentState, evidenceState, options.now, evidence, options.organizationId, options.serviceId],
  );
  if (current.current_state !== currentState) {
    await client.query(
      `INSERT INTO service_state_transitions
       (organization_id, service_id, from_state, to_state, evidence_state, actor_type, reason,
        source, idempotency_key, evidence, occurred_at)
       VALUES ($1,$2,$3,$4,$5,'worker',$6,'policy_engine',$7,$8,$9)
       ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
      [
        options.organizationId,
        options.serviceId,
        current.current_state,
        currentState,
        evidenceState,
        reason,
        `service-state:${options.serviceId}:${options.sourceId}:${currentState}`,
        evidence,
        options.now,
      ],
    );
  }
  return { currentState, evidenceState, reason };
}

export class MonitoringFreshnessDetector {
  constructor(
    private readonly database: DatabaseClient,
    private readonly queue: JobQueue,
  ) {}

  async inspect(now = new Date()) {
    const queueHealth = await this.queue.inspectHealth();
    const worker = await this.database.pool.query<{ heartbeat_at: Date }>(
      "SELECT heartbeat_at FROM worker_heartbeats WHERE deployment_mode = 'local' ORDER BY heartbeat_at DESC LIMIT 1",
    );
    const workerStale =
      queueHealth.adapter === "bullmq" &&
      (!worker.rows[0] || now.getTime() - worker.rows[0].heartbeat_at.getTime() > 90_000);
    await this.database.pool.query(
      `UPDATE expected_check_windows w SET status = 'expired', lease_owner = NULL,
         lease_expires_at = NULL, updated_at = now()
       FROM monitor_policies p WHERE p.monitor_id = w.monitor_id AND p.organization_id = w.organization_id
         AND w.status IN ('pending','claimed')
         AND w.scheduled_at + make_interval(secs => p.interval_seconds) + interval '2 minutes' < $1`,
      [now],
    );
    const stale = await this.database.pool.query<{ organization_id: string; service_id: string }>(
      `SELECT DISTINCT m.organization_id, m.service_id FROM monitors m
       JOIN monitor_policies p ON p.monitor_id = m.id AND p.organization_id = m.organization_id
       LEFT JOIN monitor_policy_evaluations e ON e.monitor_id = m.id AND e.organization_id = m.organization_id
       WHERE m.status = 'active' AND m.deleted_at IS NULL AND
         (e.id IS NULL OR e.fresh_until < $1 OR EXISTS (
           SELECT 1 FROM expected_check_windows w WHERE w.organization_id = m.organization_id
             AND w.monitor_id = m.id AND w.status = 'expired'
             AND (e.latest_scheduled_at IS NULL OR w.scheduled_at >= e.latest_scheduled_at)))`,
      [now],
    );
    const queueStale = queueHealth.lagMilliseconds > 120_000;
    const services = new Map(
      stale.rows.map((row) => [`${row.organization_id}:${row.service_id}`, row]),
    );
    if (workerStale || queueStale) {
      const all = await this.database.pool.query<{ organization_id: string; service_id: string }>(
        "SELECT DISTINCT organization_id, service_id FROM monitors WHERE status = 'active' AND deleted_at IS NULL",
      );
      for (const row of all.rows) services.set(`${row.organization_id}:${row.service_id}`, row);
    }
    for (const service of services.values()) {
      const client = await this.database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT id FROM services WHERE organization_id = $1 AND id = $2 FOR UPDATE",
          [service.organization_id, service.service_id],
        );
        if (!workerStale && !queueStale) {
          const stillStale = await client.query(
            `SELECT 1 FROM monitors m
             JOIN monitor_policies p ON p.monitor_id = m.id AND p.organization_id = m.organization_id
             LEFT JOIN monitor_policy_evaluations e ON e.monitor_id = m.id AND e.organization_id = m.organization_id
             WHERE m.organization_id = $1 AND m.service_id = $2
               AND m.status = 'active' AND m.deleted_at IS NULL AND
               (e.id IS NULL OR e.fresh_until < $3 OR EXISTS (
                 SELECT 1 FROM expected_check_windows w WHERE w.organization_id = m.organization_id
                   AND w.monitor_id = m.id AND w.status = 'expired'
                   AND (e.latest_scheduled_at IS NULL OR w.scheduled_at >= e.latest_scheduled_at)))
             LIMIT 1`,
            [service.organization_id, service.service_id, now],
          );
          if (!stillStale.rowCount) {
            await client.query("COMMIT");
            continue;
          }
        }
        const reason = workerStale
          ? "worker_heartbeat_stale"
          : queueStale
            ? "queue_lag_excessive"
            : "expected_check_window_missed";
        await calculateAndPersistServiceState(client, {
          forceUnknownReason: reason,
          now,
          organizationId: service.organization_id,
          serviceId: service.service_id,
          sourceId: `freshness:${Math.floor(now.getTime() / 300_000)}`,
        });
        const id = randomUUID();
        await client.query(
          `INSERT INTO audit_events
           (id, organization_id, actor_type, action, target_type, target_id, source,
            correlation_id, idempotency_key, safe_payload, occurred_at)
           VALUES ($1::uuid,$2,'system','system.monitoring_evidence_stale','service',$3,'freshness_detector',$1::text,$4,$5,$6)
           ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
          [
            id,
            service.organization_id,
            service.service_id,
            `freshness:${service.service_id}:${Math.floor(now.getTime() / 300_000)}`,
            { queueLagMilliseconds: queueHealth.lagMilliseconds, reason },
            now,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return { affectedServices: services.size, queueStale, workerStale };
  }
}
