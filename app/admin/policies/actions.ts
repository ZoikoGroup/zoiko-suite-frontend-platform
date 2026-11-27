"use server";

// Server Actions for policy-svc (:8085).
//
// Server Actions are reachable by direct POST, so the session is verified inside
// every action rather than relying on the proxy's /admin matcher.
//
// The session check here only decides who is asking. policy-svc itself decides
// whether they may: every write is authorized by authorization-svc for the
// scope it binds, and GOV-05 adds maker–checker (the author never approves or
// activates, the suspender never reviews), optimistic concurrency (every
// lifecycle command names the version's row_version) and, for evaluable types,
// certification before activation (V-001 PDC-05). The console surfaces those
// refusals in plain words; it never pre-empts them.
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
  createControlTestDefinition,
  createControlTestExecution,
  getPolicyVersionByID,
  submitPolicyVersionForReview,
  approvePolicyVersion,
  schedulePolicyVersion,
  suspendPolicyVersion,
  reviewPolicyVersionSuspension,
  retirePolicyVersion,
  retirePolicyFamily,
  createPolicyTestCase,
  runPolicyTestSuite,
  requestPolicyTestWaiver,
  approvePolicyTestWaiver,
  createAttestation,
  revokeAttestation,
  redeliverPolicyEvidence,
  draftAccountingPolicy,
  submitAccountingPolicy,
  approveAccountingPolicyVersion,
  activateAccountingPolicyVersion,
  supersedeAccountingPolicyVersion,
  emergencySuspendAccountingPolicy,
  reviewAccountingPolicySuspension,
  type AccountingPolicyVersion,
  type PolicyVersion,
} from "@/lib/api/policies";
import type { ApiError, ApiWriteResult } from "@/lib/api/client";
import type { CommandState, ControlWriteState, EvaluateState, PolicyWriteState } from "./state";

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
    caller: identity,
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
 * Activate an APPROVED version.
 *
 * The one write here that changes what the platform enforces. GOV-05: only an
 * approved version goes live, never by its author, and an evaluable type only
 * once certified. The version is read first for its row_version (policy-svc
 * refuses a lifecycle command that names none) and its status, so a draft is
 * explained before anything is sent.
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

  const current = await getPolicyVersionByID(versionId, identity);
  if (!current.ok) {
    return writeFailure(current.error, {
      notFound:
        "There is no version with that reference. Check it against the policy's Requirements tab — the second box wants the version's reference, not the policy's.",
    });
  }
  const version = current.data;
  if (version.policy_id !== policyId) {
    return {
      status: "error",
      message: "That version belongs to a different policy. Check both references — they are easy to swap.",
    };
  }
  const blocked = activationBlocker(version);
  if (blocked) return { status: "conflict", message: blocked, version };

  const result = await activatePolicyVersion({
    policyId,
    versionId,
    expectedVersion: version.row_version ?? 1,
    identity,
  });

  if (!result.ok) {
    const failure = commandFailure(result.error, "activate");
    return { status: failure.status === "conflict" || failure.status === "stale" ? "conflict" : "error", message: failure.message };
  }

  refresh();

  const scheduled = result.data.version_status === "SCHEDULED";
  return {
    status: "created",
    version: result.data,
    // Deliberately not "has just been changed". The service accepts activating
    // a limit that is already in force and answers 200 without altering
    // anything, and nothing in the response distinguishes that from a first
    // activation — so this says what is true afterwards either way, and says
    // that repeating it is harmless rather than implying something moved.
    message: scheduled
      ? `This version is scheduled and takes over on ${result.data.effective_from.slice(0, 10)}, its effective date. The scheduling is recorded against your name.`
      : "This version is in force and is being applied to decisions. Anything that applied to the same scope before has been replaced, and the activation is recorded against your name. Repeating this on a version already in force changes nothing.",
  };
}

/** Why a version cannot be activated from where it stands, or null when it can. */
function activationBlocker(version: PolicyVersion): string | null {
  switch (version.version_status) {
    case "APPROVED":
    case "ACTIVE":
    case "SCHEDULED":
      return null;
    case "DRAFT":
      return "This version is still a draft. Submit it for review from the policy's Requirements tab; once a different person has approved it, it can be brought into force.";
    case "REVIEW":
      return "This version is waiting for approval. A person other than its author must approve it before it can be brought into force.";
    case "SUSPENDED":
      return "This version is suspended. A suspension is reviewed, not undone by re-activating; draft a new version if the rule must change.";
    default:
      return "This version has been replaced or withdrawn and cannot come back into force. Draft a new version instead.";
  }
}

