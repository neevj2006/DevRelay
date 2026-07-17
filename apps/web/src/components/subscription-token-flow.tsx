"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Verification = { preferencesToken: string; unsubscribeToken: string; verified: true };

export function SubscriptionTokenFlow({
  mode,
  token,
}: {
  mode: "verify" | "unsubscribe";
  token: string;
}) {
  const [result, setResult] = useState<Verification | { unsubscribed: true } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/subscriptions/${mode}`, {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setResult(await response.json());
      })
      .catch(() => setFailed(true));
  }, [mode, token]);
  if (failed)
    return (
      <p role="alert" className="text-sm text-destructive">
        This link is invalid, expired, or has already been used.
      </p>
    );
  if (!result) return <p className="text-sm text-text-secondary">Processing your request…</p>;
  const verified = "verified" in result;
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-[var(--status-operational-fg)]">
        <CheckCircle2 aria-hidden="true" className="size-5" />
        {verified ? "Your subscription is confirmed." : "You have been unsubscribed."}
      </p>
      {verified ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            className="text-text-link"
            href={`/subscriptions/preferences?token=${result.preferencesToken}`}
          >
            Choose service preferences
          </Link>
          <Link
            className="text-text-link"
            href={`/subscriptions/unsubscribe?token=${result.unsubscribeToken}`}
          >
            Unsubscribe
          </Link>
        </div>
      ) : null}
    </div>
  );
}
