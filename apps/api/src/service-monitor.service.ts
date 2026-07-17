import { randomUUID } from "node:crypto";

import type {
  CreateMonitorInput,
  CreateServiceInput,
  CreateServiceStateOverrideInput,
  OrganizationRole,
  UpdateMonitorInput,
  UpdateServiceInput,
} from "@devrelay/contracts";
import type { DatabaseTransaction } from "@devrelay/database";
import {
  describeMonitorPolicy,
  EndpointPolicyError,
  runSafeMonitorTest,
  validateEndpointDestination,
  validateRequestHeaders,
} from "@devrelay/monitoring";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import { AuthService } from "./auth.service.js";
import { DatabaseService } from "./database.service.js";
import { OrganizationService } from "./organization.service.js";

type Context = { organizationId: string; role: OrganizationRole };
type MonitorRecord = {
  acceptedStatusCodes: readonly { from: number; to: number }[];
  configurationVersion: number;
  endpointUrl: string;
  failureImpact: string;
  failureThreshold: number;
  id: string;
  intervalSeconds: number;
  method: "GET" | "HEAD";
  name: string;
  organizationId: string;
  recoveryThreshold: number;
  requestHeaders: Record<string, string>;
  serviceId: string;
  status: "pending" | "active" | "paused" | "archived";
  testedConfigurationVersion: number | null;
  timeoutMilliseconds: number;
  updatedAt: Date;
};

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? databaseErrorCode(error.cause) : undefined;
}

