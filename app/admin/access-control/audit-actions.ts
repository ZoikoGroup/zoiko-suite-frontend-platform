"use server";

// Server Actions for reading and pre-checking the authorization plane.
//
// SEPARATE FROM actions.ts, deliberately. Everything in that module AUTHORS
// something — a role, a bundle, a grant, a conflict rule — and its comments,
// its states and its error handling are all shaped by that: a failed write
// there means "nothing changed", and the interesting question is always whether
// the change landed.
//
// Nothing here writes. Both actions below answer a question:
//
//   searchAccessDecisionsAction  reads the decision log, which is what makes
//                                the service's "denials must be evidentially
//                                retrievable" obligation true from the console.
//                                Before it, the only read was by reference —
//                                and a denial's reference exists in exactly one
//                                place, the response handed to the service that
//                                was refused, so answering "why was this person
//                                blocked" began by reading another service's
//                                logs.
//
//   precheckSoDAction            asks whether granting a set of actions would
//                                breach separation of duties, BEFORE the grant
//                                exists. The evaluation endpoint cannot answer
//                                that: a breach is a COMBINATION, so it only
//                                becomes visible once the combination exists.
//                                The only way to discover a role must not go to
//                                somebody was to give it to them and watch every
//                                use of it be refused.
//
// Neither leaves a decision artifact. That is worth stating next to the
// evaluate form on the same page, which does: every call to `authorize` writes
// a row an auditor will later read, and these two do not, so they are safe to
// run while somebody is still deciding.
//
// Server Actions are reachable by direct POST rather than only through this UI,
// so the session is verified inside each one. That matters more here than for a
// write: these read the record of who attempted what across a whole
// organisation.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import { parsePermittedActions } from "@/lib/api/access-control";
import {
  describeDelegatedAccess,
  describeEntityScope,
  describeSoDValidation,
  evaluateDelegatedAccess,
  explainAuthorizationError,
  listAccessDecisions,
  PLATFORM_SCOPE_SENTINEL,
  validateEntityScope,
  validateSoDConflicts,
} from "@/lib/api/authorization";
import {
  type DecisionSearchFilters,
  type DecisionSearchState,
  type DelegatedAccessCheckState,
  type EntityScopeCheckState,
  type SoDPrecheckState,
} from "./state";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

/** Action codes are the strings every service's check names, so they are
 *  compared exactly. Normalising a filter means a lower-case entry finds the
 *  decisions the reader meant instead of matching nothing. */
function asCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared by the two reach checks below, which refuse a malformed company
 *  reference themselves so the message can name WHICH entry was wrong —
 *  the service refuses the whole batch on the first bad one and cannot say
 *  which of five lines it was. */
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}


/**
 * How many decisions per page.
 *
 * Well under the service's own cap of 200. This is a table somebody reads, and
 * a page they have to scroll past is not more useful than one they do not —
 * paging is the affordance, not a bigger page.
 */
const DECISION_PAGE_SIZE = 25;

// ─── Search the decision log ─────────────────────────────────────────────────

/**
 * A READ, but a Server Action rather than a page-level fetch, because the
 * filters and paging are interactive: re-rendering the whole route for each
 * one would refetch every other panel on the page.
 *
 * The tenant is NOT passed. The service takes it from the verified envelope
 * header and no parameter here can widen it. Decisions recorded with no tenant
 * at all — the callers that do not yet forward an envelope — are invisible
 * here, because they cannot be attributed to an organisation; that is said in
 * the empty-result message rather than left to be discovered.
 */
