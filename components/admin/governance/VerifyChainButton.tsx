"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Download, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui";
import { verifyChain, exportChain } from "@/lib/api/governance";
import type { Identity } from "@/lib/api/client";

interface VerifyChainResult {
  valid: boolean;
  checked: number;
  last_decision_id: string;
}

export function VerifyChainButton({ identity }: { identity: Identity }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<VerifyChainResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setState("loading");
    setError(null);
    setResult(null);
    try {
      const res = await verifyChain(identity);
      if (res.ok) {
        setResult(res.data);
        setState("success");
      } else {
        setError(res.error.message);
        setState("error");
      }
    } catch {
      setError("Unexpected error");
      setState("error");
    }
  };

  const handleExport = async () => {
    setState("loading");
    setError(null);
    try {
      const res = await exportChain(identity);
      if (res.ok) {
        const json = JSON.stringify(res.data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evidence-chain-${identity.tenantId}-${Date.now()}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
        setState("success");
      } else {
        setError(res.error.message);
        setState("error");
      }
    } catch {
      setError("Export failed");
      setState("error");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={state === "loading" ? "secondary" : "ghost"}
        onClick={handleVerify}
        disabled={state === "loading"}
        className="gap-2"
      >
        {state === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying…
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" />
            Verify Chain
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        onClick={handleExport}
        disabled={state === "loading"}
        className="gap-2"
      >
        {state === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Exporting…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Export Chain
          </>
        )}
      </Button>
      {state === "success" && result && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          <span>
            Valid: {result.valid ? "Yes" : "No"} • Checked: {result.checked} • Last:{" "}
            <code className="font-mono text-[11px]">{result.last_decision_id.slice(0, 8)}…</code>
          </span>
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