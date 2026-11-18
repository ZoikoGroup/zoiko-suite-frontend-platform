"use server";

// Server Actions for the Evidence Requirements console (evidence-requirements-svc
// :8130).
//
// Every action verifies the session itself (Server Actions are reachable by
// direct POST) and forwards the session's signed envelope. The service is
// strict about scope: the body tenant must match the verified tenant, so these
// always send the session tenant rather than anything from the form.
//
// Status mapping, everywhere (the Authorization console's, so every dialog
// reads the same):
//   401 / 403 / 409 / 412 / 422 / 428 → refused (the service decided)
//   anything else                     → error   (nothing was decided)
// A 503 is never shown as a refusal: the service declined to decide because a
// dependency could not answer, and nothing was recorded.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { needsAttention } from "@/lib/api/authorization";
import type { ApiError } from "@/lib/api/client";
import {
  commandEvidenceRequest,
  createEvidenceRequest,
  createEvidenceRequirement,
  evaluateEvidence,
  explainEvidenceError,
  explainEvidenceOutcome,
  explainUnmetReason,
  recordScanResult,
  retireEvidenceRequirement,
  type EvidenceRequestCommand,
  type PresentArtifact,
  type WriteIdentity,
} from "@/lib/api/evidence";
import type { EvidenceResult } from "./state";

const EXPIRED: EvidenceResult = { status: "signin", message: "Your session has expired — sign in again." };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

async function requireIdentity(): Promise<WriteIdentity | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) return null;
  const identity: SessionIdentity = toIdentity(session);
  return { ...identity, principalId: session.principalId, tenantId: session.tenantId };
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** datetime-local gives local time with no zone; the service wants RFC 3339. */
function rfc3339(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function version(fd: FormData): number | null {
  const v = Number(text(fd, "expected_version"));
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** The problem's machine code, which the folded message does not carry. */
function codeOf(error: ApiError): string {
  const body = error.body as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : "";
}

function fail(error: ApiError): EvidenceResult {
  const attention = needsAttention(error);
  if (attention === "step_up") return { status: "step_up", message: "Verify it's you to continue." };
  if (attention === "signin") return { status: "signin", message: "Your secure session has ended — sign in again." };
  const code = codeOf(error);
  const message = explainEvidenceError(`${code} ${error.message}`.trim());
  const refused = [401, 403, 409, 412, 422, 428].includes(error.status ?? 0);
  return {
    status: refused ? "refused" : "error",
    message,
    details: code ? [{ label: "Service code", value: code }] : undefined,
  };
}

function bad(message: string): EvidenceResult {
  return { status: "error", message };
}

/** A reason from the dialog: the chosen code, and the note when there is one. */
function reasonOf(fd: FormData): string | null {
  const code = text(fd, "reason_code");
  const note = text(fd, "reason_note");
  if (!code) return null;
  if (code === "OTHER" && !note) return null;
  return note ? `${code}: ${note}` : code;
}

// ═══ Catalogue ═══════════════════════════════════════════════════════════════

export async function addRequirementAction(_prev: EvidenceResult, fd: FormData): Promise<EvidenceResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;

  const domainCode = text(fd, "domain_code").toUpperCase();
  const actionType = text(fd, "action_type").toUpperCase();
  const evidenceType = text(fd, "evidence_type").toUpperCase();
  const entity = text(fd, "legal_entity_id");
  const minimum = Number(text(fd, "minimum_count") || "1");
  if (!CODE.test(domainCode)) return bad("Choose the business area.");
  if (!CODE.test(actionType)) return bad("Name the action in capitals, e.g. JOURNAL_POST.");
  if (!CODE.test(evidenceType)) return bad("Choose the kind of evidence.");
  if (entity && !UUID.test(entity)) return bad("The company must be a legal entity ID, or blank for every company.");
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 50) return bad("How many must be on file: a whole number from 1 to 50.");
  const startsAt = rfc3339(text(fd, "effective_from"));

  const correlationId = `evidence-req-${crypto.randomUUID().slice(0, 8)}`;
  const result = await createEvidenceRequirement({
    identity,
    domainCode,
    actionType,
    evidenceType,
    legalEntityId: entity || undefined,
    spec: {
      minimum_count: minimum,
      ...(text(fd, "artifact_subtype") ? { artifact_subtype: text(fd, "artifact_subtype").toUpperCase() } : {}),
      ...(text(fd, "description") ? { description: text(fd, "description") } : {}),
    },
    effectiveFrom: startsAt ?? undefined,
    correlationId,
    idempotencyKey: text(fd, "idempotency_key") || undefined,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  const r = result.data;
  return {
    status: "done",
    message: result.status === 201 ? "Requirement added. It gates the action from its start date." : "This requirement was already added; nothing changed.",
    details: [
      { label: "Reference", value: r.evidence_requirement_id },
      { label: "Gates", value: `${r.domain_code} · ${r.action_type}` },
      { label: "Requires", value: `${minimum} × ${r.evidence_type}` },
      { label: "Applies to", value: r.legal_entity_id ?? "Every company" },
      { label: "From", value: formatDateTime(r.effective_from) },
    ],
  };
}

export async function retireRequirementAction(_prev: EvidenceResult, fd: FormData): Promise<EvidenceResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const id = text(fd, "id");
  const v = version(fd);
  const reason = reasonOf(fd);
  if (!id) return bad("Nothing was selected.");
  if (!v) return bad("The record's version is missing — reload the page and try again.");
  if (!reason) return bad("Choose a reason (and say what it is when you choose Other).");
  const endsAt = rfc3339(text(fd, "effective_to"));
  const result = await retireEvidenceRequirement({ identity, requirementId: id, reason, version: v, effectiveTo: endsAt ?? undefined });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "done",
    message: "Requirement withdrawn. It stays on record, so decisions made under it remain explicable.",
    details: [
      { label: "Ends", value: formatDateTime(result.data.effective_to ?? "") },
      { label: "Reason", value: reason },
      { label: "Version", value: `v${result.data.record_version}` },
    ],
  };
}

