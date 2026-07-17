import { CalendarClock, Clock3, RadioTower } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { type OperationalStatus, StatusBadge } from "@/components/operational-status";
import { StatusLiveRefresh } from "@/components/status-live-refresh";
import { StatusPageHeader } from "@/components/status-page-header";
import { StatusSubscriptionForm } from "@/components/status-subscription-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StatusData = {
  activeIncidents: {
    lifecycle: string;
    severity: string;
    services: string[];
    slug: string;
    summary: string;
    title: string;
    updatedAt: string;
  }[];
  description: string | null;
  lastUpdated: string;
  maintenance: {
    description: string;
    endsAt: string;
    services: string[];
    startsAt: string;
    title: string;
  }[];
  overallState: string;
  recentIncidents: { resolvedAt: string; severity: string; slug: string; title: string }[];
  services: { description: string | null; name: string; state: string; updatedAt: string }[];
  slug: string;
  stale: boolean;
  title: string;
};

const tone: Record<OperationalStatus, string> = {
  operational: "border-[var(--status-operational-border)] bg-[var(--status-operational-bg)]",
  partial_outage: "border-[var(--status-partial-border)] bg-[var(--status-partial-bg)]",
  major_outage: "border-[var(--status-major-border)] bg-[var(--status-major-bg)]",
  degraded: "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)]",
  maintenance: "border-[var(--status-maintenance-border)] bg-[var(--status-maintenance-bg)]",
  unknown: "border-[var(--status-unknown-border)] bg-[var(--status-unknown-bg)]",
};
function uiState(state: string): OperationalStatus {
  return state === "degraded_performance"
    ? "degraded"
    : state === "under_maintenance"
      ? "maintenance"
      : (state as OperationalStatus);
}
function stateTitle(state: OperationalStatus) {
  return state === "operational"
    ? "All systems operational"
    : state === "unknown"
      ? "Current status is unknown"
      : state === "maintenance"
        ? "Scheduled maintenance"
        : `${state.replaceAll("_", " ")} in progress`;
}
async function load(slug: string): Promise<StatusData | null> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/status/${slug}`,
      { cache: "no-store" },
    );
    return response.ok ? ((await response.json()) as StatusData) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ statusPageSlug: string }>;
}): Promise<Metadata> {
  const { statusPageSlug } = await params;
  const data = await load(statusPageSlug);
  return {
    title: data ? `${data.title} · DevRelay` : "Status page · DevRelay",
    description: data?.description ?? "Current service availability and incident updates.",
    openGraph: {
      title: data?.title ?? "Service status",
      description: data?.description ?? "Current service availability and incident updates.",
      type: "website",
    },
  };
}

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ statusPageSlug: string }>;
}) {
  const { statusPageSlug } = await params;
  const data = await load(statusPageSlug);
  if (!data) notFound();
  const overall = uiState(data.overallState);
  return (
    <div className="min-h-screen bg-background">
      <StatusPageHeader slug={statusPageSlug} title={data.title} />
      <main className="mx-auto max-w-[960px] space-y-10 px-4 py-10 sm:px-6 sm:py-14">
        <section
          aria-labelledby="overall-status-title"
          className={`rounded-xl border p-5 sm:p-6 ${tone[overall]}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Current status
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight" id="overall-status-title">
                {stateTitle(overall)}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {data.description}
              </p>
            </div>
            <StatusBadge className="self-start" status={overall} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t pt-4">
            <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-3.5" />
              Last updated{" "}
              <time dateTime={data.lastUpdated}>
                {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(data.lastUpdated),
                )}
              </time>
            </p>
            <StatusLiveRefresh slug={statusPageSlug} />
          </div>
          {data.stale ? (
            <p className="mt-3 rounded-md border border-[var(--status-unknown-border)] bg-[var(--status-unknown-bg)] p-3 text-sm text-[var(--status-unknown-fg)]">
              Status data may be stale. Unknown services are not assumed healthy.
            </p>
          ) : null}
        </section>
        {data.activeIncidents.length ? (
          <section aria-labelledby="active-incidents-title">
            <h2 className="mb-4 text-2xl font-semibold" id="active-incidents-title">
              Active incidents
            </h2>
            <div className="space-y-4">
              {data.activeIncidents.map((incident) => (
                <Card className="border-[var(--status-partial-border)]" key={incident.slug}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle>{incident.title}</CardTitle>
                        <CardDescription>
                          {incident.services.join(" · ")} ·{" "}
                          {incident.lifecycle.replaceAll("_", " ")}
                        </CardDescription>
                      </div>
                      <StatusBadge status={uiState(incident.severity)} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-text-secondary">{incident.summary}</p>
                    <Link
                      className="mt-4 inline-flex text-sm font-medium text-text-link"
                      href={`/status/${statusPageSlug}/incidents/${incident.slug}`}
                    >
                      View incident details →
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
        <section aria-labelledby="services-status-title">
          <h2 className="mb-4 text-2xl font-semibold" id="services-status-title">
            Services
          </h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            {data.services.length ? (
              data.services.map((service) => (
                <article className="border-b p-5 last:border-b-0" key={service.name}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{service.name}</h3>
                      {service.description ? (
                        <p className="mt-1 text-sm text-text-secondary">{service.description}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={uiState(service.state)} />
                  </div>
                </article>
              ))
            ) : (
              <p className="p-5 text-sm text-text-secondary">
                No public services have been configured.
              </p>
            )}
          </div>
        </section>
        {data.maintenance.length ? (
          <section aria-labelledby="maintenance-title">
            <h2 className="mb-4 text-2xl font-semibold" id="maintenance-title">
              Scheduled maintenance
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {data.maintenance.map((window) => (
                <Card key={`${window.title}-${window.startsAt}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarClock aria-hidden="true" className="size-5 text-primary" />
                      {window.title}
                    </CardTitle>
                    <CardDescription>
                      <time dateTime={window.startsAt}>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(window.startsAt))}
                      </time>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-text-secondary">
                    {window.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
        {data.recentIncidents.length ? (
          <section aria-labelledby="recent-title">
            <h2 className="mb-4 text-2xl font-semibold" id="recent-title">
              Recently resolved
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {data.recentIncidents.map((incident) => (
                <li
                  className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={incident.slug}
                >
                  <Link
                    className="font-medium text-text-link"
                    href={`/status/${statusPageSlug}/incidents/${incident.slug}`}
                  >
                    {incident.title}
                  </Link>
                  <time
                    className="font-mono text-xs text-muted-foreground"
                    dateTime={incident.resolvedAt}
                  >
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(incident.resolvedAt))}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section
          aria-labelledby="subscribe-title"
          className="rounded-xl border bg-card p-5 sm:p-6"
          id="subscribe"
        >
          <h2 className="text-xl font-semibold" id="subscribe-title">
            Get status updates
          </h2>
          <p className="mb-4 mt-1 text-sm text-text-secondary">
            Receive accessible email updates when incidents or maintenance affect these services.
          </p>
          <StatusSubscriptionForm slug={statusPageSlug} />
        </section>
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-[960px] flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <RadioTower aria-hidden="true" className="size-3.5" />
            Authoritative status from DevRelay
          </span>
          <span>Powered by DevRelay</span>
        </div>
      </footer>
    </div>
  );
}
