import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureLocalTracing,
  finishedLocalSpans,
  runtimeMetrics,
  sanitizeObservabilityFields,
  structuredLog,
  withTrace,
} from "./observability.js";

afterEach(() => {
  runtimeMetrics.reset();
  vi.restoreAllMocks();
});

describe("observability safety and reliability evidence", () => {
  it("retains allow-listed identifiers while removing sensitive fields", () => {
    expect(
      sanitizeObservabilityFields({
        authorization: "Bearer secret",
        correlationId: "request-1",
        monitorId: "monitor-1",
        organizationId: "org-1",
        payload: { password: "secret" },
      }),
    ).toEqual({ correlationId: "request-1", monitorId: "monitor-1", organizationId: "org-1" });
  });

  it("emits one-line JSON logs without request bodies or credentials", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    structuredLog("info", "policy.evaluated", {
      correlationId: "job-1",
      organizationId: "org-1",
      payload: { token: "never-log-me" },
      status: "healthy",
    });
    const record = JSON.parse(String(output.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(record).toMatchObject({
      correlationId: "job-1",
      event: "policy.evaluated",
      level: "info",
      organizationId: "org-1",
      status: "healthy",
    });
    expect(JSON.stringify(record)).not.toContain("never-log-me");
  });

  it("calculates p95 process metrics and records local OpenTelemetry spans", async () => {
    runtimeMetrics.record("api.request.duration", 10);
    runtimeMetrics.record("api.request.duration", 30);
    runtimeMetrics.record("api.request.duration", 20);
    expect(runtimeMetrics.snapshot()["api.request.duration"]).toEqual({
      count: 3,
      max: 30,
      p95: 30,
      sum: 60,
    });

    configureLocalTracing();
    await withTrace("monitor.check", { correlationId: "trace-1", payload: "secret" }, async () =>
      Promise.resolve(),
    );
    const span = finishedLocalSpans().find((candidate) => candidate.name === "monitor.check");
    expect(span?.attributes).toMatchObject({ correlationId: "trace-1" });
    expect(span?.attributes).not.toHaveProperty("payload");
  });
});