// ── governed commands from the drawer ──────────────────────────────────────

/** policy-svc's problem document: `code` is the GCP §16 class, `reason_code` the specific refusal. */
function problemOf(error: ApiError): { code?: string; reason?: string } {
  const body = error.body as { code?: unknown; reason_code?: unknown } | undefined;
  return {
    code: typeof body?.code === "string" ? body.code : undefined,
    reason: typeof body?.reason_code === "string" ? body.reason_code : undefined,
  };
}

const COMMAND_SUBJECT: Record<string, string> = {
  "submit-review": "submit this version for review",
  approve: "approve this version",
  activate: "bring this version into force",
  schedule: "schedule this version",
  suspend: "suspend this version",
  "review-suspension": "review this suspension",
  retire: "retire this version",
  "retire-family": "retire this policy",
  "test-case": "add this test case",
  "test-run": "run the test suite",
  "waiver-request": "request this waiver",
  "waiver-approve": "approve this waiver",
  attestation: "sign this attestation",
  "attestation-revoke": "revoke this attestation",
  redeliver: "re-deliver this evidence",
};

/**
 * One refusal, in the words of the operator who met it. The class and reason
 * from the problem document decide; the status is the fallback.
 */
function commandFailure(error: ApiError, command: string): CommandState {
  const { code, reason } = problemOf(error);
  const what = COMMAND_SUBJECT[command] ?? "make this change";
  if (code === "SOD_CONFLICT" || reason === "maker_checker_violation") {
    return {
      status: "refused",
      message:
        command === "review-suspension"
          ? "You suspended this version, so you cannot review the suspension. A different approver must review it — the refusal is recorded."
          : command === "waiver-approve"
            ? "You requested this waiver, so you cannot approve it. A different person must approve it."
            : "You drafted this version, so you cannot approve it or bring it into force. A different person must do that — the refusal is recorded.",
    };
  }
  if (code === "APPROVAL_REQUIRED") {
    return { status: "conflict", message: "This version has not been approved. It must be submitted for review and approved by a different person before it can go into force." };
  }
  if (code === "CERTIFICATION_REQUIRED") {
    return {
      status: "conflict",
      message:
        "This version is not certified. Run the policy's test suite against it from the Requirements tab; any mandatory case that fails must be fixed in a new version or waived by a second person before activation.",
    };
  }
  if (code === "POLICY_CONFLICTED") {
    return { status: "conflict", message: "Another policy of the same kind already governs exactly this scope in an overlapping period. Two rules tied at the same scope would be ambiguous, so this was refused." };
  }
  if (error.status === 412 || reason === "stale_version" || reason === "concurrency_conflict") {
    return { status: "stale", message: "Someone changed this record since the page was loaded, so nothing was done. Reload and check where it stands now." };
  }
  if (reason === "invalid_transition") {
    return { status: "conflict", message: `You cannot ${what} from where it stands now. Reload the page to see its current status.` };
  }
  if (error.status === 403) {
    return { status: "refused", message: `You do not have permission to ${what} for this scope. The refusal is recorded; ask whoever administers access.` };
  }
  return {
    status: error.status === 409 ? "conflict" : "error",
    message: explainPolicyError(error.message, { status: error.status }),
  };
}

async function commandIdentity(): Promise<SessionIdentity | CommandState> {
  try {
    return await requireIdentity();
  } catch {
    return { status: "error", message: "You have been signed out. Sign in again and repeat this — nothing was changed." };
  }
}

function isState(x: SessionIdentity | CommandState): x is CommandState {
  return "status" in x;
}

const VERSION_COMMANDS = ["submit-review", "approve", "activate", "schedule", "suspend", "review-suspension", "retire"] as const;
type VersionCommand = (typeof VERSION_COMMANDS)[number];

