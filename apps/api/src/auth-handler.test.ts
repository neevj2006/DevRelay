import { describe, expect, it } from "vitest";

import { isAllowedAuthContentType } from "./auth-handler.js";

describe("bounded auth handler", () => {
  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "application/x-www-form-urlencoded",
  ])("allows %s", (value) => expect(isAllowedAuthContentType(value)).toBe(true));

  it.each([undefined, "text/plain", "multipart/form-data", "application/xml"])(
    "rejects unsupported content type %s",
    (value) => expect(isAllowedAuthContentType(value)).toBe(false),
  );
});
