import { Archive, MoreHorizontal, Plus, Search } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/data-state";
import { StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prototypeServices } from "@/lib/prototype-data";

export default async function ServicesPage({
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
            <Link href={`/app/${orgSlug}/services/new`}>
              <Plus aria-hidden="true" />
              Create service
            </Link>
          </Button>
        }
        description="Customer-facing systems, their monitors, and current communication state."
        title="Services"
      />
      {state === "loading" ? <LoadingState label="Loading services" /> : null}
      {state === "error" ? (
        <ErrorState
          description="Service data could not be loaded. Your filters are preserved."
          title="Services unavailable"
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
          description="Create a service to organize monitors, incidents, and public status history."
          title="No services yet"
        />
      ) : null}
      {!state ? (
        <>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input aria-label="Search services" className="pl-9" placeholder="Search services" />
            </div>
            <Button variant="outline">All states</Button>
            <Button variant="outline">
              <Archive aria-hidden="true" />
              Active only
            </Button>
          </div>
          <ResponsiveDataTable
            caption="Services"
            columns={[
              {
                id: "name",
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
                header: "Current state",
                cell: (service) => <StatusBadge status={service.status} />,
              },
              {
                id: "monitors",
                header: "Monitors",
                className: "text-right",
                cell: (service) => (
                  <span className="font-mono tabular-nums">{service.monitors}</span>
                ),
              },
              {
                id: "availability",
                header: "30d availability",
                className: "text-right",
                cell: (service) => (
                  <span className="font-mono tabular-nums">{service.availability.toFixed(2)}%</span>
                ),
              },
              { id: "freshness", header: "Last check", cell: (service) => service.lastCheck },
              {
                id: "actions",
                header: "",
                className: "text-right",
                cell: () => (
                  <Button aria-label="Open service actions" size="icon-sm" variant="ghost">
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                ),
              },
            ]}
            getRowKey={(service) => service.id}
            rows={prototypeServices}
          />
        </>
      ) : null}
    </div>
  );
}
