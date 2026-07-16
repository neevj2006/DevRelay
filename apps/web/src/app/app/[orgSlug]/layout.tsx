import { AppShell } from "@/components/app-shell";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <AppShell orgSlug={orgSlug}>{children}</AppShell>;
}
