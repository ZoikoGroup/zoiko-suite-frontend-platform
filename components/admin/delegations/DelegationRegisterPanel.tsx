import { cookies } from "next/headers";
import { KeyRound, CloudOff, ShieldCheck } from "lucide-react";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  explainDelegationError,
  listDelegations,
  type DelegationGrant,
} from "@/lib/api/delegations";
import { RevokeDelegationButton } from "./DelegationForms";

function StatusBadge({ status }: { status: DelegationGrant["status"] }) {
  const style =
    status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status === "REVOKED"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400";

  const title =
    status === "ACTIVE"
      ? "In force. The delegate may act as if authorized for this action, on this entity, until the window closes."
      : status === "REVOKED"
        ? "Withdrawn explicitly. Terminal — a revoked delegation cannot be reinstated, only replaced."
        : "The window closed. Terminal, and reached without anyone acting: expiry is observed when this register is read.";

  return (
    <span
      className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " + style}
      title={title}
    >
      {status}
    </span>
  );
}

function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * The delegation register.
 *
 * WHAT THIS PANEL SHOWS DEPENDS ON WHO IS READING IT, and that is the service's
 * design rather than a limitation here. Passing a legal entity makes this an
 * entity-wide read requiring DELEGATION_VIEW; omitting one returns only the
 * delegations the caller is personally party to. There is no third mode — an
 * unscoped read used to skip authorization altogether and return the tenant's
 * complete map of who may act for whom, to any caller at all.
 *
 * The session's legal entity is sent, so a principal with the grant sees the
 * entity register and one without sees their own involvement. Both are honest
 * answers to different questions, and the panel says which one it is showing.
 */
export async function DelegationRegisterPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Not signed in"
        hint="The delegation register is read as a principal — there is no anonymous view of who may act for whom."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const entityRead = await listDelegations({ identity, legalEntityId: session.legalEntityId });

  // A 403 on the entity read is not an error to display — it means this
  // principal holds no DELEGATION_VIEW here, which is the normal state for
  // most people. Fall back to their own delegations rather than showing a
  // permission failure where a legitimate, narrower answer exists.
  const scopedToSelf = !entityRead.ok && entityRead.error.status === 403;
  const result = scopedToSelf ? await listDelegations({ identity }) : entityRead;

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Delegation register unavailable"
        hint={explainDelegationError(result.error.message)}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={KeyRound}
        tone="neutral"
        label={scopedToSelf ? "You hold and have given no delegations" : "No delegations on this entity"}
        hint={
          scopedToSelf
            ? "Nobody has delegated authority to you, and you have delegated none of yours. You are seeing only delegations you are party to, because DELEGATION_VIEW on this legal entity was not granted."
            : "No principal currently acts for another on this entity. Delegations appear here the moment they are granted, and disappear from ACTIVE on their own when the window closes."
        }
      />
    );
  }

  return (
    <div>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {scopedToSelf ? (
          <span>
            Showing only delegations <strong className="font-medium">you are party to</strong> —
            DELEGATION_VIEW on this legal entity was not granted, so the entity-wide register is not
            yours to read.
          </span>
        ) : (
          <span>
            Showing the full register for this legal entity. Statuses are current as of this read —
            expiry is observed on read, not by a background sweep.
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse">
          <thead>
            <tr>
              <th className={HEAD}>Delegator</th>
              <th className={HEAD}>Delegate</th>
              <th className={HEAD}>Action</th>
              <th className={HEAD}>Window</th>
              <th className={HEAD}>Status</th>
              <th className={HEAD}>Ended</th>
              <th className={HEAD}>ID</th>
              <th className={HEAD}></th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((d) => (
              <tr key={d.delegation_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className={CELL}>{d.delegator_principal_id}</td>
                <td className={CELL}>{d.delegate_principal_id}</td>
                <td className={CELL}>
                  <span className="font-mono text-xs">{d.action_type}</span>
                </td>
                <td className={CELL}>
                  <span className="text-xs">
                    {when(d.effective_from)} → {when(d.effective_to)}
                  </span>
                </td>
                <td className={CELL}>
                  <StatusBadge status={d.status} />
                </td>
                <td className={CELL}>
                  <span className="text-xs">
                    {d.status === "REVOKED"
                      ? `${when(d.revoked_at)} by ${d.revoked_by_principal_id ?? "—"}`
                      : d.status === "EXPIRED"
                        ? when(d.expired_at)
                        : "—"}
                  </span>
                </td>
                <td className={CELL}>
                  <CopyableId value={d.delegation_id} />
                </td>
                <td className={CELL}>
                  {d.status === "ACTIVE" ? (
                    <RevokeDelegationButton delegationId={d.delegation_id} />
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">terminal</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
