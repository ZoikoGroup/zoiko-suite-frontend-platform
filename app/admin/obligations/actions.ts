"use server";

// Server Actions for obligations-svc (:8088).
//
// Server Actions are reachable by direct POST, so the session is verified inside
// every action rather than relying on the proxy's /admin matcher.
//
// This service is the loosest in the console about identity, and these actions
// compensate rather than pretend otherwise:
//
//  - It reads NO identity headers. Not X-Tenant-Id, not X-Principal-Id. The
//    principal is a field in the request BODY (created_by_principal_id) and
//    nothing checks that it matches the caller. These actions always send the
//    session principal so the attribution is true, but that is this console being
//    honest, not the service enforcing anything.
//  - There is NO authorization check of any kind. Every write here succeeds for
//    any caller the gateway admits.
//
// Two ids are pre-validated before they reach the service, because a malformed
// UUID reaches the pg driver and comes back 503 `store_unavailable` — which reads
// as an outage rather than as a typo. Verified live.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  raiseObligation,
  transitionObligation,
  addFilingRequirement,
  getObligation,
  listFilingRequirements,
  describeTransition,
  explainObligationError,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  SEVERITY_LEVELS,
  SOURCE_TYPES,
} from "@/lib/api/obligations";
import { IDLE_LOOKUP, type LookupState } from "@/components/admin/shared/lookup";
import {
  FILING_TYPES,
  SUBMISSION_CHANNELS,
  type FilingWriteState,
  type RaiseObligationState,
  type TransitionState,
} from "./state";

const PATH = "/admin/obligations";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const EXPIRED_MESSAGE = "Your session has expired — sign in again.";

/**
 * Turn a "YYYY-MM-DD" from a date input into the RFC3339 the service needs.
 *
 * due_date decodes into a Go time.Time, so a bare date is a 400 on the JSON
 * decode — not a missing_field, which makes it look like the field was omitted.
 * Midnight UTC is used so the date a user picked is the date that is stored.
 */
function toRfc3339(date: string): string {
  return `${date}T00:00:00Z`;
}

/**
 * Raise an obligation.
 *
 * The four outcomes are deliberately distinct: a real write, an existing record
 * returned unchanged, a code collision, and a fail-closed jurisdiction outage.
 * Only the first is a save.
 */
export async function submitObligation(
  _previous: RaiseObligationState,
  formData: FormData,
): Promise<RaiseObligationState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED_MESSAGE };
  }

  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const sourceType = String(formData.get("obligation_source_type") ?? "").trim();
  const sourceId = String(formData.get("obligation_source_id") ?? "").trim();
  const code = String(formData.get("obligation_code") ?? "").trim();
  const type = String(formData.get("obligation_type") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const severity = String(formData.get("severity_level") ?? "").trim();
  const responsibleFunction = String(formData.get("responsible_function") ?? "").trim();
  const sourceReference = String(formData.get("source_reference") ?? "").trim();

  if (!jurisdictionId) {
    return { status: "error", message: "Select a jurisdiction — an obligation must be bound to one." };
  }
  if (!UUID_RE.test(jurisdictionId)) {
    return {
      status: "error",
      message: "That jurisdiction ID is not a well-formed UUID. Checked here because the service would answer 503, which reads as an outage rather than a bad value.",
    };
  }
  if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    return { status: "error", message: "Select a source type." };
  }
  if (!sourceId) {
    return { status: "error", message: "A source ID is required — it points at the record that created this obligation." };
  }
  if (!code) return { status: "error", message: "An obligation code is required." };
  if (!(OBLIGATION_TYPES as readonly string[]).includes(type)) {
    return { status: "error", message: "Select an obligation type." };
  }
  if (!dueDate) return { status: "error", message: "A due date is required." };
  if (!(SEVERITY_LEVELS as readonly string[]).includes(severity)) {
    return { status: "error", message: "Select a severity level." };
  }
  if (!responsibleFunction) {
    return { status: "error", message: "A responsible function is required." };
  }
  if (!sourceReference) {
    return {
      status: "error",
      message: "A source reference is required. It is the human-readable trace back to what created this obligation, and the service rejects a write without one.",
    };
  }

  const result = await raiseObligation({
    identity,
    principalId: identity.principalId,
    legalEntityId: identity.legalEntityId,
    jurisdictionId,
    obligationSourceType: sourceType,
    obligationSourceId: sourceId,
    obligationCode: code,
    obligationType: type,
    dueDate: toRfc3339(dueDate),
    severityLevel: severity,
    responsibleFunction,
    sourceReference,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    const explained = explainObligationError(result.error.message);
    if (result.error.message.includes("obligation_conflict")) {
      return { status: "conflict", message: explained };
    }
    if (result.error.message.includes("jurisdiction_service_unavailable")) {
      return { status: "unvalidated", message: explained };
    }
    return { status: "error", message: explained };
  }

  revalidatePath(PATH);

  if (result.status === 201) {
    return {
      status: "raised",
      obligation: result.data,
      message: `Obligation raised as ${result.data.obligation_code}, OPEN, due ${dueDate}. Its ID is ${result.data.obligation_id} — you need it to add filing requirements or move its status.`,
    };
  }

  // 200: the code already existed with matching key attributes. The response is
  // the STORED row, so anything that differs from what was just submitted was
  // discarded rather than applied.
  const discarded = [
    result.data.severity_level !== severity ? `severity is ${result.data.severity_level}, not ${severity}` : null,
    result.data.responsible_function !== responsibleFunction
      ? `responsible function is ${result.data.responsible_function}`
      : null,
    result.data.source_reference !== sourceReference ? "the source reference differs" : null,
  ].filter(Boolean);

  return {
    status: "existing",
    obligation: result.data,
    message:
      `Nothing was written. An obligation with code ${result.data.obligation_code} already exists and matches on entity, jurisdiction, type and due date, so the service returned the existing record (${result.data.obligation_id}, ${result.data.obligation_status}).` +
      (discarded.length
        ? ` The stored record differs from what you submitted and was NOT updated — ${discarded.join("; ")}. Dedup compares only those four fields, so the rest of your input was discarded.`
        : ""),
  };
}

