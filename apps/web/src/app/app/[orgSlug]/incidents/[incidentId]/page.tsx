import { Lock, Megaphone, RadioTower } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IncidentLifecycleBadge, IncidentSeverityBadge } from "@/components/incident-badges";
import { IncidentComposers } from "@/components/incident-composers";
import { IncidentTransitionActions } from "@/components/incident-transition-actions";
import { PageHeader } from "@/components/page-header";
import { Timeline, TimelineEvent } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/auth-server";
import { isPublicDemoOrganization } from "@/lib/demo";

type Incident = {
  id: string;
  lifecycle:
    | "detected"
    | "investigating"
    | "identified"
    | "monitoring"
    | "resolved"
    | "postmortem_published";
  severity: "degraded_performance" | "partial_outage" | "major_outage";
  source: string;
  startedAt: string;
  title: string;
  updatedAt: string;
  services: { id: string; name: string; currentState: string }[];
  transitions: { id: string; toLifecycle: string; reason: string; createdAt: string }[];
  publicUpdates: {
    id: string;
    body: string;
    publishedAt: string;
    deliveries: Record<string, number>;
  }[];
  privateNotes: { id: string; body: string; createdAt: string }[];
};

export default async function IncidentConsolePage({
  params,
}: {
  params: Promise<{ orgSlug: string; incidentId: string }>;
}) {
  const { orgSlug, incidentId } = await params;
  const readOnly = isPublicDemoOrganization(orgSlug);
  const response = await apiRequest(`/organizations/${orgSlug}/incidents/${incidentId}`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Incident unavailable");
  const incident = (await response.json()) as Incident;
  const timeline = [
    ...incident.transitions.map((item) => ({
      ...item,
      at: item.createdAt,
      body: item.reason,
      kind: "transition" as const,
      title: `Lifecycle changed to ${item.toLifecycle.replaceAll("_", " ")}`,
    })),
    ...incident.publicUpdates.map((item) => ({
      ...item,
      at: item.publishedAt,
      kind: "public" as const,
      title: "Customer update published",
    })),
    ...incident.privateNotes.map((item) => ({
      ...item,
      at: item.createdAt,
      kind: "private" as const,
      title: "Private responder note",
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          readOnly ? undefined : (
            <>
              <IncidentTransitionActions
                incidentId={incident.id}
                lifecycle={incident.lifecycle}
                orgSlug={orgSlug}
              />
              {(incident.lifecycle === "resolved" ||
                incident.lifecycle === "postmortem_published") && (
                <Button asChild variant="outline">
                  <Link href={`/app/${orgSlug}/incidents/${incident.id}/postmortem`}>
                    Postmortem
                  </Link>
                </Button>
              )}
            </>
          )
        }
        description={`${incident.services.map((service) => service.name).join(" and ")} · ${incident.source.replaceAll("_", " ")}`}
        title={incident.title}
      />
      <div className="flex flex-wrap items-center gap-2">
        <IncidentSeverityBadge severity={incident.severity} />
        <IncidentLifecycleBadge lifecycle={incident.lifecycle} />
        <span className="flex items-center gap-1.5 text-sm text-text-secondary">
          <RadioTower aria-hidden="true" className="size-4" />
          Authoritative database state
        </span>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {!readOnly ? (
            <IncidentComposers
              incidentId={incident.id}
              lifecycle={incident.lifecycle}
              orgSlug={orgSlug}
            />
          ) : null}
          <section aria-labelledby="timeline-title">
            <h2 className="mb-5 text-xl font-semibold" id="timeline-title">
              Authoritative timeline
            </h2>
            <Timeline>
              {timeline.map((event) => (
                <TimelineEvent
                  icon={event.kind === "public" ? Megaphone : Lock}
                  key={`${event.kind}-${event.id}`}
                  label={
                    event.kind === "public"
                      ? "Public update"
                      : event.kind === "private"
                        ? "Internal only"
                        : "Lifecycle transition"
                  }
                  timestamp={new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.at))}
                  title={event.title}
                  tone={event.kind === "public" ? "public" : "private"}
                >
                  <p>{event.body}</p>
                  {event.kind === "public" ? (
                    <p className="mt-2 text-xs">
                      Delivery state:{" "}
                      {Object.entries(event.deliveries)
                        .map(([state, count]) => `${count} ${state.replaceAll("_", " ")}`)
                        .join(", ") || "pending fan-out"}
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
                  <dd className="mt-1 capitalize">{incident.source.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Incident ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{incident.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Affected services</dt>
                  <dd className="mt-1">
                    {incident.services.map((service) => service.name).join(", ")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Related service state</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {incident.services.map((service) => (
                  <li className="flex items-center justify-between gap-3" key={service.id}>
                    <span>{service.name}</span>
                    <span className="capitalize text-text-secondary">
                      {service.currentState.replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
