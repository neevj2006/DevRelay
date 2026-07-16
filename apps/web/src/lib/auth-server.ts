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

export async function getServerSession(): Promise<AuthenticatedSession | null> {
  const requestHeaders = await headers();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/api/auth/get-session`, {
      cache: "no-store",
      headers: {
        cookie: requestHeaders.get("cookie") ?? "",
        origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthenticatedSession | null;
  } catch {
    return null;
  }
}
