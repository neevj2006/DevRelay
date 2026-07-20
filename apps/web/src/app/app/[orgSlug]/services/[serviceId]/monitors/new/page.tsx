import { redirect } from "next/navigation";

import { MonitorWizard } from "@/components/monitor-wizard";
import { PageHeader } from "@/components/page-header";
import { isPublicDemoOrganization } from "@/lib/demo";

export default async function NewMonitorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; serviceId: string }>;
}) {
  const { orgSlug, serviceId } = await params;
  if (isPublicDemoOrganization(orgSlug)) redirect(`/app/${orgSlug}/services/${serviceId}`);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        description="Configure a constrained HTTP check and a noise-resistant incident policy."
        title="Create monitor"
      />
      <MonitorWizard orgSlug={orgSlug} serviceId={serviceId} />
    </div>
  );
}
