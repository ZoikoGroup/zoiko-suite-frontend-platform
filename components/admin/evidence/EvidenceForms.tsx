"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { EVIDENCE_TYPES, describeEvidenceType, domainLabel } from "@/lib/api/evidence";
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
import { RequirementSummary, OutcomeSummary } from "./EvidenceSummary";

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
 * `none-defined` is amber, not green. It means nothing is configured to check —
 * an honest answer, and not a pass. Rendering it as success would undo the
 * distinction the service was built to make.
 *
 * `undeterminable` is amber for the same reason from the other direction: the
 * service refused to answer rather than guess, and that is neither a pass nor a
 * block.
 */
const EVAL_TONE = {
  satisfied: "success",
  missing: "error",
  "none-defined": "warning",
  unrecognised: "warning",
  undeterminable: "warning",
  denied: "error",
  error: "error",
  idle: "neutral",
} as const;

/**
 * A record inside a tinted banner.
 *
 * The banner's own text is a sentence about what happened; a record needs to
 * read as the record rather than as more of that sentence.
 */
function ResultPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
      {children}
    </div>
  );
}

/**
 * The business-area selector.
 *
 * Options read as their plain names, with the stored code alongside. The code
 * stays visible because it is what the service records and what someone would
 * have to quote — but it is no longer the only thing on offer, which is what
 * made this list unreadable to anyone who had not seen the schema.
 */
function DomainField({ id, defaultValue = "FINANCE" }: { id: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Business area
      </label>
      <select id={id} name="domain_code" defaultValue={defaultValue} className={FIELD}>
        {DOMAIN_CODES.map((code) => (
          <option key={code} value={code}>
            {domainLabel(code)} ({code})
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
            Action to gate
          </label>
          <input
            id="requirement_action"
            name="action_type"
            required
            placeholder="INVOICE_APPROVAL"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The action this evidence will be required for
          </p>
        </div>
        <div>
          <label htmlFor="requirement_scope" className={LABEL}>
            Who it applies to
          </label>
          <select
            id="requirement_scope"
            name="scope"
            defaultValue="tenant"
            className={FIELD}
          >
            <option value="tenant">Every company in the group</option>
            <option value="entity">This company only</option>
          </select>
        </div>
        <div>
          <label htmlFor="evidence_type" className={LABEL}>
            Evidence needed
          </label>
          <select
            id="evidence_type"
            name="evidence_type"
            defaultValue="SUPPORTING_DOCUMENT"
            className={FIELD}
          >
            {EVIDENCE_TYPES.map((type) => {
              const described = describeEvidenceType(type);
              return (
                <option key={type} value={type}>
                  {described.label}
                  {described.verified ? " — checked by the platform" : " — taken as stated"}
                </option>
              );
            })}
          </select>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Only documents are looked up; the rest are recorded as stated
          </p>
        </div>
        <div>
          <label htmlFor="minimum_count" className={LABEL}>
            How many are needed <span className={OPTIONAL}>(blank means one)</span>
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
            Narrow it to one kind <span className={OPTIONAL}>(optional)</span>
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
            What to produce{" "}
            <span className={OPTIONAL}>
              (shown to anyone this stops, so they know what is being asked for)
            </span>
          </label>
          <input
            id="description"
            name="description"
            placeholder="A counter-signed vendor agreement, filed in the document store"
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
          Your permission is checked first, and nothing is saved if it cannot be checked
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.requirement && (
          <ResultPanel>
            <RequirementSummary requirement={state.requirement} variant="compact" />
          </ResultPanel>
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
            Requirement reference
          </label>
          <input
            id="retire_requirement_id"
            name="requirement_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Copy it from the catalog above
          </p>
        </div>
        <div>
          <label htmlFor="retire_reason" className={LABEL}>
            Why <span className={OPTIONAL}>(required)</span>
          </label>
          <input
            id="retire_reason"
            name="reason"
            required
            placeholder="Replaced by the group-level control"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Withdrawing…" : "Withdraw requirement"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Nothing is deleted — it stays readable so past decisions can still be explained
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.requirement && (
          <ResultPanel>
            <RequirementSummary requirement={state.requirement} variant="compact" />
          </ResultPanel>
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

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DomainField id="evaluate_domain" />
        <div>
          <label htmlFor="evaluate_action" className={LABEL}>
            Action to check
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
            Evidence you say exists{" "}
            <span className={OPTIONAL}>(leave blank to see what would be required)</span>
          </label>
          <textarea
            id="present_artifacts"
            name="present_artifacts"
            rows={3}
            placeholder={"SUPPORTING_DOCUMENT doc-1234 SIGNED_CONTRACT\nAPPROVAL_RECORD apr-5678"}
            className={`${FIELD} font-mono text-xs`}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            One item per line: the kind of evidence, then its reference, then optionally which kind
            it is. The kinds you can use are{" "}
            {EVIDENCE_TYPES.map((type, index) => (
              <span key={type}>
                {index > 0 && ", "}
                <span className="font-mono">{type}</span>
              </span>
            ))}
            .
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Checking…" : "Check this action"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Documents are looked up to confirm they exist; other kinds are recorded as stated
        </p>
      </div>

      <ResultBanner tone={EVAL_TONE[state.status]} message={state.message}>
        {state.result && (
          <ResultPanel>
            <OutcomeSummary
              result={state.result}
              domainCode={state.asked?.domainCode}
              actionType={state.asked?.actionType}
            />
          </ResultPanel>
        )}
      </ResultBanner>
    </form>
  );
}
