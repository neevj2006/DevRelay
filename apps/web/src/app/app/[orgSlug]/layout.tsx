import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getServerOrganizations, getServerSession } from "@/lib/auth-server";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getServerSession();
  if (!session) redirect("/sign-in?state=expired-session");
  const organizations = await getServerOrganizations();
  const activeOrganization = organizations.find(
    (organization) => organization.slug.toLowerCase() === orgSlug.toLowerCase(),
  );
  if (!activeOrganization) redirect("/onboarding");
  return (
    <AppShell
      organizations={organizations}
      orgSlug={activeOrganization.slug}
      role={activeOrganization.role}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </AppShell>
  );
}
