import { Activity, CircleCheck, Crosshair, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const lifecycleConfig = {
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
} as const;

export type IncidentLifecycle = keyof typeof lifecycleConfig;

export function IncidentLifecycleBadge({ lifecycle }: { lifecycle: IncidentLifecycle }) {
  const definition = lifecycleConfig[lifecycle];
  const Icon = definition.icon;
  return (
    <Badge className={`gap-1.5 border ${definition.className}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {lifecycle}
    </Badge>
  );
}

export function IncidentSeverityBadge({ severity }: { severity: "SEV-1" | "SEV-2" | "SEV-3" }) {
  const className =
    severity === "SEV-1"
      ? "border-[var(--status-major-border)] bg-[var(--status-major-bg)] text-[var(--status-major-fg)]"
      : severity === "SEV-2"
        ? "border-[var(--status-partial-border)] bg-[var(--status-partial-bg)] text-[var(--status-partial-fg)]"
        : "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] text-[var(--status-degraded-fg)]";
  return <Badge className={`border font-mono ${className}`}>{severity}</Badge>;
}
