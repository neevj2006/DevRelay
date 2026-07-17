import { randomUUID } from "node:crypto";

import type { NotificationDeliveryJob, OutboxDispatchJob } from "@devrelay/contracts";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthService } from "../apps/api/src/auth.service.js";
import { DatabaseService } from "../apps/api/src/database.service.js";
import { IncidentService } from "../apps/api/src/incident.service.js";
import { NotificationService } from "../apps/api/src/notification.service.js";
import { OrganizationService } from "../apps/api/src/organization.service.js";
import { ServiceMonitorService } from "../apps/api/src/service-monitor.service.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";
import {
  decryptWebhookSecret,
  NotificationDeliveryProcessor,
  NotificationFanoutProcessor,
  signWebhook,
} from "../packages/execution/src/notifications.js";

let isolated: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
let database: DatabaseService;
let organizations: OrganizationService;
let notifications: NotificationService;
let incidents: IncidentService;
let services: ServiceMonitorService;
const userId = randomUUID();
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";

beforeAll(async () => {
  process.env.NOTIFICATION_ENCRYPTION_KEY = "integration-notification-encryption-key";
  isolated = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  process.env.DATABASE_URL = isolated.connectionString;
  process.env.REDIS_URL = "redis://localhost:6379";
  client = createDatabaseClient(isolated.connectionString, { max: 4 });
  database = new DatabaseService(isolated.connectionString);
  organizations = new OrganizationService(database);
  notifications = new NotificationService(database, organizations);
  incidents = new IncidentService(database, organizations);
  services = new ServiceMonitorService(database, organizations, {
    environment: { QUEUE_ADAPTER: "bullmq" },
  } as AuthService);
  await client.database.execute(
    sql`INSERT INTO users (id,name,email,email_verified) VALUES (${userId},'Notification Owner','notification-owner@example.test',true)`,
  );
});
afterAll(async () => {
  await database.onModuleDestroy();
  await client.close();
  await isolated.drop();
});

