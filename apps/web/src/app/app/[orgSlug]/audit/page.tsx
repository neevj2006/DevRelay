import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/auth-server";
type Audit = {
  id: string;
  action: string;
  actorName: string | null;
  actorType: string;
  targetType: string;
  targetId: string | null;
  source: string;
  safePayload: Record<string, unknown>;
  occurredAt: string;
};
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const q = await searchParams;
  const search = new URLSearchParams();
  for (const key of ["actor", "action", "target", "from", "to", "cursor"])
    if (q[key]) search.set(key, q[key]!);
  const response = await apiRequest(`/organizations/${orgSlug}/operations/audit?${search}`);
  const data = response.ok
    ? ((await response.json()) as { items: Audit[]; nextCursor: string | null })
    : { items: [], nextCursor: null };
  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit log"
        description="Immutable organization activity with bounded, safe payload summaries."
      />
      <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <Input
          aria-label="Actor filter"
          defaultValue={q.actor}
          name="actor"
          placeholder="Actor name or type"
        />
        <Input
          aria-label="Action filter"
          defaultValue={q.action}
          name="action"
          placeholder="Action contains"
        />
        <Input
          aria-label="Target filter"
          defaultValue={q.target}
          name="target"
          placeholder="Target type contains"
        />
        <Input
          aria-label="From time"
          defaultValue={q.from}
          name="from"
          placeholder="From ISO time, for example 2026-07-17T00:00:00Z"
        />
        <Input
          aria-label="To time"
          defaultValue={q.to}
          name="to"
          placeholder="To ISO time, for example 2026-07-18T00:00:00Z"
        />
        <Button>Filter</Button>
      </form>
      <ResponsiveDataTable
        caption="Read-only audit events"
        columns={[
          {
            id: "action",
            header: "Action",
            cell: (r) => <span className="font-mono text-xs">{r.action}</span>,
          },
          { id: "actor", header: "Actor", cell: (r) => r.actorName ?? r.actorType },
          {
            id: "target",
            header: "Target",
            cell: (r) => (
              <span className="font-mono text-xs">
                {r.targetType}
                {r.targetId ? ` · ${r.targetId.slice(0, 8)}` : ""}
              </span>
            ),
          },
          {
            id: "summary",
            header: "Safe summary",
            cell: (r) => (
              <span className="text-xs">
                {Object.keys(r.safePayload).join(", ") || "No payload fields"}
              </span>
            ),
          },
          {
            id: "time",
            header: "UTC timestamp",
            cell: (r) => (
              <time className="font-mono text-xs">{new Date(r.occurredAt).toISOString()}</time>
            ),
          },
        ]}
        getRowKey={(r) => r.id}
        rows={data.items}
      />
      {data.nextCursor && (
        <a
          className="inline-flex rounded border px-4 py-2 text-sm"
          href={`?${new URLSearchParams({ ...q, cursor: data.nextCursor } as Record<string, string>)}`}
        >
          Older events
        </a>
      )}
    </div>
  );
}
