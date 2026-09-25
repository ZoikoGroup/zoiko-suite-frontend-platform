"use server";

// Server Actions for governance-decision-log-svc (:8083).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// Both of the claims that used to be here — that the service performs no
// authorization of its own, and that it applies no tenant filter — were wrong,
// and every one of them has now been checked against the running service:
//
//   * A write is authorized. CreateDecision calls authorization-svc for the
//     action GOVERNANCE_DECISION_RECORD and fails closed on a denial (403) or
//     on an unreachable authorizer (503).
//   * Reads and writes are tenant-scoped, with row-level security forced in the
//     database (migrations 000002 and 000006). A read carrying another tenant's
//     X-Tenant-Id returns an empty list; a lookup by id returns 404. A request
//     with no X-Tenant-Id at all is refused with 400 missing_tenant_id.
//
// So the session check here is not the only gate, and the identity it resolves
// is not decoration — it is what scopes every call below.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  recordDecision,
  getDecision,
  explainDecisionError,
  DECISION_OUTCOMES,
  type GovernanceDecision,
} from "@/lib/api/governance";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { RecordDecisionState } from "./state";

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
    identity: {
      principalId: identity.principalId,
      tenantId: identity.tenantId,
      legalEntityId: identity.legalEntityId,
    },
  });

  if (!result.ok) {
    return { status: "error", message: explainDecisionError(result.error.message) };
  }

  refresh();

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
  _previous: LookupState<GovernanceDecision>,
  formData: FormData,
): Promise<LookupState<GovernanceDecision>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const decisionId = String(formData.get("decision_id") ?? "").trim();
  if (!decisionId) return { status: "error", message: "Enter a decision ID." };

  // The identity has to be passed. This read used to call getDecision(decisionId)
  // with nothing, on the belief — stated in this file and in lib/api/governance.ts
  // — that the service reads no identity headers. It does: without X-Tenant-Id
  // it answers 400 `missing_tenant_id` before it looks anything up, so every
  // lookup failed and reported the failure as though the id were at fault.
  const result = await getDecision(decisionId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No decision with that id is visible to your organisation. The lookup is scoped to " +
          "your tenant, so this means either that no such decision exists or that it belongs " +
          "to another tenant — from here the two are indistinguishable.",
      };
    }
    return { status: "error", message: explainDecisionError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}
