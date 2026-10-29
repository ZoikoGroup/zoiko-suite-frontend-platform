"use server";

// Server Actions that WRITE to contract-lifecycle-svc (:8119).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// contract-lifecycle-svc authorizes every write itself. These actions also ask
// authorization-svc (:8089) first, using the service's own action names
// (CONTRACT_SUBMIT_REVIEW, CONTRACT_APPROVE, …), so an unprivileged caller gets
// a readable refusal before the request is sent.
//
// Validation that duplicates the service is deliberate where the service's
// answer would be unhelpful: it rejects a missing title with prose, accepts a
// nonsensical date range without comment, and treats a zero as "field omitted".

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import { authorize, PLATFORM_SCOPE_SENTINEL } from "@/lib/api/authorization";
import {
  draftContract as draftContractCall,
  reviseContract as reviseContractCall,
  submitContractForReview,
  approveContract as approveContractCall,
  sendContractForSignature,
  recordContractExecution,
  amendContract as amendContractCall,
  renewContract as renewContractCall,
  terminateContract as terminateContractCall,
  explainContractError,
  CONTRACT_TYPES,
  type ContractType,
} from "@/lib/api/contracts";
import {
  createBoardMeeting as createBoardMeetingCall,
  createBoardResolution as createBoardResolutionCall,
  openResolutionVoting,
  castResolutionVote,
  closeResolutionVoting,
  explainBoardError,
  summariseVotes,
  RESOLUTION_CATEGORIES,
  type ResolutionCategory,
  type VoteChoice,
} from "@/lib/api/legal";
import type { BoardActionState, ContractActionState } from "./state";

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

const EXPIRED: ContractActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

async function assertAuthorized(
  identity: SessionIdentity,
  actionType: string,
  attributes?: Record<string, string>,
): Promise<ContractActionState | null> {
  const authzRes = await authorize({
    identity,
    principalId: identity.principalId,
    legalEntityId: identity.legalEntityId || PLATFORM_SCOPE_SENTINEL,
    actionType,
    attributes,
  });

  if (!authzRes.ok) {
    return fail(`Authorization check failed (${authzRes.error.message || "service unavailable"}). Contract mutation was refused.`);
  }

  if (authzRes.data.decision_outcome !== "GRANTED") {
    return fail(
      `Forbidden: You lack permission (${actionType}) to perform this contract action. Decision basis: ${authzRes.data.decision_basis || "denied"}.`,
    );
  }

  return null;
}

/** Re-render this route after a write.
 *
 *  Writes end in refresh(), not revalidatePath. Nothing on this route is cached
 *  — cacheComponents is off and every panel reads cookies() for the session — so
 *  there was no cache for revalidatePath to invalidate, while in a Server
 *  Function it additionally refreshes every previously visited page. refresh()
 *  re-renders just this route, which is what these actions actually want. The
 *  contract id is no longer needed: refresh() covers the register and the
 *  contract's own page without naming either. */
function revalidateContract(): void {
  refresh();
}

/**
 * Draft a new contract.
 *
 * Always lands in DRAFT at v1 with an "Initial draft" snapshot — the service
 * ignores any status supplied by the caller, so there is no way to create a
 * contract that is already in force.
 */
export async function draftContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const title = String(formData.get("title") ?? "").trim();
  const contractType = String(formData.get("contract_type") ?? "").trim();
  const counterpartyId = String(formData.get("counterparty_id") ?? "").trim();
  const counterpartyName = String(formData.get("counterparty_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const valueRaw = String(formData.get("total_value") ?? "").trim();

  if (!title) return fail("A contract title is required.");
  if (!counterpartyId) return fail("A counterparty ID is required.");
  if (!isContractType(contractType)) return fail("Select a contract type.");
  if (!currency) return fail("Currency is required.");

  const dateError = validateDateRange(effectiveFrom, effectiveTo);
  if (dateError) return fail(dateError);

  // The service treats total_value: 0 as "not supplied" on revision, so a
  // zero-value contract cannot later be revised upward from zero in one step.
  // Rejecting it here keeps the register free of records that behave oddly.
  const totalValue = Number(valueRaw);
  if (valueRaw === "" || !Number.isFinite(totalValue) || totalValue <= 0) {
    return fail("Contract value must be a number greater than zero.");
  }

  const authzError = await assertAuthorized(identity, "CONTRACT_CREATE", {
    contract_type: contractType,
    currency,
    total_value: String(totalValue),
  });
  if (authzError) return authzError;

  const result = await draftContractCall({
    identity,
    contractType,
    title,
    description: description || undefined,
    counterpartyId,
    counterpartyName: counterpartyName || undefined,
    effectiveFrom,
    effectiveTo: effectiveTo || undefined,
    currency,
    totalValue,
  });

  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "drafted",
    title: result.data.title,
    contractId: result.data.contract_id,
    message: `“${result.data.title}” drafted at v${result.data.version}. Submit it for review when the terms are settled.`,
  };
}

