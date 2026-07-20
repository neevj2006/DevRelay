import { Activity, CalendarClock, Plus, RadioTower } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/data-state";
import { KpiCard } from "@/components/kpi-card";
import { type OperationalStatus, StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/auth-server";
import { isPublicDemoOrganization } from "@/lib/demo";

type Service = {
  activeIncidentCount: number;
  availability: number;
  currentState: OperationalStatus;
  id: string;
  lastCheckAt: string | null;
  monitorCount: number;
  name: string;
  publicDescription: string | null;
};

type Incident = {
  id: string;
  lifecycle: string;
  startedAt: string;
  title: string;
  updatedAt: string;
};

type MaintenanceWindow = {
  endsAt: string;
  id: string;
  publicDescription: string | null;
  startsAt: string;
  status: string;
  title: string;
};

const statusRank: Record<OperationalStatus, number> = {
  operational: 0,
  unknown: 1,
  maintenance: 2,
  degraded: 3,
  partial_outage: 4,
  major_outage: 5,
};

export default async function OrganizationOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [{ orgSlug }, { state }] = await Promise.all([params, searchParams]);
  const readOnly = isPublicDemoOrganization(orgSlug);
  let services: Service[] = [];
  let incidents: Incident[] = [];
  let maintenance: MaintenanceWindow[] = [];
  let loadFailed = false;

  if (!state) {
    try {
      const [servicesResponse, incidentsResponse, maintenanceResponse] = await Promise.all([
        apiRequest(`/organizations/${orgSlug}/services`),
        apiRequest(`/organizations/${orgSlug}/incidents`),
        apiRequest(`/organizations/${orgSlug}/operations/maintenance`),
      ]);
      loadFailed = !servicesResponse.ok || !incidentsResponse.ok || !maintenanceResponse.ok;
      if (!loadFailed) {
        [services, incidents, maintenance] = await Promise.all([
          servicesResponse.json() as Promise<Service[]>,
          incidentsResponse.json() as Promise<Incident[]>,
          maintenanceResponse.json() as Promise<MaintenanceWindow[]>,
        ]);
      }
    } catch {
      loadFailed = true;
    }
  }

  const activeIncidents = incidents.filter(
    (incident) => !["resolved", "postmortem_published"].includes(incident.lifecycle),
  );
  const monitoredServices = services.filter((service) => service.monitorCount > 0);
  const availability = monitoredServices.length
    ? monitoredServices.reduce((total, service) => total + service.availability, 0) /
      monitoredServices.length
    : null;
  const overallStatus = services.reduce<OperationalStatus>(
    (current, service) =>
      statusRank[service.currentState] > statusRank[current] ? service.currentState : current,
    services.length ? "operational" : "unknown",
  );
  const upcomingMaintenance = maintenance
    .filter((window) => window.status === "scheduled" && new Date(window.endsAt) > new Date())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  const recentIncidents = [...incidents]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          readOnly ? undefined : (
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
          )
        }
        description="Monitor reliability, coordinate incidents, and keep customers informed."
        title="Overview"
      />
      {state === "loading" ? <LoadingState label="Loading organization overview" /> : null}
      {state === "error" || loadFailed ? (
        <ErrorState
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/${orgSlug}`}>Try again</Link>
            </Button>
          }
          description="The latest organization data could not be loaded. No data was changed."
          title="Overview unavailable"
        />
      ) : null}
      {state === "empty" || (!state && !loadFailed && services.length === 0) ? (
        <EmptyState
          action={
            readOnly ? undefined : (
              <Button asChild>
                <Link href={`/app/${orgSlug}/services/new`}>
                  <Plus aria-hidden="true" />
                  Create first service
                </Link>
              </Button>
            )
          }
          description="Add a customer-facing service, then attach an endpoint monitor to begin collecting evidence."
          title="Start monitoring your first service"
        />
      ) : null}
      {!state && !loadFailed && services.length > 0 ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <p className="text-sm font-medium">Current organization health</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Calculated from the latest state of {services.length} service
                  {services.length === 1 ? "" : "s"}.
                </p>
              </div>
              <StatusBadge status={overallStatus} />
            </CardContent>
          </Card>
          <section
            aria-label="Key reliability metrics"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              detail={`${services.filter((service) => service.currentState !== "operational").length} require attention`}
              label="Services"
              value={String(services.length)}
            />
            <KpiCard
              detail={`${activeIncidents.length} active now`}
              label="Incidents"
              value={String(incidents.length)}
            />
            <KpiCard
              detail={
                monitoredServices.length
                  ? `${monitoredServices.length} monitored services`
                  : "No monitor evidence yet"
              }
              label="Availability (30d)"
              value={availability === null ? "-" : `${availability.toFixed(2)}%`}
            />
            <KpiCard
              detail="Configured endpoint checks"
              label="Monitors"
              value={String(services.reduce((total, service) => total + service.monitorCount, 0))}
            />
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        {service.publicDescription ?? "No public description"}
                      </p>
                    </div>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (service) => <StatusBadge status={service.currentState} />,
                },
                {
                  id: "availability",
                  header: "30d availability",
                  className: "text-right",
                  cell: (service) => (
                    <span className="font-mono tabular-nums">
                      {service.monitorCount ? `${service.availability.toFixed(2)}%` : "-"}
                    </span>
                  ),
                },
                {
                  id: "monitors",
                  header: "Monitors",
                  className: "text-right",
                  cell: (service) => (
                    <span className="font-mono tabular-nums">{service.monitorCount}</span>
                  ),
                },
                {
                  id: "freshness",
                  header: "Last check",
                  cell: (service) =>
                    service.lastCheckAt
                      ? new Date(service.lastCheckAt).toLocaleString()
                      : "No evidence",
                },
              ]}
              getRowKey={(service) => service.id}
              rows={services}
            />
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock aria-hidden="true" className="size-5 text-primary" />
                  Upcoming maintenance
                </CardTitle>
                <CardDescription>Planned customer-visible work</CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingMaintenance ? (
                  <>
                    <p className="font-medium">{upcomingMaintenance.title}</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {new Date(upcomingMaintenance.startsAt).toLocaleString()} -{" "}
                      {new Date(upcomingMaintenance.endsAt).toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {upcomingMaintenance.publicDescription}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming maintenance.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RadioTower aria-hidden="true" className="size-5 text-primary" />
                  Recent incidents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentIncidents.length ? (
                  <ul className="space-y-4 text-sm">
                    {recentIncidents.map((incident) => (
                      <li key={incident.id}>
                        <Link
                          className="font-medium hover:text-text-link"
                          href={`/app/${orgSlug}/incidents/${incident.id}`}
                        >
                          {incident.title}
                        </Link>
                        <p className="text-muted-foreground">
                          Updated {new Date(incident.updatedAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No incidents recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
