import { CalendarDays, Download } from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { LatencyChart } from "@/components/latency-chart";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Button variant="outline">
              <CalendarDays aria-hidden="true" />
              Last 30 days
            </Button>
            <Button variant="outline">
              <Download aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
        description="Availability, latency, check completion, and incident impact from durable aggregates."
        title="Analytics"
      />
      <section
        aria-label="Availability metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard detail="+0.03% vs prior period" label="Availability" trend="up" value="99.92%" />
        <KpiCard detail="API Gateway" label="Median latency" value="214 ms" />
        <KpiCard detail="3.8 minutes" label="Incident minutes" trend="down" value="84" />
        <KpiCard detail="432,916 total" label="Check completion" trend="up" value="99.98%" />
      </section>
      <LatencyChart />
      <Card>
        <CardHeader>
          <CardTitle>Availability by service</CardTitle>
          <CardDescription>Thirty-day rollup with incident minutes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {[
              { name: "Customer dashboard", value: "99.99%", width: "99.99%" },
              { name: "Webhook delivery", value: "99.97%", width: "99.97%" },
              { name: "Checkout", value: "99.91%", width: "99.91%" },
              { name: "API Gateway", value: "99.82%", width: "99.82%" },
            ].map((item) => (
              <div key={item.name}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span>{item.name}</span>
                  <span className="font-mono tabular-nums">{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    aria-hidden="true"
                    className="h-full rounded-full bg-primary"
                    style={{ width: item.width }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Table-equivalent values are included alongside every bar; color is not the sole
            indicator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
