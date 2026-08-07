import { cookies } from "next/headers";
import { CloudOff, ClipboardList, ShieldAlert, Hourglass, ThumbsUp, ThumbsDown } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listPurchaseRequests,
  summariseRequests,
  explainRequestError,
  type RequestStatus,
} from "@/lib/api/purchase-requests";
import { PurchaseRequestTable } from "./PurchaseRequestTable";

const TILE =
  "flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Live requisition register from purchase-request-svc (:8100).
 *
 * Scoped to the session's tenant: the service requires tenant_id and applies
 * row-level security on top, so this cannot read another tenant's requests even
 * if the query were tampered with.
 *
 * Value awaiting a decision is reported per currency and never summed across
 * them — there is no FX rate in this service, and inventing one would misstate
 * the number an approver is about to act on.
 */
export async function PurchaseRequestPanel({
  status,
  legalEntityId,
}: {
  status?: RequestStatus;
  legalEntityId?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the requisition register."
      />
    );
  }

  const result = await listPurchaseRequests({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
    status,
    legalEntityId,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Purchase requests unavailable"
        hint={explainRequestError(result.error.message)}
      />
    );
  }

  const requests = result.data;

  const narrowed = Boolean(status || legalEntityId);

  if (requests.length === 0) {
    return (
      <PanelEmptyState
        icon={ClipboardList}
        label={narrowed ? "No requests match these filters" : "No purchase requests yet"}
        hint={
          narrowed
            ? "Both filters are applied by the service, not here, and they compose with AND — clear one to widen the register."
            : "Raise one above. Until a request is approved, no purchase order can be issued against it."
        }
      />
    );
  }

  const stats = summariseRequests(requests);
  const pendingValue = Object.entries(stats.pendingValueByCurrency).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-5">
      {narrowed && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Filtered to {[status, legalEntityId && `legal entity ${legalEntityId}`]
            .filter(Boolean)
            .join(" and ")}
          . The totals below describe this filtered set, not the whole register.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
            <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.pending}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Awaiting a decision</p>
          </div>
        </div>

        <div className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
            <ThumbsUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.approved}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Approved — issuable</p>
          </div>
        </div>

        <div className={TILE}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
            <ThumbsDown className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.rejected}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rejected</p>
          </div>
        </div>

        <div className={TILE}>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">Value awaiting a decision</p>
            {pendingValue.length === 0 ? (
              <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">—</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {pendingValue.map(([currency, amount]) => (
                  <li
                    key={currency}
                    className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                  >
                    {formatAmount(amount, currency)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <PurchaseRequestTable requests={requests} />
    </div>
  );
}
