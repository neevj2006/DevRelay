import type { OperationalStatus } from "@/components/operational-status";

export type PrototypeService = {
  id: string;
  name: string;
  endpoint: string;
  status: OperationalStatus;
  availability: number;
  latencyMs: number;
  monitors: number;
  lastCheck: string;
};

export const prototypeServices: ReadonlyArray<PrototypeService> = [
  {
    id: "svc-api",
    name: "API Gateway",
    endpoint: "https://api.acme.test/health",
    status: "partial_outage",
    availability: 99.82,
    latencyMs: 684,
    monitors: 2,
    lastCheck: "18 seconds ago",
  },
  {
    id: "svc-checkout",
    name: "Checkout",
    endpoint: "https://checkout.acme.test/health",
    status: "degraded",
    availability: 99.91,
    latencyMs: 412,
    monitors: 1,
    lastCheck: "22 seconds ago",
  },
  {
    id: "svc-dashboard",
    name: "Customer dashboard",
    endpoint: "https://app.acme.test",
    status: "operational",
    availability: 99.99,
    latencyMs: 186,
    monitors: 1,
    lastCheck: "12 seconds ago",
  },
  {
    id: "svc-webhooks",
    name: "Webhook delivery",
    endpoint: "https://hooks.acme.test/health",
    status: "operational",
    availability: 99.97,
    latencyMs: 221,
    monitors: 1,
    lastCheck: "31 seconds ago",
  },
];

export const latencySeries = [
  { time: "09:00", latency: 178, failures: 0 },
  { time: "10:00", latency: 193, failures: 0 },
  { time: "11:00", latency: 205, failures: 0 },
  { time: "12:00", latency: 238, failures: 1 },
  { time: "13:00", latency: 522, failures: 8 },
  { time: "14:00", latency: 684, failures: 14 },
  { time: "15:00", latency: 438, failures: 3 },
] as const;

export type PrototypeIncident = {
  id: string;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3";
  lifecycle: "Investigating" | "Identified" | "Monitoring" | "Resolved";
  services: ReadonlyArray<string>;
  duration: string;
  updatedAt: string;
};

export const prototypeIncidents: ReadonlyArray<PrototypeIncident> = [
  {
    id: "inc-api-errors",
    title: "Elevated API 5xx responses",
    severity: "SEV-2",
    lifecycle: "Monitoring",
    services: ["API Gateway", "Checkout"],
    duration: "24m",
    updatedAt: "2 minutes ago",
  },
  {
    id: "inc-webhook-delay",
    title: "Delayed webhook deliveries",
    severity: "SEV-3",
    lifecycle: "Resolved",
    services: ["Webhook delivery"],
    duration: "41m",
    updatedAt: "Yesterday",
  },
  {
    id: "inc-dashboard-auth",
    title: "Dashboard sign-in failures",
    severity: "SEV-2",
    lifecycle: "Resolved",
    services: ["Customer dashboard"],
    duration: "19m",
    updatedAt: "Jul 14",
  },
];

export const incidentTimeline = [
  {
    id: "evt-monitoring",
    title: "Incident moved to Monitoring",
    timestamp: "14:32 UTC",
    visibility: "internal" as const,
    description:
      "Traffic has shifted to the healthy pool. Recovery policy requires three successful checks.",
  },
  {
    id: "evt-public",
    title: "Recovery is underway",
    timestamp: "14:26 UTC",
    visibility: "public" as const,
    description: "We have shifted traffic and are seeing recovery. We continue to monitor.",
  },
  {
    id: "evt-note",
    title: "Primary pool isolated",
    timestamp: "14:23 UTC",
    visibility: "internal" as const,
    description:
      "The on-call engineer isolated the unhealthy pool after confirming elevated upstream resets.",
  },
  {
    id: "evt-detected",
    title: "Incident confirmed by policy",
    timestamp: "14:18 UTC",
    visibility: "internal" as const,
    description: "Three consecutive failed checks crossed the API Gateway failure threshold.",
  },
];

export function serviceById(id: string) {
  return prototypeServices.find((service) => service.id === id) ?? prototypeServices[0]!;
}

export function incidentById(id: string) {
  return prototypeIncidents.find((incident) => incident.id === id) ?? prototypeIncidents[0]!;
}
