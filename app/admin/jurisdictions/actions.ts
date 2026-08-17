"use server";

// Server Actions for jurisdiction-rules-svc (:8082).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// Two things about this service shape everything below:
//
//  - Its writes are authorized against the PLATFORM scope, not a legal entity.
//    "GB" is not owned by one. A denial therefore means the principal lacks a
//    JURISDICTION_* grant on that synthetic scope, and saying "on this legal
//    entity" would send the reader to look in the wrong place.
//  - Its reads are deliberately unauthenticated — jurisdictions are PUBLIC
//    reference data (data_classification_audit.md §2.11). The resolve action
//    below still runs server-side, because the browser must never hold a
//    backend URL, not because the read needs a credential.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createJurisdiction,
  createRule,
  deactivateJurisdiction,
  describeJurisdiction,
  explainJurisdictionError,
  getDriftEvents,
  getRulePack,
  listJurisdictions,
  recordDrift,
  transitionRule,
  DRIFT_STATES,
  RULE_STATUSES,
} from "@/lib/api/jurisdictions";
import {
  type RecordRuleState,
  type RegisterJurisdictionState,
  type RulePackState,
  type RuleActionState,
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

/** RFC3339 is what the service parses; a date input gives a plain calendar day. */
function asTimestamp(day: string): string {
  return `${day}T00:00:00Z`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Register a jurisdiction ─────────────────────────────────────────────────

export async function registerJurisdictionAction(
  _prev: RegisterJurisdictionState,
  formData: FormData,
): Promise<RegisterJurisdictionState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const code = String(formData.get("jurisdiction_code") ?? "").trim();
  const name = String(formData.get("jurisdiction_name") ?? "").trim();
  const type = String(formData.get("jurisdiction_type") ?? "").trim();
  const authority = String(formData.get("authority_type") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();
  const parent = String(formData.get("parent_jurisdiction_id") ?? "").trim();

  if (!code) return { status: "error", message: "A jurisdiction code is required (GB, US-CA)." };
  if (!name) return { status: "error", message: "A jurisdiction name is required." };
  if (!type) return { status: "error", message: "A jurisdiction type is required." };
  if (!authority) return { status: "error", message: "An authority type is required." };
  if (!DATE_RE.test(effectiveFrom)) {
    return { status: "error", message: "Effective-from must be a calendar date." };
  }
  if (effectiveTo && !DATE_RE.test(effectiveTo)) {
    return { status: "error", message: "Effective-to must be a calendar date." };
  }
  // Checked here as well as in the service: its refusal is a bare
  // `invalid_effective_period`, and an inverted period is a slip worth naming
  // before a round trip.
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    return { status: "error", message: "Effective-to must be after effective-from." };
  }

  const result = await createJurisdiction({
    identity,
    jurisdictionCode: code,
    jurisdictionName: name,
    jurisdictionType: type,
    authorityType: authority,
    effectiveFrom: asTimestamp(effectiveFrom),
    ...(effectiveTo ? { effectiveTo: asTimestamp(effectiveTo) } : {}),
    ...(parent ? { parentJurisdictionId: parent } : {}),
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 403) return { status: "unauthorized", message: explainJurisdictionError("forbidden") };
    if (status === 409) return { status: "conflict", message: explainJurisdictionError("conflict") };
    return { status: "error", message: explainJurisdictionError(message) };
  }

  refresh();

  // 200 is an idempotent replay, 201 a real insert. Collapsing them would tell
  // someone they had just registered a jurisdiction that has existed for months.
  if (result.status === 200) {
    return {
      status: "replayed",
      jurisdiction: result.data,
      message: `${describeJurisdiction(result.data)} was already registered with exactly these attributes, so nothing was written. The registry answered 200, not an error.`,
    };
  }
  return {
    status: "registered",
    jurisdiction: result.data,
    message: `Registered ${describeJurisdiction(result.data)}. Obligations and entity assignments can now be bound to it — both services validate against this register and fail closed, so an id that does not resolve here resolves nowhere.`,
  };
}

// ─── Deactivate a jurisdiction ───────────────────────────────────────────────

export async function deactivateJurisdictionAction(
  _prev: RegisterJurisdictionState,
  formData: FormData,
): Promise<RegisterJurisdictionState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const id = String(formData.get("jurisdiction_id") ?? "").trim();
  if (!id) return { status: "error", message: "Missing jurisdiction id." };

  const result = await deactivateJurisdiction(id, identity);
  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 403) return { status: "unauthorized", message: explainJurisdictionError("forbidden") };
    return { status: "error", message: explainJurisdictionError(message) };
  }

  refresh();
  return {
    status: "registered",
    jurisdiction: result.data,
    message: `${describeJurisdiction(result.data)} is deactivated and end-dated. Nothing was deleted, and it still appears in the register — but it no longer RESOLVES: a lookup by id now answers 404, deliberately, so every service that validates against this register fails closed on it. That includes records already bound to it, so this is not a cosmetic change.`,
  };
}

