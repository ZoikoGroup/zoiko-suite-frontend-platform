"use client";

import { useState } from "react";
import { Link as LinkIcon, Loader2, CheckCircle, XCircle } from "lucide-react";

export function TestConnectionButton({ interfaceId, authorityCode }: { interfaceId: string; authorityCode: string }) {
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");

  async function test() {
    setStatus("testing");
    setMsg("");
    try {
      const res = await fetch("/api/v1/tax-authority/interfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interface_id: interfaceId, authority_code: authorityCode, action: "test_connection" }),
      });
      if (res.ok) {
        setStatus("ok");
        setMsg("Connection successful");
      } else {
        const json = await res.json().catch(() => ({}));
        setStatus("fail");
        setMsg(json.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setStatus("fail");
      setMsg(err instanceof Error ? err.message : "Unreachable");
    }
  }

  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="h-3 w-3" /> OK
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400" title={msg}>
        <XCircle className="h-3 w-3" /> Fail
      </span>
    );
  }
  return (
    <button
      onClick={test}
      disabled={status === "testing"}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
      title={`Test connection to ${authorityCode}`}
    >
      {status === "testing" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <LinkIcon className="h-2.5 w-2.5" />}
      Test
    </button>
  );
}
