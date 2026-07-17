import { Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DatabaseService } from "./database.service.js";

@Injectable()
export class StatusPageService {
  constructor(private readonly databaseService: DatabaseService) {}

  async assertPublicPage(slug: string) {
    const page = await this.databaseService.database.execute(
      sql`SELECT id, title FROM status_pages WHERE lower(slug) = lower(${slug}) AND deleted_at IS NULL`,
    );
    if (!page.rows[0]) throw new NotFoundException("Status page not found");
    return page.rows[0];
  }

  async version(slug: string) {
    const result = await this.databaseService.database.execute<{ version: string }>(sql`
      SELECT floor(extract(epoch FROM greatest(page.updated_at,
        COALESCE((SELECT max(link.updated_at) FROM status_page_services link WHERE link.status_page_id = page.id AND link.organization_id = page.organization_id), page.updated_at),
        COALESCE((SELECT max(service.updated_at) FROM status_page_services link JOIN services service ON service.id = link.service_id AND service.organization_id = link.organization_id WHERE link.status_page_id = page.id), page.updated_at),
        COALESCE((SELECT max(update.published_at) FROM incident_public_updates update JOIN incidents incident ON incident.id = update.incident_id AND incident.organization_id = update.organization_id WHERE incident.organization_id = page.organization_id AND (incident.public_title IS NOT NULL OR EXISTS (SELECT 1 FROM incident_services affected JOIN status_page_services page_link ON page_link.organization_id = affected.organization_id AND page_link.service_id = affected.service_id JOIN services public_service ON public_service.id = page_link.service_id AND public_service.organization_id = page_link.organization_id AND public_service.is_public = true AND public_service.deleted_at IS NULL WHERE affected.organization_id = incident.organization_id AND affected.incident_id = incident.id AND page_link.status_page_id = page.id))), page.updated_at),
        COALESCE((SELECT max(incident.updated_at) FROM incidents incident WHERE incident.organization_id = page.organization_id AND (incident.public_title IS NOT NULL OR EXISTS (SELECT 1 FROM incident_services affected JOIN status_page_services page_link ON page_link.organization_id = affected.organization_id AND page_link.service_id = affected.service_id JOIN services public_service ON public_service.id = page_link.service_id AND public_service.organization_id = page_link.organization_id AND public_service.is_public = true AND public_service.deleted_at IS NULL WHERE affected.organization_id = incident.organization_id AND affected.incident_id = incident.id AND page_link.status_page_id = page.id))), page.updated_at),
        COALESCE((SELECT max(mw.updated_at) FROM maintenance_windows mw WHERE mw.organization_id = page.organization_id AND EXISTS (SELECT 1 FROM maintenance_window_services affected JOIN status_page_services page_link ON page_link.organization_id = affected.organization_id AND page_link.service_id = affected.service_id JOIN services public_service ON public_service.id = page_link.service_id AND public_service.organization_id = page_link.organization_id AND public_service.is_public = true AND public_service.deleted_at IS NULL WHERE affected.organization_id = mw.organization_id AND affected.maintenance_window_id = mw.id AND page_link.status_page_id = page.id)), page.updated_at))) * 1000)::bigint::text AS version
      FROM status_pages page WHERE lower(page.slug) = lower(${slug}) AND page.deleted_at IS NULL
    `);
    if (!result.rows[0]) throw new NotFoundException("Status page not found");
    return result.rows[0].version;
  }