const VERSION_DONE: Record<VersionCommand, (v: PolicyVersion) => string> = {
  "submit-review": () => "Submitted for review. A person other than you must approve it before it can go into force.",
  approve: () => "Approved. It can now be brought into force — by anyone with that permission except its author.",
  activate: (v) =>
    v.version_status === "SCHEDULED"
      ? `Scheduled: it takes over on ${v.effective_from.slice(0, 10)}, its effective date.`
      : "In force. Whatever applied to the same scope before has been superseded.",
  schedule: (v) => `Scheduled: it takes over on ${v.effective_from.slice(0, 10)}.`,
  suspend: () => "Suspended. It no longer decides anything, and its predecessor does not come back. A different approver must review the suspension.",
  "review-suspension": (v) =>
    v.suspension_review_outcome === "OVERTURNED"
      ? "Review recorded: the suspension was overturned."
      : "Review recorded: the suspension was upheld.",
  retire: () => "Retired. It will never decide anything again; its history stays on record.",
};

/**
 * A GOV-05 lifecycle command on one version. The form carries the version's
 * row_version as read when the page rendered, so a command never lands on a
 * version someone else has moved since.
 */
export async function submitVersionCommand(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const command = field("command") as VersionCommand;
  const policyId = field("policy_id");
  const versionId = field("version_id");
  const expected = Number(field("expected_version"));
  if (!VERSION_COMMANDS.includes(command) || !looksLikeReference(policyId) || !looksLikeReference(versionId) || !(expected >= 1)) {
    return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  }
  const reasonCode = field("reason_code");
  const reason = field("reason") || undefined;
  if ((command === "suspend" || command === "retire" || command === "review-suspension") && !reasonCode) {
    return { status: "error", message: "Choose a reason. A suspension, retirement or review is recorded with its reason." };
  }

  let result: ApiWriteResult<PolicyVersion>;
  switch (command) {
    case "submit-review":
      result = await submitPolicyVersionForReview(policyId, versionId, expected, who);
      break;
    case "approve":
      result = await approvePolicyVersion(policyId, versionId, expected, field("approval_reference") || undefined, who);
      break;
    case "activate":
      result = await activatePolicyVersion({ policyId, versionId, expectedVersion: expected, identity: who });
      break;
    case "schedule":
      result = await schedulePolicyVersion(policyId, versionId, expected, who);
      break;
    case "suspend":
      result = await suspendPolicyVersion(policyId, versionId, expected, reasonCode, who, reason);
      break;
    case "review-suspension": {
      const outcome = field("outcome");
      if (outcome !== "UPHELD" && outcome !== "OVERTURNED") {
        return { status: "error", message: "Choose whether the suspension is upheld or overturned." };
      }
      result = await reviewPolicyVersionSuspension(policyId, versionId, expected, reasonCode, outcome, who, reason);
      break;
    }
    case "retire":
      result = await retirePolicyVersion(policyId, versionId, expected, reasonCode, who, reason);
      break;
    default:
      return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  }
  if (!result.ok) return commandFailure(result.error, command);
  refresh();
  return { status: "done", message: VERSION_DONE[command](result.data) };
}

// ── REF-07 accounting policies ───────────────────────────────────────────────

const ACCOUNTING_COMMANDS = ["submit-review", "approve", "activate", "supersede", "emergency-suspend", "review-suspension"] as const;
type AccountingCommand = (typeof ACCOUNTING_COMMANDS)[number];

const ACCOUNTING_DONE: Record<AccountingCommand, (v: AccountingPolicyVersion) => string> = {
  "submit-review": () => "Submitted for review. A person other than you must approve it.",
  approve: () => "Approved. The designated accounting authority can now bring it into force — anyone with that authority except its author.",
  activate: (v) =>
    v.version_status === "SCHEDULED" ? `Scheduled: it governs from ${v.effective_from.slice(0, 10)}.` : "In force. Calculations in its scope now resolve to this version.",
  supersede: () => "In force, replacing the version it names. The replaced version governs nothing from now; its history stays on record.",
  "emergency-suspend": () =>
    "Suspended under the break-glass session. Calculations in its scope are blocked (nothing falls back to an older version) until a different person reviews the suspension.",
  "review-suspension": (v) =>
    v.suspension_review_outcome === "OVERTURNED" ? "Review recorded: the suspension was overturned." : "Review recorded: the suspension was upheld.",
};

