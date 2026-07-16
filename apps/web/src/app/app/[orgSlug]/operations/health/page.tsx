import {
  CheckCircle2,
  Clock3,
  Database,
  ListChecks,
  RadioTower,
  TriangleAlert,
} from "lucide-react";

import { StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const systems = [
  {
    name: "Application API",
    detail: "p95 84 ms · 0.02% errors",
    icon: RadioTower,
    status: "operational" as const,
  },
  {
    name: "PostgreSQL",
    detail: "12 ms query p95 · pool 38%",
    icon: Database,
    status: "operational" as const,
  },
  {
    name: "Monitor queue",
    detail: "3 jobs ready · oldest 4s",
    icon: ListChecks,
    status: "operational" as const,
  },
  {
    name: "Notification delivery",
    detail: "3 retries · oldest 42s",
    icon: Clock3,
    status: "degraded" as const,
  },
];

export default function OperationalHealthPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        description="Internal worker, queue, database, and delivery health for DevRelay operators."
        title="System health"
      />
      <section className="rounded-xl border border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] p-5 text-[var(--status-degraded-fg)]">
        <div className="flex gap-3">
          <TriangleAlert aria-hidden="true" className="size-5" />
          <div>
            <h2 className="font-semibold">Delivery retries elevated</h2>
            <p className="mt-1 text-sm">
              Three webhook deliveries are retrying within policy. No dead-letter backlog.
            </p>
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {systems.map(({ name, detail, icon: Icon, status }) => (
          <Card key={name}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <StatusBadge status={status} />
              </div>
              <CardTitle>{name}</CardTitle>
              <CardDescription>{detail}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                Heartbeat received 12 seconds ago
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
