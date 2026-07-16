import { describe, expect, it } from "vitest";

import { slugifyOrganizationName } from "./onboarding-flow";

describe("organization slug generation", () => {
  it.each([
    ["Acme Cloud", "acme-cloud"],
    ["  API & Reliability  ", "api-reliability"],
    ["Northstar_Labs", "northstar-labs"],
    ["---", ""],
  ])("normalizes %s", (input, expected) => {
    expect(slugifyOrganizationName(input)).toBe(expected);
  });
});
