"use server";

// Server Actions for governance-decision-log-svc (:8083).
//
// Server Actions are reachable by direct POST, not only through this UI, so
// the session is verified inside every action. The service authorizes every
// write itself (GOVERNANCE_DECISION_RECORD / _REPLAY, GOVERNANCE_EVIDENCE_SEAL)
// and fails closed; the console only relays its answer, in words.
//
// Every action returns the AuthzResult shape so the shared ActionDialog can
// show it (done / refused / error / signin).

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { ApiError } from "@/lib/api/client";
import {
  PRIORITIES,
  decisionTitle,
  explainDecisionError,
  recordDecision,
  replayDecision,
  sealPackage,
  statusView,
  verifyChain,
  verifyPackage,
} from "@/lib/api/governance";
import type { AuthzResult } from "@/app/admin/authorization/state";

const EXPIRED: AuthzResult = { status: "signin", message: "Your session has expired — sign in again." };

async function requireIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) return null;
  return toIdentity(session);
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function fail(error: ApiError): AuthzResult {
  if (error.status === 401) return { status: "signin", message: "The ledger did not recognise your session — sign in again." };
  const refused = error.status === 403 || error.status === 404 || error.status === 409 || error.status === 400 || error.status === 501;
  return { status: refused ? "refused" : "error", message: explainDecisionError(error) };
}

function short(hash: string | undefined): string {
  return hash ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : "—";
}

/**
 * Record a decision — a new one, or a follow-up of an earlier one when the
 * form carries causation_id (the drawer's "Record follow-up").
 */
export async function recordDecisionAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;

  const actionType = text(fd, "action_type").toUpperCase().replace(/\s+/g, "_");
  const outcome = text(fd, "outcome").toUpperCase();
  const ruleBasis = text(fd, "rule_basis");
  const legalEntityId = text(fd, "legal_entity_id") || identity.legalEntityId || "";
  const priority = text(fd, "priority").toUpperCase();
  if (!actionType) return { status: "error", message: "Say what kind of action was decided (action type)." };
  if (!outcome) return { status: "error", message: "Choose the outcome." };
  if (!ruleBasis) return { status: "error", message: "A rule basis is required — an outcome without its basis is not evidence." };
  if (!legalEntityId) return { status: "error", message: "Choose the legal entity the decision belongs to." };
  if (priority && !(PRIORITIES as string[]).includes(priority)) return { status: "error", message: "Choose a priority from the list." };

  let evaluationContext: unknown;
  const contextRaw = text(fd, "evaluation_context");
  if (contextRaw) {
    try {
      evaluationContext = JSON.parse(contextRaw);
    } catch {
      return { status: "error", message: "Evaluation context must be valid JSON, or left blank." };
    }
  }
  let decidedAt: string | undefined;
  const decidedRaw = text(fd, "decided_at");
  if (decidedRaw) {
    const d = new Date(decidedRaw);
    if (Number.isNaN(d.getTime())) return { status: "error", message: "The decision date is not a valid date." };
    decidedAt = d.toISOString();
  }
  const tags = [...new Set(text(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean))];

  const result = await recordDecision(
    {
      actionType,
      outcome,
      ruleBasis,
      legalEntityId,
      title: text(fd, "title") || undefined,
      summary: text(fd, "summary") || undefined,
      domain: text(fd, "domain") || undefined,
      priority: priority || undefined,
      tags,
      jurisdiction: text(fd, "jurisdiction") || undefined,
      relatedObligationId: text(fd, "related_obligation_id") || undefined,
      subjectType: text(fd, "subject_type") || undefined,
      subjectId: text(fd, "subject_id") || undefined,
      causationId: text(fd, "causation_id") || undefined,
      evaluationContext,
      decidedAt,
    },
    identity,
  );
  if (!result.ok) return fail(result.error);
  refresh();
  const d = result.data;
  const followUp = !!d.causation_id;
  return {
    status: "done",
    message:
      result.status === 201
        ? `${followUp ? "Follow-up recorded" : "Decision recorded"} as ${d.display_ref}. It is now immutable and linked into the evidence chain.`
        : `This exact decision was already recorded as ${d.display_ref}; nothing new was written.`,
    details: [
      { label: "Reference", value: d.display_ref },
      { label: "Decision", value: decisionTitle(d) },
      { label: "Status", value: statusView(d).label },
      { label: "Domain", value: d.domain },
      ...(followUp ? [{ label: "Follows up", value: d.causation_id ?? "" }] : []),
      { label: "Chain position", value: `#${d.chain_seq}` },
      { label: "Chain hash", value: short(d.curr_hash) },
    ],
  };
}

