import { cookies } from "next/headers";
import { CloudOff, FileStack, Hourglass, Landmark, Scale, ShieldAlert, TriangleAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listStatementLines,
  summariseStatementLines,
  explainReconciliationError,
  formatCents,
  type StatementLine,
  type StatementLineStatus,
} from "@/lib/api/bank-reconciliation";
import { StatementLineTable } from "./StatementLineTable";
import { CompleteStatementForm, type StatementGroup } from "./CompleteStatementForm";

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
  value: string | number;
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

/** Group this page's lines by (bank account, statement date), as the completion
 *  form offers them. An EXCEPTION counts as resolved — it has been looked at —
 *  so only UNMATCHED lines are "unmatched". */
function groupStatementLines(lines: StatementLine[]): StatementGroup[] {
  const groups = new Map<string, StatementGroup>();
  for (const line of lines) {
    const key = `${line.bank_account_id}|${line.statement_date}`;
    const group =
      groups.get(key) ??
      ({ bankAccountId: line.bank_account_id, statementDate: line.statement_date, total: 0, unmatched: 0 } satisfies StatementGroup);
    group.total += 1;
    if (line.status === "UNMATCHED") group.unmatched += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Live bank statement register from bank-reconciliation-svc (:8102).
 *
 * Scoped to the session's tenant by the X-Tenant-Id header alone — the service
 * refuses a tenant_id query parameter and there is no other scope to name.
 *
 * The register is the BANK's claim about what happened; it reconciles against
 * the journal register above it, which is the BUSINESS's claim. Matched means
 * the service verified a FINALIZED journal moving this exact amount through
 * this line's ledger account, in the same direction — a line with no ledger
 * account can never be matched at all.
 *
 * The net figure below is honest about its limits: it sums signed cents across
 * the listed lines. The lines may be in more than one currency (the service
 * records currency but nothing verifies it), so the number is a register-wide
 * balance, not an amount in any one currency.
 */
export async function BankReconciliationPanel({
  status,
  bankAccountId,
  statementDate,
}: {
  status?: StatementLineStatus;
  bankAccountId?: string;
  statementDate?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the reconciliation register."
      />
    );
  }

  const result = await listStatementLines({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
    status,
    bankAccountId,
    statementDate,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Reconciliation register unavailable"
        hint={explainReconciliationError(result.error.message)}
      />
    );
  }

  const lines = result.data;
  const narrowed = Boolean(status || bankAccountId || statementDate);

  if (lines.length === 0) {
    return (
      <PanelEmptyState
        icon={FileStack}
        label={narrowed ? "No statement lines match these filters" : "No statement lines yet"}
        hint={
          narrowed
            ? "All three filters are applied by the service, not here, and they compose with AND — clear one to widen the register."
            : "Ingest one above. It records what the bank says happened and asserts nothing about the ledger until it is matched."
        }
      />
    );
  }

  const stats = summariseStatementLines(lines);
  const groups = groupStatementLines(lines);

  const activeFilters = [
    status && `status ${status}`,
    bankAccountId && `bank account ${bankAccountId}`,
    statementDate && `statement date ${statementDate}`,
  ].filter(Boolean);

  const net =
    (stats.netCents < 0 ? "−" : "+") +
    formatCents(Math.abs(stats.netCents));

  return (
    <div className="space-y-5">
      {narrowed && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Filtered to {activeFilters.join(", ")}. The figures below describe this filtered set, not
          the whole register.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={Hourglass}
          wrap="bg-amber-50 dark:bg-amber-500/10"
          colour="text-amber-600 dark:text-amber-400"
          value={stats.open}
          label="Open — untouched, nothing accounts for them yet"
        />
        <Tile
          icon={Landmark}
          wrap="bg-emerald-50 dark:bg-emerald-500/10"
          colour="text-emerald-600 dark:text-emerald-400"
          value={stats.matched}
          label="Matched — proven by a FINALIZED journal"
        />
        <Tile
          icon={TriangleAlert}
          wrap="bg-rose-50 dark:bg-rose-500/10"
          colour="text-rose-600 dark:text-rose-400"
          value={stats.exception}
          label="Exceptions — looked at, recorded as unexplained"
        />
        <Tile
          icon={Scale}
          wrap="bg-navy-50 dark:bg-navy-500/10"
          colour="text-navy-700 dark:text-navy-300"
          value={net}
          label="Net signed movement across these lines"
        />
      </div>

      <div className={TILE}>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Can be declared reconciled
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {groups.length === 0
              ? "— no statements on this page"
              : `${groups.filter((group) => group.unmatched === 0).length} of ${groups.length} statement${
                  groups.length === 1 ? "" : "s"
                } fully resolved`}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Completing publishes reconciliation.completed and stores nothing. An exception counts as
            resolved; an untouched line does not.
          </p>
        </div>
      </div>

      <StatementLineTable lines={lines} />

      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <CompleteStatementForm groups={groups} />
      </div>
    </div>
  );
}
