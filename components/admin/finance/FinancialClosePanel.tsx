import { cookies } from "next/headers";
import { CalendarClock, CloudOff, Lock, LockOpen, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listFiscalPeriods,
  summarisePeriods,
  explainCloseError,
  formatPeriodRange,
} from "@/lib/api/financial-close";
import { FiscalPeriodTable } from "./FiscalPeriodTable";

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
 * Live fiscal period register from financial-close-svc (:8104).
 *
 * Scoped to the session's tenant and legal entity: this service has no "all
 * entities" read — legal_entity_id is a required parameter — so the register
 * shows the periods of the entity the session is bound to, and says so rather
 * than implying it is the whole tenant.
 *
 * Reading this register is itself an authorized action (PERIOD_CLOSE_VIEW), so
 * an unauthorized principal gets a refusal here rather than an empty list. That
 * distinction is worth keeping visible: "you may not see the periods" and
 * "there are no periods" would otherwise render identically.
 */
export async function FinancialClosePanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the period register."
      />
    );
  }

  const result = await listFiscalPeriods({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
    legalEntityId: session.legalEntityId,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Period register unavailable"
        hint={explainCloseError(result.error.message)}
      />
    );
  }

  const periods = result.data;

  if (periods.length === 0) {
    return (
      <PanelEmptyState
        icon={CalendarClock}
        label="No fiscal periods registered"
        hint="Register one above. Until a period is registered general-ledger-svc treats it as open, so the ledger works either way — registering is what makes a period closeable, not what makes it usable."
      />
    );
  }

  const stats = summarisePeriods(periods);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          icon={LockOpen}
          wrap="bg-amber-50 dark:bg-amber-500/10"
          colour="text-amber-600 dark:text-amber-400"
          value={stats.open}
          label="Open — postable, not yet sealed"
        />
        <Tile
          icon={Lock}
          wrap="bg-emerald-50 dark:bg-emerald-500/10"
          colour="text-emerald-600 dark:text-emerald-400"
          value={stats.locked}
          label="Closed — sealed and evidenced"
        />
        <div className={TILE}>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">Oldest period still open</p>
            {stats.oldestOpen ? (
              <>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {stats.oldestOpen.period_name}
                </p>
                <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  {formatPeriodRange(stats.oldestOpen)}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">
                — every registered period is sealed
              </p>
            )}
          </div>
        </div>
      </div>

      <FiscalPeriodTable periods={periods} />
    </div>
  );
}
