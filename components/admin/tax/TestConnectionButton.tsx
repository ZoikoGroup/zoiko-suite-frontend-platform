"use client";

// Recent submission calls to a tax-authority adapter.
//
// This was a "Test" button that POSTed /tax-authority/interfaces/{id}/test, a
// route tax-authority-interface-svc does not have, so it always showed "Fail".
// The service has no connection test; what it records is the last hour of
// submission calls per provider, and that is what this reads. An interface
// with no provider bound sends nothing, so there is nothing to read.

import { useState } from "react";
import { Activity, Loader2 } from "lucide-react";

type Health = { recent_calls: number; recent_failures: number; window: string };

export function SubmissionHealthButton({ providerKey }: { providerKey?: string }) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "error"; message: string }
  >({ kind: "idle" });

  if (!providerKey) {
    return <span className="text-[10px] text-slate-400 dark:text-slate-500">No adapter bound</span>;
  }

  async function read() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/v1/tax-authority/health?provider_key=${encodeURIComponent(providerKey!)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: "ok", health: json as Health });
      } else {
        setState({
          kind: "error",
          message:
            res.status === 401
              ? "Session expired — sign in again"
              : res.status === 503
                ? "Authority adapter is off in this environment"
                : (json.error ?? `HTTP ${res.status}`),
        });
      }
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Unreachable" });
    }
  }

  if (state.kind === "ok") {
    const { recent_calls, recent_failures, window } = state.health;
    return (
      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
        {recent_calls} calls, {recent_failures} failed ({window})
      </span>
    );
  }
  if (state.kind === "error") {
    return <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">{state.message}</span>;
  }
  return (
    <button
      type="button"
      onClick={read}
      disabled={state.kind === "loading"}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
      title={`Recent submissions through ${providerKey}`}
    >
      {state.kind === "loading" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Activity className="h-2.5 w-2.5" />}
      Check
    </button>
  );
}
