"use client";

import { useState, useEffect } from "react";
import { Radio, RefreshCw, CheckCircle2, PauseCircle } from "lucide-react";

type DataFeed = {
  subscription_id: string;
  feed_name: string;
  provider: string;
  data_type: string;
  status: "ACTIVE" | "PAUSED" | "DISCONNECTED";
  last_received_at: string;
};

export function ExternalDataFeedPanel() {
  const [feeds, setFeeds] = useState<DataFeed[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeeds = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/integration/feeds");
      if (res.ok) {
        const data = await res.json();
        setFeeds(data.subscriptions ?? []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeds();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Market Data & Regulatory Ingestion Streams</span>
          <span className="font-mono text-[11px] text-slate-400">(:8175)</span>
        </div>
        <button
          type="button"
          onClick={fetchFeeds}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && feeds.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : feeds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Radio className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No external data subscriptions active.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {feeds.map((f) => (
            <div key={f.subscription_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                    <Radio className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {f.feed_name}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Provider: {f.provider}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {f.data_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      ID: {f.subscription_id} • Last Received: {new Date(f.last_received_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      f.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {f.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
