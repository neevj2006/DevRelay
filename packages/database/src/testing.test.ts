import { describe, expect, it } from "vitest";

import { assertSafeTestDatabaseName, createTestDatabaseName } from "./testing.js";

describe("test database safety", () => {
  it("creates names inside the dedicated test namespace", () => {
    const name = createTestDatabaseName();

    expect(name).toMatch(/^devrelay_test_[0-9a-f]{32}$/);
    expect(() => assertSafeTestDatabaseName(name)).not.toThrow();
  });

  it("refuses to manage non-test databases", () => {
    expect(() => assertSafeTestDatabaseName("devrelay")).toThrow("unsafe test database name");
    expect(() => assertSafeTestDatabaseName("postgres")).toThrow("unsafe test database name");
  });
});
