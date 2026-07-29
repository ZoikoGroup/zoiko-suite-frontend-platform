"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/lib/api/governance";

/**
 * Presentational chart. Recharts needs the client, so the data is fetched by
 * GovernedActionsPanel (a Server Component) and handed down as a prop.
 */
export function GovernedActionsChart({ data }: { data: TrendPoint[] }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const isDark = mounted && resolvedTheme === "dark";

  const gridStroke = isDark ? "#1e293b" : "#e2e8f0";
  const tickFill = isDark ? "#64748b" : "#94a3b8";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="authorizedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-navy-600)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-navy-600)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="escalatedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-gold-500)" stopOpacity={0.5} />
              <stop offset="95%" stopColor="var(--color-gold-500)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: tickFill }}
            interval={2}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: tickFill }} width={36} />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
              background: isDark ? "#0f172a" : "#ffffff",
              color: isDark ? "#e2e8f0" : "#0f172a",
              fontSize: 12,
              boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
            }}
          />
          <Area
            type="monotone"
            dataKey="authorized"
            name="Authorized"
            stroke="var(--color-navy-500)"
            strokeWidth={2}
            fill="url(#authorizedFill)"
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="escalated"
            name="Escalated"
            stroke="var(--color-gold-600)"
            strokeWidth={2}
            fill="url(#escalatedFill)"
            animationDuration={900}
            animationBegin={150}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
