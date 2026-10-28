"use client";

import { useActionState, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  FilePen,
  Lock,
  PencilLine,
  Send,
  ShieldOff,
  Signature,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import { allowedTransitions, type Contract } from "@/lib/api/contracts";
import {
  reviseContract,
  submitContract,
  approveContract,
  sendForSignature,
  recordExecution,
  amendContract,
  renewContract,
  terminateContract,
} from "@/app/admin/legal/actions";
import { IDLE_CONTRACT_STATE, CONTRACT_CURRENCIES } from "@/app/admin/legal/state";
import type { ContractActionState } from "@/app/admin/legal/state";
import { FIELD, LABEL, OPTIONAL } from "./field-styles";
import { ActionFeedback } from "./ActionFeedback";

type PanelName = "revise" | "approve" | "execute" | "amend" | "renew" | "terminate";

const PANEL_WRAP =
  "animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40";

type Action = (state: ContractActionState, data: FormData) => Promise<ContractActionState>;

function useContractAction(action: Action) {
  return useActionState<ContractActionState, FormData>(action, IDLE_CONTRACT_STATE);
}

/**
 * Every lifecycle step contract-lifecycle-svc offers, for one contract:
 *
 *   DRAFT → REVIEW → APPROVED → (signature sent) → EFFECTIVE → amend / renew
 *   APPROVED / EFFECTIVE → TERMINATED
 *
 * Which buttons render is decided by allowedTransitions() from the status and
 * signature status, so the UI never offers a step the service answers 409 to.
 * That is presentation, not enforcement — the service re-checks on arrival.
 */
export function LifecycleActions({ contract }: { contract: Contract }) {
  // Keyed to the version and status it was opened against: a successful step
  // re-renders with a new version or status, which closes its own panel, while
  // a failed one keeps the typed input for a retry.
  const stamp = `${contract.version}:${contract.status}:${contract.signature_status}`;
  const [open, setOpen] = useState<{ panel: PanelName; stamp: string } | null>(null);
  const openPanel = open?.stamp === stamp ? open.panel : null;

  const [reviseState, reviseAction, revisePending] = useContractAction(reviseContract);
  const [submitState, submitAction, submitPending] = useContractAction(submitContract);
  const [approveState, approveAction, approvePending] = useContractAction(approveContract);
  const [sendState, sendAction, sendPending] = useContractAction(sendForSignature);
  const [executeState, executeAction, executePending] = useContractAction(recordExecution);
  const [amendState, amendAction, amendPending] = useContractAction(amendContract);
  const [renewState, renewAction, renewPending] = useContractAction(renewContract);
  const [terminateState, terminateAction, terminatePending] = useContractAction(terminateContract);

  const allowed = allowedTransitions(contract);
  const nothingAllowed = !Object.values(allowed).some(Boolean);

  // A terminal contract has no steps left. The banners still render here so the
  // confirmation of the step that got it there is not lost on re-render.
  if (nothingAllowed) {
    return (
      <div className="space-y-4">
        <ActionFeedback state={terminateState} />
        <PanelEmptyState
          icon={ShieldOff}
          label="No transitions available"
          hint={`This contract is ${contract.status}. No further lifecycle step is available from here.`}
        />
      </div>
    );
  }

  function toggle(panel: PanelName) {
    setOpen(openPanel === panel ? null : { panel, stamp });
  }

  const idField = <input type="hidden" name="contract_id" value={contract.contract_id} />;
  const panel = (name: PanelName) => ({
    isOpen: openPanel === name,
    onToggle: () => toggle(name),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {allowed.revise && <PanelButton {...panel("revise")} label="Revise terms" icon={PencilLine} />}

        {allowed.submit && (
          <form action={submitAction}>
            {idField}
            <Button type="submit" variant="secondary" size="sm" loading={submitPending}>
              {!submitPending && <Send className="h-3.5 w-3.5" aria-hidden="true" />}
              Submit for review
            </Button>
          </form>
        )}

        {allowed.approve && (
          <PanelButton {...panel("approve")} label="Approve" icon={CheckCircle2} variant="primary" />
        )}

        {allowed.sendForSignature && (
          <form action={sendAction}>
            {idField}
            <Button type="submit" size="sm" loading={sendPending}>
              {!sendPending && <Send className="h-3.5 w-3.5" aria-hidden="true" />}
              Send for signature
            </Button>
          </form>
        )}

        {allowed.recordExecution && (
          <PanelButton {...panel("execute")} label="Record execution" icon={Signature} variant="primary" />
        )}

        {allowed.amend && <PanelButton {...panel("amend")} label="Amend" icon={FilePen} />}
        {allowed.renew && <PanelButton {...panel("renew")} label="Renew" icon={CalendarClock} />}
        {allowed.terminate && (
          <PanelButton {...panel("terminate")} label="Terminate" icon={Lock} variant="ghost" />
        )}
      </div>

      {contract.status === "REVIEW" && contract.submitted_by && (
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Submitted for review by {contract.submitted_by}. That principal cannot approve it —
          contract-lifecycle-svc refuses self-approval.
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
                defaultValue={contract.effective_to?.slice(0, 10) ?? ""}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <ChangeSummaryField id="revise-summary" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={revisePending}>
              {revisePending ? "Recording…" : "Record revision"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Appends a version to the history — status stays {contract.status}
            </p>
          </div>
        </form>
      )}

      {openPanel === "approve" && (
        <form action={approveAction} className={PANEL_WRAP}>
          {idField}
          <input type="hidden" name="submitted_by" value={contract.submitted_by ?? ""} />
          <div>
            <label htmlFor="governance_decision_id" className={LABEL}>
              Governance decision ID{" "}
              <span className={OPTIONAL}>(required — must be GRANTED for CONTRACT_APPROVE)</span>
            </label>
            <input
              id="governance_decision_id"
              name="governance_decision_id"
              required
              placeholder="Decision ID from the governance decision log"
              className={FIELD}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={approvePending}>
              {approvePending ? "Approving…" : "Approve contract"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Fixes the terms — they cannot be revised after approval
            </p>
          </div>
        </form>
      )}

      {openPanel === "execute" && (
        <form action={executeAction} className={PANEL_WRAP}>
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
            <Button type="submit" size="sm" loading={executePending}>
              {executePending ? "Recording…" : "Record execution"}
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Makes the contract EFFECTIVE and completes the signature
            </p>
          </div>
        </form>
      )}

      {openPanel === "amend" && (
        <form action={amendAction} className={PANEL_WRAP}>
          {idField}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="amend-title" className={LABEL}>
                Title <span className={OPTIONAL}>(optional)</span>
              </label>
              <input id="amend-title" name="title" className={FIELD} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="amend-value" className={LABEL}>
                Contract value <span className={OPTIONAL}>(now {contract.total_value})</span>
              </label>
              <input
                id="amend-value"
                name="total_value"
                type="number"
                step="0.01"
                min="0.01"
                className={FIELD}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="amend-counterparty" className={LABEL}>
                Counterparty name <span className={OPTIONAL}>(optional)</span>
              </label>
              <input
                id="amend-counterparty"
                name="counterparty_name"
                className={FIELD}
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <ChangeSummaryField id="amend-summary" />
            </div>
          </div>
          <Button type="submit" size="sm" loading={amendPending}>
            {amendPending ? "Recording…" : "Record amendment"}
          </Button>
        </form>
      )}

      {openPanel === "renew" && (
        <form action={renewAction} className={PANEL_WRAP}>
          {idField}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new_effective_to" className={LABEL}>
                New end date
              </label>
              <input
                id="new_effective_to"
                name="new_effective_to"
                type="date"
                required
                className={FIELD}
              />
            </div>
            <div>
              <ChangeSummaryField id="renew-summary" />
            </div>
          </div>
          <Button type="submit" size="sm" loading={renewPending}>
            {renewPending ? "Renewing…" : "Renew contract"}
          </Button>
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
        <ActionFeedback state={approveState} />
        <ActionFeedback state={sendState} />
        <ActionFeedback state={executeState} />
        <ActionFeedback state={amendState} />
        <ActionFeedback state={renewState} />
        <ActionFeedback state={terminateState} />
      </div>
    </div>
  );
}

function PanelButton({
  isOpen,
  onToggle,
  label,
  icon: Icon,
  variant = "secondary",
}: {
  isOpen: boolean;
  onToggle: () => void;
  label: string;
  icon: typeof PencilLine;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Button type="button" variant={variant} size="sm" onClick={onToggle} aria-expanded={isOpen}>
      {isOpen ? (
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {isOpen ? "Cancel" : label}
    </Button>
  );
}

function ChangeSummaryField({ id }: { id: string }) {
  return (
    <>
      <label htmlFor={id} className={LABEL}>
        Change summary <span className={OPTIONAL}>(required — recorded on the version row)</span>
      </label>
      <input
        id={id}
        name="change_summary"
        required
        placeholder="What changed and why"
        className={FIELD}
        autoComplete="off"
      />
    </>
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
