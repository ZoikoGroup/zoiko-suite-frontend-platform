"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { POLICY_TYPES, describePolicyType } from "@/lib/api/policies";
import {
  submitPolicy,
  submitPolicyVersion,
  submitActivation,
  submitEvaluation,
} from "@/app/admin/policies/actions";
import {
  IDLE_POLICY_WRITE,
  IDLE_EVALUATE,
  type PolicyWriteState,
  type EvaluateState,
} from "@/app/admin/policies/state";
import { PolicySummary, VersionSummary, EvaluationSummary } from "./PolicySummary";

const WRITE_TONE = {
  created: "success",
  replayed: "neutral",
  conflict: "warning",
  error: "error",
  idle: "neutral",
} as const;

const EVAL_TONE = {
  within: "success",
  "approval-required": "warning",
  unenforceable: "warning",
  error: "error",
  idle: "neutral",
} as const;

/**
 * The panel a written or decided record is read back in.
 *
 * A plain container, but it exists for a reason: the summaries sit inside a
 * tinted banner, and a record needs to read as the record rather than as more of
 * the sentence above it.
 */
function ResultPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
      {children}
    </div>
  );
}

/**
 * The kind-of-rule selector.
 *
 * Options read as their plain names, with the stored code alongside. The code
 * stays visible because it is what the service records and what an operator
 * would have to quote — but it is no longer the only thing on offer, which is
 * what made this list unreadable to anyone who had not seen the schema.
 */
function PolicyTypeField({
  id,
  defaultValue = "APPROVAL_THRESHOLD",
  hint,
}: {
  id: string;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Kind of rule
      </label>
      <select id={id} name="policy_type" defaultValue={defaultValue} className={FIELD}>
        {POLICY_TYPES.map((type) => {
          const described = describePolicyType(type);
          return (
            <option key={type} value={type}>
              {described.label} ({type})
              {described.enforceable ? "" : " — decides nothing yet"}
            </option>
          );
        })}
      </select>
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

/** Scope selector, shared by the version and evaluate forms. Both use the same
 *  three-way choice, and describing it twice differently would invite drift. */
function ScopeField({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Who it applies to
      </label>
      <select id={id} name="scope" defaultValue={defaultValue} className={FIELD}>
        <option value="global">Every organisation on the platform</option>
        <option value="tenant">This organisation</option>
        <option value="entity">This legal entity only</option>
      </select>
    </div>
  );
}

export function CreatePolicyForm() {
  const [state, action, pending] = useActionState<PolicyWriteState, FormData>(
    submitPolicy,
    IDLE_POLICY_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="policy_code" className={LABEL}>
            Short code <span className={OPTIONAL}>(cannot be changed later)</span>
          </label>
          <input
            id="policy_code"
            name="policy_code"
            required
            placeholder="SPEND-LIMIT-V1"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>
            A short handle for the rule. Reusing a code that already exists, with different
            details, is refused — it would redefine a rule rather than repeat it.
          </p>
        </div>
        <PolicyTypeField
          id="policy_type"
          hint="Only an approval threshold is acted on today. The others can be recorded, and are applied to nothing."
        />
        <div className="sm:col-span-2">
          <label htmlFor="policy_name" className={LABEL}>
            Name
          </label>
          <input
            id="policy_name"
            name="policy_name"
            required
            placeholder="Purchase approval threshold"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>What people should recognise this rule by.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Creating…" : "Create the rule"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Creating it changes nothing on its own — it has no limit until you set one
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.policy && (
          <ResultPanel>
            <PolicySummary policy={state.policy} />
          </ResultPanel>
        )}
      </ResultBanner>
    </form>
  );
}

export function CreateVersionForm() {
  const [state, action, pending] = useActionState<PolicyWriteState, FormData>(
    submitPolicyVersion,
    IDLE_POLICY_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="version_policy_id" className={LABEL}>
            Rule reference
          </label>
          <input
            id="version_policy_id"
            name="policy_id"
            required
            placeholder="e.g. 4f8c21ba-90d7-4e13-8a55-c7b02e6d41f9"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          {/* Spells out that this is not the code. The placeholder used to be a
              sentence of instructions, which showed neither the shape of the
              value nor that the short code is the wrong thing to paste — and
              pasting the code is what a person naturally reaches for, because
              the code is the part they chose themselves. */}
          <p className={HINT}>
            Which rule this limit belongs to. This is the long reference the service generated —
            not the short code you chose for the rule. Click any rule reference on this page to
            copy it in full.
          </p>
        </div>
        {/* The limit gets its own numeric field. It used to be typed as JSON,
            which put a wire format between an operator and the one number this
            whole page exists to set. */}
        <div>
          <label htmlFor="threshold_amount" className={LABEL}>
            Limit
          </label>
          <input
            id="threshold_amount"
            name="threshold_amount"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="10000"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>
            Anything at or under this goes ahead. Anything above it needs approval.
          </p>
        </div>
        <div>
          <label htmlFor="effective_from" className={LABEL}>
            Dated from
          </label>
          <input
            id="effective_from"
            name="effective_from"
            type="date"
            required
            className={FIELD}
          />
          {/* This said "Starts applying — the date from which this limit is the
              one that counts", which is not what the service does: it records
              the date and never checks it, so a future date does not hold the
              limit back. A label that promises date-gating is worse than no
              label, because someone would use it to schedule a change. */}
          <p className={HINT}>
            Recorded against the limit, but it does not delay anything — once brought into
            force, the limit decides immediately even if this date is in the future. It is used
            only to rank two limits of the same scope, where the later date wins.
          </p>
        </div>
        <div className="sm:col-span-2">
          <ScopeField id="version_scope" defaultValue="tenant" />
          <p className={HINT}>
            A limit set for one legal entity beats one set for the whole organisation, which in
            turn beats one set for every organisation.
          </p>
        </div>
        {/* Kept, and moved out of the way. The column is free-form and a future
            rule type may need more than a limit in it, so removing the escape
            hatch would make those rules unwritable from this console. Folded
            shut, because for an approval threshold it is empty. */}
        <details className="sm:col-span-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-slate-400 transition-colors hover:text-navy-700 dark:text-slate-500 dark:hover:text-navy-300">
            <span className="transition-transform" aria-hidden="true">
              ›
            </span>
            Add extra details to this rule
          </summary>
          <div className="mt-3">
            <label htmlFor="rule_payload" className={LABEL}>
              Extra details <span className={OPTIONAL}>(leave empty unless you need them)</span>
            </label>
            <textarea
              id="rule_payload"
              name="rule_payload"
              rows={3}
              placeholder={'{"currency": "GBP"}'}
              className={`${FIELD} font-mono text-xs`}
            />
            <p className={HINT}>
              Anything the rule needs beyond the limit, written as named fields in the shape
              shown. It is stored as free-form data, which is why it is typed rather than picked
              — and it is read back on this page as a plain list, so it never has to be read in
              this form.
            </p>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Saving…" : "Save the limit"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Saved but not applied — bringing it into force is a separate step
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.version && (
          <ResultPanel>
            <VersionSummary version={state.version} variant="compact" />
          </ResultPanel>
        )}
      </ResultBanner>
    </form>
  );
}

