import { Plus } from "lucide-react";

import { StatusBadge } from "@/components/operational-status";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrganizationOverviewPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Button>
            <Plus aria-hidden="true" />
            Create service
          </Button>
        }
        description="Monitor reliability, coordinate incidents, and keep customers informed."
        title="Overview"
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Application shell ready</CardTitle>
              <CardDescription>
                The seeded operational dashboard arrives in the next prototype checkpoint.
              </CardDescription>
            </div>
            <StatusBadge status="operational" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            Use the responsive navigation to explore the canonical DevRelay route structure.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
