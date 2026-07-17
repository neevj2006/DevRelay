import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseService } from "../apps/api/src/database.service.js";
import { IncidentService } from "../apps/api/src/incident.service.js";
import { OrganizationService } from "../apps/api/src/organization.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolated: IsolatedTestDatabase;
let databaseService: DatabaseService;
let client: ReturnType<typeof createDatabaseClient>;
let incidents: IncidentService;
let organizations: OrganizationService;
const ownerId = randomUUID();
const otherId = randomUUID();
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  isolated = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolated.connectionString, { max: 3 });
  databaseService = new DatabaseService(isolated.connectionString);
  organizations = new OrganizationService(databaseService);
  incidents = new IncidentService(databaseService, organizations);
  await client.database.execute(
    sql`INSERT INTO users (id, name, email, email_verified) VALUES (${ownerId}, 'Owner', 'incident-owner@example.test', true), (${otherId}, 'Other', 'incident-other@example.test', true)`,
  );
  await organizations.create(ownerId, { name: "Incident Team", slug: "incident-team" });
  await organizations.create(otherId, { name: "Other Team", slug: "incident-other" });
});

afterAll(async () => {
  await databaseService.onModuleDestroy();
  await client.close();
  await isolated.drop();
});

describe("incident management", () => {
  it("creates idempotently, separates private and public content, and validates lifecycle", async () => {
    const organization = await organizations.requireRole(ownerId, "incident-team", ["owner"]);
    const serviceId = randomUUID();
    await client.database.execute(
      sql`INSERT INTO services (id, organization_id, name) VALUES (${serviceId}, ${organization.organizationId}, 'Checkout')`,
    );
    const idempotencyKey = `manual-${randomUUID()}`;
    const input = {
      affectedServiceIds: [serviceId],
      idempotencyKey,
      initialLifecycle: "investigating" as const,
      privateSummary: "Customer reports are being correlated internally.",
      publicTitle: "Checkout disruption",
      publicUpdate: "We are investigating checkout failures.",
      severity: "major_outage" as const,
      title: "Checkout requests failing",
    };
    const created = await incidents.createManual(ownerId, "incident-team", input);
    const replay = await incidents.createManual(ownerId, "incident-team", input);
    expect(replay).toMatchObject({ id: created.id });

    const detail = await incidents.get(ownerId, "incident-team", created.id);
    expect(detail).toMatchObject({ lifecycle: "investigating", severity: "major_outage" });
    expect(detail.privateNotes).toHaveLength(1);
    expect(detail.publicUpdates).toHaveLength(1);
    expect(JSON.stringify(detail.publicUpdates)).not.toContain("correlated internally");
    await expect(incidents.get(otherId, "incident-other", created.id)).rejects.toThrow(
      "Incident not found",
    );

    await expect(
      incidents.transition(ownerId, "incident-team", created.id, {
        idempotencyKey: `invalid-${randomUUID()}`,
        reason: "Cannot skip directly while investigating",
        toLifecycle: "detected",
      }),
    ).rejects.toThrow("not allowed");
    await expect(
      incidents.transition(ownerId, "incident-team", created.id, {
        idempotencyKey: `identified-${randomUUID()}`,
        reason: "A failing dependency was identified",
        toLifecycle: "identified",
      }),
    ).resolves.toMatchObject({ lifecycle: "identified" });
    await expect(
      incidents.transition(ownerId, "incident-team", created.id, {
        idempotencyKey: `resolved-${randomUUID()}`,
        outcome: "resolved",
        reason: "Recovery checks passed",
        toLifecycle: "resolved",
      }),
    ).resolves.toMatchObject({ lifecycle: "resolved", outcome: "resolved" });
    await expect(
      incidents.transition(ownerId, "incident-team", created.id, {
        idempotencyKey: `reopen-${randomUUID()}`,
        reason: "The recovery did not hold",
        toLifecycle: "investigating",
      }),
    ).resolves.toMatchObject({ lifecycle: "investigating", reopened: true });

    const evidence = await client.database.execute<{
      auditCount: number;
      outboxCount: number;
      transitionCount: number;
    }>(sql`
      SELECT (SELECT count(*)::int FROM audit_events WHERE organization_id = ${organization.organizationId} AND target_id = ${created.id}) AS "auditCount",
        (SELECT count(*)::int FROM outbox_events WHERE organization_id = ${organization.organizationId} AND aggregate_id = ${created.id}) AS "outboxCount",
        (SELECT count(*)::int FROM incident_transitions WHERE organization_id = ${organization.organizationId} AND incident_id = ${created.id}) AS "transitionCount"
    `);
    expect(evidence.rows[0]).toEqual({ auditCount: 4, outboxCount: 5, transitionCount: 4 });
  });
});
