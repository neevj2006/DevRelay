import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const websiteRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const forbiddenProductLabel = ["port", "folio"].join("");
const forbiddenDash = String.fromCodePoint(0x2014);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(?:md|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("public product copy", () => {
  it("markets DevRelay as an MVP and uses standard hyphens", () => {
    const files = [
      ...sourceFiles(websiteRoot),
      ...sourceFiles(`${projectRoot}/docs`),
      `${projectRoot}/README.md`,
    ];
    const violations = files.flatMap((path) => {
      const content = readFileSync(path, "utf8");
      const issues = [];

      if (content.toLowerCase().includes(forbiddenProductLabel)) {
        issues.push(`${path}: legacy product positioning`);
      }

      if (content.includes(forbiddenDash)) {
        issues.push(`${path}: unsupported dash character`);
      }

      return issues;
    });

    expect(violations).toEqual([]);
  });
});
