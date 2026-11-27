"use client";

// The client pieces of Policies & Controls: the register's select-all box,
// and the two control forms (define a control test, record a test result).
// The policy forms are the existing ones in ../PolicyForms.

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { submitAccountingDraft, submitControlExecution, submitControlTest } from "@/app/admin/policies/actions";
import { IDLE_COMMAND, IDLE_CONTROL_WRITE, type CommandState, type ControlWriteState } from "@/app/admin/policies/state";

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

const COMMAND_TONE = { idle: "neutral", done: "success", unchanged: "neutral", refused: "warning", stale: "warning", conflict: "warning", error: "error" } as const;

/**
 * Draft a REF-07 accounting policy version: where it applies, the framework
 * and its source, the impact analysis and (optionally) one pinned rule
 * mapping. It is always a DRAFT; the drawer carries review, approval and
 * activation, each by a different person.
 */
export function AccountingDraftForm({ firstDay }: { firstDay: string }) {
  const [state, action, pending] = useActionState<CommandState, FormData>(submitAccountingDraft, IDLE_COMMAND);
  return (
    <form action={action} className="space-y-4" data-testid="accounting-draft">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="ap_domain" className={LABEL}>Policy domain</label>
          <input id="ap_domain" name="policy_domain" required maxLength={64} placeholder="REVENUE_RECOGNITION" className={FIELD} autoComplete="off" />
          <p className={HINT}>Upper-case, e.g. INVENTORY_VALUATION.</p>
        </div>
        <div>
          <label htmlFor="ap_framework" className={LABEL}>Framework</label>
          <input id="ap_framework" name="framework" required maxLength={64} placeholder="IFRS" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ap_semver" className={LABEL}>Version</label>
          <input id="ap_semver" name="semantic_version" required maxLength={32} placeholder="1.0.0" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ap_precedence" className={LABEL}>Precedence</label>
          <input id="ap_precedence" name="precedence" type="number" min={0} defaultValue={0} className={FIELD} />
          <p className={HINT}>Higher wins where two apply.</p>
        </div>
        <div>
          <label htmlFor="ap_scope" className={LABEL}>Applies to</label>
          <select id="ap_scope" name="scope" defaultValue="entity" className={FIELD}>
            <option value="entity">Your legal entity</option>
            <option value="tenant">The whole organisation</option>
          </select>
        </div>
        <div>
          <label htmlFor="ap_book" className={LABEL}>Book <span className={OPTIONAL}>(optional, id)</span></label>
          <input id="ap_book" name="book_id" maxLength={36} className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ap_from" className={LABEL}>Effective from</label>
          <input id="ap_from" name="effective_from" type="date" required defaultValue={firstDay} className={FIELD} />
          <p className={HINT}>From 00:00 UTC. Today or earlier is retroactive: choose open periods and say why.</p>
        </div>
        <div>
          <label htmlFor="ap_to" className={LABEL}>Effective to <span className={OPTIONAL}>(optional)</span></label>
          <input id="ap_to" name="effective_to" type="date" className={FIELD} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ap_source" className={LABEL}>Framework source</label>
          <input id="ap_source" name="framework_source" required maxLength={2000} placeholder="IFRS 15 paragraphs 31–38" className={FIELD} autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ap_text" className={LABEL}>Policy text reference</label>
          <input id="ap_text" name="policy_text_ref" required maxLength={2000} placeholder="doc://policies/accounting/rev-rec-v1" className={FIELD} autoComplete="off" />
        </div>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <legend className="px-1 text-[12px] font-semibold text-navy-950 dark:text-slate-100">Impact analysis</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ap_impact" className={LABEL}>What this change reaches</label>
            <textarea id="ap_impact" name="impact_summary" required rows={2} maxLength={2000} className={FIELD} />
          </div>
          <div>
            <label htmlFor="ap_periods" className={LABEL}>Periods affected</label>
            <select id="ap_periods" name="affected_periods" defaultValue="FUTURE_ONLY" className={FIELD}>
              <option value="FUTURE_ONLY">Future periods only</option>
              <option value="OPEN_PERIODS">Open periods too</option>
            </select>
          </div>
          <div>
            <label htmlFor="ap_retro" className={LABEL}>Retroactive justification <span className={OPTIONAL}>(if it takes effect in the past)</span></label>
            <input id="ap_retro" name="retroactive_justification" maxLength={2000} className={FIELD} autoComplete="off" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300 sm:col-span-2">
            <input type="checkbox" name="closed_history_unchanged" defaultChecked className="h-3.5 w-3.5" /> Closed periods stay as they were (required: a policy change never restates a closed period)
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <legend className="px-1 text-[12px] font-semibold text-navy-950 dark:text-slate-100">Rule mapping <span className="font-normal text-slate-500">(optional)</span></legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="ap_map_kind" className={LABEL}>Kind</label>
            <input id="ap_map_kind" name="map_kind" maxLength={32} placeholder="POSTING_RULE" className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ap_map_ref" className={LABEL}>Reference</label>
            <input id="ap_map_ref" name="map_ref" maxLength={512} placeholder="PR-REV-001" className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ap_map_version" className={LABEL}>Pinned version</label>
            <input id="ap_map_version" name="map_version" maxLength={64} placeholder="3" className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ap_map_to" className={LABEL}>Maps to <span className={OPTIONAL}>(optional)</span></label>
            <input id="ap_map_to" name="map_to" maxLength={512} className={FIELD} autoComplete="off" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="ap_map_rationale" className={LABEL}>Why this rule</label>
            <input id="ap_map_rationale" name="map_rationale" maxLength={2000} className={FIELD} autoComplete="off" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="ap_rationale" className={LABEL}>Rationale</label>
        <textarea id="ap_rationale" name="rationale" required rows={2} maxLength={2000} className={FIELD} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">{pending ? "Drafting…" : "Draft accounting policy"}</Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">A draft decides nothing: a different person approves it, and the accounting authority brings it into force.</p>
      </div>
      <ResultBanner tone={COMMAND_TONE[state.status]} message={state.message} testId="accounting-draft-result" />
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