// ─── Record a rule ───────────────────────────────────────────────────────────

export async function recordRuleAction(
  _prev: RecordRuleState,
  formData: FormData,
): Promise<RecordRuleState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const domain = String(formData.get("rule_domain") ?? "").trim();
  const ruleCode = String(formData.get("rule_code") ?? "").trim();
  const ruleName = String(formData.get("rule_name") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const source = String(formData.get("source_reference") ?? "").trim();
  const ruleStatus = String(formData.get("rule_status") ?? "DRAFT").trim();
  const rawPayload = String(formData.get("rule_payload") ?? "").trim();

  if (!jurisdictionId) return { status: "error", message: "Select the jurisdiction this rule belongs to." };
  if (!domain) return { status: "error", message: "A rule domain is required." };
  if (!ruleCode) return { status: "error", message: "A rule code is required." };
  if (!ruleName) return { status: "error", message: "A rule name is required." };
  if (!DATE_RE.test(effectiveFrom)) {
    return { status: "error", message: "Effective-from must be a calendar date." };
  }
  if (!(RULE_STATUSES as readonly string[]).includes(ruleStatus)) {
    return { status: "error", message: `${ruleStatus} is not a rule status this registry records.` };
  }

  if (!rawPayload) {
    return { status: "error", message: "A rule payload is required — it is what the rule actually says." };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch (cause) {
    return {
      status: "error",
      message: `The rule payload is not valid JSON — ${(cause as Error).message}. Checked here so a syntax error does not travel to the service as a generic 400.`,
    };
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      status: "error",
      message: "The rule payload must be a JSON object of applicability metadata — who the rule applies to, how often they file, which authority. Thresholds and rates belong to the Tax and Payroll services, not here.",
    };
  }

  const result = await createRule({
    identity,
    jurisdictionId,
    ruleDomain: domain,
    ruleCode,
    ruleName,
    effectiveFrom: asTimestamp(effectiveFrom),
    rulePayload: payload,
    ...(source ? { sourceReference: source } : {}),
    ruleStatus,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 403) return { status: "unauthorized", message: explainJurisdictionError("forbidden") };
    return { status: "error", message: explainJurisdictionError(message) };
  }

  refresh();
  return {
    status: "recorded",
    rule: result.data,
    message: `Recorded ${result.data.rule_code} (${result.data.rule_domain}) as ${result.data.rule_status}, drift state ${result.data.legal_drift_state}. A DRAFT rule is registered but does not resolve into a rule pack until it is transitioned to ACTIVE.`,
  };
}

// ─── Resolve a rule pack ─────────────────────────────────────────────────────

export async function resolveRulePackAction(
  _prev: RulePackState,
  formData: FormData,
): Promise<RulePackState> {
  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const at = String(formData.get("effective_at") ?? "").trim();

  if (!jurisdictionId) return { status: "error", message: "Select a jurisdiction to resolve." };
  if (at && !DATE_RE.test(at)) {
    return { status: "error", message: "The as-at date must be a calendar date." };
  }

  const [packResult, listResult] = await Promise.all([
    getRulePack(jurisdictionId, at ? asTimestamp(at) : undefined),
    listJurisdictions(),
  ]);

  if (!packResult.ok) {
    return { status: "error", message: explainJurisdictionError(packResult.error.message) };
  }

  // Resolve the chain's ids to codes. An unresolvable id is rendered as the id
  // rather than dropped — a chain with a link missing would misrepresent the
  // resolution as shorter than it was.
  const byId = listResult.ok
    ? new Map(listResult.data.map((j) => [j.jurisdiction_id, describeJurisdiction(j)]))
    : new Map<string, string>();
  const chain = packResult.data.resolved_from.map((id) => ({ id, label: byId.get(id) ?? id }));
  const subject = byId.get(jurisdictionId) ?? jurisdictionId;

  const ruleCount = packResult.data.rules?.length ?? 0;
  const inherited = chain.length > 1;

  return {
    status: "resolved",
    pack: packResult.data,
    chain,
    subject,
    message:
      ruleCount === 0
        ? `No rule applies to ${subject} at that date. That is an answer, not an empty screen — nothing has been recorded here or on any ancestor that was in force then.`
        : `${ruleCount} rule${ruleCount === 1 ? "" : "s"} applies to ${subject} at that date` +
          (inherited
            ? `, resolved across ${chain.length} jurisdictions. Where two jurisdictions declare the same rule code, the most specific one wins.`
            : `, all recorded on ${subject} itself.`),
  };
}

