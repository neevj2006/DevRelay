import { describe, expect, it } from "vitest";

import {
  incidentTimeline,
  latencySeries,
  prototypeIncidents,
  prototypeServices,
} from "./prototype-data";

describe("prototype data", () => {
  it("keeps identifiers unique", () => {
    expect(new Set(prototypeServices.map((service) => service.id)).size).toBe(
      prototypeServices.length,
    );
    expect(new Set(prototypeIncidents.map((incident) => incident.id)).size).toBe(
      prototypeIncidents.length,
    );
  });

  it("contains both public and internal incident events", () => {
    expect(incidentTimeline.some((event) => event.visibility === "public")).toBe(true);
    expect(incidentTimeline.some((event) => event.visibility === "internal")).toBe(true);
  });

  it("keeps latency series chronological and non-negative", () => {
    expect(latencySeries.every((point) => point.latency >= 0 && point.failures >= 0)).toBe(true);
    expect(latencySeries.map((point) => point.time)).toEqual(
      [...latencySeries].map((point) => point.time).sort(),
    );
  });
});
