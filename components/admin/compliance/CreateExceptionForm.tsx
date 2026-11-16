"use client";

// Raise a compliance exception case (exception-escalation-svc) through
// app/admin/compliance/exception-actions.ts. The jurisdiction is picked from
// jurisdiction-rules-svc's register by UUID; the legal entity and author are
// the session's.

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { createExceptionAction } from "@/app/admin/compliance/exception-actions";
import {
  EXCEPTION_SEVERITIES,
  IDLE_EXCEPTION_STATE,
  type ExceptionCreateState,
} from "@/app/admin/compliance/exception-state";
import type { JurisdictionOptions } from "@/components/admin/tax/jurisdiction-options";
import { JurisdictionSelect, jurisdictionsUsable } from "@/components/admin/tax/JurisdictionSelect";
import { RecordRows, WriteFeedback, jurisdictionNamer } from "@/components/admin/tax/TaxRuleForms";

export function CreateExceptionForm({ jurisdictions }: { jurisdictions: JurisdictionOptions }) {
  const [state, action, pending] = useActionState<ExceptionCreateState, FormData>(createExceptionAction, IDLE_EXCEPTION_STATE);
  const usable = jurisdictionsUsable(jurisdictions);
  const name = jurisdictionNamer(jurisdictions);
  const c = state.record;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Raise a compliance exception</h4>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <JurisdictionSelect id="exc-jurisdiction" name="jurisdiction_id" label="Jurisdiction" options={jurisdictions} className={FIELD} labelClassName={LABEL} />
          <div>
            <label htmlFor="exc-type" className={LABEL}>Exception type</label>
            <input id="exc-type" name="exception_type" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="exc-severity" className={LABEL}>Severity</label>
            <select id="exc-severity" name="severity_level" required defaultValue="" className={FIELD}>
              <option value="" disabled>Select a severity</option>
              {EXCEPTION_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="exc-linked-type" className={LABEL}>Linked record type</label>
            <input id="exc-linked-type" name="linked_object_type" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="exc-linked-id" className={LABEL}>Linked record ID</label>
            <input id="exc-linked-id" name="linked_object_id" required className={FIELD} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="exc-role" className={LABEL}>Assign to role <span className={OPTIONAL}>(optional)</span></label>
            <input id="exc-role" name="assigned_to_role" className={FIELD} autoComplete="off" />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="exc-description" className={LABEL}>Description</label>
            <textarea id="exc-description" name="description" required rows={2} className={FIELD} />
          </div>
        </div>
        <p className={HINT}>The case opens OPEN, attributed to you; another principal resolves it.</p>
        <Button type="submit" size="sm" loading={pending} disabled={pending || !usable}>
          {pending ? "Raising…" : "Raise exception"}
        </Button>
      </form>
      <WriteFeedback state={state}>
        {c && (
          <RecordRows
            rows={[
              ["Case ID", c.exception_case_id],
              ["Type", c.exception_type],
              ["Severity", c.severity_level],
              ["Jurisdiction", name(c.jurisdiction_id)],
              ["Linked", `${c.linked_object_type} ${c.linked_object_id}`],
              ["Status", c.case_status],
            ]}
          />
        )}
      </WriteFeedback>
    </div>
  );
}
