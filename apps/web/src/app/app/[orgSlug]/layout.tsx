import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getServerSession } from "@/lib/auth-server";

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
  return (
    <AppShell orgSlug={orgSlug} user={{ email: session.user.email, name: session.user.name }}>
      {children}
    </AppShell>
  );
}
