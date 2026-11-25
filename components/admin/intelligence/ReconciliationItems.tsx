"use client";

// The suggestions of one reconciliation job, each with the decision
// reconciliation-intelligence-svc accepts. Loaded on demand: the list read does
// not carry them, and the job's version (sent as If-Match) is read with them.

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { readReconciliationItems, type JobDetail } from "@/app/admin/intelligence/detail-actions";
import { RowActions } from "@/components/admin/shared/RowActions";

type Props = {
  jobId: string;
  /** Re-read the panel's list after a decision. */
  onDone?: () => void;
};

export function ReconciliationItems({ jobId, onDone }: Props) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      try {
        setDetail(await readReconciliationItems(jobId));
      } catch {
        setDetail({ ok: false, message: "The job could not be read." });
      }
    });

  const toggle = () => {
    if (!open && !detail) load();
    setOpen((o) => !o);
  };

  const noun = "suggestions";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        {open ? `Hide ${noun}` : `Show ${noun}`}
      </button>
      {open && detail && !detail.ok && (
        <p role="alert" className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{detail.message}</p>
      )}
      {open && detail?.ok && detail.items.length === 0 && (
        <p className="text-[11px] text-slate-400">No {noun} on this job.</p>
      )}
      {open && detail?.ok && detail.items.length > 0 && (
        <ul className="space-y-2 border-l border-slate-200 pl-3 dark:border-slate-700">
          {detail.items.map((item) => (
            <li key={item.id} className="space-y-1">
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-mono text-[10px] text-slate-400">{item.status}</span> · {item.summary}
              </p>
              <RowActions
                actions={["reconciliation.decide", "reconciliation.execute"]}
                recordId={jobId}
                subId={item.id}
                status={item.status}
                version={detail.version}
                onDone={() => {
                  load();
                  onDone?.();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
