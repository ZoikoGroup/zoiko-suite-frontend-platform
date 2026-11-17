"use client";

// Control Reviews: per month, reviews completed, test runs still awaiting
// review, and controls past their test date — filled areas that fade
// downward (the v2.0 mock). Recharts needs the client; the series is
// computed on the server and handed in.

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { REVIEW_SERIES } from "./palette";

export type ReviewPoint = { label: string; completed: number; inProgress: number; overdue: number };

export function ReviewsChart({ data }: { data: ReviewPoint[] }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Control reviews per month">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {REVIEW_SERIES.map((s) => (
              <linearGradient key={s.key} id={`pc-rev-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10.5, fill: "currentColor" }} className="text-slate-500 dark:text-slate-400" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fontSize: 10.5, fill: "currentColor" }} className="text-slate-500 dark:text-slate-400" />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeWidth: 1, className: "text-slate-300 dark:text-slate-600" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-md dark:border-slate-700 dark:bg-slate-900">
                  <p className="mb-1 font-semibold text-navy-950 dark:text-slate-100">{label}</p>
                  {REVIEW_SERIES.map((s) => (
                    <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="font-semibold tabular-nums text-navy-950 dark:text-slate-100">{(payload[0]?.payload as ReviewPoint)[s.key]}</span>
                    </p>
                  ))}
                </div>
              ) : null
            }
          />
          {REVIEW_SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash}
              fill={`url(#pc-rev-${s.key})`}
              dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
