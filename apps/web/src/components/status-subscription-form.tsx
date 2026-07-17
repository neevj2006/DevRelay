"use client";

import { Bell, CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StatusSubscriptionForm({ slug }: { slug: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function submit(formData: FormData) {
    setState("sending");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/status/${slug}/subscriptions`,
        {
          body: JSON.stringify({
            email: formData.get("email"),
            incidentNotifications: true,
            maintenanceNotifications: true,
            serviceIds: [],
            website: formData.get("website") || undefined,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }
  if (state === "sent")
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--status-operational-fg)]">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        Check your email to confirm the subscription.
      </p>
    );
  return (
    <form action={submit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="Email address"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <Button disabled={state === "sending"} type="submit">
          <Bell aria-hidden="true" />
          {state === "sending" ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      <input
        aria-hidden="true"
        autoComplete="off"
        className="absolute -left-[9999px]"
        name="website"
        tabIndex={-1}
      />
      {state === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          We could not start the subscription. Please try again later.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        You will receive incident and maintenance updates for all public services. Confirmation is
        required.
      </p>
    </form>
  );
}