export function ActivateVersionForm() {
  const [state, action, pending] = useActionState<PolicyWriteState, FormData>(
    submitActivation,
    IDLE_POLICY_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="activate_policy_id" className={LABEL}>
            Rule reference
          </label>
          <input
            id="activate_policy_id"
            name="policy_id"
            required
            placeholder="e.g. 4f8c21ba-90d7-4e13-8a55-c7b02e6d41f9"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="activate_version_id" className={LABEL}>
            Limit reference
          </label>
          <input
            id="activate_version_id"
            name="version_id"
            required
            placeholder="e.g. 7b13d0ce-5a42-4c8f-9d61-2ef8a0b47c35"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
      </div>
      <p className={HINT}>
        Two different references, both shown when you saved the limit above and in the table at
        the top of this page. The first says which rule; the second says which of its limits.
        Both are long generated values, not the short code you chose for the rule.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Applying…" : "Bring it into force"}
        </Button>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Replaces whatever applies to the same scope today. It cannot be undone, and it is
          recorded against your name.
        </p>
      </div>

      {/* The activation is read back in full rather than as a sentence. This is
          the write that changes what the platform applies, and the reader should
          be able to confirm the limit, the scope and the dates they have just put
          into force — not only that something succeeded. */}
      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.version && (
          <ResultPanel>
            <VersionSummary version={state.version} />
          </ResultPanel>
        )}
      </ResultBanner>
    </form>
  );
}

export function EvaluatePolicyForm() {
  const [state, action, pending] = useActionState<EvaluateState, FormData>(
    submitEvaluation,
    IDLE_EVALUATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PolicyTypeField id="eval_policy_type" />
        <ScopeField id="eval_scope" defaultValue="tenant" />
        <div>
          <label htmlFor="amount" className={LABEL}>
            Amount to check
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            required
            placeholder="15000"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Checking…" : "Check this amount"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          An amount equal to the limit counts as within it
        </p>
      </div>

      <ResultBanner tone={EVAL_TONE[state.status]} message={state.message}>
        {state.result && (
          <ResultPanel>
            <EvaluationSummary
              result={state.result}
              amount={state.amount}
              threshold={state.threshold}
              policyName={state.policyCode}
              decisionId={state.decisionId}
            />
          </ResultPanel>
        )}
        {/* Shown whether or not there was an answer: an evaluation that found no
            rule still files a reference, and that reference is the only way to
            check afterwards whether the record was actually written. */}
        {state.decisionId && (
          <p className="text-xs">
            This check was filed for the record under reference{" "}
            <code className="font-mono">{state.decisionId}</code>. Filing it is best-effort — an
            answer here does not prove the record was kept, so look the reference up in the
            governance log if it matters.
          </p>
        )}
      </ResultBanner>
    </form>
  );
}
