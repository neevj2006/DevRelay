import type { CommunicationsData } from "@/components/communications-page";
import { CommunicationsPage } from "@/components/communications-page";
import { apiRequest } from "@/lib/auth-server";
import { isPublicDemoOrganization } from "@/lib/demo";

export default async function SubscribersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const response = await apiRequest(`/organizations/${orgSlug}/communications`);
  const data = response.ok
    ? ((await response.json()) as CommunicationsData)
    : { deliveries: [], subscribers: [], webhooks: [] };
  return (
    <CommunicationsPage
      data={data}
      orgSlug={orgSlug}
      readOnly={isPublicDemoOrganization(orgSlug)}
    />
  );
}
