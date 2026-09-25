import { cookies } from "next/headers";
import { Layers, CloudOff, Globe } from "lucide-react";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  explainSourceAuthorityError,
  listSourceAuthorityMaps,
  type SourceAuthorityMap,
} from "@/lib/api/source-authority";
import { SupersedeRuleButton } from "./SourceAuthorityForms";

function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * A rule is in force, scheduled to end, or ended. The three are shown apart
 * because "ends next Tuesday" still decides every resolution made today, and an
 * operator reading a register to work out why a value resolved the way it did
 * has to be able to see that.
 */
function ruleState(m: SourceAuthorityMap): { label: string; style: string; title: string } {
  const now = Date.now();
  const endsAt = m.effective_to ? new Date(m.effective_to).getTime() : null;

  if (endsAt !== null && endsAt <= now) {
    return {
      label: "ENDED",
      style: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
      title:
        "The window has closed. This source is no longer ranked for this field family, but the row stays so a resolution made while it applied can still be explained.",
    };
  }
  if (endsAt !== null) {
    return {
      label: "ENDING",
      style: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      title:
        "Scheduled to end. Until that moment this rule still decides resolutions — it has not stopped applying yet.",
    };
  }
  if (new Date(m.effective_from).getTime() > now) {
    return {
      label: "PENDING",
      style: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
      title: "Not yet in force. It begins deciding resolutions at its effective-from instant.",
    };
  }
  return {
    label: "IN FORCE",
    style: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    title: "Deciding resolutions right now.",
  };
}

/**
 * The precedence register.
 *
 * These rows are PLATFORM-WIDE reference data, not tenant data — every tenant
 * sees the same ranking, because which connected system is trusted for a field
 * family is a statement about the systems, not about anyone's records. The
 * facts those rules are composed over are tenant-scoped; the two are separated
 * deliberately and the page says so.
 *
 * Reading this needs SOURCE_AUTHORITY_MAP_VIEW. Until this pass it needed
 * nothing at all: the route ran no authorization, so the platform's whole trust
 * topology was readable by anything that could reach the port.
 */
export async function PrecedenceRegisterPanel({
  includeSuperseded = false,
}: {
  includeSuperseded?: boolean;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Not signed in"
        hint="The precedence register is read as a principal — there is no anonymous view of which systems the platform trusts."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listSourceAuthorityMaps({ identity, includeSuperseded });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Precedence register unavailable"
        hint={explainSourceAuthorityError(result.error.message)}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={Layers}
        tone="neutral"
        label={includeSuperseded ? "No precedence rules recorded" : "No precedence rules in force"}
        hint={
          includeSuperseded
            ? "Nothing has ever ranked a source system for any field family. Until a rule exists, a source can report facts and still be invisible to resolution — those sources are named in the resolver below rather than dropped."
            : "No rule currently ranks any source. Ended rules are hidden here; switch to the full history to see rules that have been superseded."
        }
      />
    );
  }

  return (
    <div>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          These rules are <strong className="font-medium">platform-wide</strong> — every tenant is
          ranked by the same topology. The facts they are composed over are tenant data and are not
          shared.
        </span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse">
          <thead>
            <tr>
              <th className={HEAD}>Rank</th>
              <th className={HEAD}>Field family</th>
              <th className={HEAD}>Source system</th>
              <th className={HEAD}>Window</th>
              <th className={HEAD}>State</th>
              <th className={HEAD}>Conflict route</th>
              <th className={HEAD}>ID</th>
              <th className={HEAD}></th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((m) => {
              const state = ruleState(m);
              const ended = state.label === "ENDED";
              return (
                <tr
                  key={m.source_authority_map_id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className={CELL}>
                    <span
                      className="font-mono text-xs font-medium"
                      title="Lower wins. Two sources sharing a rank is the tie that makes a resolution ambiguous."
                    >
                      {m.precedence_rank}
                    </span>
                  </td>
                  <td className={CELL}>
                    <span className="font-mono text-xs">{m.field_family}</span>
                  </td>
                  <td className={CELL}>{m.source_system}</td>
                  <td className={CELL}>
                    <span className="text-xs">
                      {when(m.effective_from)} → {m.effective_to ? when(m.effective_to) : "open"}
                    </span>
                  </td>
                  <td className={CELL}>
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " + state.style
                      }
                      title={state.title}
                    >
                      {state.label}
                    </span>
                    {m.superseded_by_principal_id ? (
                      <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                        ended by {m.superseded_by_principal_id}
                      </span>
                    ) : null}
                  </td>
                  <td className={CELL}>
                    <span className="text-xs">{m.conflict_route}</span>
                  </td>
                  <td className={CELL}>
                    <CopyableId value={m.source_authority_map_id} />
                  </td>
                  <td className={CELL}>
                    {ended ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">ended</span>
                    ) : (
                      <SupersedeRuleButton sourceAuthorityMapId={m.source_authority_map_id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
