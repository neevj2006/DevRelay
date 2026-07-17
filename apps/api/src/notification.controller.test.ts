import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";

import { NotificationController } from "./notification.controller.js";
import type { NotificationService } from "./notification.service.js";

describe("NotificationController subscription identity", () => {
  it("uses Express's trusted socket-derived address and ignores raw forwarding headers", async () => {
    const subscribe = vi.fn().mockResolvedValue({ accepted: true });
    const controller = new NotificationController({ subscribe } as unknown as NotificationService);
    const request = {
      headers: { "x-forwarded-for": "198.51.100.12" },
      ip: "203.0.113.9",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;

    await controller.subscribe(
      "public-page",
      {
        email: "person@example.com",
        incidentNotifications: true,
        maintenanceNotifications: true,
        serviceIds: [],
        website: "",
      },
      request,
    );

    expect(subscribe).toHaveBeenCalledWith(
      "public-page",
      {
        email: "person@example.com",
        incidentNotifications: true,
        maintenanceNotifications: true,
        serviceIds: [],
        website: "",
      },
      "203.0.113.9",
    );
  });
});
