import { describe, expect, it } from "vitest";

import { isNavigationPathActive, navigationForRole } from "./app-navigation";

describe("authorization-aware navigation", () => {
  it("shows owners the complete navigation", () => {
    expect(navigationForRole("owner").flatMap((group) => group.items)).toHaveLength(11);
  });

  it("does not expose administrative destinations to members", () => {
    const segments = navigationForRole("member").flatMap((group) =>
      group.items.map((item) => item.segment),
    );
    expect(segments).not.toContain("/members");
    expect(segments).not.toContain("/audit");
    expect(segments).not.toContain("/settings");
    expect(segments).not.toContain("/operations/health");
  });
});

describe("active navigation matching", () => {
  it("keeps sibling subscriber destinations mutually exclusive", () => {
    expect(isNavigationPathActive("/app/acme/subscribers", "/app/acme/subscribers")).toBe(true);
    expect(
      isNavigationPathActive("/app/acme/subscribers/deliveries", "/app/acme/subscribers"),
    ).toBe(false);
    expect(
      isNavigationPathActive(
        "/app/acme/subscribers/deliveries",
        "/app/acme/subscribers/deliveries",
      ),
    ).toBe(true);
  });

  it("keeps detail routes associated with their parent destination", () => {
    expect(isNavigationPathActive("/app/acme/services/svc-api", "/app/acme/services")).toBe(true);
    expect(isNavigationPathActive("/app/acme", "/app/acme")).toBe(true);
  });
});
