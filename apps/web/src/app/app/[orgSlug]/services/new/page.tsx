import { PageHeader } from "@/components/page-header";
import { ServiceForm } from "@/components/service-form";

export default async function NewServicePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        description="Define the customer-facing system whose health DevRelay will track."
        title="Create service"
      />
      <ServiceForm orgSlug={orgSlug} />
    </div>
  );
}
