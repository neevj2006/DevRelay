import { describe, expect, it } from "vitest";

import { safeAuthCallbackUrl } from "./auth-navigation";

describe("authentication redirects", () => {
  it("allows local application paths", () => {
    expect(safeAuthCallbackUrl("/app/acme/incidents")).toBe("/app/acme/incidents");
  });

  it("rejects absolute and protocol-relative redirect targets", () => {
    expect(safeAuthCallbackUrl("https://attacker.example")).toBe("/onboarding");
    expect(safeAuthCallbackUrl("//attacker.example")).toBe("/onboarding");
    expect(safeAuthCallbackUrl(undefined)).toBe("/onboarding");
  });
});
