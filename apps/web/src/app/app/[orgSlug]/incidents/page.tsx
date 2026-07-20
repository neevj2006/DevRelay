import { Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/data-state";
import { IncidentLifecycleBadge, IncidentSeverityBadge } from "@/components/incident-badges";
import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
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
  services: { name: string }[];
  startedAt: string;
  title: string;
  updatedAt: string;
};

export default async function IncidentsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const readOnly = isPublicDemoOrganization(orgSlug);
  let incidents: Incident[] | null = null;
  try {
    const response = await apiRequest(`/organizations/${orgSlug}/incidents`);
    if (response.ok) incidents = (await response.json()) as Incident[];
  } catch {}
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          readOnly ? undefined : (
            <Button asChild>
              <Link href={`/app/${orgSlug}/incidents/new`}>
                <Plus aria-hidden="true" />
                Create incident
              </Link>
            </Button>
          )
        }
        description="Active response, historical outcomes, and customer communication."
        title="Incidents"
      />
      {incidents === null ? (
        <ErrorState
          description="Incident history could not be loaded. Live response data has not been changed."
          title="Incidents unavailable"
        />
      ) : incidents.length === 0 ? (
        <EmptyState
          description="Confirmed monitor failures and manually created incidents will appear here."
          title="No incidents"
        />
      ) : (
        <ResponsiveDataTable
          caption="Incidents"
          columns={[
            {
              id: "incident",
              header: "Incident",
              cell: (incident) => (
                <div>
                  <Link
                    className="font-medium hover:text-text-link"
                    href={`/app/${orgSlug}/incidents/${incident.id}`}
                  >
                    {incident.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {incident.services.map((service) => service.name).join(" · ")}
                  </p>
                </div>
              ),
            },
            {
              id: "severity",
              header: "Severity",
              cell: (incident) => <IncidentSeverityBadge severity={incident.severity} />,
            },
            {
              id: "lifecycle",
              header: "Lifecycle",
              cell: (incident) => <IncidentLifecycleBadge lifecycle={incident.lifecycle} />,
            },
            {
              id: "started",
              header: "Started",
              cell: (incident) => (
                <time className="font-mono text-xs tabular-nums" dateTime={incident.startedAt}>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(incident.startedAt))}
                </time>
              ),
            },
            {
              id: "updated",
              header: "Latest update",
              cell: (incident) => (
                <time dateTime={incident.updatedAt}>
                  {new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
                    Math.round((new Date(incident.updatedAt).getTime() - Date.now()) / 60000),
                    "minute",
                  )}
                </time>
              ),
            },
          ]}
          getRowKey={(incident) => incident.id}
          rows={incidents}
        />
      )}
    </div>
  );
}
