import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "./auth.service.js";
import type { DatabaseService } from "./database.service.js";
import { assertTrustedBrowserOrigin, isPublicDemoRead, SessionGuard } from "./session.guard.js";

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getArgByIndex: vi.fn(),
    getArgs: vi.fn(),
    getClass: vi.fn(),
    getHandler: vi.fn(),
    getType: vi.fn(),
    switchToHttp: () => ({
      getNext: vi.fn(),
      getRequest: () => request,
      getResponse: vi.fn(),
    }),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("SessionGuard", () => {
  function createGuard(getSession: ReturnType<typeof vi.fn>, demoUsers: unknown[] = []) {
    return new SessionGuard(
      {
        auth: { api: { getSession } },
        environment: { APP_ORIGIN: "https://app.devrelay.example" },
      } as unknown as AuthService,
      {
        database: { execute: vi.fn().mockResolvedValue({ rows: demoUsers }) },
      } as unknown as DatabaseService,
    );
  }

  it("rejects requests without an authoritative session", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const guard = createGuard(getSession);

    await expect(
      guard.canActivate(
        createContext({ headers: {}, method: "GET", url: "/organizations/mine/services" }),
      ),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it("attaches the validated session to the request", async () => {
    const session = { session: { id: "session-id" }, user: { id: "user-id" } };
    const getSession = vi.fn().mockResolvedValue(session);
    const request = { headers: { cookie: "devrelay.session_token=test" }, method: "GET" };
    const guard = createGuard(getSession);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty("auth", session);
  });

  it("uses the seeded demo member for safe demo reads even with a signed-in session", async () => {
    const getSession = vi.fn().mockResolvedValue({
      session: { id: "signed-in-session" },
      user: { id: "another-user" },
    });
    const guard = createGuard(getSession, [
      { email: "owner@example.invalid", id: "demo-user", name: "Demo Owner" },
    ]);
    const request = {
      headers: {},
      method: "GET",
      url: "/organizations/acme/services?limit=20",
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty("auth.user.id", "demo-user");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("never treats mutations or another organization as public demo access", () => {
    expect(isPublicDemoRead({ method: "GET", url: "/organizations/acme/incidents" })).toBe(true);
    expect(isPublicDemoRead({ method: "POST", url: "/organizations/acme/incidents" })).toBe(false);
    expect(isPublicDemoRead({ method: "GET", url: "/organizations/customer/incidents" })).toBe(
      false,
    );
  });

  it("rejects cross-origin cookie-authenticated mutations", () => {
    expect(() =>
      assertTrustedBrowserOrigin(
        { headers: { origin: "https://hostile.example" }, method: "POST" },
        "https://app.devrelay.example",
      ),
    ).toThrowError(/origin/i);
  });

  it("allows same-origin mutations and safe reads", () => {
    expect(() =>
      assertTrustedBrowserOrigin(
        { headers: { origin: "https://app.devrelay.example" }, method: "PATCH" },
        "https://app.devrelay.example",
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedBrowserOrigin(
        { headers: { origin: "https://hostile.example" }, method: "GET" },
        "https://app.devrelay.example",
      ),
    ).not.toThrow();
  });
});
