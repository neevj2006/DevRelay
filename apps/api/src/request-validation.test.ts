import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseRequestBody } from "./request-validation.js";

describe("parseRequestBody", () => {
  it("returns transformed schema output", () => {
    const schema = z.object({ email: z.email().transform((value) => value.toLowerCase()) });

    expect(parseRequestBody(schema, { email: "USER@EXAMPLE.COM" })).toEqual({
      email: "user@example.com",
    });
  });

  it("throws the bounded validation response for invalid input", () => {
    expect(() => parseRequestBody(z.object({ name: z.string().min(1) }), {})).toThrow(
      BadRequestException,
    );
  });
});
