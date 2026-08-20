import { cookies } from "next/headers";
import { BookOpenCheck, CloudOff, FileStack, Hourglass, Landmark, ShieldAlert, Undo2 } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listJournals,
  summariseJournals,
  explainLedgerError,
  type JournalStatus,
} from "@/lib/api/general-ledger";
import { JournalTable } from "./JournalTable";

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
 * Live journal register from general-ledger-svc (:8098).
 *
 * Scoped to the session's tenant by the X-Tenant-Id header alone. The service
 * takes the verified header as authoritative and refuses a tenant_id query
 * parameter that disagrees with it — it used to filter by whatever the query
 * named, which meant any caller could read any tenant's whole ledger. Nothing
 * here sends one.
 *
 * No total value is shown. A journal line carries an amount but no currency
 * code — the ledger holds amounts and the entity's reporting currency lives
 * outside this service — so a single figure across the register would be a
 * number with no unit, which is worse than no number at all. The counts below
 * are unit-free and honest; per-journal totals appear on the rows, where the
 * two sides of one entry are guaranteed to be in the same currency.
 */
export async function GeneralLedgerPanel({
  status,
  legalEntityId,
  fiscalPeriod,
}: {
  status?: JournalStatus;
  legalEntityId?: string;
  fiscalPeriod?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the journal register."
      />
    );
  }

  const result = await listJournals({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
    status,
    legalEntityId,
    fiscalPeriod,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Ledger unavailable"
        hint={explainLedgerError(result.error.message)}
      />
    );
  }

  const journals = result.data;
  const narrowed = Boolean(status || legalEntityId || fiscalPeriod);

  if (journals.length === 0) {
    return (
      <PanelEmptyState
        icon={FileStack}
        label={narrowed ? "No journals match these filters" : "No journals yet"}
        hint={
          narrowed
            ? "All three filters are applied by the service, not here, and they compose with AND — clear one to widen the register."
            : "Record one above. A journal lands PENDING and reaches the books only after it has been validated and posted."
        }
      />
    );
  }

  const stats = summariseJournals(journals);

  const activeFilters = [
    status && `stage ${status}`,
    fiscalPeriod && `period ${fiscalPeriod}`,
    legalEntityId && `legal entity ${legalEntityId}`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {narrowed && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Filtered to {activeFilters.join(", ")}. The totals below describe this filtered set, not
          the whole ledger.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={Hourglass}
          wrap="bg-amber-50 dark:bg-amber-500/10"
          colour="text-amber-600 dark:text-amber-400"
          value={stats.pending}
          label="Pending — draft, may be unbalanced"
        />
        {/* A different mark from the posted tile, not the same one recoloured:
            side by side, two identical glyphs read as one metric split in half
            rather than as two distinct stages. */}
        <Tile
          icon={BookOpenCheck}
          wrap="bg-navy-50 dark:bg-navy-500/10"
          colour="text-navy-700 dark:text-navy-300"
          value={stats.validated}
          label="Validated — balanced, not yet posted"
        />
        <Tile
          icon={Landmark}
          wrap="bg-emerald-50 dark:bg-emerald-500/10"
          colour="text-emerald-600 dark:text-emerald-400"
          value={stats.finalized}
          label="Finalized — on the books"
        />
        <Tile
          icon={Undo2}
          wrap="bg-slate-100 dark:bg-slate-800"
          colour="text-slate-500 dark:text-slate-400"
          value={stats.reversed}
          label="Reversed — corrected by an inverse"
        />
      </div>

      <div className={TILE}>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Journals not yet on the books
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {stats.inFlight === 0
              ? "— everything recorded has been posted"
              : `${stats.inFlight} awaiting a decision`}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Pending and validated journals have been recorded but have not affected the ledger. Only
            FINALIZED entries are what the rest of the Finance domain reads — bank reconciliation
            will not match against anything else.
          </p>
        </div>
      </div>

      <JournalTable journals={journals} />
    </div>
  );
}
