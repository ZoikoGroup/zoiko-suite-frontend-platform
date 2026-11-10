"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Package, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { sealPackage, getPackage } from "@/lib/api/governance";
import type { Identity } from "@/lib/api/client";

interface SealPackageResult {
  package_id: string;
  sealed_at: string;
  decision_count: number;
  merkle_root: string;
}

export function SealPackageForm({ identity }: { identity: Identity }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<SealPackageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDecisionId, setLastDecisionId] = useState("");
  const [packageId, setPackageId] = useState("");

  const handleSeal = async () => {
    if (!lastDecisionId.trim()) {
      setError("Last decision ID is required");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    setResult(null);
    try {
      const res = await sealPackage(identity, {
        packageId: `pkg-${Date.now()}`,
        lastDecisionId: lastDecisionId.trim(),
      });
      if (res.ok) {
        setResult({
          package_id: res.data.package_id,
          sealed_at: new Date().toISOString(),
          decision_count: res.data.decision_count,
          merkle_root: res.data.merkle_root,
        });
        setState("success");
      } else {
        setError(res.error.message);
        setState("error");
      }
    } catch {
      setError("Failed to seal package");
      setState("error");
    }
  };

  const handleGetPackage = async () => {
    if (!packageId.trim()) {
      setError("Package ID is required");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const res = await getPackage(identity, packageId.trim());
      if (res.ok) {
        setResult({
          package_id: res.data.package_id,
          sealed_at: res.data.sealed_at,
          decision_count: res.data.decision_count,
          merkle_root: res.data.merkle_root,
        });
        setState("success");
      } else {
        setError(res.error.message);
        setState("error");
      }
    } catch {
      setError("Failed to fetch package");
      setState("error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="last_decision_id" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Last Decision ID <span className="text-slate-400">(required)</span>
          </label>
          <input
            id="last_decision_id"
            type="text"
            value={lastDecisionId}
            onChange={(e) => setLastDecisionId(e.target.value)}
            placeholder="4f8c2a91-…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono bg-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={state === "loading"}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seal all decisions up to and including this decision ID into a tamper-evident package.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="package_id" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Package ID <span className="text-slate-400">(to retrieve)</span>
          </label>
          <input
            id="package_id"
            type="text"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            placeholder="pkg-1234567890"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono bg-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={state === "loading"}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Look up a previously sealed package by its ID.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={state === "loading" ? "secondary" : "primary"}
          onClick={handleSeal}
          disabled={state === "loading" || !lastDecisionId.trim()}
          className="gap-2"
        >
          {state === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sealing…
            </>
          ) : (
            <>
              <Package className="h-4 w-4" />
              Seal Package
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={handleGetPackage}
          disabled={state === "loading" || !packageId.trim()}
          className="gap-2"
        >
          {state === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Get Package
            </>
          )}
        </Button>
      </div>

      {state === "success" && result && (
        <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-3">
            <CheckCircle className="h-4 w-4" />
            Package sealed
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">Package ID</dt>
            <dd className="font-mono text-slate-900 dark:text-slate-100">{result.package_id}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Sealed at</dt>
            <dd className="text-slate-900 dark:text-slate-100">{result.sealed_at}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Decisions included</dt>
            <dd className="text-slate-900 dark:text-slate-100">{result.decision_count}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Merkle root</dt>
            <dd className="font-mono text-[11px] text-slate-900 dark:text-slate-100">{result.merkle_root}</dd>
          </dl>
        </div>
      )}

      {state === "error" && error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}