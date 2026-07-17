import { ApiKeyConsole, type ApiKeyRecord } from "@/components/api-key-console";
import { apiRequest } from "@/lib/auth-server";
export default async function ApiKeysPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const response = await apiRequest(`/organizations/${orgSlug}/operations/api-keys`);
  const keys = response.ok ? ((await response.json()) as ApiKeyRecord[]) : [];
  return <ApiKeyConsole initialKeys={keys} orgSlug={orgSlug} />;
}