// ─── Rule transitions, drift, and history ────────────────────────────────────

export async function transitionRuleAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const ruleId = String(formData.get("rule_id") ?? "").trim();
  const newStatus = String(formData.get("new_status") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();

  if (!ruleId) return { status: "error", message: "Missing rule id." };
  if (!(RULE_STATUSES as readonly string[]).includes(newStatus)) {
    return { status: "error", message: `${newStatus} is not a status this registry records.` };
  }
  if (effectiveTo && !DATE_RE.test(effectiveTo)) {
    return { status: "error", message: "The end date must be a calendar date." };
  }

  const result = await transitionRule(
    ruleId, newStatus, identity, effectiveTo ? asTimestamp(effectiveTo) : undefined);

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 403) return { status: "unauthorized", message: explainJurisdictionError("forbidden") };
    return { status: "error", message: explainJurisdictionError(message) };
  }

  refresh();
  const closed = result.data.rule_status === "SUPERSEDED" || result.data.rule_status === "RETIRED";
  return {
    status: "transitioned",
    rule: result.data,
    message:
      `${result.data.rule_code} is now ${result.data.rule_status}.` +
      (closed
        ? ` It is end-dated ${result.data.effective_to ? `to ${result.data.effective_to.slice(0, 10)}` : "as of now"}, so point-in-time queries after that date resolve its replacement instead of matching both.`
        : " It now resolves into rule packs for this jurisdiction and everything nested inside it."),
  };
}

export async function recordDriftAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const ruleId = String(formData.get("rule_id") ?? "").trim();
  const driftState = String(formData.get("drift_state") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!ruleId) return { status: "error", message: "Missing rule id." };
  if (!(DRIFT_STATES as readonly string[]).includes(driftState)) {
    return { status: "error", message: `${driftState} is not a drift state this registry records.` };
  }
  // The service accepts a null reason. The console requires one: a drift entry
  // without its evidence records that a rule diverged from the law and not what
  // diverged, which is the only part anyone needs later.
  if (!reason) {
    return {
      status: "error",
      message: "A reason is required — it is the evidence for the change. Name the regulatory update that diverged from this rule, or the review conclusion that closed it.",
    };
  }

  const result = await recordDrift(ruleId, driftState, reason, identity);
  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 403) return { status: "unauthorized", message: explainJurisdictionError("forbidden") };
    return { status: "error", message: explainJurisdictionError(message) };
  }

  refresh();
  const inForce = result.data.rule_status === "ACTIVE" && result.data.legal_drift_state !== "CURRENT";
  return {
    status: "drifted",
    rule: result.data,
    message:
      `${result.data.rule_code} is now ${result.data.legal_drift_state}.` +
      (inForce
        ? " It is still ACTIVE, so it continues to resolve into rule packs — a rule can be in force and known to have diverged at the same time, and that combination is exactly what this state exists to make visible."
        : " The transition is recorded in the append-only drift history, which keeps the previous states rather than replacing them."),
  };
}

export async function loadDriftHistoryAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) return { status: "error", message: "Missing rule id." };

  const result = await getDriftEvents(ruleId);
  if (!result.ok) {
    return { status: "error", message: explainJurisdictionError(result.error.message) };
  }

  const events = result.data ?? [];
  return {
    status: "history",
    ruleId,
    events,
    message:
      events.length === 0
        ? "This rule has never changed legal drift state. The register shows its current state; this history is what shows how it got there."
        : `${events.length} recorded transition${events.length === 1 ? "" : "s"}, oldest first. The history is append-only — a correction adds an entry, it never edits one.`,
  };
}