/**
 * Revise a DRAFT or REVIEW contract's terms.
 *
 * Only fields the user actually filled in are sent. The service merges
 * field-by-field and reads an empty string or a zero as "leave unchanged", so
 * sending blanks for untouched fields would work by accident rather than by
 * intent — and would silently stop working if the service ever started
 * honouring them.
 */
export async function reviseContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const changeSummary = String(formData.get("change_summary") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const counterpartyName = String(formData.get("counterparty_name") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const valueRaw = String(formData.get("total_value") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  // The service defaults change_summary to "" and stores it. An unexplained
  // restatement of contractual terms is exactly what the version history exists
  // to prevent, so the console requires the reason even though the service
  // does not.
  if (!changeSummary) return fail("A change summary is required — it is the audit record.");

  if (effectiveTo && !isDate(effectiveTo)) {
    return fail("Effective-to must be a valid date.");
  }

  let totalValue: number | undefined;
  if (valueRaw !== "") {
    totalValue = Number(valueRaw);
    if (!Number.isFinite(totalValue) || totalValue <= 0) {
      return fail("Revised value must be a number greater than zero.");
    }
  }

  const authzError = await assertAuthorized(identity, "CONTRACT_UPDATE", {
    contract_id: contractId,
    ...(totalValue ? { total_value: String(totalValue) } : {}),
  });
  if (authzError) return authzError;

  const result = await reviseContractCall({
    contractId,
    identity,
    changeSummary,
    title: title || undefined,
    counterpartyName: counterpartyName || undefined,
    effectiveTo: effectiveTo || undefined,
    currency: currency || undefined,
    totalValue,
  });

  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "revised",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” revised — now at v${result.data.version}. The previous terms are preserved in the version history.`,
  };
}

/** DRAFT → REVIEW. The submitter is recorded and cannot approve it later. */
export async function submitContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  if (!contractId) return fail("Missing contract ID.");

  const authzError = await assertAuthorized(identity, "CONTRACT_SUBMIT_REVIEW", {
    contract_id: contractId,
  });
  if (authzError) return authzError;

  const result = await submitContractForReview(contractId, identity);
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "submitted",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” is now in REVIEW. Someone other than you has to approve it.`,
  };
}

/**
 * REVIEW → APPROVED. Needs a GRANTED governance decision, and the approver may
 * not be the principal who submitted the contract — the service enforces both.
 */
export async function approveContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const governanceDecisionId = String(formData.get("governance_decision_id") ?? "").trim();
  const submittedBy = String(formData.get("submitted_by") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  if (!governanceDecisionId) {
    return fail("Enter the governance decision ID that authorizes this approval.");
  }
  if (submittedBy && submittedBy === identity.principalId) {
    return fail("You submitted this contract for review, so you cannot approve it. Another approver has to.");
  }

  const authzError = await assertAuthorized(identity, "CONTRACT_APPROVE", {
    contract_id: contractId,
  });
  if (authzError) return authzError;

  const result = await approveContractCall({ contractId, identity, governanceDecisionId });
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "approved",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” is APPROVED. Its terms are now fixed — send it for signature next.`,
  };
}

/** APPROVED → signature SENT. */
export async function sendForSignature(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  if (!contractId) return fail("Missing contract ID.");

  const authzError = await assertAuthorized(identity, "CONTRACT_SEND_FOR_SIGNATURE", {
    contract_id: contractId,
  });
  if (authzError) return authzError;

  const result = await sendContractForSignature(contractId, identity);
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "sent",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” was sent for signature. Record execution once every signature is in.`,
  };
}

