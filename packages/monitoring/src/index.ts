import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

const allowedPorts = new Set(["", "80", "443"]);
const forbiddenHeaderNames = new Set([
  "authorization",
  "connection",
  "cookie",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "set-cookie",
  "transfer-encoding",
]);
const allowedHeaderNames = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "user-agent",
  "x-devrelay-check",
]);

export type EndpointAddress = { address: string; family: 4 | 6 };
export type EndpointResolver = (hostname: string) => Promise<readonly EndpointAddress[]>;
export type ResolvedEndpoint = { addresses: readonly EndpointAddress[]; url: URL };
export type PinnedEndpointResponse = {
  headers: Readonly<Record<string, string | undefined>>;
  responseTooLarge: boolean;
  status: number;
};
export type EndpointRequester = (options: {
  body?: string;
  destination: ResolvedEndpoint;
  headers: Readonly<Record<string, string>>;
  maxResponseBytes: number;
  method: "GET" | "HEAD" | "POST";
  timeoutMilliseconds: number;
}) => Promise<PinnedEndpointResponse>;
export type MonitorTestEvidence = {
  code: "http_response" | "network_error" | "response_too_large" | "too_many_redirects";
  durationMilliseconds: number;
  finalOrigin: string;
  httpStatusCode: number | null;
  ok: boolean;
  redirectCount: number;
  summary: string;
};

export class EndpointPolicyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "credentials_not_allowed"
      | "dns_resolution_failed"
      | "forbidden_address"
      | "forbidden_header"
      | "forbidden_port"
      | "invalid_url"
      | "sensitive_query_parameter"
      | "unsupported_protocol",
  ) {
    super(message);
    this.name = "EndpointPolicyError";
  }
}

function isForbiddenIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return true;
  const [a, b, c] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6Groups(address: string): number[] {
  const normalized = address.toLowerCase().split("%")[0]!;
  const [head = "", tail = ""] = normalized.split("::");
  const parseSide = (side: string) =>
    side ? side.split(":").map((part) => Number.parseInt(part, 16)) : [];
  const left = parseSide(head);
  const right = parseSide(tail);
  return [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
}

function isForbiddenIpv6(address: string): boolean {
  const mappedAddress = address
    .toLowerCase()
    .split("%")[0]!
    .match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedAddress) return isForbiddenIpv4(mappedAddress);
  const groups = parseIpv6Groups(address);
  if (groups.length !== 8 || groups.some((value) => !Number.isInteger(value))) return true;
  const first = groups[0]!;
  const isUnspecifiedOrLoopback = groups.slice(0, 7).every((value) => value === 0);
  const isMappedIpv4 = groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff;
  if (isMappedIpv4) {
    const high = groups[6]!;
    const low = groups[7]!;
    return isForbiddenIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return (
    isUnspecifiedOrLoopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && groups[1] === 0x0db8)
  );
}

export function isForbiddenAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? isForbiddenIpv4(address) : family === 6 ? isForbiddenIpv6(address) : true;
}

export function validateRequestHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim().toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) ||
      forbiddenHeaderNames.has(name) ||
      !allowedHeaderNames.has(name)
    ) {
      throw new EndpointPolicyError(`Request header ${rawName} is not allowed`, "forbidden_header");
    }
    if (/\r|\n/.test(rawValue)) {
      throw new EndpointPolicyError(
        `Request header ${rawName} contains invalid characters`,
        "forbidden_header",
      );
    }
    safe[name] = rawValue;
  }
  return safe;
}

export function normalizeEndpointUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EndpointPolicyError("Endpoint must be a valid absolute URL", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EndpointPolicyError(
      "Only HTTP and HTTPS endpoints are supported",
      "unsupported_protocol",
    );
  }
  if (url.username || url.password) {
    throw new EndpointPolicyError(
      "Embedded endpoint credentials are not allowed",
      "credentials_not_allowed",
    );
  }
  if (!allowedPorts.has(url.port)) {
    throw new EndpointPolicyError(
      "Only standard HTTP and HTTPS ports are allowed",
      "forbidden_port",
    );
  }
  for (const key of url.searchParams.keys()) {
    if (/(?:api[-_]?key|auth|password|secret|signature|token)/i.test(key)) {
      throw new EndpointPolicyError(
        "Endpoint query parameters must not contain credentials or secrets",
        "sensitive_query_parameter",
      );
    }
  }
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  return url;
}

export const systemResolver: EndpointResolver = async (hostname) => {
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => reject(new Error("DNS resolution timed out")), 5_000);
        timeout.unref();
      }),
    ]);
    return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
  } catch {
    throw new EndpointPolicyError(
      "Endpoint hostname could not be resolved",
      "dns_resolution_failed",
    );
  }
};

export async function validateEndpointDestination(
  value: string,
  resolver: EndpointResolver = systemResolver,
): Promise<URL> {
  return (await resolveEndpointDestination(value, resolver)).url;
}

