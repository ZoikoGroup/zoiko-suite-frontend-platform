"use client";

import { useState, useEffect } from "react";
import { AlertOctagon, RefreshCw, Filter, ShieldAlert } from "lucide-react";

type SiemEvent = {
  event_id: string;
  event_type: string;
  source_ip: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  siem_platform: string;
  status: string;
  occurred_at: string;
};

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

export function SiemIntegrationPanel() {
  const [events, setEvents] = useState<SiemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/security/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filtered = severityFilter === "ALL" ? events : events.filter((e) => e.severity === severityFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Real-time SIEM Forwarding Feed</span>
          <span className="font-mono text-[11px] text-slate-400">(:8167)</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <button
            type="button"
            onClick={fetchEvents}
            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <AlertOctagon className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No security telemetry events matching filter.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filtered.map((evt) => (
            <div key={evt.event_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        SEVERITY_BADGES[evt.severity] || SEVERITY_BADGES.LOW
                      }`}
                    >
                      {evt.severity}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {evt.event_type}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {evt.siem_platform}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{evt.description}</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    Source IP: {evt.source_ip} • Status: {evt.status}
                  </p>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  <div>{new Date(evt.occurred_at).toLocaleTimeString()}</div>
                  <div className="text-[10px] font-mono">{evt.event_id}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
