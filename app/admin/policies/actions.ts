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
//
// Every message these return is addressed to whoever operates the rule, not to
// whoever wrote the service: no status codes, no column names, and no stored
// codes except where the reader needs to quote one. The record itself is read
// back by the summary components, which carry the codes.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import {
  createPolicy,
  createPolicyVersion,
  activatePolicyVersion,
  evaluatePolicy,
  listApplicablePolicyVersions,
  explainPolicyError,
  explainBadReference,
  looksLikeReference,
  describePolicyType,
  thresholdAmount,
  EVALUABLE_POLICY_TYPES,
  POLICY_TYPES,
} from "@/lib/api/policies";
import type { EvaluateState, PolicyWriteState } from "./state";

// Writes end in refresh(), not revalidatePath. Nothing on this route is cached
// — cacheComponents is off and every panel reads cookies() for the session — so
// there was no cache for revalidatePath to invalidate, while in a Server
// Function it additionally refreshes every previously visited page. refresh()
// re-renders just this route, which is what these actions actually want.

// Built through toIdentity() rather than by hand. lib/auth.ts is explicit that
// it is the one place deciding what a request presents about who is making it —
// assembling the three fields inline here is how this action came to send an
// identity that policy-svc refused, and it also silently dropped the session's
// bearer token, which starts mattering the day the gateway goes in front.
async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return toIdentity(session);
}

const EXPIRED: PolicyWriteState = {
  status: "error",
  message: "You have been signed out. Sign in again and repeat this — nothing was saved.",
};

/**
 * 409 carries a distinct meaning here, so it is separated from every other
 * failure before the generic explainer runs.
 *
 * `conflict` and `notFound` are the wording for THIS write. policy-svc answers
 * both statuses with an empty body, so there is no error code in the response
 * to explain — without wording from the call site the reader was shown
 * "policy-svc returned 409 for /v1/policies". A conflict on a rule, on a
 * version, and on an activation are three different problems with three
 * different fixes, so one generic sentence would not do either.
 */
