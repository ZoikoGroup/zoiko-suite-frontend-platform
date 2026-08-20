"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  grantDelegationAction,
  revokeDelegationAction,
} from "@/app/admin/delegations/actions";
import {
  IDLE_GRANT_DELEGATION,
  IDLE_REVOKE_DELEGATION,
  type GrantDelegationState,
  type RevokeDelegationState,
} from "@/app/admin/delegations/state";

/**
 * Tones.
 *
 * `replayed` is neutral rather than green: the service answered 200 because
 * this correlation id had already granted the delegation and nothing was
 * written. Colouring that as a fresh success would tell an operator they had
 * just handed out authority that was handed out days ago.
 *
 * `refused` is amber, not red. Every refusal this register produces is the
 * control working — you may not delegate what is not yours, you may not be the
 * beneficiary of a delegation you administered, the delegator does not hold the
 * action. Painting those red reads as a system fault and invites a retry, which
 * is precisely the wrong response.
 */
const GRANT_TONE = {
  granted: "success",
  replayed: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const REVOKE_TONE = {
  revoked: "success",
  terminal: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Action types are free-text VARCHAR in the service on purpose — a new action
 *  arrives by grant, not by redeploying this console. These are suggestions
 *  drawn from actions the platform already authorizes, not a closed set. */
const COMMON_ACTIONS = [
  "PAYMENT_APPROVE",
  "PO_ISSUE",
  "PO_APPROVE",
  "CONTRACT_SIGN",
  "RESOLUTION_PASS",
  "OBLIGATION_STATUS_UPDATE",
  "INVOICE_APPROVE",
] as const;

export function GrantDelegationForm({
  principalId,
  legalEntityId,
  correlationId,
}: {
  principalId: string;
  legalEntityId: string;
  /** Minted by the server component on every render of this route.
   *
   *  It arrives as a prop rather than being generated here, and that is
   *  load-bearing twice over. A value from crypto.randomUUID() computed during
   *  render differs between the server pass and the client pass, so React
   *  hydrates against markup containing a different id and tears the tree down
   *  with a hydration mismatch — observed, not theoretical. Generating it in an
   *  effect instead fixes the mismatch and trips
   *  react-hooks/set-state-in-effect, which is right to complain: this value
   *  was never client state.
   *
   *  As a prop it is also correct for idempotency. It stays fixed while the
   *  form is on screen, so retrying the SAME submission replays rather than
   *  granting twice; and every write ends in refresh(), which re-runs the
   *  server component and mints a fresh one for the next grant. */
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<GrantDelegationState, FormData>(
    grantDelegationAction,
    IDLE_GRANT_DELEGATION,
  );
  const listId = useId();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="delegator_principal_id">
            Delegator <span className={OPTIONAL}>(defaults to you)</span>
          </label>
          <input
            className={FIELD}
            id="delegator_principal_id"
            name="delegator_principal_id"
            defaultValue={principalId}
          />
          <p className={HINT}>
            You may only delegate authority that is your own. Naming someone else here needs the
            DELEGATION_ADMINISTER grant on this entity — without it the service refuses, rather than
            silently substituting you.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="delegate_principal_id">
            Delegate
          </label>
          <input
            className={FIELD}
            id="delegate_principal_id"
            name="delegate_principal_id"
            placeholder="principal receiving the authority"
            required
          />
          <p className={HINT}>
            Who may act. They gain exactly one action, on one entity, for the window below — nothing
            wider.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="action_type">
            Action type
          </label>
          <input
            className={FIELD}
            id="action_type"
            name="action_type"
            list={listId}
            placeholder="PAYMENT_APPROVE"
            required
          />
          <datalist id={listId}>
            {COMMON_ACTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <p className={HINT}>
            One action per delegation. The service verifies the delegator actually holds it — a
            delegation may never exceed the delegator&rsquo;s own authority.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="legal_entity_id">
            Legal entity <span className={OPTIONAL}>(defaults to your session)</span>
          </label>
          <input
            className={FIELD}
            id="legal_entity_id"
            name="legal_entity_id"
            defaultValue={legalEntityId}
          />
          <p className={HINT}>Delegations are entity-scoped; authority is granted on one entity.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="effective_from">
            Effective from
          </label>
          <input
            className={FIELD}
            id="effective_from"
            name="effective_from"
            type="datetime-local"
            required
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="effective_to">
            Effective to
          </label>
          <input
            className={FIELD}
            id="effective_to"
            name="effective_to"
            type="datetime-local"
            required
          />
          <p className={HINT}>
            Required. A delegation must be time-bound — it expires on its own, and expiry is
            observed the next time this register is read. Neither field is prefilled: the server
            renders this form and does not know your timezone, so any default it suggested would be
            wrong by the offset between you and it.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Granting…" : "Grant delegation"}
        </Button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Idempotency key {correlationId.slice(0, 8)}…
        </span>
      </div>

      <ResultBanner tone={GRANT_TONE[state.status]} message={state.status === "idle" ? undefined : state.message}>
        {(state.status === "granted" || state.status === "replayed") && (
          <div className="mt-2 text-xs">
            <CopyableId value={state.delegation.delegation_id} />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}

export function RevokeDelegationButton({ delegationId }: { delegationId: string }) {
  const [state, action, pending] = useActionState<RevokeDelegationState, FormData>(
    revokeDelegationAction,
    IDLE_REVOKE_DELEGATION,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="delegation_id" value={delegationId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      <ResultBanner
        tone={REVOKE_TONE[state.status]}
        message={state.status === "idle" ? undefined : state.message}
        className="mt-2"
      />
    </form>
  );
}