@Injectable()
export class ServiceMonitorService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly organizations: OrganizationService,
    private readonly authService: AuthService,
  ) {}

  async listServices(userId: string, slug: string) {
    const context = await this.context(userId, slug);
    const result = await this.databaseService.database.execute(sql`
      SELECT service.id, service.name, service.public_description AS "publicDescription",
        service.display_order AS "displayOrder", service.is_public AS "isPublic",
        service.current_state AS "currentState", service.updated_at AS "updatedAt",
        count(DISTINCT monitor.id)::int AS "monitorCount",
        max(result.finished_at) AS "lastCheckAt",
        COALESCE(round(avg(aggregate.availability_basis_points)::numeric / 100, 2), 0)::float AS availability,
        count(DISTINCT incident.id) FILTER (WHERE incident.lifecycle <> 'resolved')::int AS "activeIncidentCount"
      FROM services AS service
      LEFT JOIN monitors AS monitor ON monitor.service_id = service.id AND monitor.organization_id = service.organization_id AND monitor.deleted_at IS NULL
      LEFT JOIN check_results AS result ON result.monitor_id = monitor.id AND result.organization_id = service.organization_id
      LEFT JOIN daily_availability_aggregates AS aggregate ON aggregate.service_id = service.id AND aggregate.organization_id = service.organization_id AND aggregate.day >= current_date - 30
      LEFT JOIN incident_services AS affected ON affected.service_id = service.id AND affected.organization_id = service.organization_id
      LEFT JOIN incidents AS incident ON incident.id = affected.incident_id AND incident.organization_id = service.organization_id
      WHERE service.organization_id = ${context.organizationId} AND service.deleted_at IS NULL
      GROUP BY service.id
      ORDER BY service.display_order, lower(service.name), service.id
    `);
    return result.rows;
  }

  async getService(userId: string, slug: string, serviceId: string) {
    const context = await this.context(userId, slug);
    const result = await this.databaseService.database.execute(sql`
      SELECT service.id, service.organization_id AS "organizationId", service.name,
        service.public_description AS "publicDescription", service.display_order AS "displayOrder",
        service.is_public AS "isPublic", service.current_state AS "currentState",
        service.evidence_state AS "evidenceState", service.state_changed_at AS "stateChangedAt",
        service.updated_at AS "updatedAt", count(DISTINCT monitor.id)::int AS "monitorCount",
        max(check_result.finished_at) AS "lastCheckAt",
        COALESCE(round(avg(aggregate.availability_basis_points)::numeric / 100, 2), 0)::float AS availability
      FROM services AS service
      LEFT JOIN monitors AS monitor ON monitor.service_id = service.id AND monitor.organization_id = service.organization_id AND monitor.deleted_at IS NULL
      LEFT JOIN check_results AS check_result ON check_result.monitor_id = monitor.id AND check_result.organization_id = service.organization_id
      LEFT JOIN daily_availability_aggregates AS aggregate ON aggregate.service_id = service.id AND aggregate.organization_id = service.organization_id AND aggregate.day >= current_date - 30
      WHERE service.id = ${serviceId} AND service.organization_id = ${context.organizationId} AND service.deleted_at IS NULL
      GROUP BY service.id
    `);
    if (!result.rows[0]) throw new NotFoundException("Service not found");
    const monitors = await this.listMonitorsForService(context.organizationId, serviceId);
    const incidents = await this.databaseService.database.execute(sql`
      SELECT incident.id, incident.title, incident.lifecycle, incident.severity, incident.started_at AS "startedAt"
      FROM incident_services AS affected JOIN incidents AS incident ON incident.id = affected.incident_id
      WHERE affected.organization_id = ${context.organizationId} AND affected.service_id = ${serviceId}
      ORDER BY incident.started_at DESC LIMIT 10
    `);
    const override = await this.databaseService.database.execute(sql`
      SELECT id, declared_state AS state, reason, starts_at AS "startsAt", expires_at AS "expiresAt"
      FROM service_state_overrides WHERE organization_id = ${context.organizationId} AND service_id = ${serviceId}
        AND cancelled_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1
    `);
    const stateHistory = await this.databaseService.database.execute(sql`
      SELECT id, from_state AS "fromState", to_state AS "toState", evidence_state AS "evidenceState",
        actor_type AS "actorType", reason, source, occurred_at AS "occurredAt"
      FROM service_state_transitions WHERE organization_id = ${context.organizationId} AND service_id = ${serviceId}
      ORDER BY occurred_at DESC, id DESC LIMIT 25
    `);
    return {
      ...result.rows[0],
      incidents: incidents.rows,
      monitors,
      stateHistory: stateHistory.rows,
      stateOverride: override.rows[0] ?? null,
    };
  }

  async createService(userId: string, slug: string, input: CreateServiceInput) {
    const context = await this.manageContext(userId, slug);
    try {
      return await this.databaseService.database.transaction(async (transaction) => {
        const id = randomUUID();
        const created = await transaction.execute(sql`
          INSERT INTO services (id, organization_id, name, public_description, display_order, is_public)
          VALUES (${id}, ${context.organizationId}, ${input.name}, ${input.publicDescription ?? null}, ${input.displayOrder}, ${input.isPublic})
          RETURNING id, organization_id AS "organizationId", name, public_description AS "publicDescription", display_order AS "displayOrder", is_public AS "isPublic", current_state AS "currentState", updated_at AS "updatedAt"
        `);
        await this.audit(
          transaction,
          userId,
          context.organizationId,
          "service.created",
          "service",
          id,
          { displayOrder: input.displayOrder, isPublic: input.isPublic, name: input.name },
        );
        return created.rows[0]!;
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505")
        throw new ConflictException("An active service already uses this name");
      throw error;
    }
  }

  async updateService(userId: string, slug: string, serviceId: string, input: UpdateServiceInput) {
    const context = await this.manageContext(userId, slug);
    if (Object.keys(input).length === 0)
      throw new BadRequestException("At least one service field must be provided");
    try {
      return await this.databaseService.database.transaction(async (transaction) => {
        const updated = await transaction.execute(sql`
          UPDATE services SET name = COALESCE(${input.name ?? null}, name),
            public_description = CASE WHEN ${input.publicDescription === undefined} THEN public_description ELSE ${input.publicDescription ?? null} END,
            display_order = COALESCE(${input.displayOrder ?? null}, display_order),
            is_public = COALESCE(${input.isPublic ?? null}, is_public), updated_at = now(), version = version + 1
          WHERE id = ${serviceId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL
          RETURNING id, organization_id AS "organizationId", name, public_description AS "publicDescription", display_order AS "displayOrder", is_public AS "isPublic", current_state AS "currentState", updated_at AS "updatedAt"
        `);
        if (!updated.rows[0]) throw new NotFoundException("Service not found");
        await this.audit(
          transaction,
          userId,
          context.organizationId,
          "service.updated",
          "service",
          serviceId,
          { changedFields: Object.keys(input) },
        );
        return updated.rows[0];
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505")
        throw new ConflictException("An active service already uses this name");
      throw error;
    }
  }

  async archiveService(userId: string, slug: string, serviceId: string) {
    const context = await this.manageContext(userId, slug);
    return this.databaseService.database.transaction(async (transaction) => {
      const archived = await transaction.execute(sql`
        UPDATE services SET deleted_at = now(), is_public = false, updated_at = now(), version = version + 1
        WHERE id = ${serviceId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL RETURNING id
      `);
      if (!archived.rows[0]) throw new NotFoundException("Service not found");
      await transaction.execute(
        sql`UPDATE monitors SET status = 'archived', deleted_at = COALESCE(deleted_at, now()), next_due_at = NULL, paused_at = NULL, updated_at = now() WHERE service_id = ${serviceId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL`,
      );
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        "service.archived",
        "service",
        serviceId,
        { historyPreserved: true },
      );
      return { archived: true, id: serviceId };
    });
  }

  async createStateOverride(
    userId: string,
    slug: string,
    serviceId: string,
    input: CreateServiceStateOverrideInput,
  ) {
    const context = await this.manageContext(userId, slug);
    const now = new Date();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 86_400_000) {
      throw new BadRequestException(
        "Override expiry must be in the future and no more than 24 hours away",
      );
    }
    return this.databaseService.database.transaction(async (transaction) => {
      const service = await transaction.execute<{ currentState: string }>(sql`
        SELECT current_state AS "currentState" FROM services
        WHERE id = ${serviceId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL FOR UPDATE
      `);
      if (!service.rows[0]) throw new NotFoundException("Service not found");
      await transaction.execute(sql`
        UPDATE service_state_overrides SET cancelled_at = ${now}, cancelled_by_user_id = ${userId}, updated_at = now()
        WHERE organization_id = ${context.organizationId} AND service_id = ${serviceId} AND cancelled_at IS NULL
      `);
      const id = randomUUID();
      await transaction.execute(sql`
        INSERT INTO service_state_overrides
          (id, organization_id, service_id, declared_state, reason, starts_at, expires_at, created_by_user_id)
        VALUES (${id}, ${context.organizationId}, ${serviceId}, ${input.state}, ${input.reason}, ${now}, ${expiresAt}, ${userId})
      `);
      await transaction.execute(sql`
        UPDATE services SET current_state = ${input.state}, state_changed_at = ${now}, updated_at = now(), version = version + 1
        WHERE id = ${serviceId} AND organization_id = ${context.organizationId}
      `);
      await transaction.execute(sql`
        INSERT INTO service_state_transitions
          (organization_id, service_id, from_state, to_state, evidence_state, actor_type, actor_user_id,
           reason, source, idempotency_key, evidence, occurred_at)
        SELECT ${context.organizationId}, ${serviceId}, ${service.rows[0].currentState}, ${input.state}, evidence_state,
          'user', ${userId}, ${input.reason}, 'manual_override', ${`override:${id}:created`},
          ${JSON.stringify({ expiresAt: expiresAt.toISOString(), overrideId: id })}::jsonb, ${now}
        FROM services WHERE id = ${serviceId} AND organization_id = ${context.organizationId}
      `);
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        "service.state_override_created",
        "service",
        serviceId,
        {
          expiresAt: expiresAt.toISOString(),
          overrideId: id,
          reason: input.reason,
          state: input.state,
        },
      );
      return { expiresAt, id, reason: input.reason, state: input.state };
    });
  }

  async cancelStateOverride(
    userId: string,
    slug: string,
    serviceId: string,
    input: { reason: string },
  ) {
    const context = await this.manageContext(userId, slug);
    return this.databaseService.database.transaction(async (transaction) => {
      const service = await transaction.execute<{
        currentState: string;
        evidenceState: string;
      }>(sql`
        SELECT current_state AS "currentState", evidence_state AS "evidenceState" FROM services
        WHERE id = ${serviceId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL FOR UPDATE
      `);
      if (!service.rows[0]) throw new NotFoundException("Service not found");
      const cancelled = await transaction.execute<{ id: string }>(sql`
        UPDATE service_state_overrides SET cancelled_at = now(), cancelled_by_user_id = ${userId}, updated_at = now()
        WHERE organization_id = ${context.organizationId} AND service_id = ${serviceId} AND cancelled_at IS NULL
        RETURNING id
      `);
      if (!cancelled.rows[0]) throw new NotFoundException("Active state override not found");
      const maintenance = await transaction.execute(sql`
        SELECT 1 FROM maintenance_windows w JOIN maintenance_window_services s
          ON s.maintenance_window_id = w.id AND s.organization_id = w.organization_id
        WHERE w.organization_id = ${context.organizationId} AND s.service_id = ${serviceId}
          AND w.status = 'scheduled' AND w.starts_at <= now() AND w.ends_at > now() LIMIT 1
      `);
      const restoredState = maintenance.rows[0]
        ? "under_maintenance"
        : service.rows[0].evidenceState;
      await transaction.execute(sql`
        UPDATE services SET current_state = ${restoredState}, state_changed_at = now(), updated_at = now(), version = version + 1
        WHERE id = ${serviceId} AND organization_id = ${context.organizationId}
      `);
      await transaction.execute(sql`
        INSERT INTO service_state_transitions
          (organization_id, service_id, from_state, to_state, evidence_state, actor_type, actor_user_id,
           reason, source, idempotency_key, evidence, occurred_at)
        VALUES (${context.organizationId}, ${serviceId}, ${service.rows[0].currentState}, ${restoredState},
          ${service.rows[0].evidenceState}, 'user', ${userId}, ${input.reason}, 'manual_override',
          ${`override:${cancelled.rows[0].id}:cancelled`}, ${JSON.stringify({ overrideId: cancelled.rows[0].id })}::jsonb, now())
      `);
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        "service.state_override_cancelled",
        "service",
        serviceId,
        {
          overrideId: cancelled.rows[0].id,
          reason: input.reason,
          restoredState,
        },
      );
      return { cancelled: true, currentState: restoredState };
    });
  }

  async listMonitors(userId: string, slug: string, serviceId: string) {
    const context = await this.context(userId, slug);
    await this.requireService(context.organizationId, serviceId);
    return this.listMonitorsForService(context.organizationId, serviceId);
  }

  async createMonitor(userId: string, slug: string, input: CreateMonitorInput) {
    const context = await this.manageContext(userId, slug);
    await this.requireService(context.organizationId, input.serviceId);
    const endpointUrl = await this.validateEndpoint(input.endpointUrl);
    const requestHeaders = this.validateHeaders(input.policy.requestHeaders);
    this.enforceHostedInterval(input.policy.intervalSeconds);
    try {
      return await this.databaseService.database.transaction(async (transaction) => {
        const id = randomUUID();
        await transaction.execute(
          sql`INSERT INTO monitors (id, organization_id, service_id, name, endpoint_url, method) VALUES (${id}, ${context.organizationId}, ${input.serviceId}, ${input.name}, ${endpointUrl}, ${input.method})`,
        );
        await transaction.execute(sql`
          INSERT INTO monitor_policies (organization_id, monitor_id, interval_seconds, timeout_milliseconds, failure_threshold, recovery_threshold, failure_impact, accepted_status_codes, request_headers)
          VALUES (${context.organizationId}, ${id}, ${input.policy.intervalSeconds}, ${input.policy.timeoutMilliseconds}, ${input.policy.failureThreshold}, ${input.policy.recoveryThreshold}, ${input.policy.failureImpact}, ${JSON.stringify(input.policy.acceptedStatusCodes)}::jsonb, ${JSON.stringify(requestHeaders)}::jsonb)
        `);
        await this.audit(
          transaction,
          userId,
          context.organizationId,
          "monitor.created",
          "monitor",
          id,
          {
            endpointHost: new URL(endpointUrl).hostname,
            method: input.method,
            serviceId: input.serviceId,
          },
        );
        return this.getMonitorRecord(transaction, context.organizationId, id);
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505")
        throw new ConflictException("An active monitor already uses this name for the service");
      throw error;
    }
  }

  async updateMonitor(userId: string, slug: string, monitorId: string, input: UpdateMonitorInput) {
    const context = await this.manageContext(userId, slug);
    if (Object.keys(input).length === 0)
      throw new BadRequestException("At least one monitor field must be provided");
    const endpointUrl = input.endpointUrl
      ? await this.validateEndpoint(input.endpointUrl)
      : undefined;
    if (input.policy) {
      this.validateHeaders(input.policy.requestHeaders);
      this.enforceHostedInterval(input.policy.intervalSeconds);
    }
    return this.databaseService.database.transaction(async (transaction) => {
      const updated = await transaction.execute(sql`
        UPDATE monitors SET name = COALESCE(${input.name ?? null}, name), endpoint_url = COALESCE(${endpointUrl ?? null}, endpoint_url),
          method = COALESCE(${input.method ?? null}, method), configuration_version = configuration_version + 1,
          tested_configuration_version = NULL, last_tested_at = NULL, last_test_evidence = NULL,
          status = CASE WHEN status = 'active' THEN 'pending' ELSE status END, next_due_at = NULL, updated_at = now()
        WHERE id = ${monitorId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL RETURNING id
      `);
      if (!updated.rows[0]) throw new NotFoundException("Monitor not found");
      if (input.policy)
        await transaction.execute(sql`
        UPDATE monitor_policies SET interval_seconds = ${input.policy.intervalSeconds}, timeout_milliseconds = ${input.policy.timeoutMilliseconds},
          failure_threshold = ${input.policy.failureThreshold}, recovery_threshold = ${input.policy.recoveryThreshold}, failure_impact = ${input.policy.failureImpact},
          accepted_status_codes = ${JSON.stringify(input.policy.acceptedStatusCodes)}::jsonb, request_headers = ${JSON.stringify(this.validateHeaders(input.policy.requestHeaders))}::jsonb, updated_at = now()
        WHERE monitor_id = ${monitorId} AND organization_id = ${context.organizationId}
      `);
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        "monitor.updated",
        "monitor",
        monitorId,
        { changedFields: Object.keys(input), requiresRetest: true },
      );
      return this.getMonitorRecord(transaction, context.organizationId, monitorId);
    });
  }

  async testMonitor(userId: string, slug: string, monitorId: string) {
    const context = await this.manageContext(userId, slug);
    const monitor = await this.getMonitorRecord(
      this.databaseService.database,
      context.organizationId,
      monitorId,
    );
    if (monitor.status === "archived")
      throw new ConflictException("Archived monitors cannot be tested");
    let networkEvidence;
    try {
      networkEvidence = await runSafeMonitorTest({
        endpointUrl: monitor.endpointUrl,
        headers: monitor.requestHeaders,
        method: monitor.method,
        timeoutMilliseconds: monitor.timeoutMilliseconds,
      });
    } catch (error) {
      if (error instanceof EndpointPolicyError) {
        throw new BadRequestException({ error: error.code, message: error.message });
      }
      throw error;
    }
    const statusAccepted =
      networkEvidence.httpStatusCode !== null &&
      monitor.acceptedStatusCodes.some(
        ({ from, to }) =>
          networkEvidence.httpStatusCode! >= from && networkEvidence.httpStatusCode! <= to,
      );
    const evidence = {
      ...networkEvidence,
      ok: networkEvidence.ok && statusAccepted,
      statusAccepted,
    };
    await this.databaseService.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`UPDATE monitors SET tested_configuration_version = ${evidence.ok ? monitor.configurationVersion : null}, last_tested_at = now(), last_test_evidence = ${JSON.stringify(evidence)}::jsonb, updated_at = now() WHERE id = ${monitorId} AND organization_id = ${context.organizationId} AND configuration_version = ${monitor.configurationVersion}`,
      );
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        "monitor.tested",
        "monitor",
        monitorId,
        {
          code: evidence.code,
          httpStatusCode: evidence.httpStatusCode,
          ok: evidence.ok,
          redirectCount: evidence.redirectCount,
        },
      );
    });
    return evidence;
  }

  async activateMonitor(userId: string, slug: string, monitorId: string) {
    return this.setMonitorActive(userId, slug, monitorId, "monitor.activated");
  }

  async resumeMonitor(userId: string, slug: string, monitorId: string) {
    return this.setMonitorActive(userId, slug, monitorId, "monitor.resumed");
  }

  async pauseMonitor(userId: string, slug: string, monitorId: string) {
    const context = await this.manageContext(userId, slug);
    return this.changeStatus(context, userId, monitorId, "paused", "monitor.paused");
  }

  async archiveMonitor(userId: string, slug: string, monitorId: string) {
    const context = await this.manageContext(userId, slug);
    return this.databaseService.database.transaction(async (transaction) => {
      const result = await transaction.execute(
        sql`UPDATE monitors SET status = 'archived', deleted_at = now(), paused_at = NULL, next_due_at = NULL, updated_at = now() WHERE id = ${monitorId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL RETURNING id`,
      );
      if (!result.rows[0]) throw new NotFoundException("Monitor not found");
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        "monitor.archived",
        "monitor",
        monitorId,
        { historyPreserved: true },
      );
      return { archived: true, id: monitorId };
    });
  }

  private async setMonitorActive(userId: string, slug: string, monitorId: string, action: string) {
    const context = await this.manageContext(userId, slug);
    return this.databaseService.database.transaction(async (transaction) => {
      const monitor = await this.getMonitorRecord(transaction, context.organizationId, monitorId);
      if (monitor.configurationVersion !== monitor.testedConfigurationVersion)
        throw new ConflictException(
          "Run a successful test for the current configuration before activation",
        );
      await this.enforceHostedMonitorQuota(transaction, monitor.status);
      const result = await transaction.execute(
        sql`UPDATE monitors SET status = 'active', paused_at = NULL, next_due_at = now(), updated_at = now() WHERE id = ${monitorId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL RETURNING id, status, next_due_at AS "nextDueAt"`,
      );
      await this.audit(transaction, userId, context.organizationId, action, "monitor", monitorId, {
        configurationVersion: monitor.configurationVersion,
      });
      return result.rows[0]!;
    });
  }

  private async changeStatus(
    context: Context,
    userId: string,
    monitorId: string,
    status: "paused",
    action: string,
  ) {
    return this.databaseService.database.transaction(async (transaction) => {
      const result = await transaction.execute(
        sql`UPDATE monitors SET status = ${status}, paused_at = now(), next_due_at = NULL, updated_at = now() WHERE id = ${monitorId} AND organization_id = ${context.organizationId} AND deleted_at IS NULL AND status = 'active' RETURNING id, status`,
      );
      if (!result.rows[0]) throw new ConflictException("Only an active monitor can be paused");
      await this.audit(
        transaction,
        userId,
        context.organizationId,
        action,
        "monitor",
        monitorId,
        {},
      );
      return result.rows[0];
    });
  }

  private async context(userId: string, slug: string): Promise<Context> {
    return this.organizations.requireRole(userId, slug, ["owner", "admin", "member"]);
  }

  private async manageContext(userId: string, slug: string): Promise<Context> {
    const context = await this.context(userId, slug);
    if (context.role === "member") throw new ForbiddenException("Insufficient role");
    return context;
  }

  private async requireService(organizationId: string, serviceId: string) {
    const result = await this.databaseService.database.execute(
      sql`SELECT id FROM services WHERE id = ${serviceId} AND organization_id = ${organizationId} AND deleted_at IS NULL`,
    );
    if (!result.rows[0]) throw new NotFoundException("Service not found");
  }

  private listMonitorsForService(organizationId: string, serviceId: string) {
    return this.databaseService.database
      .execute(
        sql`
      SELECT monitor.id, monitor.organization_id AS "organizationId", monitor.service_id AS "serviceId", monitor.name, monitor.endpoint_url AS "endpointUrl", monitor.method, monitor.status,
        monitor.configuration_version AS "configurationVersion", monitor.tested_configuration_version AS "testedConfigurationVersion", monitor.last_tested_at AS "lastTestedAt", monitor.last_test_evidence AS "lastTestEvidence", monitor.updated_at AS "updatedAt",
        policy.interval_seconds AS "intervalSeconds", policy.timeout_milliseconds AS "timeoutMilliseconds", policy.failure_threshold AS "failureThreshold", policy.recovery_threshold AS "recoveryThreshold", policy.failure_impact AS "failureImpact", policy.accepted_status_codes AS "acceptedStatusCodes", policy.request_headers AS "requestHeaders"
      FROM monitors AS monitor JOIN monitor_policies AS policy ON policy.monitor_id = monitor.id AND policy.organization_id = monitor.organization_id
      WHERE monitor.organization_id = ${organizationId} AND monitor.service_id = ${serviceId} AND monitor.deleted_at IS NULL ORDER BY lower(monitor.name), monitor.id
    `,
      )
      .then(({ rows }) =>
        rows.map((row) => ({ ...row, policyPreview: describeMonitorPolicy(row as MonitorRecord) })),
      );
  }

  private async getMonitorRecord(
    executor: Pick<DatabaseTransaction, "execute">,
    organizationId: string,
    monitorId: string,
  ): Promise<MonitorRecord & { policyPreview: string }> {
    const result = await executor.execute<MonitorRecord>(sql`
      SELECT monitor.id, monitor.organization_id AS "organizationId", monitor.service_id AS "serviceId", monitor.name, monitor.endpoint_url AS "endpointUrl", monitor.method, monitor.status,
        monitor.configuration_version AS "configurationVersion", monitor.tested_configuration_version AS "testedConfigurationVersion", monitor.updated_at AS "updatedAt",
        policy.interval_seconds AS "intervalSeconds", policy.timeout_milliseconds AS "timeoutMilliseconds", policy.failure_threshold AS "failureThreshold", policy.recovery_threshold AS "recoveryThreshold", policy.failure_impact AS "failureImpact", policy.accepted_status_codes AS "acceptedStatusCodes", policy.request_headers AS "requestHeaders"
      FROM monitors AS monitor JOIN monitor_policies AS policy ON policy.monitor_id = monitor.id AND policy.organization_id = monitor.organization_id
      WHERE monitor.id = ${monitorId} AND monitor.organization_id = ${organizationId} AND monitor.deleted_at IS NULL
    `);
    const monitor = result.rows[0];
    if (!monitor) throw new NotFoundException("Monitor not found");
    return { ...monitor, policyPreview: describeMonitorPolicy(monitor) };
  }

  private enforceHostedInterval(intervalSeconds: number) {
    if (this.authService.environment.QUEUE_ADAPTER === "qstash" && intervalSeconds < 300) {
      throw new ConflictException({
        error: "hosted_limit_reached",
        limit: "minimum_monitor_interval_seconds",
        maximum: null,
        minimum: 300,
        requested: intervalSeconds,
      });
    }
  }

  private async validateEndpoint(endpointUrl: string): Promise<string> {
    try {
      return (await validateEndpointDestination(endpointUrl)).href;
    } catch (error) {
      if (error instanceof EndpointPolicyError) {
        throw new BadRequestException({ error: error.code, message: error.message });
      }
      throw error;
    }
  }

  private validateHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
    try {
      return validateRequestHeaders(headers);
    } catch (error) {
      if (error instanceof EndpointPolicyError) {
        throw new BadRequestException({ error: error.code, message: error.message });
      }
      throw error;
    }
  }

  private async enforceHostedMonitorQuota(
    transaction: DatabaseTransaction,
    currentStatus: MonitorRecord["status"],
  ) {
    if (this.authService.environment.QUEUE_ADAPTER !== "qstash" || currentStatus === "active")
      return;
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('hosted-active-monitor-limit'))`,
    );
    const count = await transaction.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM monitors WHERE status = 'active' AND deleted_at IS NULL`,
    );
    const usage = count.rows[0]?.count ?? 0;
    if (usage >= 5)
      throw new ConflictException({
        error: "hosted_limit_reached",
        limit: "active_http_monitors",
        currentUsage: usage,
        maximum: 5,
      });
  }

  private async audit(
    transaction: DatabaseTransaction,
    actorUserId: string,
    organizationId: string,
    action: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) {
    const id = randomUUID();
    await transaction.execute(
      sql`INSERT INTO audit_events (id, organization_id, actor_type, actor_user_id, action, target_type, target_id, source, correlation_id, idempotency_key, safe_payload, occurred_at) VALUES (${id}, ${organizationId}, 'user', ${actorUserId}, ${action}, ${targetType}, ${targetId}, 'api', ${id}, ${action + ":" + id}, ${JSON.stringify(payload)}::jsonb, now())`,
    );
  }
}