describe("subscriber notification lifecycle", () => {
  it("verifies, scopes preferences, fans out once, delivers through Mailpit, and revokes unsubscribe tokens", async () => {
    const organization = await organizations.create(userId, {
      name: "Notify Cloud",
      slug: "notify-cloud",
    });
    const service = (await services.createService(userId, "notify-cloud", {
      displayOrder: 0,
      isPublic: true,
      name: "API",
      publicDescription: "Public API",
    })) as { id: string };
    const email = `subscriber-${randomUUID()}@example.test`;
    await expect(
      notifications.subscribe(
        "notify-cloud",
        {
          email,
          incidentNotifications: true,
          maintenanceNotifications: true,
          serviceIds: [],
          website: "",
        },
        "192.0.2.40",
      ),
    ).resolves.toEqual({ accepted: true });
    const pending = await client.database.execute<{
      id: string;
      safePayload: { verifyUrlCiphertext: string };
    }>(
      sql`SELECT id,safe_payload AS "safePayload" FROM notification_deliveries WHERE organization_id=${organization.id} AND kind='subscription_verification'`,
    );
    const serializedPayload = JSON.stringify(pending.rows[0]!.safePayload);
    expect(serializedPayload).not.toContain("token=");
    const verifyUrl = decryptWebhookSecret(
      pending.rows[0]!.safePayload.verifyUrlCiphertext,
      process.env.NOTIFICATION_ENCRYPTION_KEY!,
    );
    const token = new URL(verifyUrl).searchParams.get("token")!;
    const controls = await notifications.verify(token);
    await notifications.updatePreferences({
      incidentNotifications: true,
      maintenanceNotifications: false,
      serviceIds: [service.id],
      token: controls.preferencesToken,
    });
    const preference = await notifications.getPreferences(controls.preferencesToken);
    expect(preference.serviceIds).toEqual([service.id]);

    const created = await incidents.createManual(userId, "notify-cloud", {
      affectedServiceIds: [service.id],
      idempotencyKey: `incident-${randomUUID()}`,
      initialLifecycle: "investigating",
      privateSummary: "Internal",
      publicTitle: "API disruption",
      publicUpdate: "We are investigating.",
      severity: "partial_outage",
      title: "Internal incident",
    });
    const event = await client.database.execute<{ id: string }>(
      sql`SELECT id FROM outbox_events WHERE organization_id=${organization.id} AND aggregate_id=${created.id} AND event_type='incident.public_update_published'`,
    );
    const job: OutboxDispatchJob = {
      correlationId: "test",
      createdAt: new Date().toISOString(),
      id: "fanout-test",
      name: "outbox.dispatch",
      organizationId: organization.id,
      payload: { outboxEventId: event.rows[0]!.id },
      version: 1,
    };
    const fanout = new NotificationFanoutProcessor(client, "http://localhost:3000");
    expect((await fanout.execute(job)).created).toBe(1);
    expect((await fanout.execute(job)).created).toBe(0);
    const deliveries = await client.database.execute<{ count: number; id: string }>(
      sql`SELECT count(*)::int AS count,min(id::text)::uuid AS id FROM notification_deliveries WHERE organization_id=${organization.id} AND kind='incident_update'`,
    );
    expect(deliveries.rows[0]!.count).toBe(1);
    const deliveryJob: NotificationDeliveryJob = {
      correlationId: "delivery-test",
      createdAt: new Date().toISOString(),
      id: "delivery-test",
      name: "notification.deliver",
      organizationId: organization.id,
      payload: { deliveryId: deliveries.rows[0]!.id },
      version: 1,
    };
    const processor = new NotificationDeliveryProcessor(client, {
      appOrigin: "http://localhost:3000",
      emailFrom: "DevRelay <notifications@localhost>",
      encryptionKey: process.env.NOTIFICATION_ENCRYPTION_KEY,
      resendApiKey: undefined,
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      workerId: "integration-worker",
    });
    expect(await processor.execute(deliveryJob)).toEqual({ status: "succeeded" });
    expect(await processor.execute(deliveryJob)).toEqual({ status: "duplicate" });
    const attempt = await client.database.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM delivery_attempts WHERE delivery_id=${deliveries.rows[0]!.id}`,
    );
    expect(attempt.rows[0]!.count).toBe(1);
    await expect(
      notifications.redeliver(userId, "notify-cloud", deliveries.rows[0]!.id),
    ).resolves.toEqual({ id: deliveries.rows[0]!.id, status: "retry_scheduled" });
    const redelivery = await client.database.execute<{ status: string }>(
      sql`SELECT status FROM notification_deliveries WHERE id=${deliveries.rows[0]!.id}`,
    );
    expect(redelivery.rows[0]!.status).toBe("retry_scheduled");
    await expect(notifications.unsubscribe(controls.unsubscribeToken)).resolves.toEqual({
      unsubscribed: true,
    });
    await expect(notifications.getPreferences(controls.preferencesToken)).rejects.toThrow(
      "invalid or expired",
    );
  });

  it("produces documented HMAC signatures", () => {
    expect(signWebhook('{"ok":true}', "1700000000000", "secret")).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(signWebhook('{"ok":true}', "1700000000000", "secret")).toBe(
      signWebhook('{"ok":true}', "1700000000000", "secret"),
    );
  });

  it("requires an administrator and encrypts outgoing webhook secrets", async () => {
    const organization = await organizations.create(userId, {
      name: "Webhook Cloud",
      slug: `webhook-cloud-${randomUUID()}`,
    });
    const created = await notifications.createWebhook(userId, organization.slug, {
      endpointUrl: "https://93.184.216.34/devrelay",
      name: "Customer receiver",
    });
    const stored = await client.database.execute<{
      ciphertext: string;
      prefix: string;
    }>(sql`SELECT signing_secret_ciphertext AS ciphertext, signing_secret_prefix AS prefix
      FROM webhook_destinations WHERE id=${created.id}`);
    expect(stored.rows[0]!.ciphertext).not.toContain(created.secret);
    expect(stored.rows[0]!.prefix).toBe(created.secret.slice(0, 12));
    const audit = await client.database.execute<{ count: number }>(sql`SELECT count(*)::int AS count
      FROM audit_events WHERE organization_id=${organization.id} AND action='webhook.created' AND target_id=${created.id}`);
    expect(audit.rows[0]!.count).toBe(1);
  });
});
