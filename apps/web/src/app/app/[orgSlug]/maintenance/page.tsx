import { CalendarClock, MoreHorizontal, Plus, Wrench } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MaintenancePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Button>
            <Plus aria-hidden="true" />
            Schedule maintenance
          </Button>
        }
        description="Planned operational work and its public service impact."
        title="Maintenance"
      />
      <section aria-labelledby="upcoming-title">
        <h2 className="mb-4 text-xl font-semibold" id="upcoming-title">
          Upcoming
        </h2>
        <Card className="border-[var(--status-maintenance-border)]">
          <CardHeader>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--status-maintenance-fg)]">
                  <Wrench aria-hidden="true" className="size-4" />
                  SCHEDULED
                </p>
                <CardTitle>Database failover rehearsal</CardTitle>
                <CardDescription>Saturday, Jul 18 · 02:00–02:30 UTC</CardDescription>
              </div>
              <Button aria-label="Maintenance actions" size="icon" variant="ghost">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary">
              API Gateway and Checkout may experience brief connection retries. Public notice
              publishes 24 hours before start.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border px-2.5 py-1">API Gateway</span>
              <span className="rounded-full border px-2.5 py-1">Checkout</span>
            </div>
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="past-title">
        <h2 className="mb-4 text-xl font-semibold" id="past-title">
          Past maintenance
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock aria-hidden="true" className="size-5 text-muted-foreground" />
              Cache cluster upgrade
            </CardTitle>
            <CardDescription>Completed Jul 05 · 18 minutes · No customer impact</CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
