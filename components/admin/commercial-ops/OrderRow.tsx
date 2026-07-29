"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, PencilLine, Lock, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { amendOrder, closeOrder } from "@/app/admin/commercial-ops/actions";
import { IDLE_ORDER_STATE, type OrderActionState } from "@/app/admin/commercial-ops/state";
import type { PurchaseOrder } from "@/lib/api/purchase-orders";

const FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

const CELL = "px-4 py-3 text-sm text-slate-700 dark:text-slate-300";

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

type OrderRowProps = {
  order: PurchaseOrder;
  /** Columns to span when the amendment panel is open. */
  columnCount: number;
};

export function OrderRow({ order, columnCount }: OrderRowProps) {
  // Which version of this order the amendment panel was opened against, rather
  // than a plain boolean. A successful amendment bumps the order's version and
  // revalidates the page, so the panel closes itself with no effect syncing
  // state — and a *failed* amendment leaves the version alone, so the panel
  // stays open with the typed reason intact for a retry.
  const [openForVersion, setOpenForVersion] = useState<number | null>(null);
  const amendOpen = openForVersion === order.version;

  const [amendState, amendAction, amendPending] = useActionState<OrderActionState, FormData>(
    amendOrder,
    IDLE_ORDER_STATE,
  );
  const [closeState, closeAction, closePending] = useActionState<OrderActionState, FormData>(
    closeOrder,
    IDLE_ORDER_STATE,
  );

  const isClosed = order.po_status === "CLOSED";
  const error =
    amendState.status === "error"
      ? amendState.message
      : closeState.status === "error"
        ? closeState.message
        : null;
  const success =
    amendState.status === "amended"
      ? amendState.message
      : closeState.status === "closed"
        ? closeState.message
        : null;

  return (
    <>
      <tr className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
          {order.po_number}
        </td>
        <td className={CELL}>
          {isClosed ? (
            <Badge tone="neutral">Closed</Badge>
          ) : (
            <Badge tone="success" dot>
              Issued
            </Badge>
          )}
        </td>
        <td className={cn(CELL, "text-right tabular-nums")}>
          {formatAmount(order.total_amount, order.currency_code)}
        </td>
        <td className={cn(CELL, "text-right tabular-nums text-slate-500 dark:text-slate-400")}>
          v{order.version}
        </td>
        <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
          {formatDate(order.issued_at)}
        </td>
        <td className={cn(CELL, "text-right")}>
          {isClosed ? (
            <span className="text-xs text-slate-400 dark:text-slate-500">Terminal</span>
          ) : (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenForVersion(amendOpen ? null : order.version)}
                aria-expanded={amendOpen}
                aria-label={`Amend ${order.po_number}`}
              >
                {amendOpen ? (
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {amendOpen ? "Cancel" : "Amend"}
              </Button>
              <form action={closeAction}>
                <input type="hidden" name="purchase_order_id" value={order.purchase_order_id} />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  loading={closePending}
                  aria-label={`Close ${order.po_number}`}
                >
                  {!closePending && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                  Close
                </Button>
              </form>
            </div>
          )}
        </td>
      </tr>

      {amendOpen && !isClosed && (
        <tr className="bg-slate-50/70 dark:bg-slate-800/40">
          <td colSpan={columnCount} className="px-4 py-4">
            <form action={amendAction} className="animate-fade-up space-y-3">
              <input type="hidden" name="purchase_order_id" value={order.purchase_order_id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={`amount-${order.purchase_order_id}`} className={LABEL}>
                    Revised total ({order.currency_code})
                  </label>
                  <input
                    id={`amount-${order.purchase_order_id}`}
                    name="new_total_amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={order.total_amount}
                    className={FIELD}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`reason-${order.purchase_order_id}`} className={LABEL}>
                    Reason <span className="font-normal text-slate-400">(recorded permanently)</span>
                  </label>
                  <input
                    id={`reason-${order.purchase_order_id}`}
                    name="reason"
                    required
                    placeholder="Vendor revised quotation after scope change"
                    className={FIELD}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" loading={amendPending}>
                  {amendPending ? "Recording…" : "Record amendment"}
                </Button>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Appends an immutable amendment and bumps the order to v{order.version + 1}
                </p>
              </div>
            </form>
          </td>
        </tr>
      )}

      {(error || success) && (
        <tr>
          <td colSpan={columnCount} className="px-4 pb-3">
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm animate-fade-up",
                error
                  ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
              )}
              role="status"
              aria-live="polite"
            >
              {error ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{error ?? success}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
