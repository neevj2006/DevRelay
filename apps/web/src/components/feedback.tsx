import { CircleCheck, Info, TriangleAlert, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const feedbackConfig = {
  info: { icon: Info, className: "border-primary/30 bg-brand-soft text-brand-soft-foreground" },
  success: {
    icon: CircleCheck,
    className:
      "border-[var(--status-operational-border)] bg-[var(--status-operational-bg)] text-[var(--status-operational-fg)]",
  },
  warning: {
    icon: TriangleAlert,
    className:
      "border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] text-[var(--status-degraded-fg)]",
  },
  danger: {
    icon: XCircle,
    className:
      "border-[var(--status-major-border)] bg-[var(--status-major-bg)] text-[var(--status-major-fg)]",
  },
} as const;

export function InlineFeedback({
  tone,
  title,
  description,
  className,
}: {
  tone: keyof typeof feedbackConfig;
  title: string;
  description: string;
  className?: string;
}) {
  const definition = feedbackConfig[tone];
  const Icon = definition.icon;
  return (
    <Alert className={cn(definition.className, className)}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
