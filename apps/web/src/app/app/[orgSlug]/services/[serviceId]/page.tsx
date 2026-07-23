import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MonitorActions } from "@/components/monitor-actions";
import { type OperationalStatus, StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/auth-server";
import { isPublicDemoOrganization } from "@/lib/demo";

type Monitor = {
  endpointUrl: string | null;
  failureThreshold: number;
  id: string;
  intervalSeconds: number;
  method: string;
  monitorType: "dns" | "http" | "tls";
  name: string;
  policyPreview: string;
  recoveryThreshold: number;
  protocolConfig: { hostname?: string; recordType?: string };
  status: string;
};
type Service = {
  availability: number;
  currentState: OperationalStatus;
  id: string;
  incidents: { id: string; lifecycle: string; severity: string; title: string }[];
  lastCheckAt: string | null;
  monitorCount: number;
  monitors: Monitor[];
  name: string;
  publicDescription: string | null;
};

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; serviceId: string }>;
}) {
  const { orgSlug, serviceId } = await params;
  const readOnly = isPublicDemoOrganization(orgSlug);
  const response = await apiRequest(`/organizations/${orgSlug}/services/${serviceId}`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Service data could not be loaded");
  const service = (await response.json()) as Service;
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/status/${orgSlug}`}>
                <ExternalLink />
                Public page
              </Link>
            </Button>
            {!readOnly ? (
              <Button asChild>
                <Link href={`/app/${orgSlug}/services/${service.id}/monitors/new`}>
                  <Plus />
                  Add monitor
                </Link>
              </Button>
            ) : null}
          </>
        }
        description={service.publicDescription ?? "No public description"}
        title={service.name}
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={service.currentState} />
        <span className="text-sm text-text-secondary">
          {service.lastCheckAt
            ? `Evidence from ${new Date(service.lastCheckAt).toLocaleString()}`
            : "No monitoring evidence yet"}
        </span>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monitors">Monitors</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6 grid gap-4 sm:grid-cols-3" value="overview">
          <Metric label="30d availability" value={`${service.availability.toFixed(2)}%`} />
          <Metric label="Active monitors" value={String(service.monitorCount)} />
          <Metric label="Recent incidents" value={String(service.incidents.length)} />
        </TabsContent>
        <TabsContent className="mt-6 space-y-4" value="monitors">
          {service.monitors.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No monitors</CardTitle>
                <CardDescription>
                  Create a safe HTTP, TLS, or DNS monitor to collect availability evidence.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            service.monitors.map((monitor) => (
              <Card key={monitor.id}>
                <CardHeader>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <CardTitle>{monitor.name}</CardTitle>
                      <CardDescription className="font-mono">
                        <span className="mr-2 rounded border px-1.5 py-0.5 font-sans text-xs font-medium">
                          {monitor.monitorType.toUpperCase()}
                        </span>
                        {monitor.monitorType === "dns"
                          ? `${monitor.protocolConfig.recordType ?? "DNS"} ${monitor.protocolConfig.hostname ?? ""}`
                          : `${monitor.method} ${monitor.endpointUrl ?? ""}`}
                      </CardDescription>
                    </div>
                    <span className="capitalize">{monitor.status}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">{monitor.policyPreview}</p>
                  {!readOnly ? (
                    <MonitorActions
                      monitorId={monitor.id}
                      orgSlug={orgSlug}
                      status={monitor.status}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
        <TabsContent className="mt-6" value="incidents">
          <Card>
            <CardHeader>
              <CardTitle>Recent incidents</CardTitle>
            </CardHeader>
            <CardContent>
              {service.incidents.length ? (
                <ul className="space-y-3">
                  {service.incidents.map((incident) => (
                    <li key={incident.id}>
                      <Link
                        className="font-medium text-text-link"
                        href={`/app/${orgSlug}/incidents/${incident.id}`}
                      >
                        {incident.title}
                      </Link>
                      <p className="text-sm capitalize text-muted-foreground">
                        {incident.severity.replaceAll("_", " ")} · {incident.lifecycle}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No incidents reference this service.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