export async function searchAccessDecisionsAction(
  _prev: DecisionSearchState,
  formData: FormData,
): Promise<DecisionSearchState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const filters: DecisionSearchFilters = {
    principalId: String(formData.get("principal_id") ?? "").trim(),
    outcome: String(
      formData.get("decision_outcome") ?? "",
    ).trim() as DecisionSearchFilters["outcome"],
    actionType: asCode(String(formData.get("action_type") ?? "")),
    legalEntityId: String(formData.get("legal_entity_id") ?? "").trim(),
    decidedFrom: String(formData.get("decided_from") ?? "").trim(),
    decidedTo: String(formData.get("decided_to") ?? "").trim(),
  };
  const cursor = String(formData.get("cursor") ?? "").trim();

  if (filters.outcome && filters.outcome !== "GRANTED" && filters.outcome !== "DENIED") {
    return {
      status: "invalidFilter",
      message: "Outcome has to be either allowed or refused — leave it blank for both.",
    };
  }

  // The form's date inputs produce YYYY-MM-DD and the service takes RFC3339
  // only — deliberately, because reading a bare date as midnight UTC shifts a
  // window by hours with no error. Widened here rather than there, because
  // this console is the layer that knows it meant whole days.
  const toInstant = (day: string, isEnd: boolean): string | undefined => {
    if (!day) return undefined;
    if (day.includes("T")) return day;
    if (!isEnd) return day + "T00:00:00Z";
    // The service's upper bound is EXCLUSIVE, so "up to and including the
    // 30th" is the start of the 31st. Passing the 30th would silently drop
    // that whole day from an audit — the kind of wrong that is invisible in
    // the output.
    const next = new Date(day + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().replace(/\.\d{3}Z$/, "Z");
  };

  const decidedFrom = toInstant(filters.decidedFrom, false);
  const decidedTo = toInstant(filters.decidedTo, true);

  if (decidedFrom && decidedTo && decidedTo <= decidedFrom) {
    return {
      status: "invalidFilter",
      message: "The end of the window has to be on or after its start.",
    };
  }

  if (filters.legalEntityId && !UUID_RE.test(filters.legalEntityId)) {
    return {
      status: "invalidFilter",
      message:
        "A company reference is 36 characters of letters, numbers and dashes. Leave it blank to search every company.",
    };
  }

  const result = await listAccessDecisions(identity, {
    principalId: filters.principalId || undefined,
    outcome: filters.outcome || undefined,
    actionType: filters.actionType || undefined,
    legalEntityId: filters.legalEntityId || undefined,
    decidedFrom,
    decidedTo,
    limit: DECISION_PAGE_SIZE,
    cursor: cursor || undefined,
  });

  if (!result.ok) {
    if (result.error.status === 401 || result.error.status === 403) {
      return {
        status: "unauthorized",
        message:
          "You are not permitted to read this organisation's decision history. It is the record of who attempted what, so it is restricted deliberately.",
      };
    }
    if (result.error.status === 400) {
      return {
        status: "invalidFilter",
        message: explainAuthorizationError(result.error.message, { status: 400 }),
      };
    }
    return {
      status: "error",
      message: explainAuthorizationError(result.error.message, {
        status: result.error.status,
      }),
    };
  }

  const decisions = result.data?.decisions ?? [];
  if (decisions.length === 0) {
    return {
      status: "empty",
      filters,
      message:
        "No recorded checks match. Worth knowing before concluding anything from that: checks " +
        "made by services that do not yet identify their organisation are recorded without one, " +
        "and those are deliberately not readable here — so this means nothing matched, not " +
        "necessarily that nothing happened.",
    };
  }

  const denied = decisions.filter((d) => d.decision_outcome === "DENIED").length;
  return {
    status: "searched",
    decisions,
    nextCursor: result.data?.next_cursor,
    filters,
    message:
      String(decisions.length) +
      (decisions.length === 1 ? " check" : " checks") +
      (denied > 0 ? ", " + String(denied) + " refused" : "") +
      (result.data?.next_cursor ? ". There are older ones." : "."),
  };
}

// ─── Pre-flight separation-of-duties check ───────────────────────────────────

/**
 * Records nothing. Unlike the evaluate form on the same page, this leaves no
 * decision artifact, so it is safe to run while somebody is still deciding.
 */
