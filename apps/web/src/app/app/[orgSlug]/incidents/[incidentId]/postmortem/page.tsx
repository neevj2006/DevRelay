import { type PostmortemData, PostmortemEditor } from "@/components/postmortem-editor";
import { apiRequest } from "@/lib/auth-server";
export default async function PostmortemPage({
  params,
}: {
  params: Promise<{ orgSlug: string; incidentId: string }>;
}) {
  const { orgSlug, incidentId } = await params;
  const response = await apiRequest(
    `/organizations/${orgSlug}/operations/incidents/${incidentId}/postmortem`,
  );
  const body = response.ok ? await response.text() : "";
  const data = body ? (JSON.parse(body) as PostmortemData) : null;
  return <PostmortemEditor initial={data} incidentId={incidentId} orgSlug={orgSlug} />;
}