/**
 * Move an obligation's status.
 *
 * The service answers 200 whether it moved the row or the row was already in the
 * requested status, and its body carries no `transitioned` flag — so the response
 * ALONE cannot distinguish them. The prior status has to come from somewhere else.
 *
 * `current_status` supplies it when a caller already has it rendered. When it does
 * not, this action READS the obligation first rather than guessing. The obvious
 * shortcut — falling back to the status in the response — is wrong in a way that
 * always lies: on success the returned status equals the requested status, so the
 * comparison would report "already there, nothing changed" for every genuine
 * transition. Caught by the browser click-through, which moved a row OPEN →
 * IN_PROGRESS and was told nothing had happened.
 *
 * The pre-read costs one GET and can itself fail; if it does, the result says the
 * transition was accepted without claiming which of the two occurred, because a
 * hedge is better than a confident falsehood.
 */
export async function submitTransition(
  _previous: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  // The session is needed for more than a liveness check now: every call to
  // this service carries the tenant and principal as headers, and it answers
  // 401 without them.
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED_MESSAGE };
  }

  const obligationId = String(formData.get("obligation_id") ?? "").trim();
  const status = String(formData.get("obligation_status") ?? "").trim();
  const currentStatus = String(formData.get("current_status") ?? "").trim();

  if (!obligationId) return { status: "error", message: "An obligation ID is required." };
  if (!UUID_RE.test(obligationId)) {
    return {
      status: "error",
      message: "That is not a well-formed obligation ID. Checked here because a malformed UUID reaches the database driver and returns 503, which reads as an outage rather than a typo.",
    };
  }
  if (!(OBLIGATION_STATUSES as readonly string[]).includes(status)) {
    return { status: "error", message: "Select a status." };
  }

  // Establish the prior status BEFORE writing, so a real transition and a no-op
  // stay distinguishable. See the doc comment for why the response cannot supply
  // this.
  let priorStatus = currentStatus;
  if (!priorStatus) {
    const before = await getObligation(obligationId, identity);
    if (before.ok) priorStatus = before.data.obligation_status;
  }

  const result = await transitionObligation({
    identity,
    obligationId,
    status,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    const explained = explainObligationError(result.error.message);
    if (result.error.message.includes("invalid_transition")) {
      return { status: "illegal", message: explained };
    }
    return { status: "error", message: explained };
  }

  revalidatePath(PATH);

  const closedNote =
    result.data.obligation_status === "CLOSED" && result.data.closed_at
      ? ` closed_at was stamped at ${result.data.closed_at}. CLOSED is terminal — there is no reopen transition.`
      : "";

  // The pre-read failed and no status was carried in. Report what is certain — the
  // service accepted it and the row is now in this state — without asserting
  // whether that was a move or a no-op.
  if (!priorStatus) {
    return {
      status: "transitioned",
      obligation: result.data,
      message: `Accepted — the obligation is now ${result.data.obligation_status}. Whether that was a transition or a no-op could not be determined, because this service returns 200 for both and its prior status could not be read.${closedNote}`,
    };
  }

  const { changed, message } = describeTransition(
    priorStatus,
    status,
    result.data.obligation_status,
  );

  return {
    status: changed ? "transitioned" : "unchanged",
    obligation: result.data,
    message: `${message}${closedNote}`,
  };
}

