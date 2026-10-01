"use client";

import { useActionState, useState } from "react";
import { Lock, LockOpen, Banknote, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD } from "@/components/admin/shared/form";
import {
  holdPayableAction,
  releaseHoldPayableAction,
  applyConfirmedPaymentAction,
  closePayableAction,
} from "@/app/admin/finance/payable-open-item-actions";
import { IDLE_PAYABLE_OPEN_ITEM_STATE } from "@/app/admin/finance/payable-open-item-state";
import type { PayableOpenItem } from "@/lib/api/payable-open-items";

const TONE: Record<"idle" | "success" | "error", BannerTone> = {
  idle: "neutral",
  success: "success",
  error: "error",
};

/**
 * The lifecycle actions this console wires up: hold / release, apply a
 * confirmed payment, and close. Dispute, resolve-dispute, apply-supplier-
 * credit, and apply-recovery exist on the real service but have no button
 * here yet — same "coded on the backend, not yet wired" gap this console
 * already carries for several other services; exercise those via the API
 * directly until a button is added.
 */
export function PayableOpenItemRowActions({ payable }: { payable: PayableOpenItem }) {
  const [holdOpen, setHoldOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const [holdState, holdAction, holdPending] = useActionState(holdPayableAction, IDLE_PAYABLE_OPEN_ITEM_STATE);
  const [releaseState, releaseAction, releasePending] = useActionState(
    releaseHoldPayableAction,
    IDLE_PAYABLE_OPEN_ITEM_STATE
  );
  const [payState, payAction, payPending] = useActionState(
    applyConfirmedPaymentAction,
    IDLE_PAYABLE_OPEN_ITEM_STATE
  );
  const [closeState, closeAction, closePending] = useActionState(closePayableAction, IDLE_PAYABLE_OPEN_ITEM_STATE);

  const canApplyPayment = payable.status !== "SETTLED";
  const canClose = payable.status === "SETTLED" && !payable.is_held && !payable.is_disputed;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {payable.is_held ? (
          <form action={releaseAction}>
            <input type="hidden" name="payable_id" value={payable.payable_id} />
            <Button type="submit" variant="secondary" size="sm" loading={releasePending}>
              <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Release hold
            </Button>
          </form>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setHoldOpen((v) => !v)}>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Hold
          </Button>
        )}

        {canApplyPayment && (
          <Button variant="secondary" size="sm" onClick={() => setPayOpen((v) => !v)}>
            <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
            Apply payment
          </Button>
        )}

        {canClose && (
          <form action={closeAction}>
            <input type="hidden" name="payable_id" value={payable.payable_id} />
            <Button type="submit" variant="secondary" size="sm" loading={closePending}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Close
            </Button>
          </form>
        )}
      </div>

      {holdOpen && !payable.is_held && (
        <form action={holdAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="payable_id" value={payable.payable_id} />
          <input
            name="reason"
            required
            placeholder="Reason for hold"
            className={`${FIELD} w-56`}
            autoComplete="off"
          />
          <Button type="submit" size="sm" loading={holdPending}>
            Confirm hold
          </Button>
        </form>
      )}

      {payOpen && canApplyPayment && (
        <form action={payAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="payable_id" value={payable.payable_id} />
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="Amount"
            className={`${FIELD} w-32`}
          />
          <input
            name="provider_payment_ref"
            required
            placeholder="Payment reference"
            className={`${FIELD} w-48`}
            autoComplete="off"
          />
          <Button type="submit" size="sm" loading={payPending}>
            Confirm payment
          </Button>
        </form>
      )}

      {holdState.status !== "idle" && <ResultBanner tone={TONE[holdState.status]} message={holdState.message} />}
      {releaseState.status !== "idle" && (
        <ResultBanner tone={TONE[releaseState.status]} message={releaseState.message} />
      )}
      {payState.status !== "idle" && <ResultBanner tone={TONE[payState.status]} message={payState.message} />}
      {closeState.status !== "idle" && <ResultBanner tone={TONE[closeState.status]} message={closeState.message} />}
    </div>
  );
}
