"use server";

// Server Actions for policy-svc (:8085).
//
// Server Actions are reachable by direct POST, so the session is verified inside
// every action rather than relying on the proxy's /admin matcher.
//
// policy-svc performs no authorization of its own — like the governance log, the
// session check here is the console's only gate. Unlike the governance log, what
// gets written here changes what the platform enforces: activating a version
// supersedes whatever previously held its scope. That makes activation the most
// consequential write in this console, and it is checked by nothing downstream.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createPolicy,
  createPolicyVersion,
  activatePolicyVersion,
  evaluatePolicy,
  explainPolicyError,
  EVALUABLE_POLICY_TYPES,
  POLICY_TYPES,
} from "@/lib/api/policies";
import type { EvaluateState, PolicyWriteState } from "./state";

// Writes end in refresh(), not revalidatePath. Nothing on this route is cached
// — cacheComponents is off and every panel reads cookies() for the session — so
// there was no cache for revalidatePath to invalidate, while in a Server
// Function it additionally refreshes every previously visited page. refresh()
// re-renders just this route, which is what these actions actually want.

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: PolicyWriteState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** 409 carries a distinct meaning here, so it is separated from every other
 *  failure before the generic explainer runs. */
function writeFailure(status: number | undefined, message: string): PolicyWriteState {
  if (status === 409) {
    return { status: "conflict", message: explainPolicyError(message) };
  }
  return { status: "error", message: explainPolicyError(message) };
}

/** Create a named policy container. It enforces nothing until it has an ACTIVE version. */
export async function submitPolicy(
  _previous: PolicyWriteState,
  formData: FormData,
): Promise<PolicyWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const policyCode = String(formData.get("policy_code") ?? "").trim();
  const policyName = String(formData.get("policy_name") ?? "").trim();
  const policyType = String(formData.get("policy_type") ?? "").trim();

  if (!policyCode) return { status: "error", message: "A policy code is required." };
  if (!policyName) return { status: "error", message: "A policy name is required." };
  if (!(POLICY_TYPES as readonly string[]).includes(policyType)) {
    return { status: "error", message: "Select a policy type." };
  }

  const result = await createPolicy({
    policyCode,
    policyName,
    policyType,
    principalId: identity.principalId,
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  refresh();

  const enforceable = EVALUABLE_POLICY_TYPES.includes(policyType);
  const caveat = enforceable
    ? ""
    : ` Note that policy-svc has no evaluation logic for ${policyType}, so this policy can be versioned and activated but never evaluated — it will be enforced by nothing.`;

  return result.status === 201
    ? {
        status: "created",
        policy: result.data,
        message: `Policy ${policyCode} created. It carries no rules yet — add a version, then activate it.${caveat}`,
      }
    : {
        status: "replayed",
        policy: result.data,
        message: `${policyCode} already existed with exactly these attributes, so nothing was written.${caveat}`,
      };
}

/** Add a DRAFT version. Always DRAFT — activation is a separate, attributable act. */
export async function submitPolicyVersion(
  _previous: PolicyWriteState,
  formData: FormData,
): Promise<PolicyWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const policyId = String(formData.get("policy_id") ?? "").trim();
  const payloadRaw = String(formData.get("rule_payload") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const scope = String(formData.get("scope") ?? "global").trim();

  if (!policyId) return { status: "error", message: "A policy ID is required." };
  if (!effectiveFrom) {
    return { status: "error", message: "An effective-from date is required." };
  }

  let rulePayload: unknown;
  try {
    rulePayload = JSON.parse(payloadRaw || "{}");
  } catch {
    return { status: "error", message: "The rule payload must be valid JSON." };
  }

  // policy-svc accepts a payload with no threshold_amount and only discovers the
  // problem at evaluation time, where it answers 500 invalid_policy_payload. A
  // version that can never be evaluated is worse than a rejected form.
  const threshold = (rulePayload as { threshold_amount?: unknown })?.threshold_amount;
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return {
      status: "error",
      message:
        "The rule payload needs a numeric threshold_amount. policy-svc would accept this version without one and then fail at evaluation with a 500, so it is rejected here instead.",
    };
  }

  const result = await createPolicyVersion({
    policyId,
    rulePayload,
    effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`).toISOString(),
    tenantId: scope === "global" ? undefined : identity.tenantId,
    legalEntityId: scope === "entity" ? identity.legalEntityId : undefined,
    principalId: identity.principalId,
    // The scope the version binds can be global; who published it cannot.
    callerTenantId: identity.tenantId,
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  refresh();

  return result.status === 201
    ? {
        status: "created",
        version: result.data,
        message: `Version created as ${result.data.version_status}. It enforces nothing until activated.`,
      }
    : {
        status: "replayed",
        version: result.data,
        message:
          "An identical version already existed, so nothing was written. Its status is unchanged.",
      };
}

/**
 * Activate a DRAFT version.
 *
 * The one write here that changes what the platform enforces. Legal only from
 * DRAFT — a 409 means someone else moved it, or it was never a draft.
 */
export async function submitActivation(
  _previous: PolicyWriteState,
  formData: FormData,
): Promise<PolicyWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const policyId = String(formData.get("policy_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!policyId || !versionId) {
    return { status: "error", message: "Both a policy ID and a version ID are required." };
  }

  const result = await activatePolicyVersion({
    policyId,
    versionId,
    principalId: identity.principalId,
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  refresh();

  return {
    status: "created",
    version: result.data,
    message: `Version is now ${result.data.version_status}. Whatever previously held this scope has been superseded, and this activation is attributed to you permanently.`,
  };
}

/**
 * Evaluate an amount against the applicable policy.
 *
 * Also appends an evidence row in governance-decision-log-svc — but best-effort:
 * policy-svc logs a failure there and still returns 200. So a successful result
 * does not prove the decision was recorded, and the returned decision_id is
 * surfaced so it can be checked against the Governance Log.
 */
export async function submitEvaluation(
  _previous: EvaluateState,
  formData: FormData,
): Promise<EvaluateState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const policyType = String(formData.get("policy_type") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const scope = String(formData.get("scope") ?? "tenant").trim();

  if (!policyType) return { status: "error", message: "Select a policy type." };

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount)) {
    return { status: "error", message: "Enter a numeric amount to evaluate." };
  }
  if (!EVALUABLE_POLICY_TYPES.includes(policyType)) {
    return {
      status: "unenforceable",
      message: `policy-svc has no evaluation logic for ${policyType} — it would answer 501. Only ${EVALUABLE_POLICY_TYPES.join(", ")} can be evaluated.`,
    };
  }

  const decisionId = crypto.randomUUID();
  const result = await evaluatePolicy({
    policyType,
    actionContext: { amount },
    identity,
    decisionId,
    tenantId: scope === "global" ? undefined : identity.tenantId,
    legalEntityId: scope === "entity" ? identity.legalEntityId : undefined,
  });

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "unenforceable",
        message: explainPolicyError("no_applicable_policy"),
        decisionId,
      };
    }
    return { status: "error", message: explainPolicyError(result.error.message) };
  }

  const evaluated = result.data;
  const requiresApproval = evaluated.result === "APPROVAL_REQUIRED";

  return {
    status: requiresApproval ? "approval-required" : "within",
    result: evaluated,
    decisionId,
    message: requiresApproval
      ? `APPROVAL_REQUIRED — the amount exceeds the active threshold. Basis: ${evaluated.rule_basis}.`
      : `WITHIN_THRESHOLD — the amount is at or under the active threshold. Basis: ${evaluated.rule_basis}.`,
  };
}