function writeFailure(
  error: { status?: number; message: string },
  wording: { conflict?: string; notFound?: string } = {},
): PolicyWriteState {
  const message = explainPolicyError(error.message, {
    status: error.status,
    ...wording,
  });
  return error.status === 409
    ? { status: "conflict", message }
    : { status: "error", message };
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

  if (!policyCode) {
    return { status: "error", message: "Give the rule a short code so it can be found again." };
  }
  if (!policyName) {
    return { status: "error", message: "Give the rule a name people will recognise." };
  }
  if (!(POLICY_TYPES as readonly string[]).includes(policyType)) {
    return { status: "error", message: "Choose what kind of rule this is." };
  }

  const result = await createPolicy({
    policyCode,
    policyName,
    policyType,
    identity,
  });

  if (!result.ok) {
    return writeFailure(result.error, {
      conflict:
        "A rule with that code already exists under a different name or kind. This would redefine it rather than repeat it, so nothing was saved — choose a different code, or use the existing rule as it stands.",
    });
  }

  refresh();

  const type = describePolicyType(policyType);
  const caveat = type.enforceable
    ? ""
    : ` Be aware that nothing on the platform can act on a ${type.label.toLowerCase()} yet — it can be given a limit and brought into force, and it will still decide nothing.`;

  return result.status === 201
    ? {
        status: "created",
        policy: result.data,
        message: `“${policyName}” has been created. It sets no limit yet and changes nothing — set one below, then bring it into force.${caveat}`,
      }
    : {
        status: "replayed",
        policy: result.data,
        message: `A rule with this code and exactly these details already existed, so nothing was changed. What was already there is shown below.${caveat}`,
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
  const thresholdRaw = String(formData.get("threshold_amount") ?? "").trim();
  const extrasRaw = String(formData.get("rule_payload") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const scope = String(formData.get("scope") ?? "global").trim();

  if (!policyId) {
    return {
      status: "error",
      message: "Paste the reference of the rule this limit belongs to.",
    };
  }
  // Checked here rather than left to the service. policy-svc casts this to a
  // uuid in SQL, and a value that will not cast comes back as a database
  // outage — which is both wrong and the least useful thing to tell someone
  // who has pasted a rule code into a reference field.
  if (!looksLikeReference(policyId)) {
    return { status: "error", message: explainBadReference(policyId, "rule") };
  }
  if (!effectiveFrom) {
    return { status: "error", message: "Choose the date this limit starts applying." };
  }

  // The limit comes from its own numeric field. Anything else the rule needs
  // goes in the extras box, which stays JSON because the column is free-form and
  // this console cannot know in advance what a future rule type wants in it.
  let rulePayload: Record<string, unknown> = {};
  if (extrasRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extrasRaw);
    } catch {
      return {
        status: "error",
        message:
          "The extra details could not be read. They have to be written as JSON, in the shape shown under the box — or left empty, which is the usual case.",
      };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        status: "error",
        message:
          "The extra details have to be a set of named fields, like the example under the box.",
      };
    }
    rulePayload = { ...(parsed as Record<string, unknown>) };
  }

  if (thresholdRaw !== "") {
    const threshold = Number(thresholdRaw);
    if (!Number.isFinite(threshold)) {
      return { status: "error", message: "The limit has to be a number." };
    }
    if (threshold < 0) {
      return { status: "error", message: "The limit cannot be negative." };
    }
    rulePayload.threshold_amount = threshold;
  }

  // policy-svc accepts a payload with no threshold and only discovers the
  // problem when the version is asked to decide something, at which point it
  // fails outright. A version that can never decide anything is worse than a
  // rejected form, so it is caught here.
  if (thresholdAmount(rulePayload) === null) {
    return {
      status: "error",
      message:
        "Enter the limit for this rule. The service would accept a version without one and then fail the first time it was asked to decide anything, so it is refused here instead.",
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
    callerLegalEntityId: identity.legalEntityId,
  });

  if (!result.ok) {
    return writeFailure(result.error, {
      conflict:
        "A limit already covers this scope from this date, and sets a different amount. Nothing was saved — either give this one a later start date, or a narrower scope.",
      notFound:
        "There is no rule with that reference. Check it against the table at the top of the page — this box wants the rule's reference, and it is easy to paste a limit's reference by mistake.",
    });
  }

  refresh();

  return result.status === 201
    ? {
        status: "created",
        version: result.data,
        message:
          "The limit has been saved, but it is not in force and is deciding nothing. Bring it into force below to start applying it.",
      }
    : {
        status: "replayed",
        version: result.data,
        message:
          "An identical version already existed, so nothing was changed. Whether it is in force is unchanged too — see below.",
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
    return {
      status: "error",
      message: "Paste both references — the one for the rule and the one for the limit.",
    };
  }
  if (!looksLikeReference(policyId)) {
    return { status: "error", message: explainBadReference(policyId, "rule") };
  }
  if (!looksLikeReference(versionId)) {
    return { status: "error", message: explainBadReference(versionId, "limit") };
  }

  const result = await activatePolicyVersion({
    policyId,
    versionId,
    identity,
  });

  if (!result.ok) {
    return writeFailure(result.error, {
      conflict:
        "This limit cannot be brought into force from where it stands — it has already been replaced or withdrawn. Reload the page to see its current standing.",
      notFound:
        "Neither reference matched anything on record. Check both: the first is the rule's reference, the second is the limit's, and they are easy to swap.",
    });
  }

  refresh();

  return {
    status: "created",
    version: result.data,
    // Deliberately not "has just been changed". The service accepts activating
    // a limit that is already in force and answers 200 without altering
    // anything, and nothing in the response distinguishes that from a first
    // activation — so this says what is true afterwards either way, and says
    // that repeating it is harmless rather than implying something moved.
    message:
      "This limit is in force and is being applied to decisions. Anything that applied to the same scope before has been replaced, and the activation is recorded against your name. Repeating this on a limit already in force changes nothing.",
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
    return {
      status: "error",
      message: "You have been signed out. Sign in again and repeat this.",
    };
  }

  const policyType = String(formData.get("policy_type") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const scope = String(formData.get("scope") ?? "tenant").trim();

  if (!policyType) return { status: "error", message: "Choose what kind of rule to check." };

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount)) {
    return { status: "error", message: "Enter the amount you want to check." };
  }
  if (!EVALUABLE_POLICY_TYPES.includes(policyType)) {
    const type = describePolicyType(policyType);
    return {
      status: "unenforceable",
      message: `Nothing on the platform can decide a ${type.label.toLowerCase()} yet, so this cannot be checked. Only an approval threshold can be tested; the other kinds can be recorded but are applied to nothing.`,
      amount,
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
        amount,
        decisionId,
      };
    }
    return {
      status: "error",
      message: explainPolicyError(result.error.message, { status: result.error.status }),
      amount,
    };
  }

  const evaluated = result.data;

  // The evaluate response carries the outcome, a version id and a rule basis —
  // not the limit it was compared against. Reading that back is what lets the
  // answer say "15,000 is over the 10,000 limit" instead of naming a code and a
  // UUID. Best-effort on purpose: the decision has already been made and filed,
  // and a failure to re-read the limit must not turn a valid answer into an
  // error. The summary says the limit could not be read rather than inventing
  // one.
  let threshold: number | undefined;
  let policyCode: string | undefined;
  const applicable = await listApplicablePolicyVersions({
    policyType,
    tenantId: scope === "global" ? undefined : identity.tenantId,
    legalEntityId: scope === "entity" ? identity.legalEntityId : undefined,
    callerTenantId: identity.tenantId,
  });
  if (applicable.ok) {
    const deciding = applicable.data.find(
      (version) => version.policy_version_id === evaluated.policy_version_id,
    );
    if (deciding) {
      threshold = thresholdAmount(deciding.rule_payload) ?? undefined;
      policyCode = deciding.policy_code;
    }
  }

  // Mapped from the two outcomes by name rather than by "is it approval, else
  // pass". An outcome this console has not been taught could as easily mean
  // blocked, and defaulting it to the green banner is the one misreading a
  // governance console must not make — it goes to the amber one, where the
  // summary explains that the answer was not understood.
  const status =
    evaluated.result === "APPROVAL_REQUIRED"
      ? "approval-required"
      : evaluated.result === "WITHIN_THRESHOLD"
        ? "within"
        : "unenforceable";

  return {
    // The banner tone only; the wording lives in the summary, which has the
    // amount and the limit to write it with.
    status,
    result: evaluated,
    amount,
    threshold,
    policyCode,
    decisionId,
    message: "",
  };
}
