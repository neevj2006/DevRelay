import { describe, expect, it } from "vitest";

import { createWorkerHeartbeat } from "./heartbeat.js";

describe("createWorkerHeartbeat", () => {
  it("returns a stable UTC heartbeat payload", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");

    expect(createWorkerHeartbeat(now)).toEqual({
      recordedAt: "2026-07-17T12:00:00.000Z",
      service: "worker",
    });
  });
});
