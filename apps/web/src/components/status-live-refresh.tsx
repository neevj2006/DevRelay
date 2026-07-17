"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function StatusLiveRefresh({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<"live" | "polling" | "updated">("live");
  const scrollPosition = useRef(0);
  const opened = useRef(false);
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    let poll: ReturnType<typeof setInterval> | undefined;
    const reload = () => {
      scrollPosition.current = window.scrollY;
      setState("updated");
      router.refresh();
      requestAnimationFrame(() => window.scrollTo({ top: scrollPosition.current }));
    };
    const stream = new EventSource(`${apiUrl}/status/${encodeURIComponent(slug)}/events`);
    stream.addEventListener("status.changed", reload);
    stream.onopen = () => {
      setState("live");
      if (opened.current) reload();
      opened.current = true;
    };
    stream.onerror = () => {
      setState("polling");
      if (!poll) poll = setInterval(reload, 30_000);
    };
    return () => {
      stream.close();
      if (poll) clearInterval(poll);
    };
  }, [router, slug]);
  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
    >
      <RefreshCw
        aria-hidden="true"
        className={state === "updated" ? "size-3.5" : "size-3.5 motion-safe:animate-spin"}
      />
      {state === "live"
        ? "Live updates connected"
        : state === "polling"
          ? "Live connection unavailable; polling every 30 seconds"
          : "New status update loaded"}
    </span>
  );
}
