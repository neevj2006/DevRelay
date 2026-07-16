"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AccessibleChart } from "@/components/accessible-chart";
import { latencySeries } from "@/lib/prototype-data";

export function LatencyChart() {
  return (
    <AccessibleChart
      columns={["Time", "Latency (ms)", "Failed checks"]}
      description="API Gateway response time and failed checks over the last six hours."
      rows={latencySeries.map((point) => ({
        label: point.time,
        values: [point.latency, point.failures],
      }))}
      summary="Latency peaked at 684 ms at 14:00 UTC alongside 14 failed checks, then improved to 438 ms after traffic shifted."
      title="Latency and check outcomes"
    >
      <ResponsiveContainer height={260} width="100%">
        <LineChart data={latencySeries} margin={{ left: -12, right: 8, top: 12 }}>
          <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            fontSize={12}
            stroke="var(--text-muted)"
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            fontSize={12}
            stroke="var(--text-muted)"
            tickFormatter={(value) => `${value}ms`}
            tickLine={false}
            width={58}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              color: "var(--text-primary)",
            }}
            formatter={(value) => [`${value} ms`, "Latency"]}
          />
          <Line
            activeDot={{ r: 4 }}
            dataKey="latency"
            dot={false}
            stroke="var(--chart-1)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </AccessibleChart>
  );
}
