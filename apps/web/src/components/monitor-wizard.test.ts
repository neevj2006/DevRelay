import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "monitor-wizard.tsx"), "utf8");

describe("monitor wizard protocol controls", () => {
  it("requires an explicit HTTP, TLS, or DNS selection", () => {
    expect(source).toContain('aria-label="Monitor type"');
    expect(source).toContain('["http", "tls", "dns"]');
  });

  it("uses progressive TLS and DNS fields without exposing unsafe evidence", () => {
    expect(source).toContain("Certificate expiry warning (days)");
    expect(source).toContain("DNS hostname");
    expect(source).toContain("Expected records");
    expect(source).toContain("Safe evidence only was retained.");
  });
});