  async getPublic(slug: string) {
    const page = await this.databaseService.database.execute<{
      description: string | null;
      organizationId: string;
      title: string;
      updatedAt: Date;
    }>(
      sql`SELECT organization_id AS "organizationId", title, description, updated_at AS "updatedAt" FROM status_pages WHERE lower(slug) = lower(${slug}) AND deleted_at IS NULL`,
    );
    const record = page.rows[0];
    if (!record) throw new NotFoundException("Status page not found");
    const [services, activeIncidents, resolvedIncidents, maintenance] = await Promise.all([
      this.databaseService.database.execute(
        sql`SELECT service.name, service.public_description AS description, service.current_state AS state, service.updated_at AS "updatedAt" FROM status_page_services link JOIN services service ON service.id = link.service_id AND service.organization_id = link.organization_id WHERE link.organization_id = ${record.organizationId} AND link.status_page_id = (SELECT id FROM status_pages WHERE lower(slug) = lower(${slug}) AND deleted_at IS NULL) AND service.deleted_at IS NULL AND service.is_public = true ORDER BY link.display_order, service.display_order, lower(service.name)`,
      ),
      this.databaseService.database.execute(
        sql`SELECT incident.slug, COALESCE(incident.public_title, 'Service disruption') AS title, incident.severity, incident.lifecycle, incident.started_at AS "startedAt", incident.updated_at AS "updatedAt", COALESCE((SELECT update.body FROM incident_public_updates update WHERE update.organization_id = incident.organization_id AND update.incident_id = incident.id ORDER BY update.published_at DESC, update.id DESC LIMIT 1), 'We are investigating a confirmed service impairment.') AS summary, COALESCE(json_agg(service.name ORDER BY service.display_order) FILTER (WHERE service.id IS NOT NULL), '[]') AS services FROM incidents incident LEFT JOIN incident_services affected ON affected.incident_id = incident.id AND affected.organization_id = incident.organization_id LEFT JOIN status_page_services page_link ON page_link.organization_id = affected.organization_id AND page_link.service_id = affected.service_id AND page_link.status_page_id = (SELECT id FROM status_pages WHERE lower(slug) = lower(${slug}) AND deleted_at IS NULL) LEFT JOIN services service ON service.id = page_link.service_id AND service.organization_id = page_link.organization_id AND service.is_public = true AND service.deleted_at IS NULL WHERE incident.organization_id = ${record.organizationId} AND incident.resolved_at IS NULL AND (incident.public_title IS NOT NULL OR EXISTS (SELECT 1 FROM incident_services eligible JOIN status_page_services eligible_link ON eligible_link.organization_id = eligible.organization_id AND eligible_link.service_id = eligible.service_id JOIN services public_service ON public_service.id = eligible_link.service_id AND public_service.organization_id = eligible_link.organization_id AND public_service.is_public = true AND public_service.deleted_at IS NULL WHERE eligible.organization_id = incident.organization_id AND eligible.incident_id = incident.id AND eligible_link.status_page_id = (SELECT id FROM status_pages WHERE lower(slug) = lower(${slug}) AND deleted_at IS NULL))) GROUP BY incident.id ORDER BY incident.started_at DESC`,
      ),
      this.databaseService.database.execute(
        sql`SELECT incident.slug, COALESCE(incident.public_title, 'Service disruption') AS title, incident.severity, incident.resolved_at AS "resolvedAt" FROM incidents incident WHERE incident.organization_id = ${record.organizationId} AND incident.resolved_at IS NOT NULL AND (incident.public_title IS NOT NULL OR EXISTS (SELECT 1 FROM incident_services eligible JOIN status_page_services eligible_link ON eligible_link.organization_id = eligible.organization_id AND eligible_link.service_id = eligible.service_id JOIN services public_service ON public_service.id = eligible_link.service_id AND public_service.organization_id = eligible_link.organization_id AND public_service.is_public = true AND public_service.deleted_at IS NULL WHERE eligible.organization_id = incident.organization_id AND eligible.incident_id = incident.id AND eligible_link.status_page_id = (SELECT id FROM status_pages WHERE lower(slug) = lower(${slug}) AND deleted_at IS NULL))) ORDER BY incident.resolved_at DESC LIMIT 10`,
      ),
      this.databaseService.database.execute(
        sql`SELECT mw.title, mw.public_description AS description, mw.starts_at AS "startsAt", mw.ends_at AS "endsAt", mw.updated_at AS "updatedAt", COALESCE(json_agg(service.name ORDER BY service.display_order) FILTER (WHERE service.id IS NOT NULL), '[]') AS services FROM maintenance_windows mw JOIN maintenance_window_services link ON link.maintenance_window_id = mw.id AND link.organization_id = mw.organization_id JOIN services service ON service.id = link.service_id AND service.organization_id = link.organization_id AND service.is_public = true WHERE mw.organization_id = ${record.organizationId} AND mw.status = 'scheduled' AND mw.ends_at > now() AND mw.public_description IS NOT NULL GROUP BY mw.id ORDER BY mw.starts_at LIMIT 10`,
      ),
    ]);
    const states = services.rows.map((service) => String(service.state));
    const severity =
      [
        "major_outage",
        "partial_outage",
        "degraded_performance",
        "under_maintenance",
        "unknown",
        "operational",
      ].find((state) => states.includes(state)) ?? "unknown";
    const lastUpdated = [
      new Date(record.updatedAt),
      ...services.rows.map((service) => new Date(service.updatedAt as string)),
      ...activeIncidents.rows.map((incident) => new Date(incident.updatedAt as string)),
      ...resolvedIncidents.rows.map((incident) => new Date(incident.resolvedAt as string)),
      ...maintenance.rows.map((window) => new Date(window.updatedAt as string)),
    ].sort((a, b) => b.getTime() - a.getTime())[0]!;
    return {
      activeIncidents: activeIncidents.rows,
      description: record.description,
      lastUpdated,
      maintenance: maintenance.rows,
      overallState: severity,
      recentIncidents: resolvedIncidents.rows,
      services: services.rows,
      slug,
      stale: Date.now() - lastUpdated.getTime() > 10 * 60_000,
      title: record.title,
    };
  }

