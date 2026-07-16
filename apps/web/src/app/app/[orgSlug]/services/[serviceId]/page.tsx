import { Archive, ExternalLink, Pause, Plus, Settings2 } from "lucide-react";
import Link from "next/link";

import { LatencyChart } from "@/components/latency-chart";
import { StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serviceById } from "@/lib/prototype-data";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; serviceId: string }>;
}) {
  const { orgSlug, serviceId } = await params;
  const service = serviceById(serviceId);
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/status/${orgSlug}`}>
                <ExternalLink aria-hidden="true" />
                Public page
              </Link>
            </Button>
            <Button variant="outline">
              <Settings2 aria-hidden="true" />
              Edit service
            </Button>
          </>
        }
        description={<span className="font-mono">{service.endpoint}</span>}
        title={service.name}
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={service.status} />
        <span className="text-sm text-text-secondary">Fresh evidence · {service.lastCheck}</span>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monitors">Monitors</TabsTrigger>
          <TabsTrigger value="checks">Check history</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6 space-y-6" value="overview">
          <section className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>30d availability</CardDescription>
                <CardTitle className="font-mono text-3xl tabular-nums">
                  {service.availability.toFixed(2)}%
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Latest latency</CardDescription>
                <CardTitle className="font-mono text-3xl tabular-nums">
                  {service.latencyMs} ms
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Active monitors</CardDescription>
                <CardTitle className="font-mono text-3xl tabular-nums">
                  {service.monitors}
                </CardTitle>
              </CardHeader>
            </Card>
          </section>
          <LatencyChart />
        </TabsContent>
        <TabsContent className="mt-6" value="monitors">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Primary HTTP monitor</CardTitle>
                  <CardDescription className="font-mono">GET {service.endpoint}</CardDescription>
                </div>
                <StatusBadge status={service.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Interval</dt>
                  <dd className="mt-1 font-medium">60 seconds</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Failure policy</dt>
                  <dd className="mt-1 font-medium">3 failures</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recovery</dt>
                  <dd className="mt-1 font-medium">3 successes</dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline">
                  <Pause aria-hidden="true" />
                  Pause
                </Button>
                <Button asChild>
                  <Link href={`/app/${orgSlug}/services/${service.id}/monitors/new`}>
                    <Plus aria-hidden="true" />
                    Add monitor
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="checks">
          <Card>
            <CardHeader>
              <CardTitle>Recent evidence</CardTitle>
              <CardDescription>
                Safe response metadata; bodies and secrets are never stored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-surface-subtle p-4 font-mono text-xs leading-6">
                <p>14:34:12 UTC · HTTP 200 · 438 ms · us-east</p>
                <p>14:33:12 UTC · HTTP 200 · 511 ms · us-east</p>
                <p>14:32:12 UTC · HTTP 502 · 684 ms · us-east</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="incidents">
          <Card>
            <CardHeader>
              <CardTitle>Related incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                className="font-medium text-text-link"
                href={`/app/${orgSlug}/incidents/inc-api-errors`}
              >
                Elevated API 5xx responses
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">Active · Monitoring · 24 minutes</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Service settings</CardTitle>
              <CardDescription>Public visibility, ordering, and archival controls.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive">
                <Archive aria-hidden="true" />
                Archive service
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