/**
 * Add a filing requirement under an obligation.
 *
 * Worth knowing while reading the result: the requirement is created PENDING and
 * this service has no endpoint that advances filing_status. Creating one records
 * that a filing is required; it does not track whether it happened.
 *
 * Filing against a CLOSED obligation is also permitted — there is no guard, and
 * it returns 201. Verified live. The page says so rather than implying the
 * lifecycle protects it.
 */
export async function submitFilingRequirement(
  _previous: FilingWriteState,
  formData: FormData,
): Promise<FilingWriteState> {
  // The session is needed for more than a liveness check now: every call to
  // this service carries the tenant and principal as headers, and it answers
  // 401 without them.
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED_MESSAGE };
  }

  const obligationId = String(formData.get("obligation_id") ?? "").trim();
  const filingType = String(formData.get("filing_type") ?? "").trim();
  const filingAuthority = String(formData.get("filing_authority") ?? "").trim();
  const submissionChannel = String(formData.get("submission_channel") ?? "").trim();

  if (!obligationId) return { status: "error", message: "An obligation ID is required." };
  if (!UUID_RE.test(obligationId)) {
    return {
      status: "error",
      message: "That is not a well-formed obligation ID. Checked here because the service would answer 503, which reads as an outage rather than a typo.",
    };
  }
  if (!(FILING_TYPES as readonly string[]).includes(filingType)) {
    return { status: "error", message: "Select a filing type." };
  }
  if (!filingAuthority) {
    return { status: "error", message: "A filing authority is required (for example HMRC)." };
  }
  if (!(SUBMISSION_CHANNELS as readonly string[]).includes(submissionChannel)) {
    return { status: "error", message: "Select a submission channel." };
  }

  const result = await addFilingRequirement({
    identity,
    obligationId,
    filingType,
    filingAuthority,
    submissionChannel,
    correlationId: crypto.randomUUID(),
  });

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "no-obligation",
        message: "No obligation with that ID, so there was nothing to file against. Filing requirements only exist beneath an obligation.",
      };
    }
    return { status: "error", message: explainObligationError(result.error.message) };
  }

  revalidatePath(PATH);

  return {
    status: "created",
    filing: result.data,
    message: `Filing requirement recorded as ${result.data.filing_status} — ${result.data.filing_type} to ${result.data.filing_authority} via ${submissionChannel}. Nothing in this service advances filing_status, so it stays PENDING: this records that the filing is required, not that it was made.`,
  };
}

/** Read one obligation by id. */
export async function lookupObligation(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  // The session is needed for more than a liveness check now: every call to
  // this service carries the tenant and principal as headers, and it answers
  // 401 without them.
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED_MESSAGE };
  }

  const obligationId = String(formData.get("obligation_id") ?? "").trim();
  if (!obligationId) return IDLE_LOOKUP;
  if (!UUID_RE.test(obligationId)) {
    return {
      status: "error",
      message: "That is not a well-formed obligation ID. A malformed UUID returns 503 from this service rather than 404, so it is rejected here instead.",
    };
  }

  const result = await getObligation(obligationId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message: "No obligation with that ID. This service has no tenant scoping, so that means it does not exist rather than that it is someone else's.",
      };
    }
    return { status: "error", message: explainObligationError(result.error.message) };
  }

  return { status: "found", message: "", record: result.data };
}

/**
 * Read the filing requirements under one obligation.
 *
 * A 404 here is genuinely "no such obligation" — an obligation that exists with
 * no filings returns an empty array instead. Verified live, and the reason this
 * lookup can report the two apart.
 */
export async function lookupFilingRequirements(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  // The session is needed for more than a liveness check now: every call to
  // this service carries the tenant and principal as headers, and it answers
  // 401 without them.
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED_MESSAGE };
  }

  const obligationId = String(formData.get("filings_obligation_id") ?? "").trim();
  if (!obligationId) return IDLE_LOOKUP;
  if (!UUID_RE.test(obligationId)) {
    return {
      status: "error",
      message: "That is not a well-formed obligation ID. A malformed UUID returns 503 from this service rather than 404, so it is rejected here instead.",
    };
  }

  const result = await listFilingRequirements(obligationId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message: "No obligation with that ID. Note this is a real 404 for the obligation — an obligation that exists with no filing requirements returns an empty list, so the two are distinguishable.",
      };
    }
    return { status: "error", message: explainObligationError(result.error.message) };
  }

  if (result.data.length === 0) {
    return {
      status: "found",
      message: "That obligation exists and has no filing requirements yet.",
      record: result.data,
    };
  }

  return {
    status: "found",
    message: `${result.data.length} filing requirement${result.data.length === 1 ? "" : "s"} under this obligation.`,
    record: result.data,
  };
}
