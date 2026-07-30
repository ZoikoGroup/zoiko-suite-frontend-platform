"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { POLICY_TYPES, EVALUABLE_POLICY_TYPES } from "@/lib/api/policies";
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

/** Scope selector, shared by the version and evaluate forms. Both use the same
 *  three-way choice, and describing it twice differently would invite drift. */
function ScopeField({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Scope
      </label>
      <select id={id} name="scope" defaultValue={defaultValue} className={FIELD}>
        <option value="global">Global — every tenant</option>
        <option value="tenant">This tenant</option>
        <option value="entity">This legal entity</option>
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
            Policy code <span className={OPTIONAL}>(stable — also the dedup key)</span>
          </label>
          <input
            id="policy_code"
            name="policy_code"
            required
            placeholder="SPEND-LIMIT-V1"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="policy_type" className={LABEL}>
            Policy type
          </label>
          <select
            id="policy_type"
            name="policy_type"
            defaultValue="APPROVAL_THRESHOLD"
            className={FIELD}
          >
            {POLICY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
                {EVALUABLE_POLICY_TYPES.includes(type) ? "" : " — cannot be evaluated"}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="policy_name" className={LABEL}>
            Policy name
          </label>
          <input
            id="policy_name"
            name="policy_name"
            required
            placeholder="Purchase approval threshold"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Creating…" : "Create policy"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Immutable once created, and enforces nothing until a version is activated
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.policy && (
          <JsonBlock
            value={{
              policy_id: state.policy.policy_id,
              policy_code: state.policy.policy_code,
              policy_type: state.policy.policy_type,
            }}
          />
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
            Policy ID
          </label>
          <input
            id="version_policy_id"
            name="policy_id"
            required
            placeholder="Copy it from the create-policy result above"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <ScopeField id="version_scope" defaultValue="tenant" />
        <div>
          <label htmlFor="effective_from" className={LABEL}>
            Effective from
          </label>
          <input
            id="effective_from"
            name="effective_from"
            type="date"
            required
            className={FIELD}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rule_payload" className={LABEL}>
            Rule payload{" "}
            <span className={OPTIONAL}>(JSON — needs a numeric threshold_amount)</span>
          </label>
          <textarea
            id="rule_payload"
            name="rule_payload"
            rows={3}
            required
            defaultValue={'{ "threshold_amount": 10000 }'}
            className={`${FIELD} font-mono text-xs`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Creating…" : "Create draft version"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Always created DRAFT — there is no way to create an already-active version
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.version && (
          <JsonBlock
            value={{
              policy_version_id: state.version.policy_version_id,
              version_status: state.version.version_status,
              tenant_id: state.version.tenant_id,
              legal_entity_id: state.version.legal_entity_id,
            }}
          />
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
            Policy ID
          </label>
          <input
            id="activate_policy_id"
            name="policy_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="activate_version_id" className={LABEL}>
            Version ID
          </label>
          <input
            id="activate_version_id"
            name="version_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Activating…" : "Activate version"}
        </Button>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Supersedes whatever currently holds this scope. Not reversible, and attributed to you.
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message} />
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
        <div>
          <label htmlFor="eval_policy_type" className={LABEL}>
            Policy type
          </label>
          <select
            id="eval_policy_type"
            name="policy_type"
            defaultValue="APPROVAL_THRESHOLD"
            className={FIELD}
          >
            {POLICY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <ScopeField id="eval_scope" defaultValue="tenant" />
        <div>
          <label htmlFor="amount" className={LABEL}>
            Amount to test
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
          {pending ? "Evaluating…" : "Evaluate"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Equal to the threshold counts as within it
        </p>
      </div>

      <ResultBanner tone={EVAL_TONE[state.status]} message={state.message}>
        {state.decisionId && (
          <p className="text-xs">
            Evidence was written best-effort under decision ID{" "}
            <code className="font-mono">{state.decisionId}</code>. A 200 here does not prove the
            log accepted it — check the Governance Log for that id.
          </p>
        )}
        {state.result && <JsonBlock value={state.result} />}
      </ResultBanner>
    </form>
  );
}
