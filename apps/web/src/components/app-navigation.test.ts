import { describe, expect, it } from "vitest";

import { navigationForRole } from "./app-navigation";

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
