"use client";

import { Archive, LoaderCircle, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function MonitorActions({
  monitorId,
  orgSlug,
  status,
}: {
  monitorId: string;
  orgSlug: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function mutate(action: "pause" | "resume" | "archive") {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/backend/organizations/${orgSlug}/monitors/${monitorId}${action === "archive" ? "" : `/${action}`}`,
        { method: action === "archive" ? "DELETE" : "POST" },
      );
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) return toast.error(body?.message ?? `Monitor could not be ${action}d.`);
      toast.success(
        action === "pause"
          ? "Monitor paused"
          : action === "resume"
            ? "Monitor resumed"
            : "Monitor archived",
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" ? (
        <Button disabled={busy} onClick={() => mutate("pause")} variant="outline">
          {busy ? <LoaderCircle className="animate-spin" /> : <Pause />}Pause
        </Button>
      ) : null}
      {status === "paused" ? (
        <Button disabled={busy} onClick={() => mutate("resume")} variant="outline">
          {busy ? <LoaderCircle className="animate-spin" /> : <Play />}Resume
        </Button>
      ) : null}
      <Button disabled={busy} onClick={() => mutate("archive")} variant="ghost">
        <Archive />
        Archive
      </Button>
    </div>
  );
}
