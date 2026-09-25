"use server";

// Server Actions for evidence-requirements-svc (:8130).
//
// Server Actions are reachable by direct POST, so the session is verified inside
// every action rather than relying on the proxy's /admin matcher.
//
// This is the one service in this console whose writes are genuinely gated
// downstream. Catalog mutation is checked against authorization-svc and the check
// fails CLOSED — an unreachable authorization-svc refuses the write rather than
// allowing it. So unlike the policy and vault pages, a 403 here is a real denial
// and a 503 is a real fail-closed refusal, and the two are reported apart because
// they call for different responses: one is a permissions problem, the other an
// outage.
//
// It is also strict about scope in a way the others are not: the body tenant must
// match the verified header tenant, so these actions always send the session
// tenant rather than anything from the form.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createEvidenceRequirement,
  retireEvidenceRequirement,
  evaluateEvidence,
  getEvidenceRequirement,
  getEvidenceEvaluation,
  explainEvidenceError,
  explainEvidenceOutcome,
  actionLabel,
  domainLabel,
  EVIDENCE_TYPES,
  type EvidenceEvaluation,
  type EvidenceRequirement,
  type OutcomeKind,
  type PresentArtifact,
} from "@/lib/api/evidence";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { EvidenceEvaluateState, RequirementWriteState } from "./state";

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

const EXPIRED: RequirementWriteState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/** 403 is a denial, 503 a fail-closed refusal. Neither is a generic error, and
 *  the difference is the whole point of a fail-closed check. */
function writeFailure(status: number | undefined, message: string): RequirementWriteState {
  if (status === 403) return { status: "denied", message: explainEvidenceError(message) };
  return { status: "error", message: explainEvidenceError(message) };
}

/** Add a requirement to the catalog. Authorization-gated, fail-closed. */
export async function submitRequirement(
  _previous: RequirementWriteState,
  formData: FormData,
): Promise<RequirementWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const domainCode = String(formData.get("domain_code") ?? "").trim();
  const actionType = String(formData.get("action_type") ?? "").trim();
  const evidenceType = String(formData.get("evidence_type") ?? "").trim();
  const scope = String(formData.get("scope") ?? "tenant").trim();
  const minimumRaw = String(formData.get("minimum_count") ?? "").trim();
  const artifactSubtype = String(formData.get("artifact_subtype") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!domainCode) return { status: "error", message: "Choose a business area." };
  if (!actionType) return { status: "error", message: "Enter the action this evidence is for." };
  if (!(EVIDENCE_TYPES as readonly string[]).includes(evidenceType)) {
    return { status: "error", message: "Choose which kind of evidence is needed." };
  }

  let minimumCount: number | undefined;
  if (minimumRaw !== "") {
    const parsed = Number(minimumRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { status: "error", message: "How many are needed has to be a whole number, one or more." };
    }
    minimumCount = parsed;
  }

  const result = await createEvidenceRequirement({
    identity,
    domainCode,
    actionType,
    evidenceType,
    legalEntityId: scope === "entity" ? identity.legalEntityId : undefined,
    spec:
      minimumCount === undefined && !artifactSubtype && !description
        ? undefined
        : {
            ...(minimumCount === undefined ? {} : { minimum_count: minimumCount }),
            ...(artifactSubtype ? { artifact_subtype: artifactSubtype } : {}),
            ...(description ? { description } : {}),
          },
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  refresh();

  const gate =
    scope === "entity" ? "this company" : "every company in the group";

  return result.status === 201
    ? {
        status: "created",
        requirement: result.data,
        message: `Added. ${actionLabel(actionType)} in ${domainLabel(
          domainCode,
        )} now needs this evidence for ${gate}, and any check made without it will block the action.`,
      }
    : {
        status: "replayed",
        requirement: result.data,
        message:
          "This requirement already existed, so nothing was added. What was already there is shown below.",
      };
}

/**
 * Retire a requirement by end-dating it.
 *
 * There is no delete route in this service and no soft-delete flag — retirement is
 * a date, and the row stays readable so past evaluations remain explicable. Doing
 * it twice is a 422, never a silent no-op.
 */
export async function submitRetirement(
  _previous: RequirementWriteState,
  formData: FormData,
): Promise<RequirementWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requirementId = String(formData.get("requirement_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!requirementId) return { status: "error", message: "Enter the reference of the requirement to withdraw." };
  if (!reason) {
    return {
      status: "error",
      message: "Say why you are withdrawing it. Nothing is saved without a reason, so that the record explains itself later.",
    };
  }

  const result = await retireEvidenceRequirement({ requirementId, identity, reason });

  if (!result.ok) {
    if (result.error.status === 422) {
      return { status: "already-retired", message: explainEvidenceError("already_retired") };
    }
    return writeFailure(result.error.status, result.error.message);
  }

  refresh();

  return {
    status: "retired",
    requirement: result.data,
    message:
      "Withdrawn. It gates nothing from now on, and stays in the catalog so decisions made while it applied can still be explained.",
  };
}

/**
 * Determine whether required evidence exists.
 *
 * A completed determination is always a 200, so MISSING arrives as a success. The
 * verdict is read off `outcome`, never off the status code, and NO_REQUIREMENTS_
 * DEFINED is kept separate from SATISFIED — conflating them is exactly what this
 * service's three-outcome design exists to prevent.
 */
export async function submitEvidenceEvaluation(
  _previous: EvidenceEvaluateState,
  formData: FormData,
): Promise<EvidenceEvaluateState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const domainCode = String(formData.get("domain_code") ?? "").trim();
  const actionType = String(formData.get("action_type") ?? "").trim();
  const artifactsRaw = String(formData.get("present_artifacts") ?? "").trim();

  if (!domainCode) return { status: "error", message: "A domain code is required." };
  if (!actionType) return { status: "error", message: "An action type is required." };

  // One artifact per line: TYPE reference-id [subtype]. A JSON textarea would be
  // more expressive and much harder to type correctly under time pressure, which
  // is when this page gets used.
  const presentArtifacts: PresentArtifact[] = [];
  for (const line of artifactsRaw.split("\n")) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length < 2) {
      return {
        status: "error",
        message: `Could not read "${line.trim()}". Each line needs an evidence type and a reference id, e.g. SUPPORTING_DOCUMENT doc-1234.`,
      };
    }
    presentArtifacts.push({
      evidence_type: parts[0],
      reference_id: parts[1],
      ...(parts[2] ? { artifact_subtype: parts[2] } : {}),
    });
  }

  const result = await evaluateEvidence({
    identity,
    legalEntityId: identity.legalEntityId,
    domainCode,
    actionType,
    presentArtifacts,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (message.includes("document_service_unavailable")) {
      return {
        status: "undeterminable",
        message: explainEvidenceError("document_service_unavailable"),
      };
    }
    if (status === 403) return { status: "denied", message: explainEvidenceError(message) };
    return { status: "error", message: explainEvidenceError(message) };
  }

  const evaluation = result.data;
  const unmet = evaluation.unmet ?? [];
  const explained = explainEvidenceOutcome(evaluation.outcome, unmet.length);

  return {
    status: OUTCOME_STATUS[explained.kind],
    result: evaluation,
    // The service answers with an outcome and a reference and says nothing about
    // the question, so the question travels back for the summary to state.
    asked: { domainCode, actionType },
    // Deliberately empty: the summary below the banner carries the wording, so
    // what each outcome means is defined in one place rather than here as well.
    message: "",
  };
}

