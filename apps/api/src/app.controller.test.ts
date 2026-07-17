import { describe, expect, it } from "vitest";

import { AppController } from "./app.controller.js";
import type { SystemHealthService } from "./system-health.service.js";

describe("AppController", () => {
  it("reports the dependency-aware API health contract", async () => {
    const health = {
      inspect: () => Promise.resolve({ service: "api", status: "ok" }),
      metrics: () => ({ metrics: {} }),
    } as unknown as SystemHealthService;
    await expect(new AppController(health).getHealth()).resolves.toEqual({
      service: "api",
      status: "ok",
    });
    expect(new AppController(health).getMetrics()).toEqual({ metrics: {} });
  });
});
