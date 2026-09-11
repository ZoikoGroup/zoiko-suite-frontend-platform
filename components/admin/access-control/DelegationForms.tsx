"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, HandCoins, Info, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import {
  delegateAuthorityAction,
  withdrawAuthorityAction,
} from "@/app/admin/access-control/actions";
import {
  IDLE_DELEGATE_AUTHORITY,
  type DelegateAuthorityState,
} from "@/app/admin/access-control/state";
import type { DelegatedAuthority } from "@/lib/api/authorization";

/**
 * Lend your own authority to somebody else.
 *
 * There is no field for who is lending, and that is the design rather than an
 * omission: the service refuses any delegation whose delegator is not the
 * caller, so an input for it could only ever produce a refusal — and offering
 * one would imply the platform lets one person hand out another person's
 * access, which is the thing that check exists to prevent.
 *
 * What a delegation actually confers is narrower than it looks, and the form
 * says so: it is intersected with the lender's LIVE grants at every
 * evaluation. So it can never confer an action the lender does not currently
 * hold, and it shrinks on its own if the lender's access does. Before that was
 * fixed a delegation recorded as restricted looked restricted and was not.
 */
export function DelegateAuthorityForm() {
  const [state, action, pending] = useActionState<DelegateAuthorityState, FormData>(
    delegateAuthorityAction,
    IDLE_DELEGATE_AUTHORITY,
  );
  const [scopeType, setScopeType] = useState<"FULL" | "ACTION_SUBSET">("ACTION_SUBSET");

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="delegate_principal_id" className={LABEL}>
              Who is borrowing it?
            </label>
            <input
              id="delegate_principal_id"
              name="delegate_principal_id"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              You are the lender — that is taken from your session and cannot be set here, because
              nobody may lend authority that is not their own.
            </p>
          </div>

          <div>
            <label htmlFor="scope_type" className={LABEL}>
              How much are you lending?
            </label>
            <select
              id="scope_type"
              name="scope_type"
              required
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as "FULL" | "ACTION_SUBSET")}
              className={FIELD}
            >
              <option value="ACTION_SUBSET">Only the actions I name</option>
              <option value="FULL">Everything I can do</option>
            </select>
            <p className={HINT}>
              Either way it is limited to what you still hold yourself, checked afresh on every
              decision — so it can never confer more than you have right now.
            </p>
          </div>

          {scopeType === "ACTION_SUBSET" && (
            <div className="sm:col-span-2">
              <label htmlFor="delegated_actions" className={LABEL}>
                Which actions?
              </label>
              <textarea
                id="delegated_actions"
                name="delegated_actions"
                rows={3}
                placeholder={"PAYMENT_APPROVE\nINVOICE_APPROVE"}
                className={`${FIELD} font-mono text-xs`}
              />
              <p className={HINT}>
                One per line, or separated by commas. Naming an action you do not hold yourself
                lends nothing — the list is narrowed to your own access, not added to it.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="delegation_legal_entity_id" className={LABEL}>
              In which company? <span className={OPTIONAL}>(optional)</span>
            </label>
            <input
              id="delegation_legal_entity_id"
              name="delegation_legal_entity_id"
              placeholder="Leave blank for the whole organisation"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              Leaving it blank lends across every company in the organisation, including ones
              added later. Naming one keeps it to that company.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="delegation_effective_from" className={LABEL}>
                From
              </label>
              <input
                id="delegation_effective_from"
                name="delegation_effective_from"
                type="date"
                required
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="delegation_effective_to" className={LABEL}>
                Until <span className={OPTIONAL}>(optional)</span>
              </label>
              <input
                id="delegation_effective_to"
                name="delegation_effective_to"
                type="date"
                className={FIELD}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} size="sm">
            {!pending && <HandCoins className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {pending ? "Lending…" : "Lend authority"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            An end date is worth setting. Without one it runs until somebody remembers to withdraw
            it, and only you can.
          </p>
        </div>
      </form>

      <DelegationFeedback state={state} />
    </div>
  );
}

/**
 * Withdraw a delegation.
 *
 * Only the lender can, which is why this is offered per row rather than as a
 * bulk control: an administrator looking at somebody else's delegation cannot
 * end it from here and should be told so rather than shown a button that
 * fails. A projected row — one recorded by the upstream delegation service —
 * cannot be withdrawn here either, because this table is the read-model rather
 * than the authority for those.
 */
export function WithdrawDelegationButton({
  delegation,
  currentPrincipalId,
}: {
  delegation: DelegatedAuthority;
  currentPrincipalId: string;
}) {
  const [state, action, pending] = useActionState<DelegateAuthorityState, FormData>(
    withdrawAuthorityAction,
    IDLE_DELEGATE_AUTHORITY,
  );

  if (delegation.revocation_status !== "ACTIVE") {
    return (
      <span className="text-[11px] text-slate-400 dark:text-slate-500">
        Already ended — and it cannot be reinstated.
      </span>
    );
  }

  if (delegation.source_service) {
    return (
      <span className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Recorded by {delegation.source_service}. It has to be withdrawn there — this list is a
        copy the checks read, not the record itself.
      </span>
    );
  }

  if (delegation.delegator_principal_id !== currentPrincipalId) {
    return (
      <span className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Only the person who lent it can withdraw it. To remove the access another way, end the
        grant they are lending from.
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      <form action={action}>
        <input
          type="hidden"
          name="delegated_authority_id"
          value={delegation.delegated_authority_id}
        />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {!pending && <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
          {pending ? "Withdrawing…" : "Withdraw"}
        </Button>
      </form>

      {state.status !== "idle" && (
        <p
          className={cn(
            "text-[11px] leading-relaxed",
            state.status === "withdrawn"
              ? "text-emerald-700 dark:text-emerald-400"
              : state.status === "alreadyWithdrawn"
                ? "text-slate-500 dark:text-slate-400"
                : "text-rose-700 dark:text-rose-400",
          )}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

function DelegationFeedback({ state }: { state: DelegateAuthorityState }) {
  if (state.status === "idle") return null;

  if (state.status === "lent" || state.status === "withdrawn") {
    return (
      <div
        className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm animate-fade-up dark:border-emerald-500/30 dark:bg-emerald-500/10"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p className="leading-relaxed text-emerald-800 dark:text-emerald-300">{state.message}</p>
      </div>
    );
  }

  const neutral = state.status === "alreadyWithdrawn";
  const isUnauthorized = state.status === "unauthorized";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        neutral
          ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
          : isUnauthorized
            ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
            : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
      )}
      role="status"
      aria-live="polite"
    >
      {neutral || isUnauthorized ? (
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <p className="leading-relaxed">{state.message}</p>
    </div>
  );
}
