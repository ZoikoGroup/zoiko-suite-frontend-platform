// Shared contract between the evidence Server Actions and the forms that call
// them.

import type { EvidenceEvaluationResult, EvidenceRequirement } from "@/lib/api/evidence";

export type RequirementWriteState = {
  status: "idle" | "created" | "replayed" | "retired" | "already-retired" | "denied" | "error";
  message: string;
  requirement?: EvidenceRequirement;
};

export const IDLE_REQUIREMENT_WRITE: RequirementWriteState = { status: "idle", message: "" };

/**
 * Evaluation outcome — three verdicts plus two failure modes, all distinct.
 *
 * The one that matters is `none-defined`. An empty requirement catalog is a
 * legitimate data state, and the whole reason this service returns three outcomes
 * instead of two is so "nobody configured this yet" cannot be mistaken for
 * "verified complete". Folding it into `satisfied` here would undo that at the
 * last step.
 *
 * `undeterminable` is the document-vault 503: the service refuses to answer
 * rather than record MISSING off the back of an outage, and the console reports
 * that as neither a pass nor a block.
 */
export type EvidenceEvaluateState = {
  status:
    | "idle"
    | "satisfied"
    | "missing"
    | "none-defined"
    | "undeterminable"
    | "denied"
    | "error";
  message: string;
  result?: EvidenceEvaluationResult;
};

export const IDLE_EVIDENCE_EVALUATE: EvidenceEvaluateState = { status: "idle", message: "" };

/** Domain codes the console offers when creating a requirement or evaluating.
 *  Free-form in the service — this narrows only our own forms. */
export const DOMAIN_CODES = [
  "FINANCE",
  "PAYROLL",
  "HR",
  "LEGAL",
  "TAX",
  "COMPLIANCE",
  "COMMERCIAL_OPS",
] as const;
