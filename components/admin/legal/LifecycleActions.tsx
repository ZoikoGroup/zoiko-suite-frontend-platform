"use client";

import { useActionState, useState } from "react";
import { Lock, PencilLine, Send, ShieldOff, Signature, X } from "lucide-react";
import { Button } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { allowedTransitions, type Contract } from "@/lib/api/contracts";
import {
  reviseContract,
  submitContract,
  activateContract,
  terminateContract,
} from "@/app/admin/legal/actions";
import { IDLE_CONTRACT_STATE, CONTRACT_CURRENCIES } from "@/app/admin/legal/state";
import type { ContractActionState } from "@/app/admin/legal/state";
import { FIELD, LABEL, OPTIONAL } from "./field-styles";
import { ActionFeedback } from "./ActionFeedback";

type PanelName = "revise" | "activate" | "terminate";

const PANEL_WRAP =
  "animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40";

/**
 * Every lifecycle transition contract-lifecycle-svc offers, for one contract.
 *
 * Which buttons render is decided by allowedTransitions() from the contract's
 * current status, so the UI never offers a step the service would answer 409 to.
 * That is presentation, not enforcement — the service is the only thing that
 * actually guards a transition, and it re-checks on arrival.
 */
export function LifecycleActions({ contract }: { contract: Contract }) {
  // Which panel is open, keyed to the version it was opened against rather than
  // a bare name. Revising and activating both bump the version and revalidate,
  // so a successful action closes its own panel with no effect syncing state —
  // while a failed one leaves the version alone and keeps the typed input for a
  // retry.
  const [open, setOpen] = useState<{ panel: PanelName; version: number } | null>(null);
  const openPanel = open?.version === contract.version ? open.panel : null;

  const [reviseState, reviseAction, revisePending] = useActionState<ContractActionState, FormData>(
    reviseContract,
    IDLE_CONTRACT_STATE,
  );
  const [submitState, submitAction, submitPending] = useActionState<ContractActionState, FormData>(
    submitContract,
    IDLE_CONTRACT_STATE,
  );
  const [activateState, activateAction, activatePending] = useActionState<
    ContractActionState,
    FormData
  >(activateContract, IDLE_CONTRACT_STATE);
  const [terminateState, terminateAction, terminatePending] = useActionState<
    ContractActionState,
    FormData
  >(terminateContract, IDLE_CONTRACT_STATE);

  const allowed = allowedTransitions(contract.status);
  const nothingAllowed =
    !allowed.revise && !allowed.submit && !allowed.activate && !allowed.terminate;

  // TERMINATED is the only status with no transitions left, and terminating is what
  // gets you there — so this branch renders immediately after a successful
  // termination, replacing the panel the user just submitted from.
  //
  // The feedback banners have to render here too. Returning only the empty state
  // swallowed the one confirmation that matters most: the write succeeded, the
  // revalidate re-rendered with the new status, this branch took over, and the
  // "terminated" banner was destroyed before it could be read. The user was left
  // with "No transitions available" and no confirmation that their own action was
  // what did it — or, if the action had failed, no error either. Every other
  // transition keeps at least one action available, so terminate was the only one
  // that lost its result. Found by driving the page in a real browser.
  if (nothingAllowed) {
    return (
      <div className="space-y-4">
        <ActionFeedback state={terminateState} />
        <ActionFeedback state={activateState} />
        <PanelEmptyState
          icon={ShieldOff}
          label="No transitions available"
          hint="This contract is TERMINATED. Termination is terminal — it cannot be revised, reactivated, or reopened."
        />
      </div>
    );
  }

  function toggle(panel: PanelName) {
    setOpen(openPanel === panel ? null : { panel, version: contract.version });
  }

  const idField = <input type="hidden" name="contract_id" value={contract.contract_id} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {allowed.revise && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => toggle("revise")}
            aria-expanded={openPanel === "revise"}
          >
            {openPanel === "revise" ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {openPanel === "revise" ? "Cancel" : "Revise terms"}
          </Button>
        )}

        {allowed.submit && (
          <form action={submitAction}>
            {idField}
            <Button type="submit" variant="secondary" size="sm" loading={submitPending}>
              {!submitPending && <Send className="h-3.5 w-3.5" aria-hidden="true" />}
              Submit for approval
            </Button>
          </form>
        )}

        {allowed.activate && (
          <Button
            type="button"
            size="sm"
            onClick={() => toggle("activate")}
            aria-expanded={openPanel === "activate"}
          >
            {openPanel === "activate" ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Signature className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {openPanel === "activate" ? "Cancel" : "Activate"}
          </Button>
        )}

        {allowed.terminate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggle("terminate")}
            aria-expanded={openPanel === "terminate"}
          >
            {openPanel === "terminate" ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {openPanel === "terminate" ? "Cancel" : "Terminate"}
          </Button>
        )}
      </div>

      {contract.status === "DRAFT" && allowed.activate && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          This contract can be activated straight from DRAFT. contract-lifecycle-svc refuses
          activation only for ACTIVE and TERMINATED contracts, so PENDING_APPROVAL is not a
          prerequisite — signing here bypasses approval entirely rather than being blocked by it.
        </p>
      )}

      {openPanel === "revise" && (
        <form action={reviseAction} className={PANEL_WRAP}>
          {idField}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Leave a field blank to keep it as it is. The service reads an empty value as
            &ldquo;unchanged&rdquo;, so a field cannot be cleared here — only replaced.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="revise-title" className={LABEL}>
                Title <span className={OPTIONAL}>(currently &ldquo;{contract.title}&rdquo;)</span>
              </label>
              <input id="revise-title" name="title" className={FIELD} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="revise-value" className={LABEL}>
                Contract value <span className={OPTIONAL}>(now {contract.total_value})</span>
              </label>
              <input
                id="revise-value"
                name="total_value"
                type="number"
                step="0.01"
                min="0.01"
                className={FIELD}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="revise-currency" className={LABEL}>
                Currency
              </label>
              <select
                id="revise-currency"
                name="currency"
                defaultValue={contract.currency}
                className={FIELD}
              >
                {currencyOptions(contract.currency).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="revise-counterparty" className={LABEL}>
                Counterparty name
              </label>
              <input
                id="revise-counterparty"
                name="counterparty_name"
                className={FIELD}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="revise-effective-to" className={LABEL}>
                Effective to
              </label>
              <input
                id="revise-effective-to"
                name="effective_to"
                type="date"
                defaultValue={contract.effective_to ?? ""}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="revise-summary" className={LABEL}>
                Change summary{" "}
                <span className={OPTIONAL}>(required — recorded on the version row)</span>
              </label>
              <input
                id="revise-summary"
                name="change_summary"
                required
                placeholder="Value uplifted after scope extension agreed on call"
                className={FIELD}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={revisePending}>
              {revisePending ? "Recording…" : "Record revision"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Appends v{contract.version + 1} to the history — status stays {contract.status}
            </p>
          </div>
        </form>
      )}

      {openPanel === "activate" && (
        <form action={activateAction} className={PANEL_WRAP}>
          {idField}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="signed_by" className={LABEL}>
                Signed by
              </label>
              <input
                id="signed_by"
                name="signed_by"
                required
                placeholder="Name of the authorised signatory"
                className={FIELD}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="document_vault_id" className={LABEL}>
                Document vault ID <span className={OPTIONAL}>(optional)</span>
              </label>
              <input
                id="document_vault_id"
                name="document_vault_id"
                placeholder="Reference to the executed PDF"
                className={FIELD}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={activatePending}>
              {activatePending ? "Activating…" : "Activate contract"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Signature timestamp is stamped now, server-side
            </p>
          </div>
        </form>
      )}

      {openPanel === "terminate" && (
        <form action={terminateAction} className={PANEL_WRAP}>
          {idField}
          <div>
            <label htmlFor="termination_note" className={LABEL}>
              Termination reason{" "}
              <span className={OPTIONAL}>(required — recorded permanently)</span>
            </label>
            <input
              id="termination_note"
              name="termination_note"
              required
              placeholder="Terminated for convenience under clause 14.2, 30 days' notice served"
              className={FIELD}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={terminatePending}>
              {terminatePending ? "Terminating…" : "Terminate contract"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Terminal, and closes the term off as of today
            </p>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <ActionFeedback state={reviseState} />
        <ActionFeedback state={submitState} />
        <ActionFeedback state={activateState} />
        <ActionFeedback state={terminateState} />
      </div>
    </div>
  );
}

/** The offered currencies, plus whatever this contract is already denominated in
 *  if the service holds a code the console does not list. Without this, a stored
 *  code outside the list would silently re-denominate the contract on revision:
 *  the select would fall back to its first option and send that. */
function currencyOptions(current: string): string[] {
  return (CONTRACT_CURRENCIES as readonly string[]).includes(current)
    ? [...CONTRACT_CURRENCIES]
    : [current, ...CONTRACT_CURRENCIES];
}
