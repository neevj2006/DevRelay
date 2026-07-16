import { AlertCircle, Clock3, Inbox, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DataStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: DataStateProps) {
  return (
    <section
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center",
        className,
      )}
    >
      <span className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
        <Inbox aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

export function LoadingState({ label = "Loading data" }: { label?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="space-y-3 rounded-lg border bg-card p-5"
      role="status"
    >
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ title, description, action, className }: DataStateProps) {
  return (
    <Alert className={className} variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </AlertDescription>
    </Alert>
  );
}

export function StaleState({ lastUpdated }: { lastUpdated: string }) {
  return (
    <Alert className="border-[var(--status-unknown-border)] bg-[var(--status-unknown-bg)] text-[var(--status-unknown-fg)]">
      <Clock3 aria-hidden="true" />
      <AlertTitle>Data may be stale</AlertTitle>
      <AlertDescription>Showing the last usable data from {lastUpdated}.</AlertDescription>
    </Alert>
  );
}

export function ReconnectingState() {
  return (
    <Alert
      className="border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] text-[var(--status-degraded-fg)]"
      role="status"
    >
      <WifiOff aria-hidden="true" />
      <AlertTitle>Reconnecting</AlertTitle>
      <AlertDescription>
        Live updates are paused. Existing information remains available.
      </AlertDescription>
    </Alert>
  );
}

export function UnauthorizedState() {
  return (
    <EmptyState
      action={
        <Button variant="outline">
          <RefreshCw aria-hidden="true" />
          Try another organization
        </Button>
      }
      description="Your current role does not grant access to this resource."
      title="Access restricted"
    />
  );
}

export function QuotaState({ reached = false }: { reached?: boolean }) {
  return (
    <Alert>
      <ShieldAlert aria-hidden="true" />
      <AlertTitle>{reached ? "Free-tier limit reached" : "Approaching free-tier limit"}</AlertTitle>
      <AlertDescription>
        {reached
          ? "Archive an unused resource before creating another."
          : "Review usage before adding more monitored resources."}
      </AlertDescription>
    </Alert>
  );
}