  async getPublicIncident(statusSlug: string, incidentSlug: string) {
    const page = (await this.assertPublicPage(statusSlug)) as { id: string; title: string };
    const incident = await this.databaseService.database.execute(
      sql`SELECT incident.slug, COALESCE(incident.public_title, 'Service disruption') AS title, incident.severity, incident.lifecycle, incident.started_at AS "startedAt", incident.resolved_at AS "resolvedAt", COALESCE(json_agg(service.name ORDER BY service.display_order) FILTER (WHERE service.id IS NOT NULL), '[]') AS services FROM incidents incident LEFT JOIN incident_services affected ON affected.incident_id = incident.id AND affected.organization_id = incident.organization_id LEFT JOIN status_page_services page_link ON page_link.organization_id = affected.organization_id AND page_link.service_id = affected.service_id AND page_link.status_page_id = ${page.id} LEFT JOIN services service ON service.id = page_link.service_id AND service.organization_id = page_link.organization_id AND service.is_public = true AND service.deleted_at IS NULL WHERE incident.organization_id = (SELECT organization_id FROM status_pages WHERE id = ${page.id}) AND lower(incident.slug) = lower(${incidentSlug}) AND (incident.public_title IS NOT NULL OR EXISTS (SELECT 1 FROM incident_services eligible JOIN status_page_services eligible_link ON eligible_link.organization_id = eligible.organization_id AND eligible_link.service_id = eligible.service_id JOIN services public_service ON public_service.id = eligible_link.service_id AND public_service.organization_id = eligible_link.organization_id AND public_service.is_public = true AND public_service.deleted_at IS NULL WHERE eligible.organization_id = incident.organization_id AND eligible.incident_id = incident.id AND eligible_link.status_page_id = ${page.id})) GROUP BY incident.id`,
    );
    if (!incident.rows[0]) throw new NotFoundException("Public incident not found");
    const updates = await this.databaseService.database.execute(
      sql`SELECT lifecycle, body, published_at AS "publishedAt" FROM incident_public_updates WHERE organization_id = (SELECT organization_id FROM status_pages WHERE id = ${page.id}) AND incident_id = (SELECT id FROM incidents WHERE organization_id = (SELECT organization_id FROM status_pages WHERE id = ${page.id}) AND lower(slug) = lower(${incidentSlug})) ORDER BY published_at DESC, id DESC`,
    );
    return { ...incident.rows[0], statusTitle: page.title, updates: updates.rows };
  }
}
