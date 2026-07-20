import { redirect } from "next/navigation";

import { organizationLandingPath } from "@/lib/auth-navigation";
import { getServerOrganizations, getServerSession } from "@/lib/auth-server";

export default async function AppEntryPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackUrl=/app");

  const organizations = await getServerOrganizations();
  redirect(organizationLandingPath(organizations));
}
