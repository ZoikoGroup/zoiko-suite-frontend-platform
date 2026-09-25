import { cookies } from "next/headers";
import { CloudOff, Search, ShieldAlert, CheckCircle2, HelpCircle } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD, PANEL } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  explainSourceAuthorityError,
  formatFactValue,
  listNormalizedFacts,
  resolveFact,
  type NormalizedFact,
} from "@/lib/api/source-authority";

function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function ClassBadge({ authorityClass }: { authorityClass: NormalizedFact["authority_class"] }) {
  const style =
    authorityClass === "AUTHORITATIVE"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : authorityClass === "DERIVED"
        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
        : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400";

  const title =
    authorityClass === "AUTHORITATIVE"
      ? "The source is the system of record for this value."
      : authorityClass === "DERIVED"
        ? "Computed from other facts rather than reported directly. §D3 allows a derived fact to be authoritative only where that has been explicitly defined — this service records the class, it does not decide the question."
        : "A copy that may be stale. Recorded so staleness is visible; §D1 treats staleness as an exception to reconcile, not permission to seize authority.";

  return (
    <span
      className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " + style}
      title={title}
    >
      {authorityClass}
    </span>
  );
}

function FactTable({ facts }: { facts: NormalizedFact[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse">
        <thead>
          <tr>
            <th className={HEAD}>Source system</th>
            <th className={HEAD}>Value</th>
            <th className={HEAD}>Class</th>
            <th className={HEAD}>Observed</th>
            <th className={HEAD}>Effective</th>
            <th className={HEAD}>Source record</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr key={f.normalized_fact_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className={CELL}>{f.source_system}</td>
              <td className={CELL}>
                <span className="font-mono text-xs">{formatFactValue(f.fact_value)}</span>
              </td>
              <td className={CELL}>
                <ClassBadge authorityClass={f.authority_class} />
              </td>
              <td className={CELL}>
                <span className="text-xs">{when(f.observed_at)}</span>
              </td>
              <td className={CELL}>
                <span className="text-xs">{when(f.effective_at)}</span>
              </td>
              <td className={CELL}>
                <span className="font-mono text-xs">
                  {f.source_record}
                  {f.source_version ? ` @${f.source_version}` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Resolve one field on one entity, and show the workings.
 *
 * The resolution alone asserts an answer; the observation history underneath is
 * what makes it explainable. Both are tenant-scoped — until this pass
 * normalized facts had no tenant column at all, so this read composed one
 * caller's query over every tenant's facts and returned raw values for any
 * entity_ref in the platform.
 *
 * Three outcomes are rendered as genuinely different answers rather than
 * degrees of success, because acting on them differs: a resolved value, a
 * blocked ambiguity, and nothing found.
 */
export async function FactResolverPanel({
  fieldFamily,
  entityRef,
}: {
  fieldFamily?: string;
  entityRef?: string;
}) {
  if (!fieldFamily || !entityRef) {
    return (
      <PanelEmptyState
        icon={Search}
        tone="neutral"
        label="Name a field family and an entity"
        hint="Resolution answers one question at a time: for this field, on this entity, which system's value should be trusted right now."
      />
    );
  }

  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Not signed in"
        hint="Facts are tenant data. This register will not resolve one without a verified principal and tenant."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [resolution, history] = await Promise.all([
    resolveFact({ identity, fieldFamily, entityRef }),
    listNormalizedFacts({ identity, fieldFamily, entityRef, limit: 100 }),
  ]);

  if (!resolution.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Could not resolve"
        hint={explainSourceAuthorityError(resolution.error.message)}
      />
    );
  }

  const r = resolution.data;
  const unmapped = r.unmapped_sources ?? [];

  return (
    <div className="space-y-4">
      {r.ambiguous ? (
        <div className="animate-fade-up rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            Ambiguous — blocked, not resolved
          </p>
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300/90">
            Two equally-ranked sources disagree, so there is no trusted value. This is the control
            working: picking one arbitrarily is exactly what §D2 forbids, because a material fact
            nobody can vouch for must stop a downstream decision rather than quietly supply it.
            {r.conflict_route ? (
              <>
                {" "}
                Route this to <strong className="font-medium">{r.conflict_route}</strong>.
              </>
            ) : null}
          </p>
          {r.conflicting_facts && r.conflicting_facts.length > 0 ? (
            <div className="mt-3">
              <FactTable facts={r.conflicting_facts} />
            </div>
          ) : null}
        </div>
      ) : r.authoritative_fact ? (
        <div className="animate-fade-up rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Resolved
          </p>
          <p className="mt-2 font-mono text-lg text-emerald-900 dark:text-emerald-200">
            {formatFactValue(r.authoritative_fact.fact_value)}
          </p>
          <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300/90">
            From <strong className="font-medium">{r.authoritative_fact.source_system}</strong>,
            observed {when(r.authoritative_fact.observed_at)}. This is the value to act on — it won
            on precedence, or its tier agreed.
          </p>
        </div>
      ) : (
        <div className={PANEL}>
          <p className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            No trusted value
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {unmapped.length > 0
              ? "Sources have reported a value for this field, but none of them is ranked — so there is no basis to prefer one. This is not the same as having no data; see below."
              : "No source has reported a value for this field on this entity."}
          </p>
        </div>
      )}

      {unmapped.length > 0 ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-sm font-medium text-sky-800 dark:text-sky-300">
            Reporting, but unranked: {unmapped.join(", ")}
          </p>
          <p className="mt-1.5 text-xs text-sky-700 dark:text-sky-300/90">
            {unmapped.length === 1 ? "This source has" : "These sources have"} reported a value and
            {unmapped.length === 1 ? " has" : " have"} no precedence rule in force, so
            {unmapped.length === 1 ? " it takes" : " they take"} no part in the resolution above.
            They used to be dropped in silence — the resolver joined facts to rules and an unranked
            source simply vanished, so its disagreement with the winner never surfaced and &ldquo;nobody
            has ranked this source&rdquo; looked identical to &ldquo;this source lost&rdquo;. Rank
            {unmapped.length === 1 ? " it" : " them"} in the precedence register to bring
            {unmapped.length === 1 ? " it" : " them"} into resolution.
          </p>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Every observation behind this answer
        </h3>
        {!history.ok ? (
          <PanelEmptyState
            icon={CloudOff}
            tone="warning"
            label="History unavailable"
            hint={explainSourceAuthorityError(history.error.message)}
          />
        ) : history.data.length === 0 ? (
          <PanelEmptyState
            icon={Search}
            tone="neutral"
            label="No observations"
            hint="Nothing has been reported for this field on this entity."
          />
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
              Append-only, newest first. A correction is a later observation, never an edit — which
              is why an older value that has since been superseded is still here.
            </p>
            <FactTable facts={history.data} />
          </>
        )}
      </div>
    </div>
  );
}
