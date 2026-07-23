import { lookup, resolve4, resolve6, resolveCname, resolveMx, resolveTxt } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";

import type { DnsMonitorConfiguration, TlsMonitorConfiguration } from "@devrelay/contracts";

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

export type TlsMonitorTestEvidence = {
  code:
    | "certificate_expired"
    | "certificate_invalid"
    | "hostname_mismatch"
    | "network_error"
    | "tls_valid"
    | "tls_warning"
    | "unsupported_tls_version";
  daysUntilExpiry: number | null;
  durationMilliseconds: number;
  expiresAt: string | null;
  ok: boolean;
  summary: string;
  tlsVersion: "TLSv1.2" | "TLSv1.3" | null;
};

export type DnsMonitorTestEvidence = {
  code:
    | "dns_malformed_response"
    | "dns_nodata"
    | "dns_nxdomain"
    | "dns_record_limit_exceeded"
    | "dns_resolver_failure"
    | "dns_servfail"
    | "dns_timeout"
    | "dns_txt_limit_exceeded"
    | "dns_valid"
    | "unexpected_dns_records";
  durationMilliseconds: number;
  observedRecordCount: number;
  ok: boolean;
  recordType: DnsMonitorConfiguration["recordType"];
  summary: string;
};

export type DnsResolver = {
  resolve4(hostname: string): Promise<readonly string[]>;
  resolve6(hostname: string): Promise<readonly string[]>;
  resolveCname(hostname: string): Promise<readonly string[]>;
  resolveMx(hostname: string): Promise<readonly { exchange: string; priority: number }[]>;
  resolveTxt(hostname: string): Promise<readonly (readonly string[])[]>;
};

export type TlsHandshakeRequester = (
  destination: ResolvedEndpoint,
  timeoutMilliseconds: number,
) => Promise<{ expiresAt: Date | null; tlsVersion: string | null }>;

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

export async function runSafeTlsMonitorTest(options: {
  configuration: TlsMonitorConfiguration;
  requester?: TlsHandshakeRequester;
  resolver?: EndpointResolver;
  timeoutMilliseconds: number;
}): Promise<TlsMonitorTestEvidence> {
  const startedAt = performance.now();
  try {
    const destination = await resolveEndpointDestination(
      options.configuration.endpointUrl,
      options.resolver,
    );
    if (destination.url.protocol !== "https:" || !["", "443"].includes(destination.url.port)) {
      throw new EndpointPolicyError(
        "TLS monitors require an HTTPS endpoint on port 443",
        "unsupported_protocol",
      );
    }
    const result = await (options.requester ?? requestTlsHandshake)(
      destination,
      options.timeoutMilliseconds,
    );
    const durationMilliseconds = elapsedMilliseconds(startedAt);
    if (result.tlsVersion !== "TLSv1.2" && result.tlsVersion !== "TLSv1.3") {
      return tlsEvidence(
        "unsupported_tls_version",
        false,
        durationMilliseconds,
        null,
        null,
        `The endpoint negotiated unsupported TLS ${result.tlsVersion ?? "version"}`,
      );
    }
    if (!result.expiresAt || Number.isNaN(result.expiresAt.getTime())) {
      return tlsEvidence(
        "certificate_invalid",
        false,
        durationMilliseconds,
        result.tlsVersion,
        null,
        "The endpoint did not provide a valid certificate expiry",
      );
    }
    const daysUntilExpiry = Math.floor((result.expiresAt.getTime() - Date.now()) / 86_400_000);
    if (daysUntilExpiry < 0) {
      return tlsEvidence(
        "certificate_expired",
        false,
        durationMilliseconds,
        result.tlsVersion,
        result.expiresAt,
        "The endpoint certificate has expired",
      );
    }
    const warning = daysUntilExpiry <= options.configuration.expiryWarningDays;
    return tlsEvidence(
      warning ? "tls_warning" : "tls_valid",
      true,
      durationMilliseconds,
      result.tlsVersion,
      result.expiresAt,
      warning
        ? `The endpoint certificate expires in ${daysUntilExpiry} days`
        : "The endpoint TLS certificate is valid",
    );
  } catch (error) {
    if (error instanceof EndpointPolicyError) throw error;
    return tlsEvidence(
      tlsErrorCode(error),
      false,
      elapsedMilliseconds(startedAt),
      null,
      null,
      "The TLS connection or certificate validation failed",
    );
  }
}

export async function runSafeDnsMonitorTest(options: {
  configuration: DnsMonitorConfiguration;
  resolver?: DnsResolver;
  timeoutMilliseconds: number;
}): Promise<DnsMonitorTestEvidence> {
  const startedAt = performance.now();
  const resolver = options.resolver ?? systemDnsResolver;
  try {
    const observed = await resolveDnsRecords(
      options.configuration,
      resolver,
      options.timeoutMilliseconds,
    );
    if (observed.length > 32)
      return dnsEvidence(options.configuration, "dns_record_limit_exceeded", 0, false, startedAt);
    if (
      options.configuration.recordType === "TXT" &&
      observed.some(
        (record) =>
          new TextEncoder().encode(typeof record === "string" ? record : "").byteLength > 1024,
      )
    ) {
      return dnsEvidence(
        options.configuration,
        "dns_txt_limit_exceeded",
        observed.length,
        false,
        startedAt,
      );
    }
    const matches = sameRecordSet(options.configuration.expectedRecords, observed);
    return dnsEvidence(
      options.configuration,
      matches ? "dns_valid" : "unexpected_dns_records",
      observed.length,
      matches,
      startedAt,
    );
  } catch (error) {
    return dnsEvidence(options.configuration, dnsErrorCode(error), 0, false, startedAt);
  }
}

