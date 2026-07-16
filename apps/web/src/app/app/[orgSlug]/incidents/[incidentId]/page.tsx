import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Lock,
  Megaphone,
  MoreHorizontal,
  RadioTower,
  RotateCcw,
  Send,
} from "lucide-react";
import Link from "next/link";

import { ReconnectingState, StaleState } from "@/components/data-state";
import { IncidentLifecycleBadge, IncidentSeverityBadge } from "@/components/incident-badges";
import { IncidentComposers } from "@/components/incident-composers";
import { PageHeader } from "@/components/page-header";
import { Timeline, TimelineEvent } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { incidentById, incidentTimeline } from "@/lib/prototype-data";

export default async function IncidentConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; incidentId: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [{ orgSlug, incidentId }, { state }] = await Promise.all([params, searchParams]);
  const incident = incidentById(incidentId);
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/status/${orgSlug}/incidents/${incident.id}`}>
                <ExternalLink aria-hidden="true" />
                Public status
              </Link>
            </Button>
            <Button variant="outline">
              <MoreHorizontal aria-hidden="true" />
              More
            </Button>
            <Button>
              <CheckCircle2 aria-hidden="true" />
              Resolve
            </Button>
          </>
        }
        description={`${incident.services.join(" and ")} · Active for ${incident.duration} · Monitor-confirmed`}
        title={incident.title}
      />
      <div className="flex flex-wrap items-center gap-2">
        <IncidentSeverityBadge severity={incident.severity} />
        <IncidentLifecycleBadge lifecycle={incident.lifecycle} />
        <span className="flex items-center gap-1.5 text-sm text-text-secondary">
          <RadioTower aria-hidden="true" className="size-4" />
          Live · updated 18 seconds ago
        </span>
      </div>
      {state === "reconnecting" ? <ReconnectingState /> : null}
      {state === "stale" ? <StaleState lastUpdated="14:32 UTC" /> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <IncidentComposers />
          <section aria-labelledby="timeline-title">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold" id="timeline-title">
                  Authoritative timeline
                </h2>
                <p aria-live="polite" className="mt-1 text-sm text-text-secondary">
                  All transitions, evidence, communication, and delivery events.
                </p>
              </div>
              <Button size="sm" variant="outline">
                <RotateCcw aria-hidden="true" />
                Refresh
              </Button>
            </div>
            <Timeline>
              {incidentTimeline.map((event) => (
                <TimelineEvent
                  icon={event.visibility === "public" ? Megaphone : Lock}
                  key={event.id}
                  label={event.visibility === "public" ? "Public update" : "Internal only"}
                  timestamp={event.timestamp}
                  title={event.title}
                  tone={event.visibility === "public" ? "public" : "private"}
                >
                  <p>{event.description}</p>
                  {event.visibility === "public" ? (
                    <p className="mt-2 flex items-center gap-2 text-xs">
                      <Send aria-hidden="true" className="size-3.5" />
                      Delivered to 1,248 destinations
                    </p>
                  ) : null}
                </TimelineEvent>
              ))}
            </Timeline>
          </section>
        </div>
        <aside aria-label="Incident metadata" className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Incident details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="mt-1">Monitor policy</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Incident ID</dt>
                  <dd className="mt-1 font-mono text-xs">{incident.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Affected services</dt>
                  <dd className="mt-1">{incident.services.join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Commander</dt>
                  <dd className="mt-1">Neev A.</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Delivery summary</CardTitle>
              <CardDescription>Latest public update</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums">1,248</p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl font-semibold tabular-nums">3</p>
                  <p className="text-xs text-muted-foreground">Retrying</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Related service state</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between">
                  <span>API Gateway</span>
                  <span className="text-[var(--status-partial-fg)]">Partial outage</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Checkout</span>
                  <span className="text-[var(--status-degraded-fg)]">Degraded</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Button className="w-full" variant="outline">
            <Activity aria-hidden="true" />
            Open postmortem draft
          </Button>
        </aside>
      </div>
    </div>
  );
}
