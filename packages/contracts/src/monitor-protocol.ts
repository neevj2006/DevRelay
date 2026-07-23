import { z } from "zod";

import { dnsRecordTypeValues, monitorMethodValues, monitorTypeValues } from "./enums.js";

const httpEndpointSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP and HTTPS endpoints are supported");

const tlsEndpointSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && (url.port === "" || url.port === "443");
}, "TLS monitors require an HTTPS endpoint on port 443");

const dnsHostnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}\.?$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\.?$/,
    "Enter a fully qualified DNS hostname",
  )
  .transform((value) => `${value.replace(/\.$/, "").toLowerCase()}.`);

const absoluteHostnameSchema = dnsHostnameSchema;
const ipv4AddressSchema = z.ipv4();
const ipv6AddressSchema = z.ipv6();
const txtRecordSchema = z.string().min(1).max(1024);

const dnsAConfigurationSchema = z.strictObject({
  expectedRecords: z.array(ipv4AddressSchema).min(1).max(32),
  hostname: dnsHostnameSchema,
  recordType: z.literal("A"),
  timeoutMilliseconds: z.number().int().min(1000).max(15_000).default(5000),
  type: z.literal("dns"),
});

const dnsAaaaConfigurationSchema = z.strictObject({
  expectedRecords: z.array(ipv6AddressSchema).min(1).max(32),
  hostname: dnsHostnameSchema,
  recordType: z.literal("AAAA"),
  timeoutMilliseconds: z.number().int().min(1000).max(15_000).default(5000),
  type: z.literal("dns"),
});

const dnsCnameConfigurationSchema = z.strictObject({
  expectedRecords: z.array(absoluteHostnameSchema).min(1).max(32),
  hostname: dnsHostnameSchema,
  recordType: z.literal("CNAME"),
  timeoutMilliseconds: z.number().int().min(1000).max(15_000).default(5000),
  type: z.literal("dns"),
});

const dnsMxConfigurationSchema = z.strictObject({
  expectedRecords: z
    .array(
      z.strictObject({
        exchange: absoluteHostnameSchema,
        priority: z.number().int().min(0).max(65_535),
      }),
    )
    .min(1)
    .max(32),
  hostname: dnsHostnameSchema,
  recordType: z.literal("MX"),
  timeoutMilliseconds: z.number().int().min(1000).max(15_000).default(5000),
  type: z.literal("dns"),
});

const dnsTxtConfigurationSchema = z.strictObject({
  expectedRecords: z.array(txtRecordSchema).min(1).max(32),
  hostname: dnsHostnameSchema,
  recordType: z.literal("TXT"),
  timeoutMilliseconds: z.number().int().min(1000).max(15_000).default(5000),
  type: z.literal("dns"),
});

export const httpMonitorConfigurationSchema = z.strictObject({
  endpointUrl: httpEndpointSchema,
  method: z.enum(monitorMethodValues).default("GET"),
  type: z.literal("http"),
});

export const tlsMonitorConfigurationSchema = z.strictObject({
  endpointUrl: tlsEndpointSchema,
  expiryWarningDays: z.number().int().min(1).max(365).default(30),
  timeoutMilliseconds: z.number().int().min(1000).max(30_000).default(10_000),
  type: z.literal("tls"),
});

export const dnsMonitorConfigurationSchema = z.discriminatedUnion("recordType", [
  dnsAConfigurationSchema,
  dnsAaaaConfigurationSchema,
  dnsCnameConfigurationSchema,
  dnsMxConfigurationSchema,
  dnsTxtConfigurationSchema,
]);

export const monitorProtocolConfigurationSchema = z.discriminatedUnion("type", [
  httpMonitorConfigurationSchema,
  tlsMonitorConfigurationSchema,
  dnsMonitorConfigurationSchema,
]);

export const supportedMonitorTypeSchema = z.enum(monitorTypeValues);
export const supportedDnsRecordTypeSchema = z.enum(dnsRecordTypeValues);

export type HttpMonitorConfiguration = z.infer<typeof httpMonitorConfigurationSchema>;
export type TlsMonitorConfiguration = z.infer<typeof tlsMonitorConfigurationSchema>;
export type DnsMonitorConfiguration = z.infer<typeof dnsMonitorConfigurationSchema>;
export type MonitorProtocolConfiguration = z.infer<typeof monitorProtocolConfigurationSchema>;
