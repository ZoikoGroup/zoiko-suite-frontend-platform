"use client";

// The client pieces of Policies & Controls: the register's select-all box,
// and the two control forms (define a control test, record a test result).
// The policy forms are the existing ones in ../PolicyForms.

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { submitControlExecution, submitControlTest } from "@/app/admin/policies/actions";
import { IDLE_CONTROL_WRITE, type ControlWriteState } from "@/app/admin/policies/state";

const TONE = { created: "success", replayed: "neutral", conflict: "warning", error: "error", idle: "neutral" } as const;

/** Ticks or clears every row box that belongs to the export form. */
export function SelectAll({ form }: { form: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all rows on this page"
      className="h-3.5 w-3.5 rounded border-slate-300 accent-navy-700 dark:border-slate-600"
      onChange={(e) => {
        const on = e.currentTarget.checked;
        document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="ids"][form="${form}"]`).forEach((b) => {
          b.checked = on;
        });
      }}
    />
  );
}

export function CreateControlTestForm({ defaultRef }: { defaultRef?: string }) {
  const [state, action, pending] = useActionState<ControlWriteState, FormData>(submitControlTest, IDLE_CONTROL_WRITE);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="ct_control_ref" className={LABEL}>Control reference</label>
          <input id="ct_control_ref" name="control_ref" required maxLength={128} defaultValue={defaultRef} placeholder="FIN-AP-01" className={FIELD} autoComplete="off" />
          <p className={HINT}>The control this test proves. Use a policy code to tie it to that policy.</p>
        </div>
        <div>
          <label htmlFor="ct_test_code" className={LABEL}>Test code <span className={OPTIONAL}>(cannot be changed later)</span></label>
          <input id="ct_test_code" name="test_code" required maxLength={64} placeholder="CT-FIN-AP-01" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ct_frequency" className={LABEL}>Test frequency</label>
          <select id="ct_frequency" name="test_frequency" defaultValue="QUARTERLY" className={FIELD}>
            {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "WEEKLY"].map((f) => (
              <option key={f} value={f}>{f.replace("_", "-").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>
            ))}
          </select>
          <p className={HINT}>Sets when the next test falls due.</p>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="ct_title" className={LABEL}>Title</label>
          <input id="ct_title" name="title" required maxLength={255} placeholder="Vendor bank-detail changes are independently verified" className={FIELD} autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ct_methodology" className={LABEL}>Methodology</label>
          <textarea id="ct_methodology" name="methodology" required rows={2} placeholder="Re-perform: trace each change to a call-back record by a second person." className={FIELD} />
        </div>
        <div>
          <label htmlFor="ct_sample" className={LABEL}>Sample approach <span className={OPTIONAL}>(optional)</span></label>
          <textarea id="ct_sample" name="sample_approach" rows={2} placeholder="25 items, random" className={FIELD} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">{pending ? "Defining…" : "Define control test"}</Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">A definition is immutable: a changed methodology is a new test code.</p>
      </div>
      <ResultBanner tone={TONE[state.status]} message={state.message} />
    </form>
  );
}

export function RecordExecutionForm({ definitionId }: { definitionId: string }) {
  const [state, action, pending] = useActionState<ControlWriteState, FormData>(submitControlExecution, IDLE_CONTROL_WRITE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="control_test_definition_id" value={definitionId} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="ex_from" className={LABEL}>Period from</label>
          <input id="ex_from" type="date" name="period_start" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="ex_to" className={LABEL}>Period to</label>
          <input id="ex_to" type="date" name="period_end" required className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="ex_result" className={LABEL}>Result</label>
        <select id="ex_result" name="result" defaultValue="EFFECTIVE" className={FIELD}>
          <option value="EFFECTIVE">Effective</option>
          <option value="EFFECTIVE_WITH_EXCEPTIONS">Effective with exceptions</option>
          <option value="NOT_EFFECTIVE">Not effective</option>
        </select>
      </div>
      <div>
        <label htmlFor="ex_exceptions" className={LABEL}>Exceptions noted <span className={OPTIONAL}>(optional)</span></label>
        <textarea id="ex_exceptions" name="exceptions_noted" rows={2} className={FIELD} />
      </div>
      <div>
        <label htmlFor="ex_evidence" className={LABEL}>Evidence references <span className={OPTIONAL}>(one per line)</span></label>
        <textarea id="ex_evidence" name="evidence_refs" rows={2} placeholder="doc://workpapers/2026-Q3/ap-01" className={FIELD} />
      </div>
      <Button type="submit" loading={pending} size="sm" className="w-full">{pending ? "Recording…" : "Record test result"}</Button>
      <p className={HINT}>You are recorded as the tester. Review by a second person is recorded separately.</p>
      <ResultBanner tone={TONE[state.status]} message={state.message} />
    </form>
  );
}
