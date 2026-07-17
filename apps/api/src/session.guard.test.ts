import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "./auth.service.js";
import { assertTrustedBrowserOrigin, SessionGuard } from "./session.guard.js";

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
  it("rejects requests without an authoritative session", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const guard = new SessionGuard({
      auth: { api: { getSession } },
      environment: { APP_ORIGIN: "https://app.devrelay.example" },
    } as unknown as AuthService);

    await expect(
      guard.canActivate(createContext({ headers: {}, method: "GET" })),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it("attaches the validated session to the request", async () => {
    const session = { session: { id: "session-id" }, user: { id: "user-id" } };
    const getSession = vi.fn().mockResolvedValue(session);
    const request = { headers: { cookie: "devrelay.session_token=test" }, method: "GET" };
    const guard = new SessionGuard({
      auth: { api: { getSession } },
      environment: { APP_ORIGIN: "https://app.devrelay.example" },
    } as unknown as AuthService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty("auth", session);
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
