import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  detail,
  trend = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down" | "neutral";
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-medium text-text-secondary">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p
          className={cn(
            "mt-2 flex items-center gap-1 text-xs text-muted-foreground",
            trend === "up" && "text-[var(--status-operational-fg)]",
            trend === "down" && "text-[var(--status-major-fg)]",
          )}
        >
          <TrendIcon aria-hidden="true" className="size-3.5" />
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}
