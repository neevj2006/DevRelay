import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { DatabaseTransaction } from "@devrelay/database";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DatabaseService } from "./database.service.js";
import { OrganizationService } from "./organization.service.js";

type MaintenanceInput = {
  endsAt: string;
  internalNote?: string | undefined;
  notifySubscribers: boolean;
  publicDescription?: string | undefined;
  serviceIds: string[];
  startsAt: string;
  title: string;
};

type PostmortemInput = {
  actionItems: readonly {
    description: string;
    dueAt?: string | undefined;
    owner?: string | undefined;
  }[];
  impact: string;
  resolution: string;
  rootCause: string;
  summary: string;
  timeline: string;
};

const apiKeyScopes = new Set([
  "incidents:read",
  "incidents:write",
  "services:read",
  "analytics:read",
]);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizations: OrganizationService,
  ) {}

  async listMaintenance(userId: string, slug: string) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const result = await this.database.database.execute(sql`
      SELECT w.id,w.title,w.public_description AS "publicDescription",w.internal_note AS "internalNote",
        w.starts_at AS "startsAt",w.ends_at AS "endsAt",w.status,w.notify_subscribers AS "notifySubscribers",
        w.version,COALESCE(json_agg(json_build_object('id',s.id,'name',s.name) ORDER BY s.display_order)
          FILTER (WHERE s.id IS NOT NULL),'[]') AS services
      FROM maintenance_windows w LEFT JOIN maintenance_window_services x
        ON x.organization_id=w.organization_id AND x.maintenance_window_id=w.id
      LEFT JOIN services s ON s.organization_id=x.organization_id AND s.id=x.service_id
      WHERE w.organization_id=${context.organizationId}
      GROUP BY w.id ORDER BY w.starts_at DESC,w.id DESC`);
    return result.rows;
  }

  async createMaintenance(userId: string, slug: string, input: MaintenanceInput) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.database.database.transaction(async (transaction) => {
      await this.assertServices(transaction, context.organizationId, input.serviceIds);
      const id = randomUUID();
      await transaction.execute(sql`INSERT INTO maintenance_windows
        (id,organization_id,title,public_description,internal_note,starts_at,ends_at,notify_subscribers,created_by_user_id)
        VALUES (${id},${context.organizationId},${input.title},${input.publicDescription ?? null},
          ${input.internalNote ?? null},${input.startsAt},${input.endsAt},${input.notifySubscribers},${userId})`);
      for (const serviceId of input.serviceIds)
        await transaction.execute(sql`
        INSERT INTO maintenance_window_services (organization_id,maintenance_window_id,service_id)
        VALUES (${context.organizationId},${id},${serviceId})`);
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "maintenance.created",
        "maintenance_window",
        id,
        {
          endsAt: input.endsAt,
          serviceIds: input.serviceIds,
          startsAt: input.startsAt,
        },
      );
      await this.reconcileMaintenance(transaction, context.organizationId);
      if (input.notifySubscribers)
        await this.enqueueMaintenanceNotifications(transaction, context.organizationId, id, input);
      return { id, status: "scheduled" };
    });
  }

  async updateMaintenance(userId: string, slug: string, windowId: string, input: MaintenanceInput) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.database.database.transaction(async (transaction) => {
      await this.assertServices(transaction, context.organizationId, input.serviceIds);
      const updated = await transaction.execute<{ id: string }>(sql`UPDATE maintenance_windows SET
        title=${input.title},public_description=${input.publicDescription ?? null},internal_note=${input.internalNote ?? null},
        starts_at=${input.startsAt},ends_at=${input.endsAt},notify_subscribers=${input.notifySubscribers},
        version=version+1,updated_at=now() WHERE id=${windowId} AND organization_id=${context.organizationId}
        AND status='scheduled' RETURNING id`);
      if (!updated.rows[0]) throw new NotFoundException("Scheduled maintenance window not found");
      await transaction.execute(
        sql`DELETE FROM maintenance_window_services WHERE organization_id=${context.organizationId} AND maintenance_window_id=${windowId}`,
      );
      for (const serviceId of input.serviceIds)
        await transaction.execute(sql`INSERT INTO maintenance_window_services
        (organization_id,maintenance_window_id,service_id) VALUES (${context.organizationId},${windowId},${serviceId})`);
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "maintenance.updated",
        "maintenance_window",
        windowId,
        {
          serviceIds: input.serviceIds,
        },
      );
      await this.reconcileMaintenance(transaction, context.organizationId);
      return { id: windowId, status: "scheduled" };
    });
  }

  async cancelMaintenance(userId: string, slug: string, windowId: string, reason: string) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.database.database.transaction(async (transaction) => {
      const cancelled = await transaction.execute<{
        id: string;
      }>(sql`UPDATE maintenance_windows SET status='cancelled',
        cancelled_at=now(),cancelled_by_user_id=${userId},version=version+1,updated_at=now()
        WHERE id=${windowId} AND organization_id=${context.organizationId} AND status='scheduled' RETURNING id`);
      if (!cancelled.rows[0]) throw new NotFoundException("Scheduled maintenance window not found");
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "maintenance.cancelled",
        "maintenance_window",
        windowId,
        { reason },
      );
      await this.reconcileMaintenance(transaction, context.organizationId);
      return { cancelled: true };
    });
  }

  async reconcileAllMaintenance() {
    const organizations = await this.database.database.execute<{ id: string }>(
      sql`SELECT id FROM organizations WHERE deleted_at IS NULL`,
    );
    for (const organization of organizations.rows)
      await this.database.database.transaction((transaction) =>
        this.reconcileMaintenance(transaction, organization.id),
      );
    return { organizations: organizations.rows.length };
  }

  async aggregateAvailability(day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
    await this.database.database.execute(sql`
      INSERT INTO daily_availability_aggregates
        (organization_id,service_id,day,expected_checks,completed_checks,successful_checks,failed_checks,missing_checks,
         availability_basis_points,latency_p50_milliseconds,latency_p95_milliseconds)
      SELECT s.organization_id,s.id,${day}::date,count(w.id)::int,count(r.id)::int,
        count(r.id) FILTER (WHERE r.outcome='success')::int,count(r.id) FILTER (WHERE r.outcome<>'success')::int,
        count(w.id) FILTER (WHERE r.id IS NULL)::int,
        CASE WHEN count(r.id)=0 THEN NULL ELSE round(10000.0*count(r.id) FILTER (WHERE r.outcome='success')/count(r.id))::int END,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_milliseconds) FILTER (WHERE r.latency_milliseconds IS NOT NULL)::int,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY r.latency_milliseconds) FILTER (WHERE r.latency_milliseconds IS NOT NULL)::int
      FROM services s LEFT JOIN monitors m ON m.organization_id=s.organization_id AND m.service_id=s.id AND m.deleted_at IS NULL
      LEFT JOIN expected_check_windows w ON w.organization_id=m.organization_id AND w.monitor_id=m.id
        AND w.scheduled_at>=${day}::date AND w.scheduled_at<${day}::date+interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM maintenance_window_services x JOIN maintenance_windows mw
          ON mw.id=x.maintenance_window_id AND mw.organization_id=x.organization_id
          WHERE x.organization_id=s.organization_id AND x.service_id=s.id AND mw.status='scheduled'
            AND w.scheduled_at>=mw.starts_at AND w.scheduled_at<mw.ends_at)
      LEFT JOIN check_results r ON r.organization_id=w.organization_id AND r.monitor_id=w.monitor_id AND r.scheduled_at=w.scheduled_at
      WHERE s.deleted_at IS NULL GROUP BY s.organization_id,s.id
      ON CONFLICT (organization_id,service_id,day) DO UPDATE SET
        expected_checks=excluded.expected_checks,completed_checks=excluded.completed_checks,
        successful_checks=excluded.successful_checks,failed_checks=excluded.failed_checks,missing_checks=excluded.missing_checks,
        availability_basis_points=excluded.availability_basis_points,latency_p50_milliseconds=excluded.latency_p50_milliseconds,
        latency_p95_milliseconds=excluded.latency_p95_milliseconds,updated_at=now()`);
    return { day };
  }

  async analytics(userId: string, slug: string, from: string, to: string) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const result = await this.database.database.execute(sql`
      SELECT s.id,s.name,sum(a.expected_checks)::int AS "expectedChecks",sum(a.completed_checks)::int AS "completedChecks",
        sum(a.successful_checks)::int AS "successfulChecks",sum(a.failed_checks)::int AS "failedChecks",sum(a.missing_checks)::int AS "missingChecks",
        CASE WHEN sum(a.completed_checks)=0 THEN NULL ELSE round(10000.0*sum(a.successful_checks)/sum(a.completed_checks))::int END AS "availabilityBasisPoints",
        CASE WHEN sum(a.completed_checks)=0 THEN NULL ELSE greatest(0,round(sum(a.completed_checks)*0.001-sum(a.failed_checks)))::int END AS "errorBudgetChecksRemaining",
        round(avg(a.latency_p50_milliseconds))::int AS "latencyP50Milliseconds",max(a.latency_p95_milliseconds)::int AS "latencyP95Milliseconds"
      FROM services s LEFT JOIN daily_availability_aggregates a ON a.organization_id=s.organization_id AND a.service_id=s.id AND a.day BETWEEN ${from}::date AND ${to}::date
      WHERE s.organization_id=${context.organizationId} AND s.deleted_at IS NULL GROUP BY s.id,s.name ORDER BY s.display_order,s.name`);
    const daily = await this.database.database
      .execute(sql`SELECT service_id AS "serviceId",day,expected_checks AS "expectedChecks",
      completed_checks AS "completedChecks",missing_checks AS "missingChecks",availability_basis_points AS "availabilityBasisPoints",
      latency_p50_milliseconds AS "latencyP50Milliseconds",latency_p95_milliseconds AS "latencyP95Milliseconds"
      FROM daily_availability_aggregates WHERE organization_id=${context.organizationId} AND day BETWEEN ${from}::date AND ${to}::date ORDER BY day,service_id`);
    return {
      daily: daily.rows,
      formula:
        "successful completed checks / completed checks; declared maintenance excluded; missing checks reported separately",
      from,
      services: result.rows,
      sloBasisPoints: 9990,
      timezone: "UTC",
      to,
    };
  }

  async getPostmortem(userId: string, slug: string, incidentId: string) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const result = await this.database.database.execute(
      sql`SELECT p.* FROM postmortems p WHERE p.organization_id=${context.organizationId} AND p.incident_id=${incidentId}`,
    );
    return result.rows[0] ?? null;
  }

  async savePostmortem(userId: string, slug: string, incidentId: string, input: PostmortemInput) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const incident = await this.database.database.execute<{ slug: string }>(
      sql`SELECT slug FROM incidents WHERE id=${incidentId} AND organization_id=${context.organizationId} AND lifecycle IN ('resolved','postmortem_published')`,
    );
    if (!incident.rows[0]) throw new BadRequestException("Postmortems require a resolved incident");
    const id = randomUUID();
    return this.database.database.transaction(async (transaction) => {
      const saved = await transaction.execute<{ id: string }>(sql`INSERT INTO postmortems
        (id,organization_id,incident_id,slug,summary,impact,timeline,root_cause,resolution,action_items)
        VALUES (${id},${context.organizationId},${incidentId},${incident.rows[0]!.slug},${input.summary},${input.impact},${input.timeline},${input.rootCause},${input.resolution},${JSON.stringify(input.actionItems)}::jsonb)
        ON CONFLICT (organization_id,incident_id) DO UPDATE SET summary=excluded.summary,impact=excluded.impact,
          timeline=excluded.timeline,root_cause=excluded.root_cause,resolution=excluded.resolution,action_items=excluded.action_items,updated_at=now()
        WHERE postmortems.status='draft' RETURNING id`);
      if (!saved.rows[0]) throw new BadRequestException("Published postmortems cannot be edited");
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "postmortem.draft_saved",
        "postmortem",
        saved.rows[0].id,
        {},
      );
      return { id: saved.rows[0].id, status: "draft" };
    });
  }

  async publishPostmortem(userId: string, slug: string, incidentId: string) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.database.database.transaction(async (transaction) => {
      const published = await transaction.execute<{
        id: string;
      }>(sql`UPDATE postmortems SET status='published',published_at=now(),published_by_user_id=${userId},updated_at=now()
        WHERE organization_id=${context.organizationId} AND incident_id=${incidentId} AND status='draft' RETURNING id`);
      if (!published.rows[0]) throw new NotFoundException("Postmortem draft not found");
      await transaction.execute(
        sql`UPDATE incidents SET lifecycle='postmortem_published',updated_at=now() WHERE organization_id=${context.organizationId} AND id=${incidentId} AND lifecycle='resolved'`,
      );
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "postmortem.published",
        "postmortem",
        published.rows[0].id,
        {},
      );
      return { id: published.rows[0].id, status: "published" };
    });
  }

  async publicPostmortem(statusPageSlug: string, postmortemSlug: string) {
    const result = await this.database.database
      .execute(sql`SELECT p.slug,p.summary,p.impact,p.timeline,p.root_cause AS "rootCause",p.resolution,p.action_items AS "actionItems",p.published_at AS "publishedAt",i.public_title AS title
      FROM postmortems p JOIN status_pages page ON page.organization_id=p.organization_id AND page.deleted_at IS NULL
      JOIN incidents i ON i.id=p.incident_id AND i.organization_id=p.organization_id
      WHERE lower(page.slug)=lower(${statusPageSlug}) AND lower(p.slug)=lower(${postmortemSlug}) AND p.status='published'`);
    if (!result.rows[0]) throw new NotFoundException("Published postmortem not found");
    return result.rows[0];
  }

  async listApiKeys(userId: string, slug: string) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    const result = await this.database.database.execute(
      sql`SELECT id,label,prefix,scopes,created_at AS "createdAt",last_used_at AS "lastUsedAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM api_keys WHERE organization_id=${context.organizationId} ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async createApiKey(
    userId: string,
    slug: string,
    input: { expiresAt?: string | undefined; label: string; scopes: string[] },
  ) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    if (input.scopes.some((scope) => !apiKeyScopes.has(scope)))
      throw new BadRequestException("Unsupported API key scope");
    if (input.expiresAt && new Date(input.expiresAt) <= new Date())
      throw new BadRequestException("API key expiry must be in the future");
    const plaintext = `dr_live_${randomBytes(32).toString("base64url")}`;
    const id = randomUUID();
    await this.database.database.transaction(async (transaction) => {
      await transaction.execute(sql`INSERT INTO api_keys (id,organization_id,label,prefix,secret_hash,scopes,created_by_user_id,expires_at)
        VALUES (${id},${context.organizationId},${input.label},${plaintext.slice(0, 16)},${hash(plaintext)},${JSON.stringify(input.scopes)}::jsonb,${userId},${input.expiresAt ?? null})`);
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "api_key.created",
        "api_key",
        id,
        { label: input.label, scopes: input.scopes },
      );
    });
    return { id, plaintext, prefix: plaintext.slice(0, 16) };
  }

  async revokeApiKey(userId: string, slug: string, keyId: string) {
    const context = await this.organizations.requireRole(userId, slug, ["owner", "admin"]);
    return this.database.database.transaction(async (transaction) => {
      const revoked = await transaction.execute<{
        id: string;
      }>(sql`UPDATE api_keys SET revoked_at=now(),revoked_by_user_id=${userId},updated_at=now()
        WHERE id=${keyId} AND organization_id=${context.organizationId} AND revoked_at IS NULL RETURNING id`);
      if (!revoked.rows[0]) throw new NotFoundException("Active API key not found");
      await this.audit(
        transaction,
        context.organizationId,
        userId,
        "api_key.revoked",
        "api_key",
        keyId,
        {},
      );
      return { revoked: true };
    });
  }

  async authenticateApiKey(plaintext: string, requiredScope: string) {
    const key = await this.database.database.execute<{
      id: string;
      organizationId: string;
      scopes: string[];
    }>(sql`SELECT id,organization_id AS "organizationId",scopes FROM api_keys
      WHERE secret_hash=${hash(plaintext)} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())`);
    const record = key.rows[0];
    if (!record || !record.scopes.includes(requiredScope))
      throw new NotFoundException("Valid scoped API key not found");
    const window = Math.floor(Date.now() / 60_000) * 60_000;
    const usage = await this.database.database.execute<{
      count: number;
    }>(sql`INSERT INTO auth_rate_limits (key,count,last_request) VALUES (${`api-key:${record.id}`},1,${window})
      ON CONFLICT (key) DO UPDATE SET count=CASE WHEN auth_rate_limits.last_request<${window} THEN 1 ELSE auth_rate_limits.count+1 END,last_request=${window} RETURNING count`);
    if ((usage.rows[0]?.count ?? 0) > 120)
      throw new HttpException("API key rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    await this.database.database.execute(
      sql`UPDATE api_keys SET last_used_at=now(),updated_at=now() WHERE id=${record.id}`,
    );
    const auditId = randomUUID();
    await this.database.database.execute(sql`INSERT INTO audit_events
      (id,organization_id,actor_type,action,target_type,target_id,source,correlation_id,idempotency_key,safe_payload,occurred_at)
      VALUES (${auditId},${record.organizationId},'system','api_key.used','api_key',${record.id},'api_key',${auditId},${`api_key.used:${auditId}`},${JSON.stringify({ requiredScope })}::jsonb,now())`);
    return record;
  }

  async listAudit(
    userId: string,
    slug: string,
    query: {
      action?: string | undefined;
      actor?: string | undefined;
      before?: string | undefined;
      cursor?: string | undefined;
      from?: string | undefined;
      target?: string | undefined;
      to?: string | undefined;
    },
  ) {
    const context = await this.organizations.requireRole(userId, slug, [
      "owner",
      "admin",
      "member",
    ]);
    const result = await this.database.database
      .execute(sql`SELECT e.id,e.actor_type AS "actorType",e.action,e.target_type AS "targetType",e.target_id AS "targetId",e.source,e.safe_payload AS "safePayload",e.occurred_at AS "occurredAt",u.name AS "actorName"
      FROM audit_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=${context.organizationId}
      AND (${query.actor ?? null}::text IS NULL OR e.actor_type::text ILIKE ${query.actor ? `%${query.actor}%` : null} OR u.name ILIKE ${query.actor ? `%${query.actor}%` : null})
      AND (${query.action ?? null}::text IS NULL OR e.action ILIKE ${query.action ? `%${query.action}%` : null})
      AND (${query.target ?? null}::text IS NULL OR e.target_type ILIKE ${query.target ? `%${query.target}%` : null})
      AND (${query.from ?? null}::timestamptz IS NULL OR e.occurred_at>=${query.from ?? null}::timestamptz)
      AND (${query.to ?? null}::timestamptz IS NULL OR e.occurred_at<=${query.to ?? null}::timestamptz)
      AND (${query.before ?? null}::timestamptz IS NULL OR e.occurred_at<${query.before ?? null}::timestamptz)
      AND (${query.cursor ?? null}::uuid IS NULL OR (e.occurred_at,e.id)<(SELECT c.occurred_at,c.id FROM audit_events c WHERE c.organization_id=${context.organizationId} AND c.id=${query.cursor ?? null}::uuid))
      ORDER BY e.occurred_at DESC,e.id DESC LIMIT 51`);
    return {
      items: result.rows.slice(0, 50),
      nextCursor: result.rows.length > 50 ? (result.rows[49] as { id: string }).id : null,
    };
  }

  private async assertServices(
    transaction: DatabaseTransaction,
    organizationId: string,
    serviceIds: string[],
  ) {
    const serviceArray = sql`ARRAY[${sql.join(
      serviceIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::uuid[]`;
    const found = await transaction.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM services WHERE organization_id=${organizationId} AND id=ANY(${serviceArray}) AND deleted_at IS NULL`,
    );
    if ((found.rows[0]?.count ?? 0) !== new Set(serviceIds).size)
      throw new BadRequestException("Every maintenance service must belong to the organization");
  }

  private async reconcileMaintenance(transaction: DatabaseTransaction, organizationId: string) {
    await transaction.execute(sql`UPDATE services s SET current_state='under_maintenance',updated_at=now() WHERE s.organization_id=${organizationId} AND EXISTS
      (SELECT 1 FROM maintenance_window_services x JOIN maintenance_windows w ON w.id=x.maintenance_window_id AND w.organization_id=x.organization_id
       WHERE x.organization_id=s.organization_id AND x.service_id=s.id AND w.status='scheduled' AND now()>=w.starts_at AND now()<w.ends_at)`);
    await transaction.execute(sql`UPDATE services s SET current_state='unknown',updated_at=now() WHERE s.organization_id=${organizationId} AND s.current_state='under_maintenance' AND NOT EXISTS
      (SELECT 1 FROM maintenance_window_services x JOIN maintenance_windows w ON w.id=x.maintenance_window_id AND w.organization_id=x.organization_id
       WHERE x.organization_id=s.organization_id AND x.service_id=s.id AND w.status='scheduled' AND now()>=w.starts_at AND now()<w.ends_at)`);
  }

  private async enqueueMaintenanceNotifications(
    transaction: DatabaseTransaction,
    organizationId: string,
    windowId: string,
    input: MaintenanceInput,
  ) {
    await transaction.execute(sql`INSERT INTO notification_deliveries (organization_id,kind,channel,subscriber_id,idempotency_key,safe_payload,next_attempt_at)
      SELECT s.organization_id,'maintenance','email',s.id,${`maintenance:${windowId}:`}||s.id||':email',
        jsonb_build_object('email',s.email,'title',${input.title},'body',${input.publicDescription ?? "Scheduled maintenance"},'statusUrl','/status','notificationType','maintenance'),now()
      FROM subscribers s JOIN subscriber_preferences p ON p.organization_id=s.organization_id AND p.subscriber_id=s.id
      WHERE s.organization_id=${organizationId} AND s.state='active' AND p.maintenance_notifications=true
      GROUP BY s.organization_id,s.id,s.email ON CONFLICT DO NOTHING`);
  }

  private async audit(
    transaction: DatabaseTransaction,
    organizationId: string,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) {
    const id = randomUUID();
    await transaction.execute(sql`INSERT INTO audit_events (id,organization_id,actor_type,actor_user_id,action,target_type,target_id,source,correlation_id,idempotency_key,safe_payload,occurred_at)
      VALUES (${id},${organizationId},'user',${actorUserId},${action},${targetType},${targetId},'api',${id},${action + ":" + id},${JSON.stringify(payload)}::jsonb,now())`);
  }
}