/** APPROVED + signature SENT → EFFECTIVE. */
export async function recordExecution(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const signedBy = String(formData.get("signed_by") ?? "").trim();
  const documentVaultId = String(formData.get("document_vault_id") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  if (!signedBy) return fail("Name the signatory — execution is attributed to them.");

  const authzError = await assertAuthorized(identity, "CONTRACT_RECORD_EXECUTION", {
    contract_id: contractId,
  });
  if (authzError) return authzError;

  const result = await recordContractExecution({
    contractId,
    identity,
    signedBy,
    documentVaultId: documentVaultId || undefined,
  });
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "executed",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” is EFFECTIVE at v${result.data.version}, signed by ${signedBy}.`,
  };
}

/** Amend an EFFECTIVE contract's terms. */
export async function amendContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const changeSummary = String(formData.get("change_summary") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const counterpartyName = String(formData.get("counterparty_name") ?? "").trim();
  const valueRaw = String(formData.get("total_value") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  if (!changeSummary) return fail("A change summary is required — it is the audit record.");

  let totalValue: number | undefined;
  if (valueRaw !== "") {
    totalValue = Number(valueRaw);
    if (!Number.isFinite(totalValue) || totalValue <= 0) {
      return fail("Amended value must be a number greater than zero.");
    }
  }
  if (!title && !counterpartyName && totalValue === undefined) {
    return fail("Change at least one term — title, counterparty name, or value.");
  }

  const authzError = await assertAuthorized(identity, "CONTRACT_AMEND", { contract_id: contractId });
  if (authzError) return authzError;

  const result = await amendContractCall({
    contractId,
    identity,
    changeSummary,
    title: title || undefined,
    counterpartyName: counterpartyName || undefined,
    totalValue,
  });
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "amended",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” amended — now at v${result.data.version}.`,
  };
}

