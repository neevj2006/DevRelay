import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("application route authentication proxy", () => {
  it("allows the reserved product demo without a session", () => {
    const response = proxy(new NextRequest("https://devrelay.example/app/acme/services"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects another organization to sign in without a session", () => {
    const response = proxy(new NextRequest("https://devrelay.example/app/customer/services"));

    expect(response.headers.get("location")).toBe(
      "https://devrelay.example/sign-in?callbackUrl=%2Fapp%2Fcustomer%2Fservices",
    );
  });
});
