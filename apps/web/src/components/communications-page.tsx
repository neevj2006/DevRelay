import { Bell, CheckCircle2, Plus, RefreshCw, Send, Webhook } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const subscribers = [
  {
    destination: "a•••@example.com",
    services: "All services",
    verified: "Jul 12",
    state: "Subscribed",
  },
  {
    destination: "o•••@example.com",
    services: "API Gateway, Checkout",
    verified: "Jul 10",
    state: "Subscribed",
  },
  {
    destination: "s•••@example.com",
    services: "Webhook delivery",
    verified: "Jul 08",
    state: "Suppressed",
  },
];

const deliveries = [
  {
    destination: "Email batch",
    event: "Recovery is underway",
    attempts: 1,
    status: "Delivered",
    timestamp: "14:26:08 UTC",
  },
  {
    destination: "Customer webhook",
    event: "Recovery is underway",
    attempts: 2,
    status: "Retrying",
    timestamp: "14:26:11 UTC",
  },
  {
    destination: "Slack webhook",
    event: "Incident identified",
    attempts: 1,
    status: "Delivered",
    timestamp: "14:20:04 UTC",
  },
];

export function CommunicationsPage({
  defaultTab = "subscribers",
}: {
  defaultTab?: "subscribers" | "deliveries";
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Button>
            <Plus aria-hidden="true" />
            Add webhook
          </Button>
        }
        description="Subscriber preferences, outbound webhooks, and retry-safe delivery evidence."
        title="Communications"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Verified subscribers</CardDescription>
            <CardTitle className="font-mono text-3xl">1,248</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>30d delivery rate</CardDescription>
            <CardTitle className="font-mono text-3xl">99.92%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Retrying now</CardDescription>
            <CardTitle className="font-mono text-3xl">3</CardTitle>
          </CardHeader>
        </Card>
      </section>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="subscribers">
            <Bell aria-hidden="true" />
            Subscribers
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            <Webhook aria-hidden="true" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="deliveries">
            <Send aria-hidden="true" />
            Delivery history
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6" value="subscribers">
          <ResponsiveDataTable
            caption="Status page subscribers"
            columns={[
              {
                id: "destination",
                header: "Destination",
                cell: (row) => <span className="font-mono text-xs">{row.destination}</span>,
              },
              { id: "services", header: "Services", cell: (row) => row.services },
              { id: "verified", header: "Verified", cell: (row) => row.verified },
              { id: "state", header: "State", cell: (row) => row.state },
            ]}
            getRowKey={(row) => row.destination}
            rows={subscribers}
          />
        </TabsContent>
        <TabsContent className="mt-6" value="webhooks">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Customer status webhook</CardTitle>
                  <CardDescription className="font-mono">
                    https://hooks.customer.example/status
                  </CardDescription>
                </div>
                <CheckCircle2
                  aria-label="Healthy"
                  className="size-5 text-[var(--status-operational-fg)]"
                />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-secondary">
                HMAC SHA-256 · v1 payload · timestamp replay protection · 5 retry attempts
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="deliveries">
          <ResponsiveDataTable
            caption="Notification delivery history"
            columns={[
              { id: "destination", header: "Destination", cell: (row) => row.destination },
              { id: "event", header: "Event", cell: (row) => row.event },
              {
                id: "attempts",
                header: "Attempts",
                className: "text-right",
                cell: (row) => <span className="font-mono">{row.attempts}</span>,
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                    {row.status}
                  </span>
                ),
              },
              {
                id: "timestamp",
                header: "Timestamp",
                cell: (row) => <span className="font-mono text-xs">{row.timestamp}</span>,
              },
            ]}
            getRowKey={(row) => `${row.destination}-${row.timestamp}`}
            rows={deliveries}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
