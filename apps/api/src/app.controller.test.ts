import { describe, expect, it } from "vitest";

import { AppController } from "./app.controller.js";

describe("AppController", () => {
  it("reports the API health contract", () => {
    expect(new AppController().getHealth()).toEqual({
      service: "api",
      status: "ok",
    });
  });
});
