"use server";

// Server Actions for governance-decision-log-svc (:8083).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// This service performs no authorization of its own and applies no tenant
// filter, so the session check here is the console's only gate on writing to the
// evidence log. That is worth being explicit about: anything the gateway admits
// can append a decision, and any caller can read any tenant's decisions.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  recordDecision,
  getDecision,
  explainDecisionError,
  DECISION_OUTCOMES,
} from "@/lib/api/governance";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { RecordDecisionState } from "./state";

const PATH = "/admin/governance";

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

/**
 * Append a decision to the evidence log.
 *
 * `decision_id` is generated here rather than taken from the form. It is the
 * service's idempotency key, and a human-chosen value would collide across
 * unrelated decisions — at which point the second one is silently swallowed as a
 * replay and never recorded at all.
 *
 * `decided_at` is stamped here too. The field means "when the decision was made
 * upstream", and the service defaults it to its own receipt time when omitted,
 * which quietly conflates deciding with logging.
 */
export async function submitDecision(
  _previous: RecordDecisionState,
  formData: FormData,
): Promise<RecordDecisionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const actionType = String(formData.get("action_type") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const ruleBasis = String(formData.get("rule_basis") ?? "").trim();
  const actorId = String(formData.get("actor_id") ?? "").trim() || identity.principalId;
  const legalEntityId =
    String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const contextRaw = String(formData.get("evaluation_context") ?? "").trim();

  if (!actionType) return { status: "error", message: "An action type is required." };
  if (!outcome) return { status: "error", message: "An outcome is required." };
  if (!ruleBasis) {
    return {
      status: "error",
      message: "A rule basis is required — an outcome without its basis is not evidence.",
    };
  }
  if (!(DECISION_OUTCOMES as readonly string[]).includes(outcome)) {
    // The column is free-text, so this is the console narrowing its own form
    // rather than the service refusing. Stated as such.
    return {
      status: "error",
      message: `The console records ${DECISION_OUTCOMES.join(", ")}. The service itself accepts any value.`,
    };
  }

  let evaluationContext: unknown;
  if (contextRaw) {
    try {
      evaluationContext = JSON.parse(contextRaw);
    } catch {
      return {
        status: "error",
        message: "Evaluation context must be valid JSON, or left blank.",
      };
    }
  }

  const correlationId = crypto.randomUUID();
  const result = await recordDecision({
    decisionId: crypto.randomUUID(),
    tenantId: identity.tenantId,
    legalEntityId,
    actorId,
    actionType,
    outcome,
    ruleBasis,
    correlationId,
    evaluationContext,
    decidedAt: new Date().toISOString(),
  });

  if (!result.ok) {
    return { status: "error", message: explainDecisionError(result.error.message) };
  }

  revalidatePath(PATH);

  return result.status === 201
    ? {
        status: "recorded",
        decision: result.data,
        message: `Recorded ${outcome} for ${actionType}. This row is now immutable.`,
      }
    : {
        status: "replayed",
        decision: result.data,
        message:
          "The service already held a decision with this id and wrote nothing. Nothing is wrong, but no new evidence was appended.",
      };
}

/**
 * Look up one decision by id.
 *
 * A read, driven through an action so an operator can paste an id without the
 * console needing a route per decision. `missing` is its own state: a 404 here
 * means no such record exists anywhere in the store, because this service
 * applies no tenant filter to a lookup — it is not "not visible to you".
 */
export async function lookupDecision(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  try {
    await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const decisionId = String(formData.get("decision_id") ?? "").trim();
  if (!decisionId) return { status: "error", message: "Enter a decision ID." };

  const result = await getDecision(decisionId);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No decision with that id exists in the log. This service applies no tenant filter to a lookup, so this is genuinely absent rather than out of scope.",
      };
    }
    return { status: "error", message: explainDecisionError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}
