import { Clock3, Megaphone } from "lucide-react";
import { notFound } from "next/navigation";

import { IncidentLifecycleBadge, IncidentSeverityBadge } from "@/components/incident-badges";
import { StatusLiveRefresh } from "@/components/status-live-refresh";
import { StatusPageHeader } from "@/components/status-page-header";
import { Timeline, TimelineEvent } from "@/components/timeline";

type PublicIncident = {
  lifecycle:
    | "detected"
    | "investigating"
    | "identified"
    | "monitoring"
    | "resolved"
    | "postmortem_published";
  resolvedAt: string | null;
  services: string[];
  severity: "degraded_performance" | "partial_outage" | "major_outage";
  startedAt: string;
  statusTitle: string;
  title: string;
  updates: { body: string; lifecycle: string; publishedAt: string }[];
};
export default async function PublicIncidentPage({
  params,
}: {
  params: Promise<{ statusPageSlug: string; incidentSlug: string }>;
}) {
  const { statusPageSlug, incidentSlug } = await params;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/status/${statusPageSlug}/incidents/${incidentSlug}`,
    { cache: "no-store" },
  );
  if (!response.ok) notFound();
  const incident = (await response.json()) as PublicIncident;
  return (
    <div className="min-h-screen bg-background">
      <StatusPageHeader slug={statusPageSlug} title={incident.statusTitle} />
      <main className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--status-partial-fg)]">
            {incident.resolvedAt ? "Resolved incident" : "Active incident"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{incident.title}</h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            {incident.services.join(" · ")} · Started{" "}
            <time dateTime={incident.startedAt}>
              {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(incident.startedAt),
              )}
            </time>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <IncidentSeverityBadge severity={incident.severity} />
            <IncidentLifecycleBadge lifecycle={incident.lifecycle} />
          </div>
        </header>
        <section aria-labelledby="public-timeline-title" className="mt-10">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold" id="public-timeline-title">
              Incident updates
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
              <Clock3 aria-hidden="true" className="size-4" />
              <StatusLiveRefresh slug={statusPageSlug} />
            </p>
          </div>
          {incident.updates.length ? (
            <Timeline label="Public incident updates">
              {incident.updates.map((update) => (
                <TimelineEvent
                  icon={Megaphone}
                  key={update.publishedAt}
                  label="Public update"
                  timestamp={new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(update.publishedAt))}
                  title={update.lifecycle.replaceAll("_", " ")}
                  tone="public"
                >
                  <p>{update.body}</p>
                </TimelineEvent>
              ))}
            </Timeline>
          ) : (
            <p className="rounded-xl border bg-card p-5 text-sm text-text-secondary">
              No public updates have been published yet.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