export async function resolveEndpointDestination(
  value: string,
  resolver: EndpointResolver = systemResolver,
): Promise<ResolvedEndpoint> {
  const url = normalizeEndpointUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await resolver(hostname);
  if (addresses.length === 0) {
    throw new EndpointPolicyError(
      "Endpoint hostname returned no addresses",
      "dns_resolution_failed",
    );
  }
  if (addresses.some(({ address }) => isForbiddenAddress(address))) {
    throw new EndpointPolicyError(
      "Endpoint resolves to a prohibited network address",
      "forbidden_address",
    );
  }
  return { addresses, url };
}

export function createPinnedLookup(address: EndpointAddress): LookupFunction {
  return (_hostname, _options, callback) => callback(null, address.address, address.family);
}

export const requestPinnedEndpoint: EndpointRequester = async (options) => {
  const address = options.destination.addresses[0];
  if (!address) {
    throw new EndpointPolicyError(
      "Endpoint hostname returned no addresses",
      "dns_resolution_failed",
    );
  }
  const transport = options.destination.url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<PinnedEndpointResponse>((resolve, reject) => {
    let settled = false;
    const finish = (result: PinnedEndpointResponse) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const request = transport(
      options.destination.url,
      {
        agent: false,
        family: address.family,
        headers: options.headers,
        lookup: createPinnedLookup(address),
        method: options.method,
        signal: AbortSignal.timeout(options.timeoutMilliseconds),
      },
      (response) => {
        const headers: Record<string, string | undefined> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          headers[name] = Array.isArray(value) ? value.join(", ") : value;
        }
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.byteLength;
          if (received > options.maxResponseBytes) {
            response.destroy();
            finish({
              headers,
              responseTooLarge: true,
              status: response.statusCode ?? 0,
            });
          }
        });
        response.on("end", () => {
          finish({
            headers,
            responseTooLarge: false,
            status: response.statusCode ?? 0,
          });
        });
        response.on("error", (error) => {
          if (!settled) reject(error);
        });
      },
    );
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
};

export async function runSafeMonitorTest(options: {
  endpointUrl: string;
  headers?: Readonly<Record<string, string>>;
  maxRedirects?: number;
  maxResponseBytes?: number;
  method: "GET" | "HEAD";
  resolver?: EndpointResolver;
  requester?: EndpointRequester;
  timeoutMilliseconds: number;
}): Promise<MonitorTestEvidence> {
  const startedAt = performance.now();
  const maxRedirects = options.maxRedirects ?? 3;
  const maxResponseBytes = options.maxResponseBytes ?? 65_536;
  const headers = validateRequestHeaders(options.headers ?? {});
  const requester = options.requester ?? requestPinnedEndpoint;
  let currentUrl = options.endpointUrl;
  let redirectCount = 0;

  try {
    while (true) {
      const destination = await resolveEndpointDestination(currentUrl, options.resolver);
      const response = await requester({
        destination,
        headers,
        maxResponseBytes,
        method: options.method,
        timeoutMilliseconds: options.timeoutMilliseconds,
      });
      const location = response.headers.location;
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirectCount >= maxRedirects) {
          return evidence(
            "too_many_redirects",
            false,
            response.status,
            destination.url.href,
            redirectCount,
            startedAt,
            "Endpoint exceeded the redirect limit",
          );
        }
        currentUrl = new URL(location, destination.url).href;
        redirectCount += 1;
        continue;
      }

      if (response.responseTooLarge) {
        return evidence(
          "response_too_large",
          false,
          response.status,
          destination.url.href,
          redirectCount,
          startedAt,
          "Endpoint response exceeded the safe byte limit",
        );
      }
      return evidence(
        "http_response",
        true,
        response.status,
        destination.url.href,
        redirectCount,
        startedAt,
        `Endpoint returned HTTP ${response.status}`,
      );
    }
  } catch (error) {
    if (error instanceof EndpointPolicyError) throw error;
    return evidence(
      "network_error",
      false,
      null,
      currentUrl,
      redirectCount,
      startedAt,
      "Endpoint request failed or timed out",
    );
  }
}

function evidence(
  code: MonitorTestEvidence["code"],
  ok: boolean,
  httpStatusCode: number | null,
  finalUrl: string,
  redirectCount: number,
  startedAt: number,
  summary: string,
): MonitorTestEvidence {
  return {
    code,
    durationMilliseconds: Math.max(0, Math.round(performance.now() - startedAt)),
    finalOrigin: new URL(finalUrl).origin,
    httpStatusCode,
    ok,
    redirectCount,
    summary,
  };
}

export function describeMonitorPolicy(policy: {
  acceptedStatusCodes: readonly { from: number; to: number }[];
  failureThreshold: number;
  intervalSeconds: number;
  recoveryThreshold: number;
  timeoutMilliseconds: number;
}): string {
  const ranges = policy.acceptedStatusCodes
    .map(({ from, to }) => (from === to ? `${from}` : `${from}-${to}`))
    .join(", ");
  return `Check every ${policy.intervalSeconds} seconds with a ${policy.timeoutMilliseconds} ms timeout. Accept HTTP ${ranges}. Confirm an outage after ${policy.failureThreshold} consecutive failures and recovery after ${policy.recoveryThreshold} consecutive successes.`;
}

export const monitoringPackageName = "@devrelay/monitoring" as const;
