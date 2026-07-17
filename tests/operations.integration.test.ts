import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthService } from "../apps/api/src/auth.service.js";
import { DatabaseService } from "../apps/api/src/database.service.js";
import { IncidentService } from "../apps/api/src/incident.service.js";
import { OperationsService } from "../apps/api/src/operations.service.js";
import { OrganizationService } from "../apps/api/src/organization.service.js";
import { ServiceMonitorService } from "../apps/api/src/service-monitor.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolated: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
let database: DatabaseService;
let organizations: OrganizationService;
let operations: OperationsService;
let incidents: IncidentService;
let resources: ServiceMonitorService;
const userId = randomUUID();
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolated = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolated.connectionString, { max: 4 });
  database = new DatabaseService(isolated.connectionString);
  organizations = new OrganizationService(database);
  operations = new OperationsService(database, organizations);
  incidents = new IncidentService(database, organizations);
  resources = new ServiceMonitorService(database, organizations, {
    environment: { QUEUE_ADAPTER: "bullmq" },
  } as AuthService);
  await client.database.execute(
    sql`INSERT INTO users (id,name,email,email_verified) VALUES (${userId},'Operations Owner','operations@example.test',true)`,
  );
});
afterAll(async () => {
  await database.onModuleDestroy();
  await client.close();
  await isolated.drop();
});