/**
 * Outcome to form state.
 *
 * Exhaustive over OutcomeKind on purpose. This used to be two `if`s and a
 * fallthrough to "satisfied", which meant an outcome this console had not been
 * taught — a fourth one added to the service later, or a typo in a deployment —
 * would have rendered as a green pass on an evidence gate. Mapping the
 * unrecognised case explicitly is the whole point.
 */
const OUTCOME_STATUS: Record<OutcomeKind, EvidenceEvaluateState["status"]> = {
  satisfied: "satisfied",
  missing: "missing",
  "none-defined": "none-defined",
  unrecognised: "unrecognised",
};

/** Read one requirement by id. */
export async function lookupRequirement(
  _previous: LookupState<EvidenceRequirement>,
  formData: FormData,
): Promise<LookupState<EvidenceRequirement>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const requirementId = String(formData.get("requirement_id") ?? "").trim();
  if (!requirementId) return { status: "error", message: "Enter a requirement reference." };

  const result = await getEvidenceRequirement(requirementId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return { status: "missing", message: explainEvidenceError("requirement_not_found") };
    }
    return { status: "error", message: explainEvidenceError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

/**
 * Read one stored evaluation by id.
 *
 * Worth reading rather than re-evaluating: the record froze its unmet and
 * present-artifact payloads at decision time, so it still explains a past
 * determination even after the catalog changed underneath it.
 */
export async function lookupEvaluation(
  _previous: LookupState<EvidenceEvaluation>,
  formData: FormData,
): Promise<LookupState<EvidenceEvaluation>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const evaluationId = String(formData.get("evaluation_id") ?? "").trim();
  if (!evaluationId) return { status: "error", message: "Enter the reference of a past check." };

  const result = await getEvidenceEvaluation(evaluationId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return { status: "missing", message: explainEvidenceError("evaluation_not_found") };
    }
    return { status: "error", message: explainEvidenceError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}
