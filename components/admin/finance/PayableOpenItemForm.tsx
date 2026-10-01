"use client";

import { useActionState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner, CopyableId, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { createPayableOpenItemAction } from "@/app/admin/finance/payable-open-item-actions";
import { IDLE_PAYABLE_OPEN_ITEM_STATE } from "@/app/admin/finance/payable-open-item-state";

const TONE: Record<"idle" | "success" | "error", BannerTone> = {
  idle: "neutral",
  success: "success",
  error: "error",
};

/**
 * Open a new payable in payable-open-item-svc (AP-08) — the ledger that
 * tracks residual amounts, holds, disputes, and settlement applications for
 * a supplier invoice, expense claim, or authorized adjustment. The legal
 * entity is taken from the session, not a form field: every demo account in
 * this console shares one legal entity, and the service itself derives it
 * from the caller's tenant/entity context, not a free-text choice.
 */
export function PayableOpenItemForm() {
  const [state, action, pending] = useActionState(createPayableOpenItemAction, IDLE_PAYABLE_OPEN_ITEM_STATE);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="source_type" className={LABEL}>
            Source type
          </label>
          <select id="source_type" name="source_type" defaultValue="SUPPLIER_INVOICE" className={FIELD}>
            <option value="SUPPLIER_INVOICE">Supplier invoice</option>
            <option value="EXPENSE_CLAIM">Expense claim</option>
            <option value="AUTHORIZED_ADJUSTMENT">Authorized adjustment</option>
          </select>
        </div>

        <div>
          <label htmlFor="source_reference" className={LABEL}>
            Source reference
          </label>
          <input
            id="source_reference"
            name="source_reference"
            required
            placeholder="INV-2027-00042"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Unique per source type — a second payable for the same reference is refused, not duplicated.
          </p>
        </div>

        <div>
          <label htmlFor="payee_ref" className={LABEL}>
            Payee reference
          </label>
          <input
            id="payee_ref"
            name="payee_ref"
            required
            placeholder="vendor-acme-001"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="original_amount" className={LABEL}>
            Original amount
          </label>
          <input
            id="original_amount"
            name="original_amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="15000.00"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="currency" className={LABEL}>
            Currency
          </label>
          <select id="currency" name="currency" defaultValue="USD" className={FIELD}>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </div>

        <div>
          <label htmlFor="due_date" className={LABEL}>
            Due date
          </label>
          <input id="due_date" name="due_date" type="date" required className={FIELD} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {!pending && <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />}
          {pending ? "Creating…" : "Create payable"}
        </Button>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.payableId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Payable ID</span>
            <CopyableId value={state.payableId} className="text-[11px]" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
