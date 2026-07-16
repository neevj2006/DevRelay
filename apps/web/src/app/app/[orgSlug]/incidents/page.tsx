import { Plus, Search } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/data-state";
import { IncidentLifecycleBadge, IncidentSeverityBadge } from "@/components/incident-badges";
import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prototypeIncidents } from "@/lib/prototype-data";

export default async function IncidentsPage({
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
          <Button asChild>
            <Link href={`/app/${orgSlug}/incidents/new`}>
              <Plus aria-hidden="true" />
              Create incident
            </Link>
          </Button>
        }
        description="Active response, historical outcomes, and customer communication."
        title="Incidents"
      />
      {state === "loading" ? <LoadingState label="Loading incidents" /> : null}
      {state === "error" ? (
        <ErrorState
          description="Incident history could not be loaded. Live response data has not been changed."
          title="Incidents unavailable"
        />
      ) : null}
      {state === "empty" ? (
        <EmptyState
          description="Confirmed monitor failures and manually created incidents will appear here."
          title="No incidents"
        />
      ) : null}
      {!state ? (
        <>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search incidents"
                className="pl-9"
                placeholder="Search incidents"
              />
            </div>
            <Button variant="outline">All lifecycles</Button>
            <Button variant="outline">All severities</Button>
          </div>
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
                      {incident.services.join(" · ")}
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
                id: "duration",
                header: "Duration",
                className: "text-right",
                cell: (incident) => (
                  <span className="font-mono tabular-nums">{incident.duration}</span>
                ),
              },
              { id: "updated", header: "Latest update", cell: (incident) => incident.updatedAt },
            ]}
            getRowKey={(incident) => incident.id}
            rows={prototypeIncidents}
          />
        </>
      ) : null}
    </div>
  );
}
