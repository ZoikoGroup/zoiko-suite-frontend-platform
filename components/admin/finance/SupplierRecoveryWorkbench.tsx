"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@/components/ui";
import {
  approveSupplierRecoveryCaseAction,
  applyRecoveryOffsetAction,
  closeSupplierRecoveryCaseAction,
  createSupplierRecoveryCaseAction,
  escalateSupplierRecoveryAction,
  linkSupplierRefundAction,
  recordSupplierCommitmentAction,
  type SupplierRecoveryActionState,
  writeOffSupplierRecoveryAction,
} from "@/app/admin/finance/supplier-recovery-actions";
import type { SupplierRecoveryCase } from "@/lib/api/supplier-recovery";

const IDLE: SupplierRecoveryActionState = { status: "idle" };
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function Feedback({ state }: { state: SupplierRecoveryActionState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`rounded-lg border p-3 text-xs ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
      {state.message}
    </p>
  );
}

function CaseActions({ recovery }: { recovery: SupplierRecoveryCase }) {
  const [approveState, approveAction, approvePending] = useActionState(approveSupplierRecoveryCaseAction, IDLE);
  const [commitState, commitAction, commitPending] = useActionState(recordSupplierCommitmentAction, IDLE);
  const [offsetState, offsetAction, offsetPending] = useActionState(applyRecoveryOffsetAction, IDLE);
  const [refundState, refundAction, refundPending] = useActionState(linkSupplierRefundAction, IDLE);
  const [escalateState, escalateAction, escalatePending] = useActionState(escalateSupplierRecoveryAction, IDLE);
  const [writeOffState, writeOffAction, writeOffPending] = useActionState(writeOffSupplierRecoveryAction, IDLE);
  const [closeState, closeAction, closePending] = useActionState(closeSupplierRecoveryCaseAction, IDLE);
  const active = ["IN_RECOVERY", "PARTIALLY_RECOVERED", "APPROVED"].includes(recovery.status);
  return (
    <div className="space-y-2">
      {recovery.status === "OPEN" && (
        <form action={approveAction} className="inline-flex">
          <input type="hidden" name="case_id" value={recovery.case_id} />
          <Button type="submit" size="sm" loading={approvePending}>Approve plan</Button>
        </form>
      )}
      {active && (
        <div className="grid gap-2 md:grid-cols-2">
          <form action={commitAction} className="space-y-1">
            <input type="hidden" name="case_id" value={recovery.case_id} />
            <input name="detail" required placeholder="Supplier commitment detail" className={inputClass} />
            <input name="expected_method" placeholder="Refund or offset" className={inputClass} />
            <Button type="submit" size="sm" loading={commitPending}>Record commitment</Button>
          </form>
          <form action={offsetAction} className="space-y-1">
            <input type="hidden" name="case_id" value={recovery.case_id} />
            <input name="amount" type="number" min="0.01" step="0.01" required placeholder={`Amount (${recovery.currency})`} className={inputClass} />
            <input name="recovery_ref" required placeholder="Unique offset reference" className={inputClass} />
            <Button type="submit" size="sm" loading={offsetPending}>Apply approved offset</Button>
          </form>
          <form action={refundAction} className="space-y-1">
            <input type="hidden" name="case_id" value={recovery.case_id} />
            <input name="statement_line_id" required placeholder="MATCHED bank statement line ID" className={inputClass} />
            <Button type="submit" size="sm" loading={refundPending}>Link confirmed refund</Button>
          </form>
        </div>
      )}
      {["OPEN", "IN_RECOVERY", "PARTIALLY_RECOVERED", "APPROVED"].includes(recovery.status) && (
        <form action={escalateAction} className="flex gap-2">
          <input type="hidden" name="case_id" value={recovery.case_id} />
          <input name="reason" required placeholder="Escalation reason" className={inputClass} />
          <Button type="submit" variant="secondary" size="sm" loading={escalatePending}>Escalate</Button>
        </form>
      )}
      {["OPEN", "IN_RECOVERY", "PARTIALLY_RECOVERED", "APPROVED", "ESCALATED"].includes(recovery.status) && (
        <form action={writeOffAction} className="flex gap-2">
          <input type="hidden" name="case_id" value={recovery.case_id} />
          <input name="reason" required placeholder="Write-off reason" className={inputClass} />
          <Button type="submit" variant="secondary" size="sm" loading={writeOffPending}>Write off</Button>
        </form>
      )}
      {recovery.status === "RECOVERED" && (
        <form action={closeAction} className="flex gap-2">
          <input type="hidden" name="case_id" value={recovery.case_id} />
          <input name="note" required placeholder="Closure note" className={inputClass} />
          <Button type="submit" size="sm" loading={closePending}>Close case</Button>
        </form>
      )}
      <Feedback state={approveState} /><Feedback state={commitState} /><Feedback state={offsetState} />
      <Feedback state={refundState} /><Feedback state={escalateState} /><Feedback state={writeOffState} /><Feedback state={closeState} />
    </div>
  );
}

export function SupplierRecoveryWorkbench({
  initialCases,
  legalEntityId,
}: {
  initialCases: SupplierRecoveryCase[];
  legalEntityId: string;
}) {
  const [createState, createAction, createPending] = useActionState(createSupplierRecoveryCaseAction, IDLE);
  return (
    <Card id="supplier-recovery">
      <CardHeader>
        <CardTitle>Supplier recovery cases</CardTitle>
        <CardDescription>
          AP-12 recovery workflow backed by supplier-recovery-svc (:8165). Cases are linked to a real AP-08 payable and can only close after full recovery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createAction} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2 dark:border-slate-800">
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Legal entity ID
            <input name="legal_entity_id" value={legalEntityId} readOnly className={inputClass} />
          </label>
          <input name="source_payable_id" required placeholder="Source payable ID" className={inputClass} />
          <input name="supplier_ref" required placeholder="Supplier reference" className={inputClass} />
          <select name="recovery_basis" defaultValue="OVERPAYMENT" className={inputClass}>
            <option value="OVERPAYMENT">Overpayment</option><option value="DUPLICATE_PAYMENT">Duplicate payment</option>
            <option value="SUPPLIER_CREDIT">Supplier credit</option><option value="CONTRACTUAL">Contractual</option>
          </select>
          <input name="total_amount" type="number" min="0.01" step="0.01" required placeholder="Recovery amount" className={inputClass} />
          <input name="currency" defaultValue="GBP" required placeholder="Currency" className={inputClass} />
          <input name="recovery_reason" required placeholder="Evidence/recovery reason" className={inputClass} />
          <Button type="submit" loading={createPending}>Create recovery case</Button>
        </form>
        <Feedback state={createState} />
        {initialCases.length === 0 ? <p className="text-sm text-slate-500">No open supplier recovery cases.</p> : (
          <div className="space-y-3">
            {initialCases.map((recovery) => (
              <div key={recovery.case_id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <div><strong>{recovery.supplier_ref}</strong><div className="font-mono text-slate-500">{recovery.case_id}</div></div>
                  <span className="rounded-full bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">{recovery.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-600">Payable: <span className="font-mono">{recovery.source_payable_id}</span> · {recovery.currency} {recovery.recovered_amount.toFixed(2)} / {recovery.total_amount.toFixed(2)} recovered</p>
                <div className="mt-3"><CaseActions recovery={recovery} /></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
