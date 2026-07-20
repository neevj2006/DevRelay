import { describe, expect, it } from "vitest";

import { organizationLandingPath, safeAuthCallbackUrl } from "./auth-navigation";

describe("authentication redirects", () => {
  it("allows local application paths", () => {
    expect(safeAuthCallbackUrl("/app/acme/incidents")).toBe("/app/acme/incidents");
  });

  it("rejects absolute and protocol-relative redirect targets", () => {
    expect(safeAuthCallbackUrl("https://attacker.example")).toBe("/app");
    expect(safeAuthCallbackUrl("//attacker.example")).toBe("/app");
    expect(safeAuthCallbackUrl(undefined)).toBe("/app");
  });
});

describe("organizationLandingPath", () => {
  it("opens the first organization when the user has memberships", () => {
    expect(organizationLandingPath([{ slug: "northstar" }, { slug: "platform" }])).toBe(
      "/app/northstar",
    );
  });

  it("opens onboarding only when the user has no organizations", () => {
    expect(organizationLandingPath([])).toBe("/onboarding");
  });
});
