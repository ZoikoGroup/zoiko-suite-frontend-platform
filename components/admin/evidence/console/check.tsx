// The Check evidence tab: what the gate answers, and the form that asks it.

import { explainEvidenceOutcome } from "@/lib/api/evidence";
import { Chip } from "@/components/admin/authorization/console/register";
import { CheckEvidenceDialog } from "./forms";

const OUTCOMES = ["SATISFIED", "MISSING", "NO_REQUIREMENTS_DEFINED"] as const;

export function CheckTab({ legalEntityId }: { legalEntityId: string }) {
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-[15px] font-semibold text-navy-950 dark:text-slate-100">Ask the gate</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            Name an action and the evidence on file for it. The answer is recorded in the evidence ledger exactly as a calling
            service&apos;s check would be, and it is one of three — never a plain yes or no.
          </p>
        </div>
        <CheckEvidenceDialog legalEntityId={legalEntityId} tone="primary" />
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {OUTCOMES.map((o) => {
          const x = explainEvidenceOutcome(o);
          return (
            <li key={o} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <Chip label={x.shortLabel} tone={x.tone} />
              <p className="mt-2 text-[13px] font-medium text-navy-950 dark:text-slate-100">{x.headline}</p>
              <p className="mt-1 text-[12px] leading-snug text-slate-500 dark:text-slate-400">{x.meaning}</p>
              <p className="mt-2 font-mono text-[11px] text-slate-400">{o}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
