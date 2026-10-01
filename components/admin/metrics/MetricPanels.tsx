"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Database,
  GitBranch,
  History,
  Info,
  Loader2,
  Search,
  ShieldAlert,
  User,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import type { ReportMetricDefinition } from "@/lib/api/metric-registry";

export function MetricCatalogPanel({
  metrics,
}: {
  metrics: ReportMetricDefinition[];
}) {
  const [searchTerm, setSearchTerm] = useState("");

  // Read the ?view_history=CODE param directly on the client — no server-
  // component prop needed.  useSearchParams() is safe here because this
  // component is already a "use client" boundary; page.tsx wraps it in
  // <Suspense> so the parent tree is not forced into CSR.
  const searchParams = useSearchParams();
  const viewHistoryCode = searchParams.get("view_history") ?? undefined;

  // Version history is fetched client-side via /api/v1/metrics/[code]/versions,
  // a thin Next.js Route Handler that proxies to metric-registry-svc. The
  // backend ships no CORS headers, so the browser cannot reach :8149 directly.
  const [historyVersions, setHistoryVersions] = useState<ReportMetricDefinition[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewHistoryCode) {
      setHistoryVersions(null);
      setHistoryError(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryVersions(null);

    fetch(`/api/v1/metrics/${encodeURIComponent(viewHistoryCode)}/versions`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
        return body as ReportMetricDefinition[];
      })
      .then((data) => {
        if (!cancelled) setHistoryVersions(data);
      })
      .catch((err: Error) => {
        if (!cancelled)
          setHistoryError(err.message ?? "Failed to load version history");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewHistoryCode]);

  const filtered = metrics.filter(
    (m) =>
      m.metric_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.metric_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.formula_description.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Top Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <strong className="text-sm">{metrics.length}</strong> Active Executive Metrics
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Doc7 §27 REP-01 Source-Traceable
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
            Immutable Version Lineage
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search metrics or formulas…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Catalog Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {searchTerm
            ? `No executive metrics match "${searchTerm}".`
            : "No executive metrics have been recorded yet. Register your first metric definition below."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="py-3 pl-4 pr-3">Metric Code &amp; Name</th>
                <th className="px-3 py-3">Formula &amp; Calculation</th>
                <th className="px-3 py-3">Data Sources</th>
                <th className="px-3 py-3">Version</th>
                <th className="px-3 py-3">Owner</th>
                <th className="py-3 pl-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((m) => {
                const isSelected = viewHistoryCode === m.metric_code;
                return (
                  <tr
                    key={m.metric_definition_id}
                    className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/80 ${
                      isSelected ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <td className="py-3.5 pl-4 pr-3 align-top">
                      <div className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {m.metric_code}
                      </div>
                      <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {m.metric_name}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                        <Info className="h-3 w-3 shrink-0" />
                        <span>{m.intelligence_disclaimer}</span>
                      </div>
                    </td>

                    <td className="px-3 py-3.5 align-top text-xs text-slate-700 dark:text-slate-300">
                      <div className="max-w-md font-mono text-[11px] leading-relaxed">
                        {m.formula_description}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        Effective: {new Date(m.effective_from).toLocaleDateString("en-CA")}
                      </div>
                    </td>

                    <td className="px-3 py-3.5 align-top">
                      {m.data_sources && m.data_sources.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.data_sources.map((src) => (
                            <span
                              key={src}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              <Database className="h-2.5 w-2.5" />
                              {src}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-slate-400">None specified</span>
                      )}
                    </td>

                    <td className="px-3 py-3.5 align-top">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        v{m.version} ACTIVE
                      </span>
                    </td>

                    <td className="px-3 py-3.5 align-top text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-mono text-[11px]">{m.owner_principal_id.slice(0, 8)}…</span>
                    </td>

                    <td className="py-3.5 pl-3 pr-4 text-right align-top">
                      <Link
                        href={
                          isSelected
                            ? "/admin/metrics"
                            : `/admin/metrics?view_history=${encodeURIComponent(m.metric_code)}`
                        }
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
                          isSelected
                            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        <History className="h-3 w-3" />
                        {isSelected ? "Close" : "History"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Version History Panel — appears when ?view_history=CODE is in the URL */}
      {viewHistoryCode && (
        <Card className="border-blue-200 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-950/10">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Version Lineage for Metric:{" "}
                <span className="font-mono">{viewHistoryCode}</span>
              </CardTitle>
              <CardDescription>
                Immutable historical versions. Publishing a new version atomically supersedes the previous active one.
              </CardDescription>
            </div>
            <Link
              href="/admin/metrics"
              className="text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
            >
              Close history
            </Link>
          </CardHeader>
          <CardContent>
            {/* Loading state */}
            {historyLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading version history…
              </div>
            )}

            {/* Error state */}
            {historyError && !historyLoading && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
                Failed to load version history: {historyError}
              </div>
            )}

            {/* Version cards */}
            {historyVersions && historyVersions.length === 0 && (
              <div className="py-4 text-center text-sm text-slate-500">
                No versions found for {viewHistoryCode}.
              </div>
            )}

            {historyVersions && historyVersions.length > 0 && (
              <div className="space-y-3">
                {historyVersions.map((v) => (
                  <div
                    key={v.metric_definition_id}
                    className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          Version {v.version}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            v.definition_status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {v.definition_status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Created: {new Date(v.created_at).toLocaleString("en-CA")} by{" "}
                        <span className="font-mono">{v.created_by_principal_id.slice(0, 8)}…</span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{v.metric_name}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        Formula: {v.formula_description}
                      </p>
                      {v.data_sources && v.data_sources.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Sources: {v.data_sources.join(", ")}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">
                        Effective: {new Date(v.effective_from).toLocaleDateString("en-CA")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
