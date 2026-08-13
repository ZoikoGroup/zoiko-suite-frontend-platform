// Shared contract between the policy Server Actions and the forms that call them.

import type { EvaluateResult, Policy, PolicyVersion } from "@/lib/api/policies";

/**
 * `created` vs `replayed` vs `conflict`.
 *
 * policy-svc is idempotent on a natural key and returns 200 for an identical
 * repeat, 409 when the key matches but the attributes differ. The third is not a
 * retry — it is an attempt to redefine a governance rule under a name already in
 * use — so it never renders as a plain error alongside a network failure.
 */
export type PolicyWriteState = {
  status: "idle" | "created" | "replayed" | "conflict" | "error";
  message: string;
  policy?: Policy;
  version?: PolicyVersion;
};

export const IDLE_POLICY_WRITE: PolicyWriteState = { status: "idle", message: "" };

/**
 * Evaluation outcome.
 *
 * `unenforceable` is its own state and is the important one: a 404 from evaluate
 * means no ACTIVE policy applies, and policy-svc deliberately refuses to guess
 * fail-open or fail-closed. Rendering that as an error would suggest a broken
 * service; rendering it as a pass would be a governance failure.
 */
export type EvaluateState = {
  status: "idle" | "within" | "approval-required" | "unenforceable" | "error";
  message: string;
  result?: EvaluateResult;
  /** The decision_id sent, so the operator can find the evidence row it wrote. */
  decisionId?: string;
};

export const IDLE_EVALUATE: EvaluateState = { status: "idle", message: "" };
