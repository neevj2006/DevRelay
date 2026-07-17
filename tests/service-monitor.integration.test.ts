import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthService } from "../apps/api/src/auth.service.js";
import { DatabaseService } from "../apps/api/src/database.service.js";
import { OrganizationService } from "../apps/api/src/organization.service.js";
import { ServiceMonitorService } from "../apps/api/src/service-monitor.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolatedDatabase: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
let resources: ServiceMonitorService;
let organizations: OrganizationService;
let databaseService: DatabaseService;
const ownerId = randomUUID();
const otherOwnerId = randomUUID();

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolatedDatabase = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolatedDatabase.connectionString, { max: 2 });
  await client.database.execute(
    sql`INSERT INTO users (id, name, email, email_verified) VALUES (${ownerId}, 'Owner', 'owner-service@example.test', true), (${otherOwnerId}, 'Other', 'other-service@example.test', true)`,
  );
  databaseService = new DatabaseService(isolatedDatabase.connectionString);
  organizations = new OrganizationService(databaseService);
  resources = new ServiceMonitorService(databaseService, organizations, {
    environment: { QUEUE_ADAPTER: "bullmq" },
  } as AuthService);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await databaseService?.onModuleDestroy();
  await client?.close();
  await isolatedDatabase?.drop();
});

describe("service and monitor lifecycle", () => {
  it("enforces tenant boundaries, test-before-activate, lifecycle transitions, and audit evidence", async () => {
    await organizations.create(ownerId, { name: "Reliability Team", slug: "reliability-team" });
    await organizations.create(otherOwnerId, { name: "Other Team", slug: "other-team" });
    const service = (await resources.createService(ownerId, "reliability-team", {
      displayOrder: 2,
      isPublic: true,
      name: "Public API",
      publicDescription: "Customer API",
    })) as { id: string };
    await expect(
      resources.updateService(ownerId, "reliability-team", service.id, {
        displayOrder: 1,
        publicDescription: "Customer API and webhooks",
      }),
    ).resolves.toMatchObject({
      currentState: "unknown",
      displayOrder: 1,
      publicDescription: "Customer API and webhooks",
    });
    await expect(
      resources.getService(ownerId, "reliability-team", service.id),
    ).resolves.toMatchObject({
      currentState: "unknown",
      publicDescription: "Customer API and webhooks",
    });

    await expect(resources.getService(otherOwnerId, "other-team", service.id)).rejects.toThrow(
      "Service not found",
    );
    await expect(
      resources.createMonitor(ownerId, "reliability-team", {
        endpointUrl: "http://169.254.169.254/latest/meta-data",
        method: "GET",
        name: "Unsafe",
        serviceId: service.id,
        policy: {
          acceptedStatusCodes: [{ from: 200, to: 299 }],
          failureImpact: "major_outage",
          failureThreshold: 3,
          intervalSeconds: 60,
          recoveryThreshold: 2,
          requestHeaders: {},
          timeoutMilliseconds: 1000,
        },
      }),
    ).rejects.toMatchObject({ response: { error: "forbidden_address" }, status: 400 });

    const monitor = await resources.createMonitor(ownerId, "reliability-team", {
      endpointUrl: "https://1.1.1.1/health",
      method: "GET",
      name: "API health",
      serviceId: service.id,
      policy: {
        acceptedStatusCodes: [{ from: 200, to: 299 }],
        failureImpact: "major_outage",
        failureThreshold: 3,
        intervalSeconds: 60,
        recoveryThreshold: 2,
        requestHeaders: { Accept: "application/json" },
        timeoutMilliseconds: 1000,
      },
    });
    expect(monitor.policyPreview).toContain("3 consecutive failures");
    await expect(
      resources.activateMonitor(ownerId, "reliability-team", monitor.id),
    ).rejects.toThrow("Run a successful test");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not retained", { status: 200 }));
    await expect(
      resources.testMonitor(ownerId, "reliability-team", monitor.id),
    ).resolves.toMatchObject({ httpStatusCode: 200, ok: true });
    await expect(
      resources.activateMonitor(ownerId, "reliability-team", monitor.id),
    ).resolves.toMatchObject({ status: "active" });
    await expect(
      resources.pauseMonitor(ownerId, "reliability-team", monitor.id),
    ).resolves.toMatchObject({ status: "paused" });

    await resources.updateMonitor(ownerId, "reliability-team", monitor.id, {
      name: "API health v2",
    });
    await expect(resources.resumeMonitor(ownerId, "reliability-team", monitor.id)).rejects.toThrow(
      "Run a successful test",
    );
    const listed = (await resources.listServices(ownerId, "reliability-team")) as {
      monitorCount: number;
      name: string;
    }[];
    expect(listed).toEqual([expect.objectContaining({ monitorCount: 1, name: "Public API" })]);

    const incidentId = randomUUID();
    const incidentServiceId = randomUUID();
    const organization = await client.database.execute<{ id: string }>(
      sql`SELECT id FROM organizations WHERE slug = 'reliability-team'`,
    );
    await client.database.execute(sql`
      INSERT INTO incidents (id, organization_id, slug, title, source, severity, lifecycle, creation_idempotency_key, started_at)
      VALUES (${incidentId}, ${organization.rows[0]!.id}, 'history-preservation', 'Historical outage', 'manual_responder', 'major_outage', 'investigating', ${randomUUID()}, now())
    `);
    await client.database.execute(sql`
      INSERT INTO incident_services (id, organization_id, incident_id, service_id, impact, is_primary)
      VALUES (${incidentServiceId}, ${organization.rows[0]!.id}, ${incidentId}, ${service.id}, 'major_outage', true)
    `);
    await resources.archiveService(ownerId, "reliability-team", service.id);
    await expect(resources.getService(ownerId, "reliability-team", service.id)).rejects.toThrow(
      "Service not found",
    );
    const preservedHistory = await client.database.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM incident_services WHERE id = ${incidentServiceId}`,
    );
    expect(preservedHistory.rows[0]?.count).toBe(1);
    const audits = await client.database.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM audit_events WHERE actor_user_id = ${ownerId} AND action LIKE 'monitor.%'`,
    );
    expect(audits.rows[0]?.count).toBeGreaterThanOrEqual(5);
  });

  it("enforces hosted interval and global active-monitor limits in application logic", async () => {
    const hostedResources = new ServiceMonitorService(databaseService, organizations, {
      environment: { QUEUE_ADAPTER: "qstash" },
    } as AuthService);
    const service = (await hostedResources.createService(ownerId, "reliability-team", {
      displayOrder: 0,
      isPublic: false,
      name: "Hosted quota service",
    })) as { id: string };
    const policy = {
      acceptedStatusCodes: [{ from: 200, to: 299 }],
      failureImpact: "major_outage" as const,
      failureThreshold: 2,
      intervalSeconds: 300,
      recoveryThreshold: 2,
      requestHeaders: {},
      timeoutMilliseconds: 1000,
    };

    await expect(
      hostedResources.createMonitor(ownerId, "reliability-team", {
        endpointUrl: "https://1.1.1.1/health",
        method: "GET",
        name: "Too frequent",
        policy: { ...policy, intervalSeconds: 60 },
        serviceId: service.id,
      }),
    ).rejects.toMatchObject({ response: { limit: "minimum_monitor_interval_seconds" } });

    for (let index = 1; index <= 6; index += 1) {
      const monitor = await hostedResources.createMonitor(ownerId, "reliability-team", {
        endpointUrl: `https://1.1.1.1/health-${index}`,
        method: "GET",
        name: `Hosted monitor ${index}`,
        policy,
        serviceId: service.id,
      });
      await client.database.execute(
        sql`UPDATE monitors SET tested_configuration_version = configuration_version WHERE id = ${monitor.id}`,
      );
      if (index <= 5) {
        await expect(
          hostedResources.activateMonitor(ownerId, "reliability-team", monitor.id),
        ).resolves.toMatchObject({ status: "active" });
      } else {
        await expect(
          hostedResources.activateMonitor(ownerId, "reliability-team", monitor.id),
        ).rejects.toMatchObject({
          response: { currentUsage: 5, limit: "active_http_monitors", maximum: 5 },
        });
      }
    }
  });
});
