export const publicDemoOrganization = {
  name: "Acme Reliability",
  slug: "acme",
} as const;

export function isPublicDemoOrganization(slug: string): boolean {
  return slug.toLowerCase() === publicDemoOrganization.slug;
}
