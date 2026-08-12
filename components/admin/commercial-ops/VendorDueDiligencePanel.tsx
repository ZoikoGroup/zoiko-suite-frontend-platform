import { cookies } from "next/headers";
import { CloudOff, ShieldAlert, ShieldQuestion, ShieldOff, FlaskConical } from "lucide-react";
import { PanelEmptyState, Pagination } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listVendorChecks,
  summariseVendorChecks,
  latestConcludedPerCounterparty,
  explainVendorDDError,
} from "@/lib/api/vendor-due-diligence";
import { VendorCheckTable } from "./VendorCheckTable";

const TILE =
  "flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800";

/** Rows shown per page. The service caps `limit` at 200 and defaults to 50. */
const PAGE_SIZE = 20;

/**
 * The live screening register, from vendor-due-diligence-svc (:8135).
 *
 * Reads one route with real pagination. Worth stating because the alternative was
 * available and wrong: the service had no pagination at all until now, so a panel
 * built against it would have pulled the tenant's entire screening history on every
 * render and grown without bound.
 *
 * The tiles count what the register cannot show at a glance, and one of them is the
 * point of the panel: **counterparties with no outcome**. A screening that was
 * recorded and never concluded leaves an empty result, and an empty result looks
 * like nothing went wrong. Counting it beside the findings is what stops a lost
 * screening reading as a quiet pass.
 */
export async function VendorDueDiligencePanel({
  legalEntityId,
  counterpartyId,
  offset = 0,
  params,
}: {
  legalEntityId?: string;
  counterpartyId?: string;
  offset?: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the screening register."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  // One row more than displayed: this service reports no total count, so a next
  // page is only known to exist because the probe row came back. Same convention as
  // the governance and secrets registers.
  const result = await listVendorChecks({
    identity,
    legalEntityId,
    counterpartyId,
    limit: PAGE_SIZE + 1,
    offset,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Screening register unavailable"
        hint={explainVendorDDError(result.error.message)}
      />
    );
  }

  const hasMore = result.data.length > PAGE_SIZE;
  const checks = hasMore ? result.data.slice(0, PAGE_SIZE) : result.data;
  const narrowed = Boolean(legalEntityId || counterpartyId);

  // Stats describe THIS PAGE, and the caption below says so. Computing them here
  // and labelling them as tenant-wide would be a fabrication of exactly the kind
  // this console has shipped before — the figure would silently change as the
  // operator paged.
  const stats = summariseVendorChecks(checks);
  const latest = latestConcludedPerCounterparty(checks);
  const flaggedNow = [...latest.values()].filter((c) => c.risk_outcome === "FLAGGED").length;

  return (
    <div className="space-y-5">
      {checks.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={TILE}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
              <ShieldAlert
                className="h-4 w-4 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {flaggedNow}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Counterparties currently flagged
              </p>
            </div>
          </div>

          <div className={TILE}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <ShieldQuestion
                className="h-4 w-4 text-slate-600 dark:text-slate-300"
                aria-hidden="true"
              />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {stats.screenedNoMatch}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Screened without a match
              </p>
            </div>
          </div>

          {/* The tile that earns its place. An unconcluded check has an empty
              outcome column, which reads as unremarkable; counting it beside the
              findings makes a lost screening visible. */}
          <div className={TILE}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
              <ShieldOff className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {stats.withoutOutcome}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Checks with no outcome at all
              </p>
            </div>
          </div>
        </div>
      )}

      {checks.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <FlaskConical
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <span>
            <strong className="font-medium text-slate-700 dark:text-slate-300">
              No row here is a sanctions clearance.
            </strong>{" "}
            The only screening implemented is an exact, case-insensitive match against a hardcoded
            list of two names — there is no sanctions or watchlist feed on this platform to call, so
            this stands in for an integration that does not exist rather than shortcutting one that
            does. A near-miss such as a trailing &ldquo;Ltd&rdquo; reads as no match. Counts describe
            this page only; the register reports no total, so they change as you page.
          </span>
        </p>
      )}

      <VendorCheckTable checks={checks} narrowed={narrowed} />

      {(checks.length > 0 || offset > 0) && (
        <Pagination
          basePath="/admin/commercial-ops"
          params={params}
          offsetParam="vendor_offset"
          offset={offset}
          limit={PAGE_SIZE}
          count={checks.length}
          hasMore={hasMore}
          noun="screening check"
          plural="screening checks"
        />
      )}
    </div>
  );
}
