import { describe, expect, it } from "vitest";

import {
  buildCursorPage,
  decodeTimestampCursor,
  encodeTimestampCursor,
  normalizePageSize,
  type TimestampCursor,
} from "./pagination.js";

const firstCursor: TimestampCursor = {
  createdAt: "2026-07-17T00:00:00.000Z",
  id: "4be91a47-c169-4aa7-9372-42a4f353d86c",
};

describe("database pagination", () => {
  it("round-trips an opaque timestamp cursor", () => {
    expect(decodeTimestampCursor(encodeTimestampCursor(firstCursor))).toEqual(firstCursor);
  });

  it("rejects malformed or extended cursors", () => {
    const extendedCursor = Buffer.from(
      JSON.stringify({ ...firstCursor, organizationId: "private" }),
      "utf8",
    ).toString("base64url");

    expect(() => decodeTimestampCursor("not-json")).toThrow("Invalid pagination cursor");
    expect(() => decodeTimestampCursor(extendedCursor)).toThrow("Invalid pagination cursor");
  });

  it("bounds requested page sizes", () => {
    expect(normalizePageSize(undefined)).toBe(25);
    expect(normalizePageSize(500)).toBe(100);
    expect(() => normalizePageSize(0)).toThrow("positive integer");
  });

  it("returns a cursor only when an extra row proves another page exists", () => {
    const rows = [
      firstCursor,
      {
        createdAt: "2026-07-16T00:00:00.000Z",
        id: "7db6a054-0982-4e67-b2be-891747d5ef7b",
      },
    ];

    const page = buildCursorPage(rows, 1, (row) => row);

    expect(page.items).toEqual([firstCursor]);
    expect(decodeTimestampCursor(page.nextCursor ?? "")).toEqual(firstCursor);
  });
});
