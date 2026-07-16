export function safeAuthCallbackUrl(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/onboarding";
  return value;
}