function accountingFailure(error: ApiError, command: AccountingCommand): CommandState {
  const { code, reason } = problemOf(error);
  if (code === "EMERGENCY_SESSION_REQUIRED") {
    return {
      status: "refused",
      message:
        "An emergency suspension is honoured only under your own live break-glass session. Request one on the Authorization page (Elevated access); once a second person approves it, give its session id here. Holding the permission alone suspends nothing.",
    };
  }
  if (code === "SUPERSESSION_REQUIRED") {
    return {
      status: "conflict",
      message:
        reason === "invalid_supersedes"
          ? "The version named is not the one in force for this scope, so nothing was replaced. Reload the page: the impact shows which version this would supersede."
          : "Another version already governs this scope. Replacing it is never a side effect: supersede it by name (the Supersede command) instead of activating.",
    };
  }
  return commandFailure(error, command === "emergency-suspend" ? "suspend" : command === "supersede" ? "activate" : command);
}

/**
 * Draft an accounting policy version (REF-07): where it applies, the framework
 * and its source, the impact analysis, and the rules it pins. Always DRAFT;
 * review, approval and activation are separate, attributable acts.
 */
export async function submitAccountingDraft(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const scope = field("scope");
  const affected = field("affected_periods");
  const effectiveFrom = field("effective_from");
  const effectiveTo = field("effective_to");
  const missing = (
    [
      ["policy_domain", "the policy domain"],
      ["framework", "the framework"],
      ["semantic_version", "the version number"],
      ["framework_source", "the framework source"],
      ["policy_text_ref", "the policy text reference"],
      ["impact_summary", "the impact summary"],
      ["effective_from", "the effective date"],
      ["rationale", "the rationale"],
    ] as const
  ).filter(([k]) => !field(k));
  if (missing.length) return { status: "error", message: `Fill in ${missing.map(([, l]) => l).join(", ")}.` };
  if (affected !== "FUTURE_ONLY" && affected !== "OPEN_PERIODS") return { status: "error", message: "Say which periods the change reaches." };

  const mapping = {
    ref_kind: field("map_kind"),
    ref: field("map_ref"),
    ref_version: field("map_version"),
    rationale: field("map_rationale"),
    maps_to: field("map_to") || undefined,
  };
  const anyMapping = [mapping.ref_kind, mapping.ref, mapping.ref_version, mapping.rationale].some(Boolean);
  if (anyMapping && ![mapping.ref_kind, mapping.ref, mapping.ref_version, mapping.rationale].every(Boolean)) {
    return { status: "error", message: "A rule mapping needs its kind, reference, pinned version and rationale — or leave all four empty." };
  }

  const result = await draftAccountingPolicy({
    policyDomain: field("policy_domain").toUpperCase(),
    framework: field("framework").toUpperCase(),
    bookId: field("book_id") || undefined,
    jurisdictionId: field("jurisdiction_id") || undefined,
    legalEntityId: scope === "entity" ? who.legalEntityId : undefined,
    semanticVersion: field("semantic_version"),
    precedence: Number(field("precedence") || "0"),
    frameworkSource: field("framework_source"),
    policyTextRef: field("policy_text_ref"),
    ruleMappings: anyMapping ? [mapping] : undefined,
    impactAnalysis: {
      summary: field("impact_summary"),
      affected_periods: affected,
      closed_history_unchanged: formData.get("closed_history_unchanged") === "on",
      retroactive_justification: field("retroactive_justification") || undefined,
    },
    effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`).toISOString(),
    effectiveTo: effectiveTo ? new Date(`${effectiveTo}T00:00:00Z`).toISOString() : undefined,
    rationale: field("rationale"),
    identity: who,
    callerTenantId: who.tenantId,
    callerLegalEntityId: who.legalEntityId,
  });
  if (!result.ok) {
    const { reason } = problemOf(result.error);
    if (reason === "invalid_accounting_policy") {
      // policy-svc lists everything wrong at once, in words; show its list.
      const errors = (result.error.body as { errors?: unknown } | undefined)?.errors;
      const list = Array.isArray(errors) ? errors.filter((e): e is string => typeof e === "string") : [];
      return {
        status: "error",
        message: list.length
          ? `Nothing was saved. Correct these and draft it again: ${list.join("; ")}.`
          : explainPolicyError(result.error.message, { status: result.error.status }),
      };
    }
    return result.error.status === 409
      ? { status: "conflict", message: "This draft repeats an earlier one with different content under the same key, so nothing was saved. Reload and draft it again." }
      : commandFailure(result.error, "submit-review");
  }
  refresh();
  const v = result.data;
  return {
    status: result.status === 201 ? "done" : "unchanged",
    message: `${v.policy_code ?? "Accounting policy"} ${v.details?.semantic_version ?? ""} is drafted (version ${v.version_number}). Open it below and submit it for review.`.replace(/\s+/g, " "),
  };
}

/**
 * One REF-07 lifecycle command on an accounting version. The form carries the
 * version's row_version; an emergency suspension also carries the live
 * break-glass session it is made under (X-Break-Glass-Session-Id).
 */
export async function submitAccountingCommand(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const command = field("command") as AccountingCommand;
  const versionId = field("version_id");
  const expected = Number(field("expected_version"));
  if (!ACCOUNTING_COMMANDS.includes(command) || !looksLikeReference(versionId) || !(expected >= 1)) {
    return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  }
  const reasonCode = field("reason_code") || undefined;
  if ((command === "emergency-suspend" || command === "review-suspension") && !reasonCode) {
    return { status: "error", message: "Choose a reason. A suspension and its review are recorded with their reason." };
  }
  const outcome = field("outcome");
  if (command === "review-suspension" && outcome !== "UPHELD" && outcome !== "OVERTURNED") {
    return { status: "error", message: "Choose whether the suspension is upheld or overturned." };
  }
  const supersedes = field("supersedes_version_id");
  if (command === "supersede" && !looksLikeReference(supersedes)) {
    return { status: "error", message: "Name the version this replaces. Reload the page: the impact shows it." };
  }
  const session = field("break_glass_session_id");
  const input = {
    versionId,
    expectedVersion: expected,
    reasonCode,
    reason: field("reason") || undefined,
    approvalReference: field("approval_reference") || undefined,
    outcome: command === "review-suspension" ? (outcome as "UPHELD" | "OVERTURNED") : undefined,
    supersedesVersionId: command === "supersede" ? supersedes : undefined,
    breakGlassSessionId: command === "emergency-suspend" && session ? session : undefined,
    identity: who,
  };
  const call = {
    "submit-review": submitAccountingPolicy,
    approve: approveAccountingPolicyVersion,
    activate: activateAccountingPolicyVersion,
    supersede: supersedeAccountingPolicyVersion,
    "emergency-suspend": emergencySuspendAccountingPolicy,
    "review-suspension": reviewAccountingPolicySuspension,
  }[command];
  const result = await call(input);
  if (!result.ok) return accountingFailure(result.error, command);
  refresh();
  return { status: "done", message: ACCOUNTING_DONE[command](result.data) };
}

/** Retire a whole policy family: final, and refused while a version is in force or scheduled. */
export async function submitFamilyRetirement(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const policyId = String(formData.get("policy_id") ?? "").trim();
  const reasonCode = String(formData.get("reason_code") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!looksLikeReference(policyId)) return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  if (!reasonCode) return { status: "error", message: "Choose a reason for retiring the policy." };
  const result = await retirePolicyFamily(policyId, reasonCode, reason, undefined, who);
  if (!result.ok) {
    if (result.error.status === 409) {
      return {
        status: "conflict",
        message: "A version of this policy is still in force or scheduled. Retire or let that version be superseded first — a policy that still decides things cannot be retired.",
      };
    }
    return commandFailure(result.error, "retire-family");
  }
  refresh();
  return { status: "done", message: "The policy is retired. No new version can be drafted under it; its history stays on record." };
}

// ── certification (V-001 PDC-05) ─────────────────────────────────────────────

/** Add a test case to the policy family's suite. Cases are immutable; a changed case is a new code. */
export async function submitTestCase(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const policyId = field("policy_id");
  const testCode = field("test_code");
  const description = field("description");
  const expectedResult = field("expected_result");
  const layer = field("layer") as "UNIT" | "BOUNDARY" | "REGRESSION";
  const amountRaw = field("amount");
  if (!looksLikeReference(policyId)) return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  if (!testCode || !description || !expectedResult) {
    return { status: "error", message: "A test code, a description and the expected result are all required." };
  }
  if (!["UNIT", "BOUNDARY", "REGRESSION"].includes(layer)) return { status: "error", message: "Choose the test layer." };
  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount)) return { status: "error", message: "Enter the amount the case tests." };
  const currency = field("currency");
  const result = await createPolicyTestCase(policyId, {
    testCode,
    layer,
    mandatory: formData.get("mandatory") === "on",
    description,
    actionContext: currency ? { amount, currency } : { amount },
    expectedResult,
    identity: who,
  });
  if (!result.ok) {
    if (result.error.status === 409) {
      return { status: "conflict", message: `A test case ${testCode} already exists with a different definition. Cases are immutable — choose a new code.` };
    }
    return commandFailure(result.error, "test-case");
  }
  refresh();
  return result.status === 201
    ? { status: "done", message: `Test case ${testCode} added. Run the suite against a version to certify it.` }
    : { status: "unchanged", message: `Test case ${testCode} already existed with exactly these details; nothing changed.` };
}

/** Run the family's suite against one version; the run certifies it when every mandatory case passes. */
export async function submitTestRun(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!looksLikeReference(versionId)) return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  const result = await runPolicyTestSuite(versionId, who);
  if (!result.ok) return commandFailure(result.error, "test-run");
  refresh();
  const run = result.data;
  if (run.case_count === 0) {
    return { status: "conflict", message: "The suite has no test cases, so nothing was proven. Add test cases first." };
  }
  return run.run_status === "PASS"
    ? { status: "done", message: `All ${run.case_count} cases passed. The version is certified against this suite.` }
    : {
        status: "conflict",
        message: `${run.failed_count} of ${run.case_count} cases failed. Fix the rule in a new version, or have a failing mandatory case waived by a second person.`,
      };
}

/** Request a time-bounded waiver for one failing case on one version. */
export async function submitWaiverRequest(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const versionId = field("version_id");
  const testCaseId = field("test_case_id");
  const reasonCode = field("reason_code");
  const justification = field("justification");
  const expires = field("expires_at");
  if (!looksLikeReference(versionId) || !looksLikeReference(testCaseId)) {
    return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  }
  if (!reasonCode || !justification || !expires) {
    return { status: "error", message: "A reason, a justification and an expiry date are all required." };
  }
  const expiresAt = new Date(`${expires}T23:59:59Z`);
  if (!(expiresAt.getTime() > Date.now())) return { status: "error", message: "The expiry date must be in the future." };
  const result = await requestPolicyTestWaiver(versionId, {
    testCaseId,
    reasonCode,
    justification,
    expiresAt: expiresAt.toISOString(),
    identity: who,
  });
  if (!result.ok) return commandFailure(result.error, "waiver-request");
  refresh();
  return { status: "done", message: "Waiver requested. A person other than you must approve it before it counts." };
}

export async function submitWaiverApproval(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const waiverId = String(formData.get("waiver_id") ?? "").trim();
  if (!looksLikeReference(waiverId)) return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  const result = await approvePolicyTestWaiver(waiverId, who);
  if (!result.ok) return commandFailure(result.error, "waiver-approve");
  refresh();
  return { status: "done", message: "Waiver approved. Re-check the version's certification." };
}

// ── evidence ─────────────────────────────────────────────────────────────────

/** Sign an attestation whose subject is this policy or control. */
export async function submitAttestation(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const subjectRef = field("subject_ref");
  const statement = field("statement");
  const statementVersion = field("statement_version");
  const signerRole = field("signer_role");
  const from = field("period_start");
  const to = field("period_end");
  if (!subjectRef || !statement || !statementVersion || !signerRole || !from || !to) {
    return { status: "error", message: "The statement, its version, your role and the period are all required." };
  }
  if (to <= from) return { status: "error", message: "The period must end after it starts." };
  const evidenceRefs = field("evidence_refs")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result = await createAttestation({
    statement,
    statementVersion,
    subjectRef,
    periodStart: new Date(`${from}T00:00:00Z`).toISOString(),
    periodEnd: new Date(`${to}T23:59:59Z`).toISOString(),
    signerRole,
    evidenceRefs: evidenceRefs.length ? evidenceRefs : undefined,
    identity: who,
    callerTenantId: who.tenantId,
  });
  if (!result.ok) return commandFailure(result.error, "attestation");
  refresh();
  return result.status === 201
    ? { status: "done", message: `Attestation ${statementVersion} signed in your name.` }
    : { status: "unchanged", message: "This attestation was already recorded; nothing changed." };
}

export async function submitAttestationRevocation(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const id = String(formData.get("attestation_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!looksLikeReference(id)) return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  if (!reason) return { status: "error", message: "Say why the attestation is revoked; the reason is kept with it." };
  const result = await revokeAttestation(id, who, reason);
  if (!result.ok) {
    if (result.error.status === 409) return { status: "conflict", message: "This attestation is already revoked." };
    return commandFailure(result.error, "attestation-revoke");
  }
  refresh();
  return { status: "done", message: "Attestation revoked. It stays on record, marked revoked, with your reason." };
}

/** Re-queue evaluation evidence the governance ledger refused. */
export async function submitEvidenceRedelivery(_previous: CommandState, formData: FormData): Promise<CommandState> {
  const who = await commandIdentity();
  if (isState(who)) return who;
  const evidenceId = String(formData.get("evidence_id") ?? "").trim();
  if (!looksLikeReference(evidenceId)) return { status: "error", message: "This form is incomplete. Reload the page and try again." };
  const result = await redeliverPolicyEvidence(evidenceId, "LEDGER_REFUSAL_RESOLVED", who, "re-driven from the console");
  if (!result.ok) {
    if (result.error.status === 409) return { status: "conflict", message: "This evidence is not in a failed state, so there is nothing to re-deliver." };
    return commandFailure(result.error, "redeliver");
  }
  refresh();
  return { status: "done", message: "Queued for delivery to the governance ledger again." };
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
    caller: identity,
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

// ── controls (doc7 §E3, §I3) ────────────────────────────────────────────────

/** Define a control test: the methodology a control is tested by. Immutable once created. */
export async function submitControlTest(_previous: ControlWriteState, formData: FormData): Promise<ControlWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const controlRef = field("control_ref");
  const testCode = field("test_code");
  const title = field("title");
  const methodology = field("methodology");
  if (!controlRef || !testCode || !title || !methodology) {
    return { status: "error", message: "A control reference, test code, title and methodology are all required." };
  }
  const result = await createControlTestDefinition({
    controlRef,
    testCode,
    title,
    methodology,
    sampleApproach: field("sample_approach") || undefined,
    testFrequency: field("test_frequency") || undefined,
    identity,
  });
  if (!result.ok) {
    return {
      status: result.error.status === 409 ? "conflict" : "error",
      message:
        result.error.status === 409
          ? "A control test with that code already exists with a different definition. Definitions are immutable: choose a new test code for a changed methodology."
          : explainPolicyError(result.error.message, { status: result.error.status }),
    };
  }
  refresh();
  return result.status === 201
    ? { status: "created", message: `Control test ${testCode} is defined. Record its first test result from the control's Evidence tab.` }
    : { status: "replayed", message: `Control test ${testCode} already existed with exactly these details; nothing was changed.` };
}

/** Record one test run of a control: the operating-effectiveness evidence. */
export async function submitControlExecution(_previous: ControlWriteState, formData: FormData): Promise<ControlWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const definitionId = field("control_test_definition_id");
  const periodStart = field("period_start");
  const periodEnd = field("period_end");
  const resultValue = field("result");
  if (!definitionId || !periodStart || !periodEnd || !resultValue) {
    return { status: "error", message: "The tested period and the result are required." };
  }
  if (periodEnd <= periodStart) {
    return { status: "error", message: "The period must end after it starts." };
  }
  const evidenceRefs = field("evidence_refs")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result = await createControlTestExecution({
    controlTestDefinitionId: definitionId,
    periodStart: new Date(`${periodStart}T00:00:00Z`).toISOString(),
    periodEnd: new Date(`${periodEnd}T23:59:59Z`).toISOString(),
    result: resultValue,
    sampleDescription: field("sample_description") || undefined,
    procedureNotes: field("procedure_notes") || undefined,
    exceptionsNoted: field("exceptions_noted") || undefined,
    evidenceRefs: evidenceRefs.length ? evidenceRefs : undefined,
    identity,
    callerTenantId: identity.tenantId,
  });
  if (!result.ok) {
    return {
      status: result.error.status === 409 ? "conflict" : "error",
      message: explainPolicyError(result.error.message, { status: result.error.status }),
    };
  }
  refresh();
  return { status: "created", message: `Test result ${resultValue} recorded for ${periodStart} – ${periodEnd}.` };
}
