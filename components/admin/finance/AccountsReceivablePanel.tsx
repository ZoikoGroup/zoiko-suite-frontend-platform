import { cookies } from "next/headers";
import {
  BadgeCheck,
  CloudOff,
  FileStack,
  Hourglass,
  Send,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import {
  listCustomerInvoices,
  REGISTER_PAGE_SIZE,
  summariseReceivables,
  explainAccountsReceivableError,
  type InvoiceStatus,
} from "@/lib/api/accounts-receivable";
import { ReceivablesTable } from "./ReceivablesTable";

const TILE =
  "flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

function Tile({
  icon: Icon,
  wrap,
  colour,
  value,
  label,
}: {
  icon: React.ElementType;
  wrap: string;
  colour: string;
  value: number;
  label: string;
}) {
  return (
    <div className={TILE}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${wrap}`}>
        <Icon className={`h-4 w-4 ${colour}`} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {value}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * Live receivables register from accounts-receivable-svc (:8101).
 *
 * Replaces AccountsReceivableView, which was the last consumer of the legacy
 * lib/api-client.ts layer and never showed this service's data at all. Three things
 * about it are worth remembering, because each is a shape to watch for elsewhere:
 *
 *  - It fell back to three HARDCODED invoices on any failure, with the fallback ON
 *    unless an env var explicitly disabled it. Since no RBAC bundle had ever granted
 *    AR_*, every write was a 403 — and was displayed as a successful create.
 *  - Its "Live Local Backend (Port 8101)" badge was driven by /healthz alone, so it
 *    read green while the table showed invented rows.
 *  - Its tenant was a DROPDOWN. The browser chose its own scope, an unauthenticated
 *    proxy forwarded it verbatim, and the service believed it — which is how a
 *    cross-tenant read was reachable from a select element.
 *
 * Nothing here falls back to anything. The tenant is the session's, the register is
 * scoped to it by the service, and a refusal is rendered as a refusal.
 *
 * Outstanding value is reported per currency and never summed across them: no
 * service in this suite holds an FX rate, so a single total would be invented.
 */
export async function AccountsReceivablePanel({
  status,
  legalEntityId,
  customerId,
}: {
  status?: InvoiceStatus;
  legalEntityId?: string;
  customerId?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the receivables register."
      />
    );
  }

  const result = await listCustomerInvoices({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
    status,
    legalEntityId,
    customerId,
    // The service bounds this read now — it used to return every invoice the tenant
    // had ever raised — and its own default page is 100. Asking explicitly means the
    // number this panel shows is a number this panel chose, and a full page is
    // reported as possibly-truncated below rather than passing as the whole register.
    limit: REGISTER_PAGE_SIZE,
  });

  if (!result.ok) {
    // Every non-ok kind warns, not only "unreachable". A narrow guard here is the
    // defect that makes an HTTP 500 render as a neutral "no invoices yet" on
    // fifteen other panels in this console — a broken service presented as an
    // empty register.
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Receivables unavailable"
        hint={explainAccountsReceivableError(result.error.message)}
      />
    );
  }

  const invoices = result.data;
  const narrowed = Boolean(status || legalEntityId || customerId);

  if (invoices.length === 0) {
    return (
      <PanelEmptyState
        icon={FileStack}
        label={narrowed ? "No invoices match these filters" : "No customer invoices yet"}
        hint={
          narrowed
            ? "All three filters are applied by the service, not here, and they compose with AND — clear one to widen the register."
            : "Issue one above. An invoice is not a claim on the customer until it has been sent, and payment cannot be recorded against it until the ledger carries a finalized journal for it."
        }
      />
    );
  }

  const stats = summariseReceivables(invoices);
  const outstanding = Object.entries(stats.outstandingByCurrency).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const activeFilters = [
    status && `status ${status}`,
    customerId && `customer ${customerId}`,
    legalEntityId && `legal entity ${legalEntityId}`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {narrowed && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Filtered to {activeFilters.join(", ")}. The totals below describe this filtered set, not
          the whole register.
        </p>
      )}

      {/* A full page means there may be more. Said out loud because the tiles and
          the outstanding totals below are computed from THIS page — presenting them
          as the tenant's position while silently holding back rows would be the
          same class of untruth as the invented figures this panel replaced. */}
      {invoices.length >= REGISTER_PAGE_SIZE && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Showing the most recent {REGISTER_PAGE_SIZE} invoices, which is a full page — there are
          likely more. The tiles and totals below describe these {REGISTER_PAGE_SIZE}, not the whole
          register. Narrow by status or customer to see a complete set.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Tile
          icon={FileStack}
          wrap="bg-navy-50 dark:bg-navy-500/10"
          colour="text-navy-700 dark:text-navy-300"
          value={stats.issued}
          label="Issued — not yet sent"
        />
        <Tile
          icon={Send}
          wrap="bg-amber-50 dark:bg-amber-500/10"
          colour="text-amber-600 dark:text-amber-400"
          value={stats.sent}
          label="Sent — awaiting payment"
        />
        <Tile
          icon={TriangleAlert}
          wrap="bg-rose-50 dark:bg-rose-500/10"
          colour="text-rose-600 dark:text-rose-400"
          value={stats.overdue}
          label="Declared overdue"
        />
        <Tile
          icon={BadgeCheck}
          wrap="bg-emerald-50 dark:bg-emerald-500/10"
          colour="text-emerald-600 dark:text-emerald-400"
          value={stats.paid}
          label="Paid — terminal"
        />
        {/* Counted separately from "Declared overdue" on purpose. This is the
            console's own arithmetic on due dates; OVERDUE is a recorded
            declaration made by a principal holding AR_MARK_OVERDUE and published
            as receivable.overdue. The gap between the two is the work outstanding,
            and collapsing them would hide it. */}
        <Tile
          icon={Hourglass}
          wrap="bg-amber-50 dark:bg-amber-500/10"
          colour="text-amber-600 dark:text-amber-400"
          value={stats.pastDueUndeclared}
          label="Past due, not declared"
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Outstanding
        </span>
        {outstanding.length === 0 ? (
          <span className="text-slate-500 dark:text-slate-400">
            Nothing outstanding — every invoice on this register is paid.
          </span>
        ) : (
          outstanding.map(([currency, total]) => (
            <span
              key={currency}
              className="tabular-nums font-medium text-slate-900 dark:text-slate-100"
            >
              {formatMoney(total, currency)}
            </span>
          ))
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Per currency, never summed — no service in this suite holds an FX rate.
        </span>
      </div>

      <ReceivablesTable invoices={invoices} />
    </div>
  );
}
