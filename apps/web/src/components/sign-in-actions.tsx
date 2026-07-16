"use client";

import { Code2, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { safeAuthCallbackUrl } from "@/lib/auth-navigation";

export function SignInActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeAuthCallbackUrl(searchParams.get("callbackUrl"));
  const [pending, setPending] = useState<"github" | "sign-in" | "sign-up" | null>(null);
  const [email, setEmail] = useState("developer@devrelay.local");
  const [password, setPassword] = useState("devrelay-local-password");

  async function githubSignIn() {
    setPending("github");
    const result = await authClient.signIn.social({ callbackURL: callbackUrl, provider: "github" });
    if (result.error) {
      toast.error(result.error.message ?? "GitHub sign-in could not start.");
      setPending(null);
    }
  }

  async function localAuthentication(mode: "sign-in" | "sign-up") {
    setPending(mode);
    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, name: "Local Developer", password });
    if (result.error) {
      toast.error(result.error.message ?? "Local authentication failed.");
      setPending(null);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Button className="w-full" disabled={pending !== null} onClick={githubSignIn} size="lg">
        {pending === "github" ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Code2 aria-hidden="true" />
        )}
        Continue with GitHub
      </Button>
      {process.env.NODE_ENV !== "production" ? (
        <fieldset className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Local development
          </legend>
          <div className="space-y-2">
            <Label htmlFor="local-email">Email</Label>
            <Input
              autoComplete="email"
              id="local-email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="local-password">Password</Label>
            <Input
              autoComplete="current-password"
              id="local-password"
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              disabled={pending !== null}
              onClick={() => localAuthentication("sign-in")}
              type="button"
              variant="outline"
            >
              {pending === "sign-in" ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              Sign in locally
            </Button>
            <Button
              disabled={pending !== null}
              onClick={() => localAuthentication("sign-up")}
              type="button"
              variant="secondary"
            >
              {pending === "sign-up" ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              Create local account
            </Button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