/** Extend an EFFECTIVE contract's term. */
export async function renewContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const newEffectiveTo = String(formData.get("new_effective_to") ?? "").trim();
  const changeSummary = String(formData.get("change_summary") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  if (!isDate(newEffectiveTo)) return fail("Pick the new end date for the renewed term.");
  if (!changeSummary) return fail("A change summary is required — it is the audit record.");

  const authzError = await assertAuthorized(identity, "CONTRACT_RENEW", { contract_id: contractId });
  if (authzError) return authzError;

  const result = await renewContractCall({ contractId, identity, newEffectiveTo, changeSummary });
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "renewed",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” renewed to ${newEffectiveTo} — now at v${result.data.version}.`,
  };
}

/**
 * Terminate an APPROVED or EFFECTIVE contract.
 *
 * The service also sets `effective_to` to today, so the agreement's term is
 * closed off at the moment of termination rather than left running.
 */
export async function terminateContract(
  _previous: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const terminationNote = String(formData.get("termination_note") ?? "").trim();

  if (!contractId) return fail("Missing contract ID.");
  // The service accepts an empty note. Terminating an agreement without a
  // recorded reason is not something an audit trail can be reconstructed from.
  if (!terminationNote) return fail("A termination reason is required — it is recorded permanently.");

  const authzError = await assertAuthorized(identity, "CONTRACT_TERMINATE", {
    contract_id: contractId,
  });
  if (authzError) return authzError;

  const result = await terminateContractCall({ contractId, identity, terminationNote });
  if (!result.ok) return fail(explainContractError(result.error.message));

  revalidateContract();

  return {
    status: "terminated",
    title: result.data.title,
    contractId,
    message: `“${result.data.title}” terminated at v${result.data.version}. Its term was closed off as of today.`,
  };
}

function fail(message: string): ContractActionState {
  return { status: "error", message };
}

// ─── Board Resolutions & Meetings (board-resolutions-svc :8122) ──────────────

const BOARD_EXPIRED: BoardActionState = {
  status: "error",
  message: "Nothing was changed — your session has expired. Sign in again and retry.",
};

function boardFail(message: string): BoardActionState {
  return { status: "error", message };
}

/** One list, shared with the form that offers the choices and the helper that
 *  explains them, so the three cannot drift apart. */
const CATEGORIES = new Set<ResolutionCategory>(RESOLUTION_CATEGORIES);

function isCategory(value: string): value is ResolutionCategory {
  return CATEGORIES.has(value as ResolutionCategory);
}

/** Schedule a board meeting. The service refuses a missing principal and
 *  authorizes MEETING_CREATE against the meeting's legal entity. */
export async function scheduleBoardMeeting(
  _previous: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return BOARD_EXPIRED;
  }

  const title = String(formData.get("title") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduled_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!title) return boardFail("Give the meeting a title — this is how it is listed and referred to.");
  if (!scheduledAtRaw) return boardFail("Say when the meeting sits. Both the date and the time are needed.");
  if (!effectiveFrom) return boardFail("Give the date the meeting's record applies from.");

  // datetime-local sends "2026-10-05T14:00", which is not RFC3339 — Go's
  // time.Time would reject the body with 400. Treat the input as local time
  // and emit a full RFC3339 timestamp (with seconds) for the service.
  const scheduled = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduled.getTime())) {
    return boardFail("That is not a date and time the calendar recognises. Pick it again.");
  }
  const scheduledAt = scheduled.toISOString();

  const result = await createBoardMeetingCall({
    identity,
    title,
    scheduledAt,
    ...(location ? { location } : {}),
    effectiveFrom,
  });

  if (!result.ok) {
    return boardFail(explainBoardError(result.error.message, { status: result.error.status }));
  }

  refresh();

  const m = result.data;
  return {
    status: "created",
    title: m.title,
    recordId: m.meeting_id,
    meeting: m,
    message: `The meeting is in the diary for ${formatWhen(m.scheduled_at)}. You can now propose resolutions against it.`,
  };
}

/** Propose a board resolution. Always lands in PROPOSED — the service ignores
 *  any status supplied by the caller. */
export async function proposeBoardResolution(
  _previous: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return BOARD_EXPIRED;
  }

  const meetingId = String(formData.get("meeting_id") ?? "").trim();
  const resolutionNumber = String(formData.get("resolution_number") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();

  if (!title) return boardFail("Give the resolution a title — a short line saying what is being decided.");
  if (!content) return boardFail("Write out what the resolution says. This wording is the record that survives, so it cannot be left blank.");
  if (!isCategory(category)) return boardFail("Choose what kind of decision this is. It is not a label — it decides which supporting evidence the board needs before the resolution can be passed.");
  if (!effectiveFrom) return boardFail("Give the date the decision applies from.");

  const result = await createBoardResolutionCall({
    identity,
    ...(meetingId ? { meetingId } : {}),
    ...(resolutionNumber ? { resolutionNumber } : {}),
    title,
    content,
    category,
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
  });

  if (!result.ok) {
    return boardFail(
      explainBoardError(result.error.message, {
        status: result.error.status,
        // A 404 here is the meeting the resolution was put to, not the
        // resolution — nothing has been created yet for a 404 to be about.
        notFound:
          "The meeting this was to be put to is no longer in the diary, so nothing was saved. " +
          "Reload the page and pick a meeting from the list again, or propose it standalone.",
      }),
    );
  }

  refresh();

  const r = result.data;
  return {
    status: "created",
    title: r.title,
    recordId: r.resolution_id,
    resolution: r,
    message:
      "The resolution is on the table. It has no effect yet — the board still has to decide it.",
  };
}

const NOT_FOUND_RESOLUTION =
  "That resolution is no longer on record for your organisation. Reload the page to see what " +
  "the register holds now.";

const VOTE_CHOICES = new Set<VoteChoice>(["FOR", "AGAINST", "ABSTAIN"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PROPOSED → OPEN: freeze the voter roster and the quorum threshold. */
export async function openVoting(
  _previous: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return BOARD_EXPIRED;
  }

  const resolutionId = String(formData.get("resolution_id") ?? "").trim();
  const title = String(formData.get("resolution_title") ?? "").trim();
  const rosterRaw = String(formData.get("voter_principal_ids") ?? "");
  const quorumRaw = String(formData.get("quorum_threshold") ?? "").trim();

  if (!resolutionId) return boardFail("It is not clear which resolution this applies to. Reload the page and try again.");

  // One principal ID per line or comma; duplicates collapse so the roster size
  // the quorum is checked against is the number of distinct voters.
  const roster = [...new Set(rosterRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
  if (roster.length === 0) return boardFail("Name at least one person entitled to vote — one principal ID per line.");
  const invalid = roster.filter((p) => !UUID_RE.test(p));
  if (invalid.length > 0) {
    return boardFail(`These are not principal IDs: ${invalid.slice(0, 3).join(", ")}. Each voter is identified by their principal ID.`);
  }

  const quorumThreshold = Number(quorumRaw);
  if (!Number.isInteger(quorumThreshold) || quorumThreshold < 1 || quorumThreshold > roster.length) {
    return boardFail(`The quorum must be a whole number from 1 to ${roster.length} — the number of people on the roster.`);
  }

  const result = await openResolutionVoting({ identity, resolutionId, voterPrincipalIds: roster, quorumThreshold });
  if (!result.ok) {
    return boardFail(
      explainBoardError(result.error.message, {
        status: result.error.status,
        notFound: NOT_FOUND_RESOLUTION,
        conflict: "Voting could not be opened — it is already open, or the resolution has been decided. Reload to see where it stands.",
      }),
    );
  }

  refresh();

  const r = result.data;
  return {
    status: "opened",
    title: title || r.title,
    recordId: r.resolution_id,
    resolution: r,
    message: `Voting is open for ${roster.length} voter${roster.length === 1 ? "" : "s"}, with a quorum of ${quorumThreshold}. The roster and quorum are now fixed.`,
  };
}

/** Cast the signed-in principal's own vote on an OPEN resolution. */
export async function castVote(
  _previous: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return BOARD_EXPIRED;
  }

  const resolutionId = String(formData.get("resolution_id") ?? "").trim();
  const title = String(formData.get("resolution_title") ?? "").trim();
  const vote = String(formData.get("vote") ?? "").trim() as VoteChoice;

  if (!resolutionId) return boardFail("It is not clear which resolution this applies to. Reload the page and try again.");
  if (!VOTE_CHOICES.has(vote)) return boardFail("Choose For, Against, or Abstain.");

  const result = await castResolutionVote({ identity, resolutionId, vote });
  if (!result.ok) {
    return boardFail(
      explainBoardError(result.error.message, { status: result.error.status, notFound: NOT_FOUND_RESOLUTION }),
    );
  }

  refresh();

  return {
    status: "voted",
    title,
    recordId: resolutionId,
    message: `Your vote (${vote}) is recorded. It cannot be changed. The resolution is decided when someone other than its proposer closes the vote.`,
  };
}

/**
 * OPEN → PASSED or FAILED. The service decides which, from the frozen quorum
 * and the vote ledger; the proposer may not close their own resolution.
 */
export async function closeVoting(
  _previous: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return BOARD_EXPIRED;
  }

  const resolutionId = String(formData.get("resolution_id") ?? "").trim();
  const title = String(formData.get("resolution_title") ?? "").trim();
  const createdBy = String(formData.get("resolution_created_by") ?? "").trim();
  const documentVaultId = String(formData.get("document_vault_id") ?? "").trim();

  if (!resolutionId) return boardFail("It is not clear which resolution this applies to. Reload the page and try again.");
  if (createdBy && createdBy === identity.principalId) {
    return boardFail(
      "You proposed this resolution, so you cannot be the one to close its vote. Someone else " +
        "with the authority to close resolutions has to do it.",
    );
  }

  const result = await closeResolutionVoting({
    identity,
    resolutionId,
    ...(documentVaultId ? { documentVaultId } : {}),
  });
  if (!result.ok) {
    return boardFail(
      explainBoardError(result.error.message, {
        status: result.error.status,
        notFound: NOT_FOUND_RESOLUTION,
        conflict: "Nothing was changed. This resolution is not open for voting. Reload to see how it was decided.",
      }),
    );
  }

  refresh();

  const r = result.data;
  const votes = summariseVotes(r);
  if (r.status === "PASSED") {
    return {
      status: "passed",
      title: title || r.title,
      recordId: r.resolution_id,
      passedBy: r.passed_by,
      resolution: r,
      message:
        `Passed and in force${r.passed_at ? ` as of ${formatWhen(r.passed_at)}` : ""} — ${votes.line}. ` +
        "Quorum was reached and the required supporting evidence was on file.",
    };
  }
  return {
    status: "failed",
    title: title || r.title,
    recordId: r.resolution_id,
    resolution: r,
    message: `Voting closed and the resolution was not carried — ${votes.line}. Quorum was not reached, or the votes in favour did not outnumber those against.`,
  };
}

/** A timestamp as a person would say it. The board messages are read by people
 *  who did not write the service, so an ISO string is not an answer. */
function formatWhen(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  return when.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The column is a DATE, so the wire format is a plain calendar date. A
 *  timestamp would be rejected by Postgres, not by the handler. */
function isDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** The service validates neither date, and never compares them — a contract
 *  that expires before it starts is accepted and stored. */
function validateDateRange(from: string, to: string): string | null {
  if (!from) return "An effective-from date is required.";
  if (!isDate(from)) return "Effective-from must be a valid date.";
  if (!to) return null;
  if (!isDate(to)) return "Effective-to must be a valid date.";
  if (to < from) return "Effective-to cannot fall before effective-from.";
  return null;
}

function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}
