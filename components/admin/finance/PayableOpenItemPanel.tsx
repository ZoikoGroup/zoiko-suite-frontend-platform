import { cookies } from "next/headers";
import { CloudOff, ShieldAlert, Receipt } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listPayableOpenItems } from "@/lib/api/payable-open-items";
import { PayableOpenItemRowActions } from "./PayableOpenItemRowActions";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PARTIALLY_SETTLED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  SETTLED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
};

/**
 * The open-items register from payable-open-item-svc (:8164, AP-08) — the
 * ledger this platform did not have a UI for at all until now. Reads
 * directly from the service (not through the generic write-proxy), so an
 * unreachable backend renders as an honest "unavailable" state rather than
 * an empty register that looks like there is simply nothing to show.
 */
export async function PayableOpenItemPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view payable open items."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const res = await listPayableOpenItems(identity.legalEntityId ?? "", identity);

  if (!res.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="payable-open-item-svc unavailable"
        hint={res.error.message}
      />
    );
  }

  const payables = res.data;

  if (payables.length === 0) {
    return (
      <PanelEmptyState
        icon={Receipt}
        label="No payable open items"
        hint="Payables created above will appear here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {["Source", "Payee", "Residual / Original", "Due", "Status", "Flags", "Actions"].map((h) => (
              <th key={h} className={HEAD + " text-left"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {payables.map((p) => (
            <tr key={p.payable_id}>
              <td className={CELL}>
                <div className="font-medium text-slate-800 dark:text-slate-200">{p.source_reference}</div>
                <div className="text-xs text-slate-400">{p.source_type}</div>
              </td>
              <td className={CELL}>{p.payee_ref}</td>
              <td className={CELL}>
                <span className="font-semibold">{formatMoney(p.residual_amount, p.currency)}</span>
                <span className="text-xs text-slate-400"> / {formatMoney(p.original_amount, p.currency)}</span>
              </td>
              <td className={CELL}>{p.due_date.split("T")[0]}</td>
              <td className={CELL}>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status] ?? ""}`}
                >
                  {p.status}
                </span>
              </td>
              <td className={CELL}>
                <div className="flex flex-wrap gap-1 text-xs">
                  {p.is_held && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                      Held: {p.hold_reason}
                    </span>
                  )}
                  {p.is_disputed && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      Disputed
                    </span>
                  )}
                  {p.closed_at && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Closed
                    </span>
                  )}
                </div>
              </td>
              <td className={CELL}>
                <PayableOpenItemRowActions payable={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