export async function precheckSoDAction(
  _prev: SoDPrecheckState,
  formData: FormData,
): Promise<SoDPrecheckState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const candidateActions = parsePermittedActions(
    String(formData.get("candidate_actions") ?? ""),
  );
  const principalId = String(formData.get("principal_id") ?? "").trim();
  const legalEntityIdRaw = String(formData.get("legal_entity_id") ?? "").trim();
  const legalEntityId = legalEntityIdRaw || identity.legalEntityId;

  if (candidateActions.length === 0) {
    return {
      status: "error",
      message:
        "List the actions you are about to grant, one per line or comma-separated — they are what gets checked.",
    };
  }

  // Refused here rather than sent on, so the message can say why instead of
  // relaying the service's. Somebody without a company cannot have their
  // holdings resolved, because grants are recorded per company — and the
  // service would fall back to the narrower "do these conflict with each
  // other" question, which reports conflict-free for a person who does
  // conflict. A false all-clear on a control is the worst answer available.
  if (principalId && !legalEntityId) {
    return {
      status: "error",
      message:
        "Naming a person means checking against what they already hold, and that is recorded per company — so a company is needed too. Leave the person blank to check only whether these actions conflict with each other.",
    };
  }

  const result = await validateSoDConflicts({
    identity,
    candidateActions,
    ...(principalId ? { principalId, legalEntityId } : {}),
  });

  if (!result.ok) {
    if (result.error.status === 401 || result.error.status === 403) {
      return {
        status: "unauthorized",
        message: "You are not permitted to check this organisation's duty conflicts.",
      };
    }
    if (result.error.status === 400) {
      return {
        status: "refused",
        message: explainAuthorizationError(result.error.message, { status: 400 }),
      };
    }
    // NOT an all-clear. Spelled out because the failure direction matters:
    // treating an unreachable check as "no conflict" is exactly how a
    // conflicting grant gets made.
    return {
      status: "error",
      message:
        "The conflict check could not be completed, so this is not an all-clear — nothing was checked. " +
        explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  const validation = result.data;
  if (!validation) {
    return {
      status: "error",
      message: "The check returned no answer, so nothing was verified.",
    };
  }

  const described = describeSoDValidation(validation, {
    subjectNamed: Boolean(principalId),
  });
  const ownObjectRestricted = validation.own_object_restricted ?? [];

  if (validation.conflict_free) {
    return {
      status: "clear",
      headline: described.headline,
      detail: described.detail,
      ownObjectRestricted,
    };
  }

  return {
    status: "conflict",
    headline: described.headline,
    detail: described.detail,
    conflicts: validation.conflicts,
    ownObjectRestricted,
  };
}

// ─── "Where can this person act?" ────────────────────────────────────────────

/**
 * Check a principal's reach across several companies in one call.
 *
 * Through the evaluate form this is one submission per company AND — because
 * every evaluation records its artifact — one row in the decision log per
 * company, for a question nobody acted on. Asking about five companies would
 * write five audit records to answer "which of these should be selectable".
 * This writes none.
 *
 * Delegated authority counts as in scope. A delegate acting in a company IS in
 * scope for it, and reporting otherwise would grey out exactly the companies a
 * delegation was created to open up.
 */
export async function checkEntityScopeAction(
  _prev: EntityScopeCheckState,
  formData: FormData,
): Promise<EntityScopeCheckState> {
  // Read BEFORE the session check, so a return on an expired session echoes
  // what was typed too — somebody signing back in should not also lose their
  // input. Reading FormData has no side effects.
  const principalId = String(formData.get("principal_id") ?? "").trim();
  const actionType = asCode(String(formData.get("action_type") ?? ""));
  const raw = String(formData.get("legal_entity_ids") ?? "");

  // Echoed back on every return below. React discards an uncontrolled input's
  // value when the panel's shape changes between statuses, so without this a
  // second submit re-sends the FIRST question while showing the operator the
  // text they typed — measured in a browser, not guessed.
  const submitted = { principalId, actionType, legalEntityIdsRaw: raw };

  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", submitted, message: EXPIRED };
  }

  if (!principalId) {
    return {
      status: "error",
      submitted,
      message: "Enter the person whose reach you are checking.",
    };
  }

  // Same splitting rule as a permission-bundle list — one per line or
  // comma-separated — plus the PLATFORM sentinel passed through untouched, so
  // somebody can ask about platform-wide acts alongside real companies.
  const legalEntityIds = raw
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);

  if (legalEntityIds.length === 0) {
    // Default to the session's own company rather than refusing: "can this
    // person act here" is the common question and needs no reference pasted.
    if (identity.legalEntityId) legalEntityIds.push(identity.legalEntityId);
  }
  if (legalEntityIds.length === 0) {
    return {
      status: "error",
      submitted,
      message: "List at least one company — one per line, or comma-separated.",
    };
  }
  if (legalEntityIds.length > 100) {
    return {
      status: "refused",
      submitted,
      message: "At most 100 companies per check. Narrow the list and run it again.",
    };
  }

  const malformed = legalEntityIds.filter(
    (v) => v !== PLATFORM_SCOPE_SENTINEL && !isUuid(v),
  );
  if (malformed.length > 0) {
    // Refused here so the message can name WHICH entries are wrong. The
    // service refuses the whole batch on the first bad one and cannot say
    // which of five lines it was.
    return {
      status: "refused",
      submitted,
      message:
        `Not a company reference: ${malformed.slice(0, 3).join(", ")}` +
        (malformed.length > 3 ? ` and ${malformed.length - 3} more` : "") +
        ". Each line is 36 characters of letters, numbers and dashes, or the word PLATFORM for something that belongs to no single company.",
    };
  }

  const result = await validateEntityScope({
    identity,
    principalId,
    legalEntityIds,
    ...(actionType ? { actionType } : {}),
  });

  if (!result.ok) {
    if (result.error.status === 401 || result.error.status === 403) {
      return {
        status: "unauthorized",
        submitted,
        message: "You are not permitted to read this organisation's grants.",
      };
    }
    if (result.error.status === 400) {
      return {
        status: "refused",
        submitted,
        message: explainAuthorizationError(result.error.message, { status: 400 }),
      };
    }
    return {
      status: "error",
      submitted,
      message:
        "The check could not be completed, so this is not an answer either way — nothing was read. " +
        explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  const results = result.data?.results ?? [];
  const inScopeCount = results.filter((r) => r.in_scope).length;

  return {
    status: "checked",
    submitted,
    results: results.map((r) => ({ result: r, explanation: describeEntityScope(r) })),
    inScopeCount,
    message:
      actionType
        ? `Can do ${actionType} in ${inScopeCount} of ${results.length}.`
        : `Can act in ${inScopeCount} of ${results.length}.`,
  };
}

// ─── "Whose authority is this person using?" ─────────────────────────────────

/**
 * Separate a principal's own authority from authority lent to them.
 *
 * The evaluate form cannot answer this. It returns one GRANTED for both paths
 * and names the role as the basis when both apply — so somebody who holds an
 * action in their own right AND by delegation reads as ordinary role-based
 * access. For any step that needs two different people, that is the whole
 * question, and it is the case this check exists to surface.
 *
 * Records nothing.
 */
export async function checkDelegatedAccessAction(
  _prev: DelegatedAccessCheckState,
  formData: FormData,
): Promise<DelegatedAccessCheckState> {
  const principalId = String(formData.get("principal_id") ?? "").trim();
  const actionType = asCode(String(formData.get("action_type") ?? ""));
  const rawEntity = String(formData.get("legal_entity_id") ?? "").trim();

  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    // The entity falls back to the session's own, which is exactly what an
    // expired session cannot supply — so echo the RAW field rather than a
    // resolved one that would be empty.
    return {
      status: "error",
      submitted: { principalId, actionType, legalEntityId: rawEntity },
      message: EXPIRED,
    };
  }

  const legalEntityId = rawEntity || identity.legalEntityId;

  // See checkEntityScopeAction: echoed on every return so a re-submit does not
  // silently re-send the previous question.
  const submitted = { principalId, actionType, legalEntityId };

  if (!principalId) {
    return { status: "error", submitted, message: "Enter the person you are asking about." };
  }
  if (!legalEntityId) {
    return {
      status: "error",
      submitted,
      message:
        "A company is needed — borrowed authority is recorded per company, so there is no answer without one.",
    };
  }
  if (legalEntityId !== PLATFORM_SCOPE_SENTINEL && !isUuid(legalEntityId)) {
    return {
      status: "refused",
      submitted,
      message:
        "A company reference is 36 characters of letters, numbers and dashes, or the word PLATFORM.",
    };
  }

  const result = await evaluateDelegatedAccess({
    identity,
    principalId,
    legalEntityId,
    ...(actionType ? { actionType } : {}),
  });

  if (!result.ok) {
    if (result.error.status === 401 || result.error.status === 403) {
      return {
        status: "unauthorized",
        submitted,
        message: "You are not permitted to read this organisation's delegations.",
      };
    }
    if (result.error.status === 400) {
      return {
        status: "refused",
        submitted,
        message: explainAuthorizationError(result.error.message, { status: 400 }),
      };
    }
    return {
      status: "error",
      submitted,
      message:
        "The check could not be completed, so this is not an answer either way. " +
        explainAuthorizationError(result.error.message, { status: result.error.status }),
    };
  }

  const evaluation = result.data;
  if (!evaluation) {
    return { status: "error", submitted, message: "The check returned no answer." };
  }

  const described = describeDelegatedAccess(evaluation, {
    actionNamed: Boolean(actionType),
  });

  return {
    status: "checked",
    submitted,
    headline: described.headline,
    detail: described.detail,
    tone: described.tone,
    delegatedActions: evaluation.delegated_actions ?? [],
    // Both paths at once is the finding, so it is carried explicitly rather
    // than re-derived in the component.
    bothPaths: Boolean(
      actionType && evaluation.has_delegated_access && evaluation.held_directly,
    ),
  };
}