// ═══ Check evidence ══════════════════════════════════════════════════════════

/** One artifact per line: "TYPE reference [subtype]". */
function readArtifacts(raw: string): PresentArtifact[] | string {
  const out: PresentArtifact[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [type, ref, subtype] = line.split(/\s+/);
    if (!type || !CODE.test(type.toUpperCase())) return `“${line}” does not start with an evidence type such as SUPPORTING_DOCUMENT.`;
    if (!ref) return `“${line}” names no reference.`;
    out.push({ evidence_type: type.toUpperCase(), reference_id: ref, ...(subtype ? { artifact_subtype: subtype.toUpperCase() } : {}) });
  }
  return out;
}

export async function checkEvidenceAction(_prev: EvidenceResult, fd: FormData): Promise<EvidenceResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const entity = text(fd, "legal_entity_id");
  const domainCode = text(fd, "domain_code").toUpperCase();
  const actionType = text(fd, "action_type").toUpperCase();
  if (!UUID.test(entity)) return bad("The company must be a legal entity ID.");
  if (!CODE.test(domainCode) || !CODE.test(actionType)) return bad("Name the business area and the action in capitals.");
  const artifacts = readArtifacts(text(fd, "artifacts"));
  if (typeof artifacts === "string") return bad(artifacts);

  const result = await evaluateEvidence({
    identity,
    legalEntityId: entity,
    domainCode,
    actionType,
    presentArtifacts: artifacts,
    correlationId: `evidence-check-${crypto.randomUUID().slice(0, 8)}`,
    idempotencyKey: text(fd, "idempotency_key") || undefined,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  const r = result.data;
  const unmet = r.unmet ?? [];
  const outcome = explainEvidenceOutcome(r.outcome, unmet.length);
  return {
    // MISSING is a verdict, not a failure of the check: shown as refused
    // (amber, "the control working"), never as done.
    status: outcome.kind === "satisfied" ? "done" : outcome.kind === "missing" ? "refused" : "pending",
    message: `${outcome.headline}. ${outcome.meaning}`,
    details: [
      { label: "Outcome", value: r.outcome },
      { label: "Evaluation", value: r.evaluation_id },
      { label: "Recorded", value: formatDateTime(r.evaluated_at) },
    ],
    table: unmet.length
      ? {
          headers: ["Evidence", "What is short"],
          rows: unmet.map((u) => {
            const e = explainUnmetReason(u.reason, u.evidence_type);
            return [u.evidence_type, [e.headline, e.rejected, e.description].filter(Boolean).join(" — ")];
          }),
        }
      : undefined,
  };
}

// ═══ Evidence requests (PBC) ═════════════════════════════════════════════════

export async function newEvidenceRequestAction(_prev: EvidenceResult, fd: FormData): Promise<EvidenceResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const entity = text(fd, "legal_entity_id");
  const title = text(fd, "title");
  const assignee = text(fd, "assigned_to");
  const due = rfc3339(text(fd, "due_at"));
  const requirement = text(fd, "requirement_id");
  if (!UUID.test(entity)) return bad("The company must be a legal entity ID.");
  if (!title) return bad("Give the request a title.");
  if (!assignee) return bad("Name the person who should provide the evidence.");
  if (!due) return bad("Choose when the evidence is due.");
  if (requirement && !UUID.test(requirement)) return bad("The requirement reference must be a requirement ID, or blank.");

  const correlationId = text(fd, "idempotency_key") || `evidence-pbc-${crypto.randomUUID().slice(0, 8)}`;
  const result = await createEvidenceRequest({
    identity,
    legalEntityId: entity,
    title,
    description: text(fd, "description"),
    assignedTo: assignee,
    dueAt: due,
    requirementId: requirement || undefined,
    correlationId,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "done",
    message: result.status === 201 ? "Evidence request drafted. Send it when it is ready." : "This request was already drafted; nothing changed.",
    details: [
      { label: "Reference", value: result.data.request_id },
      { label: "Due", value: formatDateTime(result.data.due_at) },
      { label: "Status", value: result.data.status },
    ],
  };
}

const REQUEST_DONE: Record<EvidenceRequestCommand, string> = {
  send: "Sent to the person named on it.",
  reassign: "Reassigned.",
  "extend-due-date": "Due date moved.",
  clarify: "Clarification requested from the contributor.",
  "mark-satisfied": "Marked satisfied.",
  close: "Closed. It stays on record.",
};

export async function requestCommandAction(_prev: EvidenceResult, fd: FormData): Promise<EvidenceResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const command = text(fd, "command") as EvidenceRequestCommand;
  const id = text(fd, "id");
  const v = version(fd);
  if (!(command in REQUEST_DONE)) return bad("Unknown action.");
  if (!id) return bad("Nothing was selected.");
  if (!v) return bad("The record's version is missing — reload the page and try again.");

  let body: Record<string, unknown> = {};
  switch (command) {
    case "reassign": {
      const to = text(fd, "new_assignee_principal_id");
      if (!to) return bad("Name the person to reassign it to.");
      body = { new_assignee_principal_id: to };
      break;
    }
    case "extend-due-date": {
      const due = rfc3339(text(fd, "new_due_at"));
      if (!due) return bad("Choose the new due date.");
      body = { new_due_at: due };
      break;
    }
    case "clarify": {
      const reason = reasonOf(fd);
      if (!reason) return bad("Say what needs clarifying (choose a reason, and explain when you choose Other).");
      body = { reason };
      break;
    }
  }
  const result = await commandEvidenceRequest({
    identity,
    requestId: id,
    command,
    version: v,
    body,
    correlationId: `evidence-pbc-${command}-${crypto.randomUUID().slice(0, 8)}`,
  });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "done",
    message: REQUEST_DONE[command],
    details: [
      { label: "Status", value: result.data.status },
      { label: "Version", value: `v${result.data.record_version}` },
    ],
  };
}

export async function scanResultAction(_prev: EvidenceResult, fd: FormData): Promise<EvidenceResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const responseId = text(fd, "response_id");
  const outcome = text(fd, "result");
  if (!UUID.test(responseId)) return bad("The response reference must be a response ID.");
  if (outcome !== "CLEAN" && outcome !== "QUARANTINED") return bad("Choose CLEAN or QUARANTINED.");
  const result = await recordScanResult({ identity, responseId, result: outcome });
  if (!result.ok) return fail(result.error);
  refresh();
  return {
    status: "done",
    message: outcome === "CLEAN" ? "Recorded as clean. The request can now be marked satisfied by a reviewer." : "Recorded as quarantined. The request keeps its status.",
  };
}