describe("maintenance, analytics, postmortems, API keys, and audit", () => {
  it("applies and cancels maintenance with tenant-scoped audit evidence", async () => {
    await organizations.create(userId, { name: "Operations Cloud", slug: "operations-cloud" });
    const service = (await resources.createService(userId, "operations-cloud", {
      displayOrder: 0,
      isPublic: true,
      name: "API",
      publicDescription: "API",
    })) as { id: string };
    const created = await operations.createMaintenance(userId, "operations-cloud", {
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      notifySubscribers: false,
      serviceIds: [service.id],
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      title: "Database upgrade",
    });
    const state = await client.database.execute<{ currentState: string }>(
      sql`SELECT current_state AS "currentState" FROM services WHERE id=${service.id}`,
    );
    expect(state.rows[0]!.currentState).toBe("under_maintenance");
    await operations.updateMaintenance(userId, "operations-cloud", created.id, {
      endsAt: new Date(Date.now() + 7_200_000).toISOString(),
      notifySubscribers: false,
      serviceIds: [service.id],
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      title: "Updated database upgrade",
    });
    await operations.cancelMaintenance(userId, "operations-cloud", created.id, "Work deferred");
    const restored = await client.database.execute<{ currentState: string }>(
      sql`SELECT current_state AS "currentState" FROM services WHERE id=${service.id}`,
    );
    expect(restored.rows[0]!.currentState).toBe("unknown");
    const events = await operations.listAudit(userId, "operations-cloud", {
      action: "maintenance",
      actor: "Operations Owner",
      target: "maintenance_window",
    });
    expect(events.items).toHaveLength(3);
  });

  it("excludes maintenance, reports missing evidence, and calculates known availability and latency", async () => {
    const context = await organizations.requireRole(userId, "operations-cloud", ["owner"]);
    const service = (
      await client.database.execute<{ id: string }>(
        sql`SELECT id FROM services WHERE organization_id=${context.organizationId} LIMIT 1`,
      )
    ).rows[0]!;
    const monitorId = randomUUID();
    await client.database.execute(
      sql`INSERT INTO monitors (id,organization_id,service_id,name,endpoint_url,status) VALUES (${monitorId},${context.organizationId},${service.id},'Analytics monitor','https://example.com','active')`,
    );
    const times = [
      "2026-07-16T01:00:00Z",
      "2026-07-16T02:00:00Z",
      "2026-07-16T03:00:00Z",
      "2026-07-16T04:00:00Z",
    ];
    for (const time of times)
      await client.database.execute(
        sql`INSERT INTO expected_check_windows (organization_id,monitor_id,scheduled_at) VALUES (${context.organizationId},${monitorId},${time})`,
      );
    await client.database
      .execute(sql`INSERT INTO check_results (organization_id,monitor_id,scheduled_at,outcome,started_at,finished_at,latency_milliseconds,region,evidence_code,evidence_summary) VALUES
      (${context.organizationId},${monitorId},${times[0]},'success',${times[0]},${times[0]},100,'local','ok','ok'),
      (${context.organizationId},${monitorId},${times[1]},'failure',${times[1]},${times[1]},300,'local','http_500','failed'),
      (${context.organizationId},${monitorId},${times[2]},'success',${times[2]},${times[2]},500,'local','ok','maintenance evidence')`);
    const windowId = randomUUID();
    await client.database.execute(
      sql`INSERT INTO maintenance_windows (id,organization_id,title,starts_at,ends_at,created_by_user_id) VALUES (${windowId},${context.organizationId},'Historical work','2026-07-16T02:30:00Z','2026-07-16T03:30:00Z',${userId})`,
    );
    await client.database.execute(
      sql`INSERT INTO maintenance_window_services (organization_id,maintenance_window_id,service_id) VALUES (${context.organizationId},${windowId},${service.id})`,
    );
    await operations.aggregateAvailability("2026-07-16");
    const analytics = (await operations.analytics(
      userId,
      "operations-cloud",
      "2026-07-16",
      "2026-07-16",
    )) as {
      services: {
        availabilityBasisPoints: number;
        completedChecks: number;
        expectedChecks: number;
        latencyP50Milliseconds: number;
        latencyP95Milliseconds: number;
        missingChecks: number;
      }[];
    };
    expect(analytics.services[0]).toMatchObject({
      availabilityBasisPoints: 5000,
      completedChecks: 2,
      expectedChecks: 3,
      latencyP50Milliseconds: 200,
      latencyP95Milliseconds: 290,
      missingChecks: 1,
    });
  });

  it("keeps drafts private, publishes complete postmortems, and never stores API key plaintext", async () => {
    const service = (
      (await resources.listServices(userId, "operations-cloud")) as { id: string }[]
    )[0]!;
    const incident = await incidents.createManual(userId, "operations-cloud", {
      affectedServiceIds: [service.id],
      idempotencyKey: `incident-${randomUUID()}`,
      initialLifecycle: "investigating",
      privateSummary: "Internal",
      publicTitle: "API incident",
      publicUpdate: "Investigating",
      severity: "partial_outage",
      title: "API incident",
    });
    await incidents.transition(userId, "operations-cloud", incident.id, {
      idempotencyKey: `resolve-${randomUUID()}`,
      outcome: "resolved",
      reason: "Service recovered",
      toLifecycle: "resolved",
    });
    const content = {
      actionItems: [{ description: "Add capacity", owner: "Platform" }],
      impact: "Requests failed",
      resolution: "Capacity restored",
      rootCause: "Capacity exhausted",
      summary: "A short disruption",
      timeline: "10:00 detected; 10:20 resolved",
    };
    await operations.savePostmortem(userId, "operations-cloud", incident.id, content);
    await expect(operations.publicPostmortem("operations-cloud", incident.slug)).rejects.toThrow(
      "not found",
    );
    await operations.publishPostmortem(userId, "operations-cloud", incident.id);
    await expect(
      operations.publicPostmortem("operations-cloud", incident.slug),
    ).resolves.toMatchObject({ summary: content.summary });

    const created = await operations.createApiKey(userId, "operations-cloud", {
      label: "CI",
      scopes: ["analytics:read"],
    });
    const stored = await client.database.execute<{ secretHash: string }>(
      sql`SELECT secret_hash AS "secretHash" FROM api_keys WHERE id=${created.id}`,
    );
    expect(stored.rows[0]!.secretHash).not.toContain(created.plaintext);
    await expect(
      operations.authenticateApiKey(created.plaintext, "analytics:read"),
    ).resolves.toMatchObject({ id: created.id });
    expect(JSON.stringify(await operations.listApiKeys(userId, "operations-cloud"))).not.toContain(
      created.plaintext,
    );
    await operations.revokeApiKey(userId, "operations-cloud", created.id);
    await expect(
      operations.authenticateApiKey(created.plaintext, "analytics:read"),
    ).rejects.toThrow("not found");
  });
});
