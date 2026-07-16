import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";

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
    const guard = new SessionGuard({ auth: { api: { getSession } } } as unknown as AuthService);

    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("attaches the validated session to the request", async () => {
    const session = { session: { id: "session-id" }, user: { id: "user-id" } };
    const getSession = vi.fn().mockResolvedValue(session);
    const request = { headers: { cookie: "devrelay.session_token=test" } };
    const guard = new SessionGuard({ auth: { api: { getSession } } } as unknown as AuthService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty("auth", session);
  });
});