/** Re-evaluate a decision against the exact policy version it used. */
export async function replayDecisionAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const decisionId = text(fd, "decision_id");
  if (!decisionId) return { status: "error", message: "No decision to replay." };
  const result = await replayDecision(decisionId, identity);
  if (!result.ok) return fail(result.error);
  refresh();
  const m = result.data;
  return {
    status: "done",
    message: m.outcomes_match
      ? "The replay reproduced the recorded outcome. The manifest is now part of the record."
      : "The replay did NOT reproduce the recorded outcome. The mismatch is recorded in the manifest for review.",
    details: [
      { label: "Original outcome", value: m.original_outcome },
      { label: "Replayed outcome", value: m.replayed_outcome },
      { label: "Reproduced", value: m.outcomes_match ? "Yes" : "No" },
      { label: "Policy version", value: m.policy_version_id },
      { label: "Replayed", value: formatDateTime(m.replayed_at) },
    ],
  };
}

/** Seal the chain (through a decision, or to the head) into a package. */
export async function sealPackageAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const result = await sealPackage(
    { throughDecisionId: text(fd, "through_decision_id") || undefined, label: text(fd, "label") || undefined, reason: text(fd, "reason") || undefined },
    identity,
  );
  if (!result.ok) return fail(result.error);
  refresh();
  const p = result.data;
  return {
    status: "done",
    message: `Package #${p.package_seq} sealed decisions 1–${p.to_seq}. Re-verifying it later proves none of them changed.`,
    details: [
      { label: "Package", value: p.package_id },
      { label: "Decisions sealed", value: String(p.leaf_count) },
      { label: "Merkle root", value: short(p.merkle_root) },
      { label: "Package hash", value: short(p.package_hash) },
      { label: "Sealed", value: formatDateTime(p.sealed_at) },
    ],
  };
}

/** Re-compute every link and every package of the tenant's chain. */
export async function verifyChainAction(_prev: AuthzResult, _fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const result = await verifyChain(identity);
  if (!result.ok) return fail(result.error);
  const v = result.data;
  const brokenPackages = v.packages.filter((p) => !p.valid);
  return {
    status: v.valid ? "done" : "refused",
    message: v.valid
      ? `All ${v.decisions_checked} decisions and ${v.packages_checked} sealed package(s) re-compute. The ledger is intact.`
      : v.first_break
        ? `The chain breaks at decision #${v.first_break.chain_seq} (${v.first_break.reason.replaceAll("_", " ").toLowerCase()}). Treat everything from there as unverified.`
        : `Every link re-computes, but ${brokenPackages.length} sealed package(s) do not: decisions were rewritten after they were sealed.`,
    details: [
      { label: "Decisions checked", value: String(v.decisions_checked) },
      { label: "Head", value: v.head_seq ? `#${v.head_seq}` : "—" },
      { label: "Head hash", value: short(v.head_hash) },
      { label: "Packages checked", value: String(v.packages_checked) },
      { label: "Verified", value: formatDateTime(v.verified_at) },
    ],
    table: v.packages.length
      ? {
          headers: ["Package", "Sealed through", "Result"],
          rows: v.packages.map((p) => [`#${p.package_seq}`, `#${p.to_seq}`, p.valid ? "Verifies" : (p.reason ?? "Fails")]),
        }
      : undefined,
  };
}

/** Re-compute one sealed package. */
export async function verifyPackageAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const packageId = text(fd, "package_id");
  const result = await verifyPackage(packageId, identity);
  if (!result.ok) return fail(result.error);
  const c = result.data;
  return {
    status: c.valid ? "done" : "refused",
    message: c.valid
      ? `Package #${c.package_seq} verifies: decisions 1–${c.to_seq} are exactly as they were when sealed.`
      : `Package #${c.package_seq} does NOT verify (${(c.reason ?? "").replaceAll("_", " ").toLowerCase()}): the sealed decisions were changed.`,
    details: [
      { label: "Sealed through", value: `#${c.to_seq}` },
      { label: "Recomputed root", value: short(c.recomputed_root) },
    ],
  };
}
