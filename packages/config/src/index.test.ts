import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseApiEnvironment, parseWebEnvironment, parseWorkerEnvironment } from "./index.js";

const sharedEnvironment = {
  DATABASE_URL: "postgresql://devrelay:devrelay_local@localhost:5432/devrelay",
  NODE_ENV: "test",
  REDIS_URL: "redis://localhost:6379",
};

describe("environment validation", () => {
  it("applies bounded API defaults", () => {
    expect(parseApiEnvironment(sharedEnvironment)).toMatchObject({
      API_HOST: "127.0.0.1",
      API_PORT: 4000,
      NODE_ENV: "test",
    });
  });

  it("rejects unsupported database protocols", () => {
    expect(() =>
      parseApiEnvironment({
        ...sharedEnvironment,
        DATABASE_URL: "mysql://localhost/devrelay",
      }),
    ).toThrow(ZodError);
  });

  it("coerces a valid worker heartbeat interval", () => {
    expect(
      parseWorkerEnvironment({
        ...sharedEnvironment,
        WORKER_HEARTBEAT_INTERVAL_MS: "45000",
      }).WORKER_HEARTBEAT_INTERVAL_MS,
    ).toBe(45_000);
  });

  it("requires an absolute public API URL", () => {
    expect(() =>
      parseWebEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_API_URL: "/api",
      }),
    ).toThrow(ZodError);
  });

  it("requires a production auth secret and paired GitHub OAuth credentials", () => {
    expect(() =>
      parseApiEnvironment({
        ...sharedEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow(ZodError);

    expect(() =>
      parseApiEnvironment({
        ...sharedEnvironment,
        GITHUB_CLIENT_ID: "client-id",
      }),
    ).toThrow(ZodError);
  });

  it("requires OAuth callbacks to use the browser application origin", () => {
    expect(() =>
      parseApiEnvironment({
        ...sharedEnvironment,
        APP_ORIGIN: "https://devrelay.example",
        AUTH_BASE_URL: "https://devrelay-api.example",
      }),
    ).toThrow(/AUTH_BASE_URL must use APP_ORIGIN/);

    expect(
      parseApiEnvironment({
        ...sharedEnvironment,
        APP_ORIGIN: "https://devrelay.example",
        AUTH_BASE_URL: "https://devrelay.example",
      }).AUTH_BASE_URL,
    ).toBe("https://devrelay.example");
  });

  it("treats empty optional OAuth values as unconfigured", () => {
    expect(
      parseApiEnvironment({
        ...sharedEnvironment,
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
      }),
    ).toMatchObject({
      GITHUB_CLIENT_ID: undefined,
      GITHUB_CLIENT_SECRET: undefined,
    });
  });
});
