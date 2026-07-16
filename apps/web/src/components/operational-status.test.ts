import { describe, expect, it } from "vitest";

import { operationalStatusConfig, operationalStatuses } from "./operational-status";

describe("operational status definitions", () => {
  it("defines every required operational state", () => {
    expect(operationalStatuses).toEqual([
      "operational",
      "degraded",
      "partial_outage",
      "major_outage",
      "maintenance",
      "unknown",
    ]);
  });

  it.each(operationalStatuses)("gives %s explicit text, an icon, and semantic colors", (status) => {
    const definition = operationalStatusConfig[status];
    expect(definition.label.length).toBeGreaterThan(0);
    expect(definition.icon).toBeTypeOf("object");
    expect(definition.className).toContain(`--status-${status.replace("_outage", "")}`);
  });
});
