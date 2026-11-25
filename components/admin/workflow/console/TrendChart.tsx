"use client";

// Approval Trend: workflows approved per day, as one green area that fades
// downward (the v2.0 mock). Recharts needs the client; the series is counted
// on the server and handed in.

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "./data";

const GREEN = "var(--wf-approved)";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const every = Math.max(1, Math.round(data.length / 10));
  return (
    <div className="h-44 w-full" role="img" aria-label="Workflows approved per day">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 14, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="wf-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.3} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
          <XAxis
            dataKey="label"
            interval={every - 1}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10.5, fill: "currentColor" }}
            className="text-slate-500 dark:text-slate-400"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={28}
            tick={{ fontSize: 10.5, fill: "currentColor" }}
            className="text-slate-500 dark:text-slate-400"
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeWidth: 1, className: "text-slate-300 dark:text-slate-600" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-md dark:border-slate-700 dark:bg-slate-900">
                  <p className="font-semibold text-navy-950 dark:text-slate-100">{label}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />
                    Approved
                    <span className="ml-3 font-semibold tabular-nums text-navy-950 dark:text-slate-100">{(payload[0]?.payload as TrendPoint).approved}</span>
                  </p>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="approved"
            name="Approved"
            stroke={GREEN}
            strokeWidth={2}
            fill="url(#wf-trend-fill)"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
