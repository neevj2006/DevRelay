import { Clock3, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/operational-status";

export function HealthSummary() {
  return (
    <section
      aria-labelledby="health-summary-title"
      className="flex flex-col gap-4 rounded-xl border border-[var(--status-partial-border)] bg-[var(--status-partial-bg)] p-5 text-[var(--status-partial-fg)] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-semibold" id="health-summary-title">
            Partial outage affecting API traffic
          </h2>
          <p className="mt-1 text-sm leading-6">
            API Gateway and Checkout are recovering after elevated upstream errors.
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-xs">
            <Clock3 aria-hidden="true" className="size-3.5" />
            Evidence refreshed 18 seconds ago
          </p>
        </div>
      </div>
      <StatusBadge className="shrink-0" status="partial_outage" />
    </section>
  );
}
