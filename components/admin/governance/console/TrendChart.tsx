"use client";

// Trend Over Time: decisions per day by status, as filled areas that fade
// downward (the v2.0 mock). Recharts needs the client; the series is computed
// on the server and handed in. Lines keep their dash patterns, the
// secondary encoding for colour-blind readers (see palette.ts).

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATUS_COLOR, STATUS_DASH, STATUS_LABEL, STATUS_ORDER, type StatusKey } from "./palette";

export type TrendRow = { date: string; label: string } & Record<StatusKey, number>;

export function TrendChart({ data }: { data: TrendRow[] }) {
  const ticks = Math.max(1, Math.floor(data.length / 6));
  return (
    <div className="h-52 w-full" role="img" aria-label="Decisions per day by status">
      <ResponsiveContainer width="100%" height="100%">
        {/* left 0 + a 32px axis: two- and three-digit counts were clipped by a
            negative left margin; right 18 keeps the last date label whole. */}
        <AreaChart data={data} margin={{ top: 6, right: 18, left: 0, bottom: 0 }}>
          <defs>
            {STATUS_ORDER.map((k) => (
              <linearGradient key={k} id={`gd-trend-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={STATUS_COLOR[k]} stopOpacity={0.24} />
                <stop offset="100%" stopColor={STATUS_COLOR[k]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
          <XAxis
            dataKey="label"
            interval={ticks - 1}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10.5, fill: "currentColor" }}
            className="text-slate-500 dark:text-slate-400"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={32}
            tick={{ fontSize: 10.5, fill: "currentColor" }}
            className="text-slate-500 dark:text-slate-400"
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeWidth: 1, className: "text-slate-300 dark:text-slate-600" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-md dark:border-slate-700 dark:bg-slate-900">
                  <p className="mb-1 font-semibold text-navy-950 dark:text-slate-100">{label}</p>
                  {STATUS_ORDER.map((k) => (
                    <p key={k} className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                        {STATUS_LABEL[k]}
                      </span>
                      <span className="font-semibold tabular-nums text-navy-950 dark:text-slate-100">
                        {(payload[0]?.payload as TrendRow)[k]}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null
            }
          />
          {STATUS_ORDER.map((k) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              name={STATUS_LABEL[k]}
              stroke={STATUS_COLOR[k]}
              strokeWidth={2}
              strokeDasharray={STATUS_DASH[k]}
              fill={`url(#gd-trend-${k})`}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
