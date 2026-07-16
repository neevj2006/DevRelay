import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDevRelayAuth } from "../apps/api/src/auth.js";
import { parseApiEnvironment } from "../packages/config/src/index.js";
import { createDatabaseClient } from "../packages/database/src/index.js";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../packages/database/src/testing.js";

let isolatedDatabase: IsolatedTestDatabase;
let client: ReturnType<typeof createDatabaseClient>;
let auth: ReturnType<typeof createDevRelayAuth>;

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://devrelay:devrelay_local@localhost:5432/devrelay";
const authOrigin = "http://localhost:4000";
const appOrigin = "http://localhost:3000";

beforeAll(async () => {
  isolatedDatabase = await createIsolatedTestDatabase({ adminConnectionString: databaseUrl });
  client = createDatabaseClient(isolatedDatabase.connectionString, { max: 2 });
  const environment = parseApiEnvironment({
    APP_ORIGIN: appOrigin,
    AUTH_BASE_URL: authOrigin,
    AUTH_SECRET: "test-only-auth-secret-with-at-least-32-characters",
    DATABASE_URL: isolatedDatabase.connectionString,
    NODE_ENV: "test",
    QUEUE_ADAPTER: "bullmq",
    REDIS_URL: "redis://localhost:6379",
  });
  auth = createDevRelayAuth(client.database, environment);
});

afterAll(async () => {
  await client?.close();
  await isolatedDatabase?.drop();
});

function authRequest(path: string, options: RequestInit = {}) {
  return new Request(`${authOrigin}/api/auth${path}`, {
    ...options,
    headers: {
      origin: appOrigin,
      "x-forwarded-for": "192.0.2.10",
      ...options.headers,
    },
  });
}

describe("Better Auth integration", () => {
  it("creates, validates, and revokes a development session", async () => {
    const email = `${randomUUID()}@example.test`;
    const signUp = await auth.handler(
      authRequest("/sign-up/email", {
        body: JSON.stringify({ email, name: "Local Developer", password: "local-password-123" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(signUp.status).toBe(200);
    const cookie = signUp.headers.get("set-cookie");
    expect(cookie).toContain("devrelay.session_token=");

    const session = await auth.handler(
      authRequest("/get-session", {
        headers: { cookie: cookie! },
      }),
    );
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({ user: { email } });

    const signOut = await auth.handler(
      authRequest("/sign-out", {
        headers: { "content-type": "application/json", cookie: cookie! },
        method: "POST",
      }),
    );
    expect(signOut.status).toBe(200);

    const expiredSession = await auth.handler(
      authRequest("/get-session", {
        headers: { cookie: cookie! },
      }),
    );
    await expect(expiredSession.json()).resolves.toBeNull();
  });

  it("enforces a database-backed sign-in rate limit", async () => {
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await auth.handler(
          authRequest("/sign-in/email", {
            body: JSON.stringify({
              email: "missing@example.test",
              password: "incorrect-password",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        ),
      );
    }

    expect(responses.at(-1)?.status).toBe(429);
    expect(responses.at(-1)?.headers.get("x-retry-after")).toBeTruthy();
  });
});
