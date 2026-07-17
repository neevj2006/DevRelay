import { describe, expect, it } from "vitest";

import {
  apiEnvironmentSchema,
  apiErrorSchema,
  createMonitorInputSchema,
  cursorPaginationInputSchema,
  incidentWebhookPayloadV1Schema,
  monitorCheckJobSchema,
  monitorImpactValues,
  notificationDeliveryJobSchema,
  organizationRoleValues,
  queueJobSchema,
  serviceStateValues,
  webhookHeadersSchema,
  workerEnvironmentSchema,
} from "./index.js";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const timestamp = "2026-07-17T00:00:00.000Z";

describe("shared enums", () => {
  it("exposes stable persisted values", () => {
    expect(organizationRoleValues).toEqual(["owner", "admin", "member"]);
    expect(monitorImpactValues).toEqual(["degraded_performance", "partial_outage", "major_outage"]);
    expect(serviceStateValues).toContain("unknown");
  });
});

describe("HTTP contracts", () => {
  it("normalizes a valid monitor request and applies policy defaults", () => {
    const result = createMonitorInputSchema.parse({
      endpointUrl: "https://example.com/health",
      name: "Public API",
      policy: {
        acceptedStatusCodes: [{ from: 200, to: 399 }],
        intervalSeconds: 300,
        timeoutMilliseconds: 5000,
      },
      serviceId: uuid,
    });

    expect(result.method).toBe("GET");
    expect(result.policy.failureThreshold).toBe(3);
    expect(result.policy.recoveryThreshold).toBe(2);
  });

  it("rejects unsafe protocols, impossible timeouts, and unknown fields", () => {
    const baseInput = {
      endpointUrl: "https://example.com/health",
      name: "Public API",
      policy: {
        acceptedStatusCodes: [{ from: 200, to: 399 }],
        intervalSeconds: 10,
        timeoutMilliseconds: 10_000,
      },
      serviceId: uuid,
    };

    expect(createMonitorInputSchema.safeParse(baseInput).success).toBe(false);
    expect(
      createMonitorInputSchema.safeParse({
        ...baseInput,
        endpointUrl: "file:///etc/passwd",
        policy: { ...baseInput.policy, timeoutMilliseconds: 1000 },
      }).success,
    ).toBe(false);
    expect(
      createMonitorInputSchema.safeParse({
        ...baseInput,
        extra: "not allowed",
        policy: { ...baseInput.policy, timeoutMilliseconds: 1000 },
      }).success,
    ).toBe(false);
  });
});

describe("pagination and errors", () => {
  it("uses bounded cursor pagination defaults", () => {
    expect(cursorPaginationInputSchema.parse({})).toEqual({ pageSize: 25 });
    expect(cursorPaginationInputSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("requires structured safe API errors", () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: "conflict",
          correlationId: uuid,
          message: "The resource changed; reload and try again.",
          retryable: false,
        },
      }).error.code,
    ).toBe("conflict");
  });
});

describe("versioned asynchronous contracts", () => {
  it("accepts known queue payloads and rejects version drift", () => {
    const monitorJob = {
      correlationId: uuid,
      createdAt: timestamp,
      id: "monitor-window:123",
      name: "monitor.check",
      organizationId: uuid,
      payload: { monitorId: uuid, scheduledAt: timestamp },
      version: 1,
    };

    expect(queueJobSchema.parse(monitorJob).name).toBe("monitor.check");
    expect(monitorCheckJobSchema.safeParse({ ...monitorJob, version: 2 }).success).toBe(false);
    expect(
      notificationDeliveryJobSchema.safeParse({
        ...monitorJob,
        name: "notification.deliver",
        payload: { deliveryId: uuid },
      }).success,
    ).toBe(true);
  });

  it("validates public-only webhook payloads and signed headers", () => {
    const payload = {
      affectedServices: [{ id: uuid, name: "API", state: "partial_outage" }],
      eventId: uuid,
      eventType: "incident.updated",
      incident: {
        id: uuid,
        lifecycle: "investigating",
        publicTitle: "API errors",
        severity: "partial_outage",
        startedAt: timestamp,
      },
      occurredAt: timestamp,
      organizationId: uuid,
      version: 1,
    };

    expect(incidentWebhookPayloadV1Schema.safeParse(payload).success).toBe(true);
    expect(
      incidentWebhookPayloadV1Schema.safeParse({ ...payload, privateNote: "secret" }).success,
    ).toBe(false);
    expect(
      webhookHeadersSchema.safeParse({
        "devrelay-delivery-id": uuid,
        "devrelay-signature": `v1=${"a".repeat(64)}`,
        "devrelay-timestamp": "1784236800",
        "devrelay-version": "1",
      }).success,
    ).toBe(true);
  });
});

describe("runtime environment contracts", () => {
  it("requires adapter-specific API and worker configuration", () => {
    const apiBase = {
      AUTH_SECRET: "a".repeat(32),
      DATABASE_URL: "postgresql://user:password@localhost:5432/devrelay",
      GITHUB_CLIENT_ID: "client",
      GITHUB_CLIENT_SECRET: "secret",
    };

    expect(apiEnvironmentSchema.safeParse({ ...apiBase, QUEUE_ADAPTER: "bullmq" }).success).toBe(
      false,
    );
    expect(
      apiEnvironmentSchema.safeParse({
        ...apiBase,
        QUEUE_ADAPTER: "bullmq",
        REDIS_URL: "redis://localhost:6379",
      }).success,
    ).toBe(true);
    expect(
      apiEnvironmentSchema.safeParse({
        ...apiBase,
        QSTASH_CURRENT_SIGNING_KEY: "current",
        QSTASH_NEXT_SIGNING_KEY: "next",
        QSTASH_TOKEN: "token",
        QUEUE_ADAPTER: "qstash",
      }).success,
    ).toBe(true);
    expect(
      workerEnvironmentSchema.safeParse({
        DATABASE_URL: apiBase.DATABASE_URL,
        QUEUE_ADAPTER: "qstash",
        WORKER_ID: "hosted-dispatcher",
      }).success,
    ).toBe(true);
  });
});
