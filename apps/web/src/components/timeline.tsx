import { Circle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function Timeline({
  children,
  className,
  label = "Activity timeline",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <ol aria-label={label} className={cn("relative space-y-6", className)}>
      {children}
    </ol>
  );
}

type TimelineEventProps = {
  title: string;
  timestamp: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  label?: string;
  tone?: "default" | "public" | "private";
};

export function TimelineEvent({
  title,
  timestamp,
  children,
  icon: Icon = Circle,
  label,
  tone = "default",
}: TimelineEventProps) {
  return (
    <li className="relative grid grid-cols-[2rem_1fr] gap-3">
      <span
        aria-hidden="true"
        className="absolute bottom-[-1.5rem] left-[0.9375rem] top-8 w-px bg-border-subtle last:hidden"
      />
      <span className="z-10 flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <article
        className={cn(
          "min-w-0 rounded-lg border bg-card p-4",
          tone === "public" && "border-primary bg-brand-soft",
          tone === "private" && "border-dashed border-border-strong bg-surface-subtle",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {label ? (
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
            ) : null}
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
          <time className="font-mono text-xs tabular-nums text-muted-foreground">{timestamp}</time>
        </div>
        {children ? <div className="mt-2 text-sm text-text-secondary">{children}</div> : null}
      </article>
    </li>
  );
}
