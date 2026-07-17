"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const next: Record<string, { label: string; state: string }[]> = {
  detected: [{ label: "Start investigating", state: "investigating" }],
  investigating: [
    { label: "Mark identified", state: "identified" },
    { label: "Start monitoring", state: "monitoring" },
    { label: "Resolve", state: "resolved" },
  ],
  identified: [
    { label: "Start monitoring", state: "monitoring" },
    { label: "Resolve", state: "resolved" },
  ],
  monitoring: [
    { label: "Resume investigating", state: "investigating" },
    { label: "Resolve", state: "resolved" },
  ],
  resolved: [{ label: "Reopen", state: "investigating" }],
  postmortem_published: [{ label: "Reopen", state: "investigating" }],
};

export function IncidentTransitionActions({
  incidentId,
  lifecycle,
  orgSlug,
}: {
  incidentId: string;
  lifecycle: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function transition(toLifecycle: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/backend/organizations/${orgSlug}/incidents/${incidentId}/transitions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            ...(toLifecycle === "resolved" ? { outcome: "resolved" } : {}),
            reason:
              toLifecycle === "resolved"
                ? "Responder confirmed resolution"
                : "Responder updated the incident lifecycle",
            toLifecycle,
          }),
        },
      );
      if (!response.ok) return toast.error("The lifecycle could not be updated.");
      toast.success("Incident lifecycle updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(next[lifecycle] ?? []).map((action) => (
        <Button
          disabled={busy}
          key={action.state}
          onClick={() => transition(action.state)}
          variant={action.state === "resolved" ? "default" : "outline"}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" />
          ) : action.state === "resolved" ? (
            <CheckCircle2 />
          ) : null}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
