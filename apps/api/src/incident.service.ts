import { randomUUID } from "node:crypto";

import type {
  CreateManualIncidentInput,
  CreatePrivateIncidentNoteInput,
  CreatePublicIncidentUpdateInput,
  IncidentLifecycle,
  IncidentOutcome,
  TransitionIncidentInput,
  UpdateIncidentInput,
} from "@devrelay/contracts";
import type { DatabaseTransaction } from "@devrelay/database";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DatabaseService } from "./database.service.js";
import { OrganizationService } from "./organization.service.js";

const allowedTransitions: Record<IncidentLifecycle, readonly IncidentLifecycle[]> = {
  detected: ["investigating", "resolved"],
  investigating: ["identified", "monitoring", "resolved"],
  identified: ["monitoring", "resolved"],
  monitoring: ["investigating", "identified", "resolved"],
  resolved: ["investigating", "postmortem_published"],
  postmortem_published: ["investigating"],
};

type IncidentRecord = {
  lifecycle: IncidentLifecycle;
  outcome: IncidentOutcome | null;
  resolvedAt: Date | null;
  source: string;
  version: number;
};

@Injectable()
export class IncidentService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly organizations: OrganizationService,
  ) {}

  async list(userId: string, slug: string) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const result = await this.databaseService.database.execute(sql`
      SELECT i.id, i.slug, i.title, i.public_title AS "publicTitle", i.source, i.severity,
        i.lifecycle, i.outcome, i.started_at AS "startedAt", i.resolved_at AS "resolvedAt",
        i.updated_at AS "updatedAt", COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name,
          'state', s.current_state, 'impact', affected.impact) ORDER BY affected.is_primary DESC, s.display_order)
          FILTER (WHERE s.id IS NOT NULL), '[]') AS services
      FROM incidents i LEFT JOIN incident_services affected ON affected.incident_id = i.id AND affected.organization_id = i.organization_id
      LEFT JOIN services s ON s.id = affected.service_id AND s.organization_id = i.organization_id
      WHERE i.organization_id = ${context.organizationId}
      GROUP BY i.id ORDER BY (i.resolved_at IS NULL) DESC, i.started_at DESC, i.id DESC
    `);
    return result.rows;
  }

  async get(userId: string, slug: string, incidentId: string) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const incident = await this.databaseService.database.execute(sql`
      SELECT id, organization_id AS "organizationId", slug, title, public_title AS "publicTitle", source,
        severity, lifecycle, outcome, started_at AS "startedAt", resolved_at AS "resolvedAt", version,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM incidents WHERE organization_id = ${context.organizationId} AND id = ${incidentId}
    `);
    if (!incident.rows[0]) throw new NotFoundException("Incident not found");
    const [services, transitions, publicUpdates, privateNotes] = await Promise.all([
      this.databaseService.database.execute(
        sql`SELECT s.id, s.name, s.current_state AS "currentState", a.impact, a.is_primary AS "isPrimary" FROM incident_services a JOIN services s ON s.id = a.service_id AND s.organization_id = a.organization_id WHERE a.organization_id = ${context.organizationId} AND a.incident_id = ${incidentId} ORDER BY a.is_primary DESC, s.display_order, s.id`,
      ),
      this.databaseService.database.execute(
        sql`SELECT id, from_lifecycle AS "fromLifecycle", to_lifecycle AS "toLifecycle", outcome, actor_type AS "actorType", actor_user_id AS "actorUserId", reason, evidence_check_result_id AS "evidenceCheckResultId", created_at AS "createdAt" FROM incident_transitions WHERE organization_id = ${context.organizationId} AND incident_id = ${incidentId} ORDER BY created_at, id`,
      ),
      this.databaseService.database.execute(
        sql`SELECT u.id, u.lifecycle, u.body, u.author_user_id AS "authorUserId", u.published_at AS "publishedAt", COALESCE(json_object_agg(d.status, d.count) FILTER (WHERE d.status IS NOT NULL), '{}') AS deliveries FROM incident_public_updates u LEFT JOIN (SELECT incident_public_update_id, status, count(*)::int FROM notification_deliveries WHERE organization_id = ${context.organizationId} GROUP BY incident_public_update_id, status) d ON d.incident_public_update_id = u.id WHERE u.organization_id = ${context.organizationId} AND u.incident_id = ${incidentId} GROUP BY u.id ORDER BY u.published_at, u.id`,
      ),
      this.databaseService.database.execute(
        sql`SELECT id, body, author_user_id AS "authorUserId", created_at AS "createdAt" FROM incident_private_notes WHERE organization_id = ${context.organizationId} AND incident_id = ${incidentId} ORDER BY created_at, id`,
      ),
    ]);
    return {
      ...incident.rows[0],
      services: services.rows,
      transitions: transitions.rows,
      publicUpdates: publicUpdates.rows,
      privateNotes: privateNotes.rows,
    };
  }

  async createManual(userId: string, slug: string, input: CreateManualIncidentInput) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const existing = await transaction.execute(
        sql`SELECT id FROM incidents WHERE organization_id = ${context.organizationId} AND creation_idempotency_key = ${input.idempotencyKey}`,
      );
      if (existing.rows[0]) return this.get(userId, slug, existing.rows[0].id as string);
      const serviceIds = sql.join(
        input.affectedServiceIds.map((id) => sql`${id}`),
        sql`, `,
      );
      const services = await transaction.execute(
        sql`SELECT id FROM services WHERE organization_id = ${context.organizationId} AND id IN (${serviceIds}) AND deleted_at IS NULL`,
      );
      if (services.rows.length !== new Set(input.affectedServiceIds).size)
        throw new BadRequestException("Every affected service must exist in this organization");
      const id = randomUUID();
      const incidentSlug = `incident-${id.slice(0, 8)}`;
      await transaction.execute(
        sql`INSERT INTO incidents (id, organization_id, slug, title, public_title, source, severity, lifecycle, creation_idempotency_key, started_at) VALUES (${id}, ${context.organizationId}, ${incidentSlug}, ${input.title}, ${input.publicTitle ?? null}, 'manual_responder', ${input.severity}, 'investigating', ${input.idempotencyKey}, now())`,
      );
      for (const [index, serviceId] of input.affectedServiceIds.entries())
        await transaction.execute(
          sql`INSERT INTO incident_services (organization_id, incident_id, service_id, impact, is_primary) VALUES (${context.organizationId}, ${id}, ${serviceId}, ${input.severity}, ${index === 0})`,
        );
      await transaction.execute(
        sql`INSERT INTO incident_transitions (organization_id, incident_id, from_lifecycle, to_lifecycle, actor_type, actor_user_id, reason, idempotency_key) VALUES (${context.organizationId}, ${id}, NULL, 'investigating', 'user', ${userId}, ${input.privateSummary}, ${input.idempotencyKey + ":created"})`,
      );
      await transaction.execute(
        sql`INSERT INTO incident_private_notes (organization_id, incident_id, author_user_id, body, idempotency_key) VALUES (${context.organizationId}, ${id}, ${userId}, ${input.privateSummary}, ${input.idempotencyKey + ":summary"})`,
      );
      if (input.publicUpdate) {
        const publicUpdate = await this.insertPublicUpdate(
          transaction,
          context.organizationId,
          id,
          userId,
          "investigating",
          input.publicUpdate,
          input.idempotencyKey + ":public",
        );
        await this.writeOutbox(
          transaction,
          context.organizationId,
          id,
          "incident.public_update_published",
          input.idempotencyKey + ":public:outbox",
          { publicUpdateId: publicUpdate.id },
        );
      }
      await this.writeOutbox(
        transaction,
        context.organizationId,
        id,
        "incident.created",
        input.idempotencyKey + ":outbox",
        { lifecycle: "investigating", severity: input.severity, source: "manual_responder" },
      );
      await this.audit(transaction, context.organizationId, userId, "incident.created", id, {
        affectedServiceCount: input.affectedServiceIds.length,
        severity: input.severity,
      });
      return { id, lifecycle: "investigating", slug: incidentSlug };
    });
  }

  async update(userId: string, slug: string, incidentId: string, input: UpdateIncidentInput) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const updated = await transaction.execute(
        sql`UPDATE incidents SET title = COALESCE(${input.title ?? null}, title), public_title = CASE WHEN ${input.publicTitle === undefined} THEN public_title ELSE ${input.publicTitle ?? null} END, severity = COALESCE(${input.severity ?? null}, severity), version = version + 1, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${incidentId} RETURNING id, title, public_title AS "publicTitle", severity, version`,
      );
      if (!updated.rows[0]) throw new NotFoundException("Incident not found");
      if (input.affectedServiceIds) {
        const serviceIds = sql.join(
          input.affectedServiceIds.map((id) => sql`${id}`),
          sql`, `,
        );
        const services = await transaction.execute(
          sql`SELECT id FROM services WHERE organization_id = ${context.organizationId} AND id IN (${serviceIds}) AND deleted_at IS NULL`,
        );
        if (services.rows.length !== new Set(input.affectedServiceIds).size)
          throw new BadRequestException("Every affected service must exist in this organization");
        await transaction.execute(
          sql`DELETE FROM incident_services WHERE organization_id = ${context.organizationId} AND incident_id = ${incidentId}`,
        );
        for (const [index, serviceId] of input.affectedServiceIds.entries())
          await transaction.execute(
            sql`INSERT INTO incident_services (organization_id, incident_id, service_id, impact, is_primary) VALUES (${context.organizationId}, ${incidentId}, ${serviceId}, COALESCE(${input.severity ?? null}, (SELECT severity FROM incidents WHERE organization_id = ${context.organizationId} AND id = ${incidentId})), ${index === 0})`,
          );
      }
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "incident.updated",
        incidentId,
        { changedFields: Object.keys(input) },
      );
      return updated.rows[0];
    });
  }

  async transition(
    userId: string,
    slug: string,
    incidentId: string,
    input: TransitionIncidentInput,
  ) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const replay = await transaction.execute(
        sql`SELECT to_lifecycle AS "toLifecycle", outcome FROM incident_transitions WHERE organization_id = ${context.organizationId} AND incident_id = ${incidentId} AND idempotency_key = ${input.idempotencyKey}`,
      );
      if (replay.rows[0]) return replay.rows[0];
      const selected = await transaction.execute<IncidentRecord>(
        sql`SELECT lifecycle, outcome, resolved_at AS "resolvedAt", source, version FROM incidents WHERE organization_id = ${context.organizationId} AND id = ${incidentId} FOR UPDATE`,
      );
      const current = selected.rows[0];
      if (!current) throw new NotFoundException("Incident not found");
      this.validateTransition(current.lifecycle, input);
      if (input.canonicalIncidentId) {
        const canonical = await transaction.execute(
          sql`SELECT id FROM incidents WHERE organization_id = ${context.organizationId} AND id = ${input.canonicalIncidentId} AND id <> ${incidentId}`,
        );
        if (!canonical.rows[0]) throw new BadRequestException("Canonical incident not found");
      }
      const resolved = input.toLifecycle === "resolved";
      const outcome = resolved
        ? (input.outcome ?? "resolved")
        : input.outcome === "maintenance_related"
          ? input.outcome
          : null;
      await transaction.execute(
        sql`UPDATE incidents SET lifecycle = ${input.toLifecycle}, outcome = ${outcome}, canonical_incident_id = ${input.canonicalIncidentId ?? null}, resolved_at = ${resolved ? new Date() : null}, version = version + 1, updated_at = now() WHERE organization_id = ${context.organizationId} AND id = ${incidentId}`,
      );
      await transaction.execute(
        sql`INSERT INTO incident_transitions (organization_id, incident_id, from_lifecycle, to_lifecycle, outcome, actor_type, actor_user_id, reason, idempotency_key) VALUES (${context.organizationId}, ${incidentId}, ${current.lifecycle}, ${input.toLifecycle}, ${outcome}, 'user', ${userId}, ${input.reason}, ${input.idempotencyKey})`,
      );
      await this.writeOutbox(
        transaction,
        context.organizationId,
        incidentId,
        "incident.transitioned",
        input.idempotencyKey + ":outbox",
        { fromLifecycle: current.lifecycle, outcome, toLifecycle: input.toLifecycle },
      );
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "incident.transitioned",
        incidentId,
        { fromLifecycle: current.lifecycle, outcome, toLifecycle: input.toLifecycle },
      );
      return {
        lifecycle: input.toLifecycle,
        outcome,
        reopened: current.resolvedAt !== null && !resolved,
      };
    });
  }

  async addPrivateNote(
    userId: string,
    slug: string,
    incidentId: string,
    input: CreatePrivateIncidentNoteInput,
  ) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    const result = await this.databaseService.database.execute(
      sql`INSERT INTO incident_private_notes (organization_id, incident_id, author_user_id, body, idempotency_key) SELECT ${context.organizationId}, id, ${userId}, ${input.body}, ${input.idempotencyKey} FROM incidents WHERE organization_id = ${context.organizationId} AND id = ${incidentId} ON CONFLICT (organization_id, incident_id, idempotency_key) DO UPDATE SET idempotency_key = excluded.idempotency_key RETURNING id, body, created_at AS "createdAt"`,
    );
    if (!result.rows[0]) throw new NotFoundException("Incident not found");
    return result.rows[0];
  }

  async publishUpdate(
    userId: string,
    slug: string,
    incidentId: string,
    input: CreatePublicIncidentUpdateInput,
  ) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.databaseService.database.transaction(async (transaction) => {
      const incident = await transaction.execute<{ lifecycle: IncidentLifecycle }>(
        sql`SELECT lifecycle FROM incidents WHERE organization_id = ${context.organizationId} AND id = ${incidentId}`,
      );
      if (!incident.rows[0]) throw new NotFoundException("Incident not found");
      if (input.lifecycle !== incident.rows[0].lifecycle)
        throw new ConflictException("Incident lifecycle changed; review the update again");
      const update = await this.insertPublicUpdate(
        transaction,
        context.organizationId,
        incidentId,
        userId,
        input.lifecycle,
        input.body,
        input.idempotencyKey,
      );
      await this.writeOutbox(
        transaction,
        context.organizationId,
        incidentId,
        "incident.public_update_published",
        input.idempotencyKey + ":outbox",
        { publicUpdateId: update.id },
      );
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "incident.public_update_published",
        incidentId,
        { publicUpdateId: update.id },
      );
      return update;
    });
  }

  private validateTransition(from: IncidentLifecycle, input: TransitionIncidentInput) {
    if (!allowedTransitions[from].includes(input.toLifecycle))
      throw new ConflictException(`Transition from ${from} to ${input.toLifecycle} is not allowed`);
    const terminal = input.toLifecycle === "resolved";
    if (!terminal && input.outcome && input.outcome !== "maintenance_related")
      throw new BadRequestException("Terminal outcomes require resolution");
    if (
      (input.outcome === "duplicate" || input.outcome === "merged") !== !!input.canonicalIncidentId
    )
      throw new BadRequestException(
        "Duplicate and merged outcomes require exactly one canonical incident",
      );
  }

  private async insertPublicUpdate(
    transaction: DatabaseTransaction,
    organizationId: string,
    incidentId: string,
    userId: string,
    lifecycle: IncidentLifecycle,
    body: string,
    idempotencyKey: string,
  ) {
    const result = await transaction.execute<{ id: string }>(
      sql`INSERT INTO incident_public_updates (organization_id, incident_id, author_user_id, lifecycle, body, idempotency_key, published_at) VALUES (${organizationId}, ${incidentId}, ${userId}, ${lifecycle}, ${body}, ${idempotencyKey}, now()) ON CONFLICT (organization_id, incident_id, idempotency_key) DO UPDATE SET idempotency_key = excluded.idempotency_key RETURNING id, body, lifecycle, published_at AS "publishedAt"`,
    );
    return result.rows[0]!;
  }

  private async writeOutbox(
    transaction: DatabaseTransaction,
    organizationId: string,
    incidentId: string,
    eventType: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ) {
    await transaction.execute(
      sql`INSERT INTO outbox_events (organization_id, aggregate_type, aggregate_id, event_type, payload_version, payload, idempotency_key) VALUES (${organizationId}, 'incident', ${incidentId}, ${eventType}, 1, ${payload}, ${idempotencyKey}) ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
    );
  }

  private async audit(
    transaction: DatabaseTransaction,
    organizationId: string,
    actorUserId: string,
    action: string,
    incidentId: string,
    payload: Record<string, unknown>,
  ) {
    const id = randomUUID();
    await transaction.execute(
      sql`INSERT INTO audit_events (id, organization_id, actor_type, actor_user_id, action, target_type, target_id, source, correlation_id, idempotency_key, safe_payload, occurred_at) VALUES (${id}, ${organizationId}, 'user', ${actorUserId}, ${action}, 'incident', ${incidentId}, 'api', ${id}, ${action + ":" + id}, ${payload}, now())`,
    );
  }
}
