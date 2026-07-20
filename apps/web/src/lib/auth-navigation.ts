export function safeAuthCallbackUrl(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

export function organizationLandingPath(organizations: ReadonlyArray<{ slug: string }>): string {
  const organization = organizations[0];
  return organization ? `/app/${organization.slug}` : "/onboarding";
}
