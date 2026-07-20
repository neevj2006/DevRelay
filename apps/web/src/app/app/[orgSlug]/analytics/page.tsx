import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/auth-server";
type ServiceMetric = {
  id: string;
  name: string;
  expectedChecks: number;
  completedChecks: number;
  missingChecks: number;
  availabilityBasisPoints: number | null;
  errorBudgetChecksRemaining: number | null;
  latencyP50Milliseconds: number | null;
  latencyP95Milliseconds: number | null;
};
export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const to = query.to ?? new Date().toISOString().slice(0, 10);
  const fromDate = new Date(to);
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  const from = query.from ?? fromDate.toISOString().slice(0, 10);
  const response = await apiRequest(
    `/organizations/${orgSlug}/operations/analytics?from=${from}&to=${to}`,
  );
  const data = response.ok
    ? ((await response.json()) as { formula: string; timezone: string; services: ServiceMetric[] })
    : { formula: "Unavailable", timezone: "UTC", services: [] };
  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Availability and latency from durable check evidence."
      />
      <Card>
        <CardHeader>
          <CardTitle>Range and evidence policy</CardTitle>
          <CardDescription>
            {from} through {to} · {data.timezone}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3">
            <label className="text-sm">
              From{" "}
              <input
                className="ml-2 rounded border bg-card p-2"
                defaultValue={from}
                name="from"
                type="date"
              />
            </label>
            <label className="text-sm">
              To{" "}
              <input
                className="ml-2 rounded border bg-card p-2"
                defaultValue={to}
                name="to"
                type="date"
              />
            </label>
            <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">
              Apply
            </button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            {data.formula}. Missing evidence is always shown and never hidden in the percentage.
          </p>
        </CardContent>
      </Card>
      <ResponsiveDataTable
        caption="Availability by service with sample counts and missing evidence"
        columns={[
          { id: "service", header: "Service", cell: (r) => r.name },
          {
            id: "availability",
            header: "Availability",
            cell: (r) =>
              r.availabilityBasisPoints === null
                ? "No completed samples"
                : `${(r.availabilityBasisPoints / 100).toFixed(2)}%`,
          },
          {
            id: "samples",
            header: "Completed / expected",
            cell: (r) => `${r.completedChecks ?? 0} / ${r.expectedChecks ?? 0}`,
          },
          { id: "missing", header: "Missing", cell: (r) => String(r.missingChecks ?? 0) },
          {
            id: "latency",
            header: "Latency p50 / p95",
            cell: (r) =>
              `${r.latencyP50Milliseconds ?? "-"} / ${r.latencyP95Milliseconds ?? "-"} ms`,
          },
          {
            id: "budget",
            header: "99.90% budget",
            cell: (r) =>
              r.errorBudgetChecksRemaining === null
                ? "-"
                : `${r.errorBudgetChecksRemaining} checks`,
          },
        ]}
        getRowKey={(r) => r.id}
        rows={data.services}
      />
    </div>
  );
}
