import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Gauge,
  type LucideIcon,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const operationalStatuses = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
  "unknown",
] as const;

export type OperationalStatus = (typeof operationalStatuses)[number];

type StatusDefinition = {
  label: string;
  icon: LucideIcon;
  className: string;
};

export const operationalStatusConfig: Record<OperationalStatus, StatusDefinition> = {
  operational: {
    label: "Operational",
    icon: CircleCheck,
    className:
      "border-[var(--status-operational-border)] bg-[var(--status-operational-bg)] text-[var(--status-operational-fg)]",
  },
  degraded: {
    label: "Degraded performance",
    icon: Gauge,
    className:
      "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] text-[var(--status-degraded-fg)]",
  },
  partial_outage: {
    label: "Partial outage",
    icon: TriangleAlert,
    className:
      "border-[var(--status-partial-border)] bg-[var(--status-partial-bg)] text-[var(--status-partial-fg)]",
  },
  major_outage: {
    label: "Major outage",
    icon: CircleX,
    className:
      "border-[var(--status-major-border)] bg-[var(--status-major-bg)] text-[var(--status-major-fg)]",
  },
  maintenance: {
    label: "Under maintenance",
    icon: Wrench,
    className:
      "border-[var(--status-maintenance-border)] bg-[var(--status-maintenance-bg)] text-[var(--status-maintenance-fg)]",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    className:
      "border-[var(--status-unknown-border)] bg-[var(--status-unknown-bg)] text-[var(--status-unknown-fg)]",
  },
};

export function StatusIcon({
  status,
  className,
}: {
  status: OperationalStatus;
  className?: string;
}) {
  const definition = operationalStatusConfig[status];
  const Icon = definition.icon;
  return <Icon aria-label={definition.label} className={cn("size-4", className)} role="img" />;
}

export function StatusBadge({
  status,
  className,
}: {
  status: OperationalStatus;
  className?: string;
}) {
  const definition = operationalStatusConfig[status];
  const Icon = definition.icon;
  return (
    <Badge
      className={cn(
        "gap-1.5 rounded-full border px-2.5 py-1 font-semibold",
        definition.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {definition.label}
    </Badge>
  );
}
