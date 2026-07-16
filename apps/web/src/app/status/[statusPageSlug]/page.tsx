import { Activity, CalendarClock, Clock3, RadioTower } from "lucide-react";
import Link from "next/link";

import { type OperationalStatus, StatusBadge } from "@/components/operational-status";
import { StatusPageHeader } from "@/components/status-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prototypeServices } from "@/lib/prototype-data";

const stateConfig: Record<
  string,
  { status: OperationalStatus; title: string; description: string }
> = {
  operational: {
    status: "operational",
    title: "All systems operational",
    description: "No active incidents or scheduled maintenance are affecting Acme Cloud services.",
  },
  maintenance: {
    status: "maintenance",
    title: "Scheduled maintenance in progress",
    description: "A planned database failover may cause brief API connection retries.",
  },
  stale: {
    status: "unknown",
    title: "Status evidence is stale",
    description:
      "We are reconnecting to live updates. The last known service state remains visible below.",
  },
  outage: {
    status: "partial_outage",
    title: "Partial outage",
    description: "API Gateway and Checkout are recovering after elevated upstream errors.",
  },
};

const summaryTone: Record<OperationalStatus, string> = {
  operational: "border-[var(--status-operational-border)] bg-[var(--status-operational-bg)]",
  partial_outage: "border-[var(--status-partial-border)] bg-[var(--status-partial-bg)]",
  major_outage: "border-[var(--status-major-border)] bg-[var(--status-major-bg)]",
  degraded: "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)]",
  maintenance: "border-[var(--status-maintenance-border)] bg-[var(--status-maintenance-bg)]",
  unknown: "border-[var(--status-unknown-border)] bg-[var(--status-unknown-bg)]",
};

export default async function PublicStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ statusPageSlug: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [{ statusPageSlug }, { state = "outage" }] = await Promise.all([params, searchParams]);
  const summary = stateConfig[state] ?? stateConfig.outage!;
  return (
    <div className="min-h-screen bg-background">
      <StatusPageHeader slug={statusPageSlug} />
      <main className="mx-auto max-w-[960px] space-y-10 px-4 py-10 sm:px-6 sm:py-14">
        <section
          aria-labelledby="overall-status-title"
          className={`rounded-xl border p-5 sm:p-6 ${summaryTone[summary.status]}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Current status
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight" id="overall-status-title">
                {summary.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {summary.description}
              </p>
            </div>
            <StatusBadge className="self-start" status={summary.status} />
          </div>
          <p
            aria-live="polite"
            className="mt-5 flex items-center gap-2 border-t pt-4 font-mono text-xs text-muted-foreground"
          >
            <Clock3 aria-hidden="true" className="size-3.5" />
            Live · refreshed 18 seconds ago
          </p>
        </section>
        {state !== "operational" ? (
          <section aria-labelledby="active-incidents-title">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--status-partial-fg)]">
                Active incident
              </p>
              <h2 className="mt-2 text-2xl font-semibold" id="active-incidents-title">
                Elevated API 5xx responses
              </h2>
            </div>
            <Card className="border-[var(--status-partial-border)]">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Recovery is underway</CardTitle>
                    <CardDescription>Updated 2 minutes ago · Monitoring</CardDescription>
                  </div>
                  <StatusBadge status="partial_outage" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-text-secondary">
                  We have shifted traffic and are seeing recovery. We continue to monitor.
                </p>
                <Link
                  className="mt-4 inline-flex text-sm font-medium text-text-link"
                  href={`/status/${statusPageSlug}/incidents/inc-api-errors`}
                >
                  View incident details →
                </Link>
              </CardContent>
            </Card>
          </section>
        ) : null}
        <section aria-labelledby="services-status-title">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold" id="services-status-title">
              Services
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Current state and 30-day availability.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            {prototypeServices.map((service) => (
              <article className="border-b p-5 last:border-b-0" key={service.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold">{service.name}</h3>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {service.availability.toFixed(2)}% uptime · checked {service.lastCheck}
                    </p>
                  </div>
                  <StatusBadge status={state === "operational" ? "operational" : service.status} />
                </div>
                <div
                  aria-label={`${service.name} 30-day history: 29 healthy days and one incident day`}
                  className="mt-4 grid grid-cols-[repeat(30,minmax(3px,1fr))] gap-1"
                  role="img"
                >
                  {Array.from({ length: 30 }, (_, index) => (
                    <span
                      aria-hidden="true"
                      className={`h-6 rounded-sm ${index === 27 && state !== "operational" ? "bg-[var(--status-partial-fg)]" : "bg-[var(--status-operational-fg)]"}`}
                      key={index}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock aria-hidden="true" className="size-5 text-primary" />
                Scheduled maintenance
              </CardTitle>
              <CardDescription>Saturday, 02:00–02:30 UTC</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary">
              Planned database failover; brief API retries may occur.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity aria-hidden="true" className="size-5 text-primary" />
                Recent history
              </CardTitle>
              <CardDescription>Last resolved Jul 16</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary">
              Delayed webhook deliveries · Resolved in 41 minutes.
            </CardContent>
          </Card>
        </section>
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-[960px] flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <RadioTower aria-hidden="true" className="size-3.5" />
            Last updated 18 seconds ago
          </span>
          <span>Powered by DevRelay · Seeded portfolio data</span>
        </div>
      </footer>
    </div>
  );
}
