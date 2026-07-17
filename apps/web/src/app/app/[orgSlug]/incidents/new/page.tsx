import { IncidentForm } from "@/components/incident-form";
import { PageHeader } from "@/components/page-header";
import { apiRequest } from "@/lib/auth-server";

export default async function NewIncidentPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const response = await apiRequest(`/organizations/${orgSlug}/services`);
  const services = response.ok ? ((await response.json()) as { id: string; name: string }[]) : [];
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        description="Start a private response record. Customer communication is published separately after review."
        title="Create incident"
      />
      <IncidentForm orgSlug={orgSlug} services={services} />
    </div>
  );
}
