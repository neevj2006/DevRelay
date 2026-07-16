"use client";

import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InvitationAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    try {
      const response = await fetch(`/api/backend/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        organizationSlug?: string;
      } | null;
      if (!response.ok || !body?.organizationSlug) {
        toast.error(body?.message ?? "This invitation cannot be accepted.");
        return;
      }
      toast.success("Invitation accepted");
      router.push(`/app/${body.organizationSlug}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-elevation-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck aria-hidden="true" />
        </div>
        <CardTitle>Organization invitation</CardTitle>
        <CardDescription>
          Accept with the signed-in account that received the invitation. Expired, revoked, and
          previously used links are rejected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" disabled={pending} onClick={accept} size="lg">
          {pending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Check aria-hidden="true" />
          )}
          Accept invitation
        </Button>
      </CardContent>
    </Card>
  );
}
