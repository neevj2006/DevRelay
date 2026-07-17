import { describe, expect, it, vi } from "vitest";

import {
  describeMonitorPolicy,
  EndpointPolicyError,
  isForbiddenAddress,
  normalizeEndpointUrl,
  runSafeMonitorTest,
  validateEndpointDestination,
  validateRequestHeaders,
} from "./index.js";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("endpoint policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "198.51.100.1",
    "203.0.113.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (address) => {
    expect(isForbiddenAddress(address)).toBe(true);
  });

  it("normalizes safe URLs and strips fragments", () => {
    expect(normalizeEndpointUrl("HTTPS://EXAMPLE.COM/path#secret").href).toBe(
      "https://example.com/path",
    );
  });

  it.each([
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com:444",
    "https://example.com/health?api_key=hidden",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => normalizeEndpointUrl(url)).toThrow(EndpointPolicyError);
  });

  it("rejects any DNS answer in a prohibited range", async () => {
    await expect(
      validateEndpointDestination("https://example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "forbidden_address" });
  });

  it("normalizes allowed headers and blocks credential-bearing headers", () => {
    expect(validateRequestHeaders({ Accept: "application/json" })).toEqual({
      accept: "application/json",
    });
    expect(() => validateRequestHeaders({ Authorization: "Bearer hidden" })).toThrow(
      EndpointPolicyError,
    );
    expect(() => validateRequestHeaders({ "X-Api-Key": "hidden" })).toThrow(EndpointPolicyError);
  });
});

describe("safe monitor test", () => {
  it("revalidates a redirect and records metadata without a body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { headers: { location: "https://www.example.com/final" }, status: 302 }),
      )
      .mockResolvedValueOnce(new Response("secret body", { status: 200 }));
    const result = await runSafeMonitorTest({
      endpointUrl: "https://example.com",
      method: "GET",
      resolver: publicResolver,
      timeoutMilliseconds: 1000,
    });
    expect(result).toMatchObject({
      code: "http_response",
      httpStatusCode: 200,
      ok: true,
      redirectCount: 1,
    });
    expect(result).not.toHaveProperty("body");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops oversized responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("123456"));
    await expect(
      runSafeMonitorTest({
        endpointUrl: "https://example.com",
        maxResponseBytes: 5,
        method: "GET",
        resolver: publicResolver,
        timeoutMilliseconds: 1000,
      }),
    ).resolves.toMatchObject({ code: "response_too_large", ok: false });
  });
});

it("builds the policy preview from stored values", () => {
  expect(
    describeMonitorPolicy({
      acceptedStatusCodes: [{ from: 200, to: 299 }],
      failureThreshold: 3,
      intervalSeconds: 60,
      recoveryThreshold: 2,
      timeoutMilliseconds: 5000,
    }),
  ).toContain("3 consecutive failures");
});
