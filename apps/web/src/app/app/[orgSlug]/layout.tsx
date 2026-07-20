import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getServerOrganizations, getServerSession } from "@/lib/auth-server";
import { isPublicDemoOrganization, publicDemoOrganization } from "@/lib/demo";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const readOnly = isPublicDemoOrganization(orgSlug);
  const session = await getServerSession();
  if (!session && !readOnly) redirect("/sign-in?state=expired-session");
  const organizations = session ? await getServerOrganizations() : [];
  const activeOrganization = organizations.find(
    (organization) => organization.slug.toLowerCase() === orgSlug.toLowerCase(),
  );
  if (!readOnly && !activeOrganization) redirect("/onboarding");
  const shellOrganizations = readOnly
    ? [publicDemoOrganization]
    : organizations.map(({ name, slug }) => ({ name, slug }));
  return (
    <AppShell
      organizations={shellOrganizations}
      orgSlug={readOnly ? publicDemoOrganization.slug : activeOrganization!.slug}
      readOnly={readOnly}
      role={readOnly ? "member" : activeOrganization!.role}
      user={session ? { email: session.user.email, name: session.user.name } : undefined}
    >
      {children}
    </AppShell>
  );
}
