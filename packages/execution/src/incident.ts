import { randomUUID } from "node:crypto";

import type { IncidentLifecycle, MonitorPolicyState, ServiceState } from "@devrelay/contracts";
import type { PoolClient } from "pg";

type Options = {
  evidenceState: ServiceState;
  monitorId: string;
  now: Date;
  organizationId: string;
  policyState: MonitorPolicyState;
  scheduledAt: Date;
  serviceId: string;
  servicePresentationState: ServiceState;
};

export async function reconcileAutomaticIncident(client: PoolClient, options: Options) {
  const fingerprint = `automatic-service:${options.serviceId}`;
  const evidence = await client.query<{ id: string }>(
    "SELECT id FROM check_results WHERE organization_id = $1 AND monitor_id = $2 AND scheduled_at = $3",
    [options.organizationId, options.monitorId, options.scheduledAt],
  );
  const evidenceId = evidence.rows[0]?.id ?? null;
  const active = await client.query<{ id: string; lifecycle: IncidentLifecycle }>(
    `SELECT id, lifecycle FROM incidents WHERE organization_id = $1 AND source = 'automatic_monitor'
     AND automatic_fingerprint = $2 AND resolved_at IS NULL FOR UPDATE`,
    [options.organizationId, fingerprint],
  );
  const current = active.rows[0];
  const impaired = ["degraded_performance", "partial_outage", "major_outage"].includes(
    options.evidenceState,
  );

  if (impaired && options.servicePresentationState !== "under_maintenance") {
    if (current && options.policyState === "recovering" && current.lifecycle !== "monitoring") {
      const key = `automatic-monitoring:${current.id}:${options.scheduledAt.toISOString()}`;
      await client.query(
        "UPDATE incidents SET lifecycle = 'monitoring', version = version + 1, updated_at = now() WHERE organization_id = $1 AND id = $2",
        [options.organizationId, current.id],
      );
      await transition(
        client,
        options,
        current.id,
        current.lifecycle,
        "monitoring",
        null,
        "Recovery evidence is being observed",
        key,
        evidenceId,
      );
      await outbox(client, options.organizationId, current.id, "incident.transitioned", key, {
        toLifecycle: "monitoring",
      });
      return { action: "monitoring" as const, id: current.id };
    }
    if (current) return { action: "linked" as const, id: current.id };
    const recent = await client.query<{ id: string; lifecycle: IncidentLifecycle }>(
      `SELECT id, lifecycle FROM incidents WHERE organization_id = $1 AND source = 'automatic_monitor'
       AND automatic_fingerprint = $2 AND resolved_at >= $3 ORDER BY resolved_at DESC LIMIT 1 FOR UPDATE`,
      [options.organizationId, fingerprint, new Date(options.now.getTime() - 86_400_000)],
    );
    if (recent.rows[0]) {
      const incident = recent.rows[0];
      const key = `automatic-reopen:${incident.id}:${options.scheduledAt.toISOString()}`;
      await client.query(
        "UPDATE incidents SET lifecycle = 'investigating', outcome = NULL, resolved_at = NULL, version = version + 1, updated_at = now() WHERE organization_id = $1 AND id = $2",
        [options.organizationId, incident.id],
      );
      await transition(
        client,
        options,
        incident.id,
        incident.lifecycle,
        "investigating",
        null,
        "Confirmed impairment recurred within 24 hours",
        key,
        evidenceId,
      );
      await outbox(client, options.organizationId, incident.id, "incident.reopened", key, {
        evidenceCheckResultId: evidenceId,
      });
      return { action: "reopened" as const, id: incident.id };
    }
    const id = randomUUID();
    const key = `automatic-create:${fingerprint}:${options.scheduledAt.toISOString()}`;
    const created = await client.query<{ id: string }>(
      `INSERT INTO incidents (id, organization_id, slug, title, source, severity, lifecycle,
       automatic_fingerprint, creation_idempotency_key, started_at)
       VALUES ($1,$2,$3,'Monitor-confirmed service impairment','automatic_monitor',$4,'investigating',$5,$6,$7)
       ON CONFLICT DO NOTHING RETURNING id`,
      [
        id,
        options.organizationId,
        `incident-${id.slice(0, 8)}`,
        options.evidenceState,
        fingerprint,
        key,
        options.now,
      ],
    );
    if (!created.rows[0]) {
      const winner = await client.query<{ id: string }>(
        "SELECT id FROM incidents WHERE organization_id = $1 AND automatic_fingerprint = $2 AND resolved_at IS NULL",
        [options.organizationId, fingerprint],
      );
      return { action: "linked" as const, id: winner.rows[0]!.id };
    }
    await client.query(
      "INSERT INTO incident_services (organization_id, incident_id, service_id, impact, is_primary) VALUES ($1,$2,$3,$4,true)",
      [options.organizationId, id, options.serviceId, options.evidenceState],
    );
    await transition(
      client,
      options,
      id,
      null,
      "detected",
      null,
      "Monitoring policy confirmed an impairment",
      `${key}:transition`,
      evidenceId,
    );
    await transition(
      client,
      options,
      id,
      "detected",
      "investigating",
      null,
      "Automatic policy accepted the confirmed incident for response",
      `${key}:investigating`,
      evidenceId,
    );
    await outbox(client, options.organizationId, id, "incident.created", key, {
      evidenceCheckResultId: evidenceId,
      serviceId: options.serviceId,
      severity: options.evidenceState,
    });
    return { action: "created" as const, id };
  }

  if (!current) return { action: "none" as const };
  if (options.evidenceState === "operational") {
    const key = `automatic-resolve:${current.id}:${options.scheduledAt.toISOString()}`;
    await client.query(
      "UPDATE incidents SET lifecycle = 'resolved', outcome = 'resolved', resolved_at = $3, version = version + 1, updated_at = now() WHERE organization_id = $1 AND id = $2",
      [options.organizationId, current.id, options.now],
    );
    await transition(
      client,
      options,
      current.id,
      current.lifecycle,
      "resolved",
      "resolved",
      "Recovery policy confirmed service health",
      key,
      evidenceId,
    );
    await outbox(client, options.organizationId, current.id, "incident.resolved", key, {
      evidenceCheckResultId: evidenceId,
    });
    return { action: "resolved" as const, id: current.id };
  }
  return { action: "none" as const, id: current.id };
}

async function transition(
  client: PoolClient,
  options: Options,
  id: string,
  from: IncidentLifecycle | null,
  to: IncidentLifecycle,
  outcome: string | null,
  reason: string,
  key: string,
  evidenceId: string | null,
) {
  await client.query(
    `INSERT INTO incident_transitions (organization_id, incident_id, from_lifecycle, to_lifecycle,
     outcome, actor_type, reason, evidence_check_result_id, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,'monitor',$6,$7,$8) ON CONFLICT (organization_id, incident_id, idempotency_key) DO NOTHING`,
    [options.organizationId, id, from, to, outcome, reason, evidenceId, key],
  );
}

async function outbox(
  client: PoolClient,
  organizationId: string,
  incidentId: string,
  eventType: string,
  key: string,
  payload: Record<string, unknown>,
) {
  await client.query(
    "INSERT INTO outbox_events (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key) VALUES ($1,'incident',$2,$3,$4,$5) ON CONFLICT (organization_id, idempotency_key) DO NOTHING",
    [organizationId, incidentId, eventType, payload, `${key}:outbox`],
  );
}
