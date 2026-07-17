import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthService } from "../apps/api/src/auth.service.js";
import { DatabaseService } from "../apps/api/src/database.service.js";
import { IncidentService } from "../apps/api/src/incident.service.js";
import { OrganizationService } from "../apps/api/src/organization.service.js";
import { ServiceMonitorService } from "../apps/api/src/service-monitor.service.js";
import { StatusPageService } from "../apps/api/src/status-page.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolated: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
let databaseService: DatabaseService;
let organizations: OrganizationService;
let services: ServiceMonitorService;
let incidents: IncidentService;
let statusPages: StatusPageService;
const userId = randomUUID();
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolated = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolated.connectionString, { max: 3 });
  databaseService = new DatabaseService(isolated.connectionString);
  organizations = new OrganizationService(databaseService);
  services = new ServiceMonitorService(databaseService, organizations, {
    environment: { QUEUE_ADAPTER: "bullmq" },
  } as AuthService);
  incidents = new IncidentService(databaseService, organizations);
  statusPages = new StatusPageService(databaseService);
  await client.database.execute(
    sql`INSERT INTO users (id, name, email, email_verified) VALUES (${userId}, 'Status Owner', 'status-owner@example.test', true)`,
  );
});

afterAll(async () => {
  await databaseService.onModuleDestroy();
  await client.close();
  await isolated.drop();
});

describe("public status projection", () => {
  it("creates one page per organization and exposes only allowlisted public data", async () => {
    const organization = await organizations.create(userId, {
      name: "Public Cloud",
      slug: "public-cloud",
    });
    const service = (await services.createService(userId, "public-cloud", {
      displayOrder: 2,
      isPublic: true,
      name: "Checkout",
      publicDescription: "Customer checkout",
    })) as { id: string };
    const privateService = (await services.createService(userId, "public-cloud", {
      displayOrder: 3,
      isPublic: false,
      name: "Private control plane",
      publicDescription: "Not published",
    })) as { id: string };
    const created = await incidents.createManual(userId, "public-cloud", {
      affectedServiceIds: [service.id],
      idempotencyKey: `incident-${randomUUID()}`,
      initialLifecycle: "investigating",
      privateSummary: "PRIVATE root cause and internal endpoint",
      publicTitle: "Checkout disruption",
      publicUpdate: "We are investigating checkout failures.",
      severity: "partial_outage",
      title: "Internal checkout title",
    });
    const projection = await statusPages.getPublic("public-cloud");
    expect(projection).toMatchObject({
      overallState: "unknown",
      slug: "public-cloud",
      title: "Public Cloud status",
    });
    expect(projection.services).toEqual([
      expect.objectContaining({ name: "Checkout", state: "unknown" }),
    ]);
    expect(projection.activeIncidents).toEqual([
      expect.objectContaining({ slug: expect.any(String), title: "Checkout disruption" }),
    ]);
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(organization.id);
    expect(serialized).not.toContain(service.id);
    expect(serialized).not.toContain(created.id);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).not.toContain("Internal checkout title");

    const privateIncidentId = randomUUID();
    await client.database.execute(sql`
      INSERT INTO incidents
        (id, organization_id, slug, title, source, severity, lifecycle,
         automatic_fingerprint, creation_idempotency_key, started_at)
      VALUES
        (${privateIncidentId}, ${organization.id}, 'private-control-plane-outage',
         'PRIVATE database credentials unavailable', 'automatic_monitor', 'major_outage',
         'investigating', ${`private-${randomUUID()}`}, ${`private-${randomUUID()}`}, now())
    `);
    await client.database.execute(sql`
      INSERT INTO incident_services
        (organization_id, incident_id, service_id, impact, is_primary)
      VALUES (${organization.id}, ${privateIncidentId}, ${privateService.id}, 'major_outage', true)
    `);
    const afterPrivateIncident = await statusPages.getPublic("public-cloud");
    expect(JSON.stringify(afterPrivateIncident)).not.toContain("private-control-plane-outage");
    expect(JSON.stringify(afterPrivateIncident)).not.toContain("PRIVATE database credentials");

    const incident = await statusPages.getPublicIncident(
      "public-cloud",
      (projection.activeIncidents[0] as { slug: string }).slug,
    );
    expect(incident).toMatchObject({
      title: "Checkout disruption",
      updates: [expect.objectContaining({ body: "We are investigating checkout failures." })],
    });
    expect(JSON.stringify(incident)).not.toContain("PRIVATE");
    const pages = await client.database.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM status_pages WHERE organization_id = ${organization.id}`,
    );
    expect(pages.rows[0]!.count).toBe(1);
  });
});
