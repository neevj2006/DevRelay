import { MaintenanceConsole, type MaintenanceWindow } from "@/components/maintenance-console";
import { apiRequest } from "@/lib/auth-server";
import { isPublicDemoOrganization } from "@/lib/demo";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const [windowsResponse, servicesResponse] = await Promise.all([
    apiRequest(`/organizations/${orgSlug}/operations/maintenance`),
    apiRequest(`/organizations/${orgSlug}/services`),
  ]);
  const windows = windowsResponse.ok ? ((await windowsResponse.json()) as MaintenanceWindow[]) : [];
  const services = servicesResponse.ok
    ? ((await servicesResponse.json()) as { id: string; name: string }[])
    : [];
  return (
    <MaintenanceConsole
      initialWindows={windows}
      orgSlug={orgSlug}
      readOnly={isPublicDemoOrganization(orgSlug)}
      services={services}
    />
  );
}
