import { Bell, Clock3, Megaphone } from "lucide-react";

import { IncidentLifecycleBadge, IncidentSeverityBadge } from "@/components/incident-badges";
import { StatusPageHeader } from "@/components/status-page-header";
import { Timeline, TimelineEvent } from "@/components/timeline";
import { Button } from "@/components/ui/button";

export default async function PublicIncidentPage({
  params,
}: {
  params: Promise<{ statusPageSlug: string; incidentSlug: string }>;
}) {
  const { statusPageSlug } = await params;
  return (
    <div className="min-h-screen bg-background">
      <StatusPageHeader slug={statusPageSlug} />
      <main className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--status-partial-fg)]">
            Active incident
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            Elevated API 5xx responses
          </h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            API Gateway and Checkout · Started 24 minutes ago
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <IncidentSeverityBadge severity="SEV-2" />
            <IncidentLifecycleBadge lifecycle="Monitoring" />
          </div>
        </header>
        <section aria-labelledby="public-timeline-title" className="mt-10">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold" id="public-timeline-title">
                Incident updates
              </h2>
              <p
                aria-live="polite"
                className="mt-1 flex items-center gap-2 text-sm text-text-secondary"
              >
                <Clock3 aria-hidden="true" className="size-4" />
                Live · refreshed 18 seconds ago
              </p>
            </div>
            <Button size="sm" variant="outline">
              <Bell aria-hidden="true" />
              Subscribe
            </Button>
          </div>
          <Timeline label="Public incident updates">
            <TimelineEvent
              icon={Megaphone}
              label="Public update"
              timestamp="14:26 UTC"
              title="Recovery is underway"
              tone="public"
            >
              <p>We have shifted traffic and are seeing recovery. We continue to monitor.</p>
            </TimelineEvent>
            <TimelineEvent
              icon={Megaphone}
              label="Public update"
              timestamp="14:20 UTC"
              title="Issue identified"
              tone="public"
            >
              <p>We identified unhealthy API capacity and are redirecting requests.</p>
            </TimelineEvent>
            <TimelineEvent
              icon={Megaphone}
              label="Public update"
              timestamp="14:18 UTC"
              title="Investigating elevated errors"
              tone="public"
            >
              <p>We are investigating elevated error rates affecting API requests and checkout.</p>
            </TimelineEvent>
          </Timeline>
        </section>
      </main>
    </div>
  );
}
