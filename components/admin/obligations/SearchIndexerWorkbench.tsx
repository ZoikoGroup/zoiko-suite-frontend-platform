"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  getSearchIndexerStatusAction,
  triggerIndexerSyncAction,
  executeSearchAction,
  indexDocumentAction,
  runFullSearchQASuiteAction,
  type SearchQATestReport,
} from "@/app/admin/obligations/search-actions";
import type { SearchIndexerStatus, SearchHit } from "@/lib/api/search-indexer";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR, BANNER_WARNING } from "@/components/admin/shared/form";

const PRIMARY_TENANT = "11111111-1111-1111-1111-111111111111";
const SECONDARY_TENANT = "99999999-9999-9999-9999-999999999999";
const DEMO_LEGAL_ENTITY = "22222222-2222-2222-2222-222222222222";

export function SearchIndexerWorkbench() {
  const [activeTab, setActiveTab] = useState<"search" | "ingest" | "qa" | "architecture">("search");
  const [isPending, startTransition] = useTransition();

  // Service telemetry state
  const [status, setStatus] = useState<SearchIndexerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Search state
  const [tenantId, setTenantId] = useState(PRIMARY_TENANT);
  const [keywords, setKeywords] = useState("OBL");
  const [searchSize, setSearchSize] = useState(10);
  const [searchResults, setSearchResults] = useState<{
    total: number;
    hits: SearchHit[];
    durationMs: number;
    searched: boolean;
    error?: string;
  }>({ total: 0, hits: [], durationMs: 0, searched: false });
  const [searchLoading, setSearchLoading] = useState(false);

  // Ingestion state
  const [docId, setDocId] = useState(() => `obl-${Date.now().toString(36)}`);
  const [docTenantId, setDocTenantId] = useState(PRIMARY_TENANT);
  const [docEntityId, setDocEntityId] = useState(DEMO_LEGAL_ENTITY);
  const [docCode, setDocCode] = useState("OBL-CORP-TAX-Q3-2026");
  const [docType, setDocType] = useState("STATUTORY");
  const [docStatus, setDocStatus] = useState("OPEN");
  const [docSeverity, setDocSeverity] = useState("HIGH");
  const [docResponsible, setDocResponsible] = useState("Corporate Tax & Compliance");
  const [docSource, setDocSource] = useState("Statutory Filing Schedule 2026 / QA Benchmark");
  const [ingestFeedback, setIngestFeedback] = useState<{
    type: "success" | "error";
    message: string;
    details?: any;
  } | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);

  // QA Suite state
  const [qaReports, setQaReports] = useState<SearchQATestReport[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaRunCompleted, setQaRunCompleted] = useState(false);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setStatusLoading(true);
    try {
      const data = await getSearchIndexerStatusAction();
      setStatus(data);
    } catch {
      // Offline fallback
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleTriggerSync() {
    setSyncFeedback({ type: "info", message: "Dispatching live on-demand sync to search-indexer-svc..." });
    startTransition(async () => {
      try {
        const res = await triggerIndexerSyncAction();
        if (res.success) {
          setSyncFeedback({
            type: "success",
            message: `Sync pass completed in ${res.duration_ms}ms. Total indexed records in OpenSearch: ${res.stats.total_indexed}.`,
          });
          await fetchStatus();
        } else {
          setSyncFeedback({
            type: "error",
            message: `Sync failed: ${res.error || "Unknown service error"}`,
          });
        }
      } catch (err: any) {
        setSyncFeedback({
          type: "error",
          message: `Network error invoking sync: ${err.message}`,
        });
      }
    });
  }

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSearchLoading(true);
    const start = performance.now();
    try {
      const res = await executeSearchAction({
        tenantId: tenantId.trim() || undefined,
        keywords: keywords.trim(),
        size: searchSize,
      });

      const elapsed = Math.round(performance.now() - start);

      if (res.ok) {
        setSearchResults({
          total: res.data.total,
          hits: res.data.results || [],
          durationMs: elapsed,
          searched: true,
        });
      } else {
        setSearchResults({
          total: 0,
          hits: [],
          durationMs: elapsed,
          searched: true,
          error: res.data.message || res.data.error || `HTTP ${res.status} error`,
        });
      }
    } catch (err: any) {
      setSearchResults({
        total: 0,
        hits: [],
        durationMs: Math.round(performance.now() - start),
        searched: true,
        error: err.message,
      });
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleIndexDocument(e: React.FormEvent) {
    e.preventDefault();
    setIngestLoading(true);
    setIngestFeedback(null);
    try {
      const res = await indexDocumentAction({
        id: docId.trim(),
        tenantId: docTenantId.trim(),
        legalEntityId: docEntityId.trim(),
        body: {
          obligation_code: docCode.trim(),
          obligation_type: docType,
          obligation_status: docStatus,
          responsible_function: docResponsible.trim(),
          source_reference: docSource.trim(),
          severity_level: docSeverity,
          jurisdiction_id: "88888888-8888-8888-8888-888888888888",
          updated_at: new Date().toISOString(),
        },
      });

      if (res.ok && res.data.indexed) {
        setIngestFeedback({
          type: "success",
          message: `Successfully indexed obligation "${docCode}" [ID: ${docId}] into OpenSearch index "${res.data.index}".`,
          details: res.data,
        });
        // Generate new ID for next insert
        setDocId(`obl-${Date.now().toString(36)}`);
        // Refresh index stats
        fetchStatus();
      } else {
        setIngestFeedback({
          type: "error",
          message: `Indexing rejected: ${res.data.message || res.data.error || `Status ${res.status}`}`,
        });
      }
    } catch (err: any) {
      setIngestFeedback({
        type: "error",
        message: `Network error: ${err.message}`,
      });
    } finally {
      setIngestLoading(false);
    }
  }

  async function handleRunQASuite() {
    setQaLoading(true);
    setQaRunCompleted(false);
    try {
      const reports = await runFullSearchQASuiteAction();
      setQaReports(reports);
      setQaRunCompleted(true);
      await fetchStatus();
    } catch (err: any) {
      alert(`QA Test Runner encountered an exception: ${err.message}`);
    } finally {
      setQaLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Telemetry Header Card */}
      <div className="rounded-xl border border-navy-200 bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 p-5 text-white shadow-lg dark:border-navy-500/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-lg font-bold tracking-tight text-white">
                Search Indexer & OpenSearch Telemetry (:8096)
              </h2>
              <span className="rounded-full bg-navy-800 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
                search-indexer-svc
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              Real-time ingestion syncer and tenant-isolated full-text search pipeline backed by OpenSearch 2.19
              and obligations-svc (:8088).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchStatus}
              disabled={statusLoading}
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              {statusLoading ? "Refreshing..." : "Refresh Probes"}
            </button>
            <button
              onClick={handleTriggerSync}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Syncing OpenSearch...
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Trigger On-Demand Sync
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-800 pt-4">
          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">Indexer Service</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  status?.status.healthy && status?.status.ready ? "bg-emerald-400" : "bg-rose-500"
                }`}
              />
              <span className="text-xs font-semibold text-slate-100">
                {status?.status.healthy && status?.status.ready ? "HEALTHY & READY" : "DEGRADED / OFFLINE"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Port :8096 | /readyz 200</p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">OpenSearch Cluster</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  status?.opensearchCluster?.status === "green"
                    ? "bg-emerald-400"
                    : status?.opensearchCluster?.status === "yellow"
                    ? "bg-amber-400"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-xs font-semibold uppercase text-slate-100">
                {status?.opensearchCluster?.status || "HEALTHY"} (Port :9200)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Nodes: {status?.opensearchCluster?.number_of_nodes || 1} | Shards:{" "}
              {status?.opensearchCluster?.active_primary_shards || 1}
            </p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">Target Search Index</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-cyan-300">zoiko-obligations</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Indexed Docs: <strong className="text-white">{status?.syncer.total_indexed ?? 0}</strong>
            </p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">Background Syncer</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-200">
                {status?.syncer.is_ready ? "Active (Every 60s)" : "Standby"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Last Pass: {status?.syncer.last_sync_at ? new Date(status.syncer.last_sync_at).toLocaleTimeString() : "Never"}
            </p>
          </div>
        </div>

        {syncFeedback && (
          <div
            className={`mt-3 rounded-lg p-2.5 text-xs font-medium ${
              syncFeedback.type === "success"
                ? "bg-emerald-950/80 border border-emerald-500/50 text-emerald-200"
                : syncFeedback.type === "error"
                ? "bg-rose-950/80 border border-rose-500/50 text-rose-200"
                : "bg-blue-950/80 border border-blue-500/50 text-blue-200"
            }`}
          >
            {syncFeedback.message}
          </div>
        )}
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("search")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "search"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Full-Text Search Console
        </button>

        <button
          onClick={() => setActiveTab("ingest")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "ingest"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Document Ingestion Studio
        </button>

        <button
          onClick={() => setActiveTab("qa")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "qa"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Senior QA Test Matrix (7 Cases)
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Automated
          </span>
        </button>

        <button
          onClick={() => setActiveTab("architecture")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "architecture"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Topology & Security Guards
        </button>
      </div>

      {/* TAB 1: Search Console */}
      {activeTab === "search" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              OpenSearch Enterprise Full-Text Search
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Dispatches multi-match queries against obligations indexed in OpenSearch. Tenant scoping is strictly
              enforced — searching without tenant ID returns 400 Bad Request.
            </p>

            <form onSubmit={handleSearch} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="tenant-input" className={LABEL}>
                    Tenant ID Scope <span className="text-rose-500">* (Mandatory Zero-Trust Guard)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="tenant-input"
                      type="text"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                      className={`${FIELD} font-mono text-xs`}
                    />
                    <button
                      type="button"
                      onClick={() => setTenantId(PRIMARY_TENANT)}
                      title="Set Primary Tenant (1111...)"
                      className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Primary Tenant
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenantId(SECONDARY_TENANT)}
                      title="Set Secondary Tenant (9999... for Cross-Tenant Negative Test)"
                      className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cross-Tenant
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenantId("")}
                      title="Clear Tenant for Missing Scope Negative Test"
                      className="shrink-0 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
                    >
                      Clear (Neg)
                    </button>
                  </div>
                  <p className={HINT}>
                    Active tenant boundary. OpenSearch strictly restricts matches where{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
                      tenant_id == {tenantId || "(none)"}
                    </code>
                    .
                  </p>
                </div>

                <div>
                  <label htmlFor="limit-input" className={LABEL}>
                    Max Results Size
                  </label>
                  <select
                    id="limit-input"
                    value={searchSize}
                    onChange={(e) => setSearchSize(Number(e.target.value))}
                    className={FIELD}
                  >
                    <option value={5}>Top 5 Results</option>
                    <option value={10}>Top 10 Results</option>
                    <option value={25}>Top 25 Results</option>
                    <option value={50}>Top 50 Results</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="keywords-input" className={LABEL}>
                  Search Keywords / Phrase
                </label>
                <div className="flex gap-2">
                  <input
                    id="keywords-input"
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="Search by code (OBL-...), function (Tax), type (STATUTORY), or source reference..."
                    className={FIELD}
                  />
                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-navy-800 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                  >
                    {searchLoading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Searching...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Search OpenSearch
                      </>
                    )}
                  </button>
                </div>
                {/* Quick Presets */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-400">Quick Filters:</span>
                  {["OBL", "STATUTORY", "TAX", "REGULATORY", "CONTRACTUAL", "QA-AUTOSUITE"].map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setKeywords(term)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>

          {/* Search Results Display */}
          {searchResults.searched && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Search Results</h4>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {searchResults.total} hit{searchResults.total !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-slate-400">({searchResults.durationMs}ms)</span>
                </div>
                {searchResults.total > 0 && (
                  <span className="text-xs text-slate-500">
                    Scoped to Tenant: <span className="font-mono font-semibold">{tenantId}</span>
                  </span>
                )}
              </div>

              {searchResults.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/50 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-bold">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Search Rejected / Guard Activated
                  </div>
                  <p className="mt-1">{searchResults.error}</p>
                </div>
              )}

              {searchResults.total === 0 && !searchResults.error && (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <svg className="mx-auto h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No documents matched query &quot;{keywords}&quot; under tenant {tenantId || "(none)"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    If this is a cross-tenant query, 0 results confirms strict tenant isolation. Otherwise, try &quot;OBL&quot; or trigger a sync pass.
                  </p>
                </div>
              )}

              {searchResults.hits.length > 0 && (
                <div className="grid grid-cols-1 gap-3">
                  {searchResults.hits.map((hit) => {
                    const body = hit.Body || {};
                    return (
                      <div
                        key={hit.ID}
                        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-navy-400 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-navy-900 dark:text-cyan-400">
                              {body.obligation_code || hit.ID}
                            </span>
                            {body.obligation_type && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {body.obligation_type}
                              </span>
                            )}
                            {body.obligation_status && (
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                  body.obligation_status === "OPEN"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                }`}
                              >
                                {body.obligation_status}
                              </span>
                            )}
                            {body.severity_level && (
                              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                {body.severity_level}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Relevance: {hit.Score.toFixed(3)}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">ID: {hit.ID.slice(0, 12)}...</span>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                          <div>
                            <strong className="text-slate-700 dark:text-slate-300">Responsible:</strong>{" "}
                            {body.responsible_function || "Unspecified"}
                          </div>
                          <div>
                            <strong className="text-slate-700 dark:text-slate-300">Source:</strong>{" "}
                            {body.source_reference || "None"}
                          </div>
                        </div>

                        <details className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <summary className="cursor-pointer text-[11px] font-medium text-navy-600 hover:underline dark:text-cyan-400">
                            View Stored JSON Payload
                          </summary>
                          <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-950 p-2.5 font-mono text-[11px] text-slate-200">
                            {JSON.stringify(hit.Body, null, 2)}
                          </pre>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Ingestion Studio */}
      {activeTab === "ingest" && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Direct Document Ingestion Studio (POST /v1/index)
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Directly upserts a structured obligation record into OpenSearch index{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
              zoiko-obligations
            </code>
            . Simulates both syncer behavior and real-time Kafka event ingestion.
          </p>

          <form onSubmit={handleIndexDocument} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="doc-id" className={LABEL}>
                  Obligation ID (OpenSearch _id)
                </label>
                <div className="flex gap-2">
                  <input
                    id="doc-id"
                    type="text"
                    required
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                    className={`${FIELD} font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={() => setDocId(`obl-${Date.now().toString(36)}`)}
                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Gen
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="doc-tenant" className={LABEL}>
                  Tenant ID Scope <span className="text-rose-500">*</span>
                </label>
                <input
                  id="doc-tenant"
                  type="text"
                  required
                  value={docTenantId}
                  onChange={(e) => setDocTenantId(e.target.value)}
                  className={`${FIELD} font-mono text-xs`}
                />
              </div>

              <div>
                <label htmlFor="doc-entity" className={LABEL}>
                  Legal Entity ID
                </label>
                <input
                  id="doc-entity"
                  type="text"
                  required
                  value={docEntityId}
                  onChange={(e) => setDocEntityId(e.target.value)}
                  className={`${FIELD} font-mono text-xs`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label htmlFor="doc-code" className={LABEL}>
                  Obligation Code
                </label>
                <input
                  id="doc-code"
                  type="text"
                  required
                  value={docCode}
                  onChange={(e) => setDocCode(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="doc-type" className={LABEL}>
                  Type
                </label>
                <select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)} className={FIELD}>
                  <option value="STATUTORY">STATUTORY</option>
                  <option value="REGULATORY">REGULATORY</option>
                  <option value="CONTRACTUAL">CONTRACTUAL</option>
                  <option value="INTERNAL_POLICY">INTERNAL_POLICY</option>
                </select>
              </div>

              <div>
                <label htmlFor="doc-status" className={LABEL}>
                  Status
                </label>
                <select id="doc-status" value={docStatus} onChange={(e) => setDocStatus(e.target.value)} className={FIELD}>
                  <option value="OPEN">OPEN</option>
                  <option value="PENDING">PENDING</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="FULFILLED">FULFILLED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div>
                <label htmlFor="doc-severity" className={LABEL}>
                  Severity Level
                </label>
                <select
                  id="doc-severity"
                  value={docSeverity}
                  onChange={(e) => setDocSeverity(e.target.value)}
                  className={FIELD}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="doc-responsible" className={LABEL}>
                  Responsible Function
                </label>
                <input
                  id="doc-responsible"
                  type="text"
                  value={docResponsible}
                  onChange={(e) => setDocResponsible(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="doc-source" className={LABEL}>
                  Source Reference
                </label>
                <input
                  id="doc-source"
                  type="text"
                  value={docSource}
                  onChange={(e) => setDocSource(e.target.value)}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDocCode(`OBL-TAX-HMRC-VAT-${Math.floor(Math.random() * 900 + 100)}`);
                    setDocType("STATUTORY");
                    setDocResponsible("UK Corporate VAT Team");
                    setDocSource("HMRC VAT Act 1994 s.59 / Schedule 11");
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Preset: UK VAT Statutory
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDocCode(`OBL-GDPR-DPO-AUDIT-${Math.floor(Math.random() * 900 + 100)}`);
                    setDocType("REGULATORY");
                    setDocResponsible("Data Privacy Office");
                    setDocSource("EU GDPR Article 30 Records of Processing");
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Preset: GDPR Privacy Audit
                </button>
              </div>

              <button
                type="submit"
                disabled={ingestLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {ingestLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Indexing Document...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Index Document to OpenSearch
                  </>
                )}
              </button>
            </div>
          </form>

          {ingestFeedback && (
            <div
              className={`mt-4 rounded-lg p-3 text-xs font-medium ${
                ingestFeedback.type === "success" ? BANNER_SUCCESS : BANNER_ERROR
              }`}
            >
              <div className="font-bold">{ingestFeedback.message}</div>
              {ingestFeedback.details && (
                <div className="mt-1 font-mono text-[11px] opacity-90">
                  Target: {ingestFeedback.details.index} | ID: {ingestFeedback.details.id} | Status: Indexed
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Automated QA Suite */}
      {activeTab === "qa" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Automated QA Test Execution Matrix
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Executes all 7 acceptance criteria tests end-to-end: health probes, OpenSearch connectivity,
                  on-demand sync, document upsert, full-text retrieval, missing-tenant negative guard, and cross-tenant
                  isolation.
                </p>
              </div>

              <button
                onClick={handleRunQASuite}
                disabled={qaLoading}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-navy-800 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
              >
                {qaLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Running 7 Test Cases...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run Complete QA Test Suite
                  </>
                )}
              </button>
            </div>

            {/* QA Scorecard Summary */}
            {qaRunCompleted && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Executed</span>
                  <div className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {qaReports.length} Tests
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40">
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Passed</span>
                  <div className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {qaReports.filter((r) => r.passed).length} / {qaReports.length}
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40">
                  <span className="text-[10px] uppercase font-bold text-rose-600">Failed</span>
                  <div className="mt-1 text-xl font-extrabold text-rose-600 dark:text-rose-400">
                    {qaReports.filter((r) => !r.passed).length}
                  </div>
                </div>
                <div className="rounded-lg bg-cyan-50 p-3 dark:bg-cyan-950/40">
                  <span className="text-[10px] uppercase font-bold text-cyan-700">Total Latency</span>
                  <div className="mt-1 text-xl font-extrabold text-cyan-800 dark:text-cyan-300">
                    {qaReports.reduce((sum, r) => sum + r.latencyMs, 0)}ms
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Case Cards */}
          {qaReports.length > 0 && (
            <div className="space-y-3">
              {qaReports.map((report) => (
                <div
                  key={report.id}
                  className={`rounded-lg border p-4 transition-all ${
                    report.passed
                      ? "border-emerald-200 bg-white dark:border-emerald-800/40 dark:bg-slate-900"
                      : "border-rose-300 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-950/20"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${
                          report.passed
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {report.passed ? "PASS" : "FAIL"}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-500">{report.id}</span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{report.title}</h4>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          report.category === "POSITIVE"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                        }`}
                      >
                        {report.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-slate-500">
                        Status: <strong className={report.passed ? "text-emerald-600" : "text-rose-600"}>{report.actualStatus}</strong>{" "}
                        (Exp: {report.expectedStatus})
                      </span>
                      <span className="font-mono text-slate-400">{report.latencyMs}ms</span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{report.description}</p>

                  <div className="mt-3 grid grid-cols-1 gap-2 rounded bg-slate-50 p-2.5 text-xs dark:bg-slate-800 sm:grid-cols-2">
                    <div>
                      <strong className="text-slate-700 dark:text-slate-300">Response Summary:</strong>{" "}
                      <span className="font-mono text-slate-600 dark:text-slate-400">{report.responseSummary}</span>
                    </div>
                    <div>
                      <strong className="text-slate-700 dark:text-slate-300">QA Note:</strong>{" "}
                      <span className="text-slate-500 dark:text-slate-400">{report.notes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!qaRunCompleted && !qaLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <svg className="mx-auto h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                QA Test Matrix Ready for Execution
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Click &quot;Run Complete QA Test Suite&quot; above to execute all 7 positive & negative test scenarios.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Architecture & Topology */}
      {activeTab === "architecture" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              System Topology & Search Index Pipeline
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Complete dataflow from obligations-svc domain writes to OpenSearch cluster indexing and client retrieval.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-[10px] text-white">
                    1
                  </span>
                  Upstream Data Source
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-navy-800 dark:text-cyan-300">
                  obligations-svc (:8088)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Tracks statutory and contractual obligations. Exposes GET /v1/obligations requiring{" "}
                  <code>X-Tenant-Id</code> and <code>X-Principal-Id</code> headers.
                </p>
              </div>

              <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-900 dark:text-cyan-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-700 text-[10px] text-white">
                    2
                  </span>
                  Syncer & Query Engine
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-cyan-800 dark:text-cyan-300">
                  search-indexer-svc (:8096)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Runs background syncer (60s), forwards security headers, enforces mandatory tenant query scoping, and manages
                  OpenSearch index lifecycle.
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] text-white">
                    3
                  </span>
                  Distributed Datastore
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                  zoiko-opensearch (:9200)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  OpenSearch 2.19 cluster hosting <code>zoiko-obligations</code> index. Provides inverted index full-text
                  BM25 scoring and multi-field matching.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Senior QA Security & Architecture Checkpoints
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <strong className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Strict Multi-Tenant Isolation (Zero-Trust)
                  </strong>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Search queries without <code>tenant_id</code> are immediately rejected with 400 Bad Request. Queries
                    with Tenant A cannot see documents belonging to Tenant B.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <strong className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Syncer Upstream Header Propagation
                  </strong>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Resolved Bug 1: Added mandatory <code>X-Principal-Id</code> and <code>X-Tenant-Id</code> forwarding in
                    syncer HTTP requests, preventing 401 unauthenticated drops.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
