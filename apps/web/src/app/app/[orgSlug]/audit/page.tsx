import { Search, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const events = [
  {
    id: "aud_01",
    action: "incident.lifecycle_changed",
    actor: "Neev A.",
    target: "inc-api-errors",
    source: "Web",
    timestamp: "14:32:04 UTC",
  },
  {
    id: "aud_02",
    action: "incident.public_update_published",
    actor: "Neev A.",
    target: "inc-api-errors",
    source: "Web",
    timestamp: "14:26:02 UTC",
  },
  {
    id: "aud_03",
    action: "monitor.policy_updated",
    actor: "Maya R.",
    target: "mon-api-health",
    source: "API",
    timestamp: "13:48:19 UTC",
  },
  {
    id: "aud_04",
    action: "member.role_changed",
    actor: "Neev A.",
    target: "member-maya",
    source: "Web",
    timestamp: "Jul 16 18:04 UTC",
  },
];

export default function AuditPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Button variant="outline">
            <ShieldCheck aria-hidden="true" />
            Verify retention
          </Button>
        }
        description="Immutable administrative and incident-response activity with safe payload summaries."
        title="Audit log"
      />
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search audit events"
            className="pl-9"
            placeholder="Search actor, action, or target"
          />
        </div>
        <Button variant="outline">All sources</Button>
        <Button variant="outline">All actions</Button>
      </div>
      <ResponsiveDataTable
        caption="Audit events"
        columns={[
          {
            id: "action",
            header: "Action",
            cell: (row) => <span className="font-mono text-xs">{row.action}</span>,
          },
          { id: "actor", header: "Actor", cell: (row) => row.actor },
          {
            id: "target",
            header: "Target",
            cell: (row) => <span className="font-mono text-xs">{row.target}</span>,
          },
          { id: "source", header: "Source", cell: (row) => row.source },
          {
            id: "time",
            header: "Timestamp",
            cell: (row) => <time className="font-mono text-xs">{row.timestamp}</time>,
          },
        ]}
        getRowKey={(row) => row.id}
        rows={events}
      />
    </div>
  );
}
