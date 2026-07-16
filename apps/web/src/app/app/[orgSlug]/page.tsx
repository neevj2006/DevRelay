import { Activity, CalendarClock, Plus, RadioTower } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StaleState } from "@/components/data-state";
import { HealthSummary } from "@/components/health-summary";
import { KpiCard } from "@/components/kpi-card";
import { LatencyChart } from "@/components/latency-chart";
import { StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prototypeServices } from "@/lib/prototype-data";

export default async function OrganizationOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [{ orgSlug }, { state }] = await Promise.all([params, searchParams]);
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/app/${orgSlug}/incidents/new`}>
                <Activity aria-hidden="true" />
                Create incident
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/app/${orgSlug}/services/new`}>
                <Plus aria-hidden="true" />
                Create service
              </Link>
            </Button>
          </>
        }
        description="Monitor reliability, coordinate incidents, and keep customers informed."
        title="Overview"
      />
      {state === "loading" ? <LoadingState label="Loading organization overview" /> : null}
      {state === "error" ? (
        <ErrorState
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/${orgSlug}`}>Try again</Link>
            </Button>
          }
          description="The latest service summary could not be loaded. No data was changed."
          title="Overview unavailable"
        />
      ) : null}
      {state === "empty" ? (
        <EmptyState
          action={
            <Button asChild>
              <Link href={`/app/${orgSlug}/services/new`}>
                <Plus aria-hidden="true" />
                Create first service
              </Link>
            </Button>
          }
          description="Add a customer-facing service, then attach a monitor to begin collecting evidence."
          title="Start monitoring your first service"
        />
      ) : null}
      {!state || state === "stale" ? (
        <>
          {state === "stale" ? <StaleState lastUpdated="14:32 UTC (6 minutes ago)" /> : null}
          <HealthSummary />
          <section
            aria-label="Key reliability metrics"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard detail="2 require attention" label="Services" trend="down" value="4" />
            <KpiCard detail="1 active now" label="Incidents (30d)" value="3" />
            <KpiCard
              detail="0.03% above last week"
              label="Availability (30d)"
              trend="up"
              value="99.92%"
            />
            <KpiCard detail="Last 24 hours" label="Checks completed" trend="up" value="99.98%" />
          </section>
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Service health</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Current customer-facing state and freshest monitor evidence.
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/app/${orgSlug}/services`}>View all</Link>
              </Button>
            </div>
            <ResponsiveDataTable
              caption="Current service health"
              columns={[
                {
                  id: "service",
                  header: "Service",
                  cell: (service) => (
                    <div>
                      <Link
                        className="font-medium hover:text-text-link"
                        href={`/app/${orgSlug}/services/${service.id}`}
                      >
                        {service.name}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {service.endpoint}
                      </p>
                    </div>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (service) => <StatusBadge status={service.status} />,
                },
                {
                  id: "availability",
                  header: "30d availability",
                  className: "text-right",
                  cell: (service) => (
                    <span className="font-mono tabular-nums">
                      {service.availability.toFixed(2)}%
                    </span>
                  ),
                },
                {
                  id: "latency",
                  header: "Latency",
                  className: "text-right",
                  cell: (service) => (
                    <span className="font-mono tabular-nums">{service.latencyMs} ms</span>
                  ),
                },
                { id: "freshness", header: "Last check", cell: (service) => service.lastCheck },
              ]}
              getRowKey={(service) => service.id}
              rows={prototypeServices}
            />
          </section>
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <LatencyChart />
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock aria-hidden="true" className="size-5 text-primary" />
                    Upcoming maintenance
                  </CardTitle>
                  <CardDescription>Planned database failover</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">Saturday, 02:00–02:30 UTC</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    API Gateway may see brief connection retries.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RadioTower aria-hidden="true" className="size-5 text-primary" />
                    Recent activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-4 text-sm">
                    <li>
                      <p className="font-medium">API incident moved to Monitoring</p>
                      <p className="text-muted-foreground">2 minutes ago · Neev A.</p>
                    </li>
                    <li>
                      <p className="font-medium">Public update delivered</p>
                      <p className="text-muted-foreground">8 minutes ago · 1,248 destinations</p>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
