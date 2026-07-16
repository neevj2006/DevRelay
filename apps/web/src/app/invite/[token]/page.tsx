import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { InvitationAcceptance } from "@/components/invitation-acceptance";
import { ThemeSelector } from "@/components/theme-selector";
import { getServerSession } from "@/lib/auth-server";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession();
  if (!session) redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <ThemeSelector />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl justify-center px-4 py-12 sm:px-6 sm:py-16">
        <InvitationAcceptance token={token} />
      </main>
    </div>
  );
}
