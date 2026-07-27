"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { APPROVAL_OUTCOMES } from "@/lib/mock-data";

export function ApprovalOutcomesChart() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div className="flex flex-col items-center">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={APPROVAL_OUTCOMES}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={3}
              cornerRadius={6}
              animationDuration={800}
              stroke="none"
            >
              {APPROVAL_OUTCOMES.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
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
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {APPROVAL_OUTCOMES.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
            <span className="font-medium text-slate-800 dark:text-slate-200">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
