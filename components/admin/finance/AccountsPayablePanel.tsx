import { cookies } from "next/headers";
import {
  BadgeCheck,
  CloudOff,
  FileStack,
  Hourglass,
  ShieldAlert,
  ShieldCheck,
  Send,
  TriangleAlert,
} from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import {
  listVendorInvoices,
  summariseInvoices,
  explainPayableError,
  REGISTER_PAGE_SIZE,
  type InvoiceStatus,
} from "@/lib/api/accounts-payable";
import { AccountsPayableTable } from "./AccountsPayableTable";

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
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${wrap}`}
      >
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
 * Live payables register from accounts-payable-svc (:8099).
 *
 * Scoped to the session's tenant: the service requires tenant_id, and its store
 * filters by tenant explicitly on top of row-level security — the pool connects as
 * a Postgres superuser, which bypasses RLS, so the explicit filter is the real
 * isolation here.
 *
 * Value awaiting payment is reported per currency and never summed across them:
 * no service in this suite holds an FX rate, so a single total would be invented.
 */
export async function AccountsPayablePanel({
  status,
  legalEntityId,
  vendorId,
}: {
  status?: InvoiceStatus;
  legalEntityId?: string;
  vendorId?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the payables register."
      />
    );
  }

  const result = await listVendorInvoices({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
    status,
    legalEntityId,
    vendorId,
    // The service bounds this read now — it used to return every invoice the
    // tenant had ever recorded on every dashboard load. Asking explicitly means
    // the counts this panel shows are counts this panel chose, and a full page is
    // reported as possibly-truncated below rather than passing as the whole
    // register. The service refuses (400) rather than clamps over 500, so a page
    // under it cannot be silently bigger than it looks.
    limit: REGISTER_PAGE_SIZE,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Payables unavailable"
        hint={explainPayableError(result.error.message)}
      />
    );
  }

  const invoices = result.data;
  const narrowed = Boolean(status || legalEntityId || vendorId);

  if (invoices.length === 0) {
    return (
      <PanelEmptyState
        icon={FileStack}
        label={narrowed ? "No invoices match these filters" : "No vendor invoices yet"}
        hint={
          narrowed
            ? "All three filters are applied by the service, not here, and they compose with AND — clear one to widen the register."
            : "Record one above. An invoice authorises no payment until it has been validated, approved, and sent for payment."
        }
      />
    );
  }

  const stats = summariseInvoices(invoices);
  const awaitingPayment = Object.entries(stats.awaitingPaymentByCurrency).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const activeFilters = [
    status && `stage ${status}`,
    vendorId && `vendor ${vendorId}`,
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
          the awaiting-payment total below are computed from THIS page — presenting
          them as the tenant's liabilities while silently holding back rows would
          be the same class of untruth as the invented figures this panel replaced. */}
      {invoices.length >= REGISTER_PAGE_SIZE && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Showing the most recent {REGISTER_PAGE_SIZE} invoices, which is a full page — there are
          likely more. The tiles and totals below describe these {REGISTER_PAGE_SIZE}, not the
          whole register. Narrow by stage or vendor to see a complete set.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Tile
          icon={Hourglass}
          wrap="bg-amber-50 dark:bg-amber-500/10"
          colour="text-amber-600 dark:text-amber-400"
          value={stats.received}
          label="Received — unchecked"
        />
        <Tile
          icon={ShieldCheck}
          wrap="bg-navy-50 dark:bg-navy-500/10"
          colour="text-navy-700 dark:text-navy-300"
          value={stats.validated}
          label="Validated — awaiting approval"
        />
        {/* A different mark from the validated tile above, not the same one in a
            different colour: side by side, two identical shields read as one
            metric split in half rather than two distinct stages. */}
        <Tile
          icon={BadgeCheck}
          wrap="bg-emerald-50 dark:bg-emerald-500/10"
          colour="text-emerald-600 dark:text-emerald-400"
          value={stats.approved}
          label="Approved — payable"
        />
        <Tile
          icon={Send}
          wrap="bg-slate-100 dark:bg-slate-800"
          colour="text-slate-500 dark:text-slate-400"
          value={stats.paymentRequested}
          label="Payment requested"
        />
        {/* Counts anything short of PAYMENT_REQUESTED whose due date has passed,
            not only approved rows — an invoice still unvalidated past its due date
            is the more urgent problem, and excluding it would make this number
            read better than the position is. */}
        <Tile
          icon={TriangleAlert}
          wrap="bg-rose-50 dark:bg-rose-500/10"
          colour="text-rose-600 dark:text-rose-400"
          value={stats.overdue}
          label="Past due, not yet sent"
        />
      </div>

      <div className={TILE}>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Approved and awaiting a payment request
          </p>
          {awaitingPayment.length === 0 ? (
            <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">
              — nothing is currently approved and unsent
            </p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              {awaitingPayment.map(([currency, amount]) => (
                <li
                  key={currency}
                  className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                >
                  {formatMoney(amount, currency)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Reported per currency. Nothing in this suite holds an FX rate, so these are never added
            together.
          </p>
        </div>
      </div>

      <AccountsPayableTable invoices={invoices} currentPrincipalId={session.principalId} />
    </div>
  );
}
