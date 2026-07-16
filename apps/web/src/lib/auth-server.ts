import { headers } from "next/headers";

type AuthenticatedSession = {
  session: {
    expiresAt: string;
    id: string;
    userId: string;
  };
  user: {
    email: string;
    id: string;
    image?: string | null;
    name: string;
  };
};

export type SessionOrganization = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  slug: string;
};

async function apiRequest(path: string) {
  const requestHeaders = await headers();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    headers: {
      cookie: requestHeaders.get("cookie") ?? "",
      origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    },
  });
}

export async function getServerSession(): Promise<AuthenticatedSession | null> {
  try {
    const response = await apiRequest("/api/auth/get-session");
    if (!response.ok) return null;
    return (await response.json()) as AuthenticatedSession | null;
  } catch {
    return null;
  }
}

export async function getServerOrganizations(): Promise<SessionOrganization[]> {
  try {
    const response = await apiRequest("/organizations");
    if (!response.ok) return [];
    return (await response.json()) as SessionOrganization[];
  } catch {
    return [];
  }
}
