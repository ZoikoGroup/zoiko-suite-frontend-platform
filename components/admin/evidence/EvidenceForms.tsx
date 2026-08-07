"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { EVIDENCE_TYPES } from "@/lib/api/evidence";
import {
  submitRequirement,
  submitRetirement,
  submitEvidenceEvaluation,
} from "@/app/admin/evidence/actions";
import {
  IDLE_REQUIREMENT_WRITE,
  IDLE_EVIDENCE_EVALUATE,
  DOMAIN_CODES,
  type RequirementWriteState,
  type EvidenceEvaluateState,
} from "@/app/admin/evidence/state";

const WRITE_TONE = {
  created: "success",
  retired: "success",
  replayed: "neutral",
  "already-retired": "warning",
  denied: "error",
  error: "error",
  idle: "neutral",
} as const;

/**
 * Evaluation tones.
 *
 * NO_REQUIREMENTS_DEFINED is amber, not green. It means nothing is configured to
 * check — an honest answer, and not a pass. Rendering it as success would undo the
 * distinction the service was built to make.
 */
const EVAL_TONE = {
  satisfied: "success",
  missing: "error",
  "none-defined": "warning",
  undeterminable: "warning",
  denied: "error",
  error: "error",
  idle: "neutral",
} as const;

function DomainField({ id, defaultValue = "FINANCE" }: { id: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Domain
      </label>
      <select id={id} name="domain_code" defaultValue={defaultValue} className={FIELD}>
        {DOMAIN_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CreateRequirementForm() {
  const [state, action, pending] = useActionState<RequirementWriteState, FormData>(
    submitRequirement,
    IDLE_REQUIREMENT_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DomainField id="requirement_domain" />
        <div>
          <label htmlFor="requirement_action" className={LABEL}>
            Action type
          </label>
          <input
            id="requirement_action"
            name="action_type"
            required
            placeholder="INVOICE_APPROVAL"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="requirement_scope" className={LABEL}>
            Scope
          </label>
          <select
            id="requirement_scope"
            name="scope"
            defaultValue="tenant"
            className={FIELD}
          >
            <option value="tenant">Tenant-wide — every entity</option>
            <option value="entity">This legal entity only</option>
          </select>
        </div>
        <div>
          <label htmlFor="evidence_type" className={LABEL}>
            Evidence type
          </label>
          <select
            id="evidence_type"
            name="evidence_type"
            defaultValue="SUPPORTING_DOCUMENT"
            className={FIELD}
          >
            {EVIDENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
                {type === "SUPPORTING_DOCUMENT" ? " — verified" : " — unverified"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="minimum_count" className={LABEL}>
            Minimum count <span className={OPTIONAL}>(blank = 1)</span>
          </label>
          <input
            id="minimum_count"
            name="minimum_count"
            type="number"
            min="1"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="artifact_subtype" className={LABEL}>
            Artifact subtype <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="artifact_subtype"
            name="artifact_subtype"
            placeholder="SIGNED_CONTRACT"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="description" className={LABEL}>
            Description{" "}
            <span className={OPTIONAL}>
              (shown to whoever gets blocked, so they know what to produce)
            </span>
          </label>
          <input
            id="description"
            name="description"
            placeholder="A counter-signed vendor agreement stored in the document vault"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Adding…" : "Add requirement"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Authorization-gated and fail-closed — an unreachable authorization-svc refuses this
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.requirement && (
          <JsonBlock
            value={{
              evidence_requirement_id: state.requirement.evidence_requirement_id,
              domain_code: state.requirement.domain_code,
              action_type: state.requirement.action_type,
              evidence_type: state.requirement.evidence_type,
              effective_from: state.requirement.effective_from,
            }}
          />
        )}
      </ResultBanner>
    </form>
  );
}

export function RetireRequirementForm() {
  const [state, action, pending] = useActionState<RequirementWriteState, FormData>(
    submitRetirement,
    IDLE_REQUIREMENT_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="retire_requirement_id" className={LABEL}>
            Requirement ID
          </label>
          <input
            id="retire_requirement_id"
            name="requirement_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="retire_reason" className={LABEL}>
            Reason <span className={OPTIONAL}>(required)</span>
          </label>
          <input
            id="retire_reason"
            name="reason"
            required
            placeholder="Superseded by the group-level control"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Retiring…" : "Retire requirement"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          End-dating, not deletion — the row stays readable so past evaluations stay explicable
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.requirement?.effective_to && (
          <p className="text-xs">
            Retired as of <code>{state.requirement.effective_to}</code>.
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

export function EvaluateEvidenceForm() {
  const [state, action, pending] = useActionState<EvidenceEvaluateState, FormData>(
    submitEvidenceEvaluation,
    IDLE_EVIDENCE_EVALUATE,
  );

  const unmet = state.result?.unmet ?? [];

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DomainField id="evaluate_domain" />
        <div>
          <label htmlFor="evaluate_action" className={LABEL}>
            Action type
          </label>
          <input
            id="evaluate_action"
            name="action_type"
            required
            placeholder="INVOICE_APPROVAL"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="present_artifacts" className={LABEL}>
            Artifacts you assert exist{" "}
            <span className={OPTIONAL}>
              (one per line: TYPE reference-id [subtype] — leave blank to test the empty case)
            </span>
          </label>
          <textarea
            id="present_artifacts"
            name="present_artifacts"
            rows={3}
            placeholder={"SUPPORTING_DOCUMENT doc-1234 SIGNED_CONTRACT\nAPPROVAL_RECORD apr-5678"}
            className={`${FIELD} font-mono text-xs`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Evaluating…" : "Evaluate"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          SUPPORTING_DOCUMENT references are checked against document-vault-svc; other types are
          taken on trust
        </p>
      </div>

      <ResultBanner tone={EVAL_TONE[state.status]} message={state.message}>
        {unmet.length > 0 && (
          <ul className="space-y-1.5 text-xs">
            {unmet.map((item) => (
              <li key={item.evidence_requirement_id}>
                <strong className="font-medium">{item.evidence_type}</strong> — {item.reason}
              </li>
            ))}
          </ul>
        )}
        {state.result && (
          <p className="text-xs">
            Recorded as evaluation{" "}
            <code className="font-mono">{state.result.evaluation_id}</code>. This record is
            append-only and froze its payloads at decision time.
          </p>
        )}
      </ResultBanner>
    </form>
  );
}
