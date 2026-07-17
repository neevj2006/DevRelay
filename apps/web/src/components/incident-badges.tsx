import { Activity, BookOpenCheck, CircleCheck, Crosshair, Radar, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const lifecycleConfig = {
  Detected: {
    icon: Radar,
    className: "border-border-default bg-surface-subtle text-text-secondary",
  },
  Investigating: {
    icon: Search,
    className:
      "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] text-[var(--status-degraded-fg)]",
  },
  Identified: {
    icon: Crosshair,
    className: "border-primary/30 bg-brand-soft text-brand-soft-foreground",
  },
  Monitoring: {
    icon: Activity,
    className:
      "border-[var(--status-maintenance-border)] bg-[var(--status-maintenance-bg)] text-[var(--status-maintenance-fg)]",
  },
  Resolved: {
    icon: CircleCheck,
    className:
      "border-[var(--status-operational-border)] bg-[var(--status-operational-bg)] text-[var(--status-operational-fg)]",
  },
  "Postmortem published": {
    icon: BookOpenCheck,
    className:
      "border-[var(--status-operational-border)] bg-[var(--status-operational-bg)] text-[var(--status-operational-fg)]",
  },
} as const;

export type IncidentLifecycle = keyof typeof lifecycleConfig;

export function IncidentLifecycleBadge({
  lifecycle,
}: {
  lifecycle:
    | IncidentLifecycle
    | "detected"
    | "investigating"
    | "identified"
    | "monitoring"
    | "resolved"
    | "postmortem_published";
}) {
  const label = lifecycle
    .split("_")
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ") as IncidentLifecycle;
  const definition = lifecycleConfig[label];
  const Icon = definition.icon;
  return (
    <Badge className={`gap-1.5 border ${definition.className}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Badge>
  );
}

export function IncidentSeverityBadge({
  severity,
}: {
  severity:
    "SEV-1" | "SEV-2" | "SEV-3" | "degraded_performance" | "partial_outage" | "major_outage";
}) {
  const className =
    severity === "SEV-1" || severity === "major_outage"
      ? "border-[var(--status-major-border)] bg-[var(--status-major-bg)] text-[var(--status-major-fg)]"
      : severity === "SEV-2" || severity === "partial_outage"
        ? "border-[var(--status-partial-border)] bg-[var(--status-partial-bg)] text-[var(--status-partial-fg)]"
        : "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] text-[var(--status-degraded-fg)]";
  const label = severity.startsWith("SEV") ? severity : severity.replaceAll("_", " ");
  return <Badge className={`border capitalize ${className}`}>{label}</Badge>;
}