const systemDnsResolver: DnsResolver = { resolve4, resolve6, resolveCname, resolveMx, resolveTxt };

const requestTlsHandshake: TlsHandshakeRequester = async (
  destination: ResolvedEndpoint,
  timeoutMilliseconds: number,
): Promise<{ expiresAt: Date | null; tlsVersion: string | null }> => {
  const address = destination.addresses[0];
  if (!address)
    throw new EndpointPolicyError(
      "Endpoint hostname returned no addresses",
      "dns_resolution_failed",
    );
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      destination.url,
      {
        agent: false,
        family: address.family,
        lookup: createPinnedLookup(address),
        method: "HEAD",
        servername: destination.url.hostname,
        signal: AbortSignal.timeout(timeoutMilliseconds),
      },
      (response) => {
        const socket = response.socket as TLSSocket;
        const certificate = socket.getPeerCertificate() as { valid_to?: string };
        response.resume();
        response.on("end", () =>
          resolve({
            expiresAt: certificate.valid_to ? new Date(certificate.valid_to) : null,
            tlsVersion: socket.getProtocol(),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
};

async function resolveDnsRecords(
  configuration: DnsMonitorConfiguration,
  resolver: DnsResolver,
  timeoutMilliseconds: number,
): Promise<readonly unknown[]> {
  const hostname = configuration.hostname;
  const deadline = new Promise<never>((_, reject) => {
    const timeout = setTimeout(
      () => reject(Object.assign(new Error("DNS resolution timed out"), { code: "ETIMEOUT" })),
      timeoutMilliseconds,
    );
    timeout.unref();
  });
  const result =
    configuration.recordType === "A"
      ? resolver.resolve4(hostname)
      : configuration.recordType === "AAAA"
        ? resolver.resolve6(hostname)
        : configuration.recordType === "CNAME"
          ? resolver.resolveCname(hostname)
          : configuration.recordType === "MX"
            ? resolver.resolveMx(hostname)
            : resolver
                .resolveTxt(hostname)
                .then((records) => records.map((segments) => segments.join("")));
  const records: readonly unknown[] = await Promise.race([result, deadline]);
  if (configuration.recordType === "CNAME")
    return (records as readonly string[]).map(normalizeDnsHostname);
  if (configuration.recordType === "MX")
    return (records as readonly { exchange: string; priority: number }[]).map((record) => ({
      exchange: normalizeDnsHostname(record.exchange),
      priority: record.priority,
    }));
  return records;
}

function normalizeDnsHostname(hostname: string): string {
  return `${hostname.replace(/\.$/, "").toLowerCase()}.`;
}

function sameRecordSet(expected: readonly unknown[], observed: readonly unknown[]): boolean {
  const serialize = (value: unknown) => JSON.stringify(value);
  return (
    expected.length === observed.length &&
    [...new Set(expected.map(serialize))].length === expected.length &&
    [...new Set(observed.map(serialize))].length === observed.length &&
    expected.every((value) => new Set(observed.map(serialize)).has(serialize(value)))
  );
}

function tlsErrorCode(error: unknown): TlsMonitorTestEvidence["code"] {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "CERT_HAS_EXPIRED") return "certificate_expired";
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return "hostname_mismatch";
  if (typeof code === "string" && code.includes("CERT")) return "certificate_invalid";
  return "network_error";
}

function dnsErrorCode(error: unknown): DnsMonitorTestEvidence["code"] {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "ENOTFOUND") return "dns_nxdomain";
  if (code === "ENODATA") return "dns_nodata";
  if (code === "ESERVFAIL") return "dns_servfail";
  if (code === "ETIMEOUT") return "dns_timeout";
  if (code === "EBADRESP") return "dns_malformed_response";
  return "dns_resolver_failure";
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function tlsEvidence(
  code: TlsMonitorTestEvidence["code"],
  ok: boolean,
  durationMilliseconds: number,
  tlsVersion: TlsMonitorTestEvidence["tlsVersion"],
  expiresAt: Date | null,
  summary: string,
): TlsMonitorTestEvidence {
  return {
    code,
    daysUntilExpiry: expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null,
    durationMilliseconds,
    expiresAt: expiresAt?.toISOString() ?? null,
    ok,
    summary,
    tlsVersion,
  };
}

function dnsEvidence(
  configuration: DnsMonitorConfiguration,
  code: DnsMonitorTestEvidence["code"],
  observedRecordCount: number,
  ok: boolean,
  startedAt: number,
): DnsMonitorTestEvidence {
  return {
    code,
    durationMilliseconds: elapsedMilliseconds(startedAt),
    observedRecordCount,
    ok,
    recordType: configuration.recordType,
    summary:
      code === "dns_valid"
        ? `DNS ${configuration.recordType} records match the expected set`
        : `DNS ${configuration.recordType} check did not produce the expected result`,
  };
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
