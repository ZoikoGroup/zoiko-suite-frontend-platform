"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createFilingRequirement,
  evaluateCompliance,
  resolveException,
  generateEvidenceManifest,
} from "@/lib/api/compliance";

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

export type ComplianceActionState = {
  ok: boolean;
  message: string;
  id?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Register a statutory filing requirement in filing-tracker-svc (lands SCHEDULED). */
export async function createFilingRequirementAction(
  formData: FormData
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const filingType = String(formData.get("filing_type") ?? "").trim();
  const filingAuthority = String(formData.get("filing_authority") ?? "").trim();
  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const periodKey = String(formData.get("period_key") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!filingType || !filingAuthority || !jurisdictionId || !periodKey) {
    return { ok: false, message: "Filing type, authority, jurisdiction, and period are required." };
  }
  if (!DATE_RE.test(dueDate)) return { ok: false, message: "The statutory due date must be a date." };

  const res = await createFilingRequirement({
    identity,
    jurisdictionId,
    filingAuthority,
    filingType,
    periodKey,
    dueDate,
    ...(notes ? { notes } : {}),
  });
  if (!res.ok) return { ok: false, message: res.error.message };

  refresh();
  return {
    ok: true,
    message: `Filing requirement ${filingType} (${periodKey}) registered — ${res.data.status}, due ${dueDate}.`,
    id: res.data.filing_id,
  };
}

/** Record a compliance evaluation; the service derives status and score. */
export async function evaluateComplianceAction(
  formData: FormData
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const domainName = String(formData.get("domain_name") ?? "").trim();
  const count = (key: string) => Number(String(formData.get(key) ?? "0").trim() || "0");
  const counts = {
    totalObligations: count("total_obligations"),
    fulfilledObligations: count("fulfilled_obligations"),
    pendingObligations: count("pending_obligations"),
    overdueObligations: count("overdue_obligations"),
    openExceptions: count("open_exceptions"),
  };

  if (!jurisdictionId || !domainName) {
    return { ok: false, message: "Jurisdiction and compliance domain are required." };
  }
  if (Object.values(counts).some((n) => !Number.isInteger(n) || n < 0)) {
    return { ok: false, message: "Each count must be a whole number, 0 or more." };
  }

  const res = await evaluateCompliance({
    identity,
    jurisdictionId,
    domainName,
    ...counts,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  if (!res.ok) return { ok: false, message: res.error.message };

  refresh();
  return {
    ok: true,
    message: `Compliance evaluated for ${domainName}: ${res.data.overall_status} (health ${Math.round(res.data.health_score)}%).`,
    id: res.data.status_id,
  };
}

/** Close an exception case with a reason. */
export async function resolveExceptionAction(
  exceptionCaseId: string,
  closureReason: string
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  if (!exceptionCaseId || !closureReason) {
    return { ok: false, message: "Exception case ID and closure reason are required." };
  }

  const res = await resolveException(exceptionCaseId, closureReason, identity);
  if (!res.ok) return { ok: false, message: res.error.message };

  refresh();
  return {
    ok: true,
    message: `Exception case ${exceptionCaseId} is now ${res.data.case_status}.`,
  };
}

export async function generateEvidenceManifestAction(
  formData: FormData
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const obligationId = String(formData.get("obligation_id") ?? "").trim();

  const res = await generateEvidenceManifest(
    {
      obligation_id: obligationId || undefined,
      legal_entity_id: identity.legalEntityId,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Evidence manifest compiled & SHA-256 verified (${res.data.checksum.slice(0, 12)}…).`,
    id: res.data.manifest_id,
  };
}
