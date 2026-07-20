"use client";

import { Bell, Plus, RefreshCw, Send, Webhook } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CommunicationsData = {
  deliveries: {
    attempts: number;
    channel: string;
    createdAt: string;
    id: string;
    kind: string;
    lastError: string | null;
    nextAttemptAt: string | null;
    status: string;
  }[];
  subscribers: {
    consent_source: string;
    email: string;
    id: string;
    state: string;
    verified_at: string | null;
  }[];
  webhooks: {
    createdAt: string;
    endpointUrl: string;
    id: string;
    name: string;
    secretPrefix: string;
    state: string;
  }[];
};

export function CommunicationsPage({
  data,
  defaultTab = "subscribers",
  orgSlug,
  readOnly = false,
}: {
  data: CommunicationsData;
  defaultTab?: "subscribers" | "webhooks" | "deliveries";
  orgSlug: string;
  readOnly?: boolean;
}) {
  const [webhooks, setWebhooks] = useState(data.webhooks);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  async function addWebhook(formData: FormData) {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/webhooks`,
      {
        body: JSON.stringify({
          endpointUrl: formData.get("endpointUrl"),
          name: formData.get("name"),
        }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      setMessage("Webhook could not be created. Use a public HTTPS destination.");
      return;
    }
    const created = await response.json();
    setSecret(created.secret);
    setWebhooks((items) => [
      {
        ...created,
        createdAt: new Date().toISOString(),
        secretPrefix: created.secret.slice(0, 12),
        state: "active",
      },
      ...items,
    ]);
    setMessage("Webhook created. Copy the secret now; it will not be shown again.");
  }
  async function redeliver(id: string) {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/deliveries/${id}/redeliver`,
      { credentials: "include", method: "POST" },
    );
    setMessage(response.ok ? "Redelivery queued." : "Redelivery could not be queued.");
  }
  const succeeded = data.deliveries.filter((item) => item.status === "succeeded").length;
  const deliveryRate = data.deliveries.length
    ? ((succeeded / data.deliveries.length) * 100).toFixed(2)
    : "—";
  return (
    <div className="space-y-8">
      <PageHeader
        description="Subscriber preferences, signed webhooks, and retry-safe delivery evidence."
        title="Communications"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Verified subscribers"
          value={String(data.subscribers.filter((item) => item.state === "active").length)}
        />
        <Metric
          label="Recent delivery rate"
          value={deliveryRate === "—" ? "—" : `${deliveryRate}%`}
        />
        <Metric
          label="Retrying now"
          value={String(data.deliveries.filter((item) => item.status === "retry_scheduled").length)}
        />
      </section>
      {message ? (
        <p aria-live="polite" className="rounded-md border bg-card p-3 text-sm">
          {message}
        </p>
      ) : null}
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
                id: "email",
                header: "Destination",
                cell: (row) => <span className="font-mono text-xs">{row.email}</span>,
              },
              {
                id: "consent_source",
                header: "Consent source",
                cell: (row) => row.consent_source.replaceAll("_", " "),
              },
              {
                id: "verified_at",
                header: "Verified",
                cell: (row) =>
                  row.verified_at ? new Date(row.verified_at).toLocaleDateString() : "Pending",
              },
              { id: "state", header: "State", cell: (row) => row.state.replaceAll("_", " ") },
            ]}
            getRowKey={(row) => row.id}
            rows={data.subscribers}
          />
        </TabsContent>
        <TabsContent className="mt-6 space-y-5" value="webhooks">
          {!readOnly ? (
            <Card>
              <CardHeader>
                <CardTitle>Add webhook destination</CardTitle>
                <CardDescription>
                  Only public HTTP(S) destinations are accepted. Secrets are encrypted at rest.
                </CardDescription>
              </CardHeader>
              <form
                action={addWebhook}
                className="grid gap-3 px-6 pb-6 sm:grid-cols-[1fr_2fr_auto]"
              >
                <Input
                  aria-label="Webhook name"
                  name="name"
                  placeholder="Customer status"
                  required
                />
                <Input
                  aria-label="Webhook URL"
                  name="endpointUrl"
                  placeholder="https://hooks.example.com/status"
                  required
                  type="url"
                />
                <Button type="submit">
                  <Plus aria-hidden="true" />
                  Add webhook
                </Button>
              </form>
              {secret ? (
                <div className="border-t px-6 py-4">
                  <p className="text-xs font-medium">Signing secret (shown once)</p>
                  <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">
                    {secret}
                  </code>
                </div>
              ) : null}
            </Card>
          ) : null}
          {webhooks.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{item.name}</CardTitle>
                <CardDescription className="break-all font-mono">
                  {item.endpointUrl}
                </CardDescription>
                <p className="text-xs text-muted-foreground">
                  HMAC SHA-256 · secret {item.secretPrefix}… · {item.state}
                </p>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>
        <TabsContent className="mt-6" value="deliveries">
          <ResponsiveDataTable
            caption="Notification delivery history"
            columns={[
              { id: "channel", header: "Channel", cell: (row) => row.channel },
              { id: "kind", header: "Event", cell: (row) => row.kind.replaceAll("_", " ") },
              {
                id: "attempts",
                header: "Attempts",
                cell: (row) => <span className="font-mono">{row.attempts}</span>,
              },
              {
                id: "status",
                header: "Status",
                cell: (row: CommunicationsData["deliveries"][number]) => (
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                    {row.status.replaceAll("_", " ")}
                  </span>
                ),
              },
              {
                id: "nextAttemptAt",
                header: "Next retry / error",
                cell: (row) =>
                  row.nextAttemptAt
                    ? new Date(row.nextAttemptAt).toLocaleString()
                    : (row.lastError ?? "—"),
              },
              ...(readOnly
                ? []
                : [
                    {
                      id: "action",
                      header: "Action",
                      cell: (row: CommunicationsData["deliveries"][number]) => (
                        <Button onClick={() => redeliver(row.id)} size="sm" variant="outline">
                          Redeliver
                        </Button>
                      ),
                    },
                  ]),
            ]}
            getRowKey={(row) => row.id}
            rows={data.deliveries}
          />
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
        <CardTitle className="font-mono text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
