import { ArrowRight, Code2, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { InlineFeedback } from "@/components/feedback";
import { MarketingHeader } from "@/components/marketing-header";
import { SignInActions } from "@/components/sign-in-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const stateMessages = {
  "provider-error": {
    tone: "danger",
    title: "GitHub sign-in unavailable",
    description: "The provider did not complete sign-in. Try again or open the seeded demo.",
  },
  "rate-limited": {
    tone: "warning",
    title: "Too many attempts",
    description: "Wait a minute before trying GitHub sign-in again.",
  },
  "expired-session": {
    tone: "info",
    title: "Session expired",
    description: "Sign in again to return to your organization.",
  },
} as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const message =
    state && state in stateMessages
      ? stateMessages[state as keyof typeof stateMessages]
      : undefined;
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_28rem]">
        <section className="hidden max-w-xl lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
            Secure workspace access
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            Return to the calm control room.
          </h1>
          <p className="mt-5 text-lg leading-8 text-text-secondary">
            GitHub OAuth protects the hosted demo. Local development can use an explicitly
            configured test identity without weakening production authentication.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-text-secondary">
            <li className="flex gap-3">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 text-primary" />
              Server-side session validation on every protected request.
            </li>
            <li className="flex gap-3">
              <Code2 aria-hidden="true" className="mt-0.5 size-5 text-primary" />
              Open implementation and documented security boundaries.
            </li>
          </ul>
        </section>
        <Card className="w-full shadow-elevation-sm">
          <CardHeader className="text-center">
            <Brand className="mx-auto mb-5 text-lg" markClassName="size-10" />
            <CardTitle className="text-2xl">Sign in to DevRelay</CardTitle>
            <CardDescription>
              Continue with GitHub or explore the seeded public demo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {message ? (
              <InlineFeedback
                description={message.description}
                title={message.title}
                tone={message.tone}
              />
            ) : null}
            <SignInActions />
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <Button asChild className="w-full" size="lg" variant="outline">
              <Link href="/app/acme">
                Open seeded demo <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              By continuing, you acknowledge this is an MVP demo with free-tier limits. Never enter
              production secrets.
            </p>
          </CardContent>
          <CardFooter className="justify-center border-t pt-5 text-xs text-muted-foreground">
            Local development login appears only when explicitly enabled.
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
