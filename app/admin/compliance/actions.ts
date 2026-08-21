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

export async function createFilingRequirementAction(
  formData: FormData
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const filingName = String(formData.get("filing_name") ?? "").trim();
  const authorityName = String(formData.get("authority_name") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "jur-uk-gb").trim();
  const frequency = String(formData.get("frequency") ?? "ANNUAL").trim();

  if (!filingName || !authorityName || !dueDate) {
    return { ok: false, message: "Filing name, authority name, and statutory due date are required." };
  }

  const res = await createFilingRequirement(
    {
      filing_name: filingName,
      authority_name: authorityName,
      due_date: dueDate,
      jurisdiction_id: jurisdictionId,
      frequency,
      legal_entity_id: identity.legalEntityId,
      status: "OPEN",
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Filing requirement "${filingName}" registered in filing-tracker-svc.`,
    id: res.data.requirement_id,
  };
}

export async function evaluateComplianceAction(
  formData: FormData
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "jur-uk-gb").trim();

  const res = await evaluateCompliance(
    {
      legal_entity_id: identity.legalEntityId,
      jurisdiction_id: jurisdictionId,
    },
    identity
  );

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Compliance evaluated for entity: Status ${res.data.overall_status} (Score: ${res.data.score_percentage}%).`,
    id: res.data.evaluation_id,
  };
}

export async function resolveExceptionAction(
  exceptionId: string,
  resolutionNote: string
): Promise<ComplianceActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ok: false, message: "Your session has expired — sign in again." };
  }

  if (!exceptionId || !resolutionNote) {
    return { ok: false, message: "Exception ID and resolution note are required." };
  }

  const res = await resolveException(exceptionId, resolutionNote, identity);

  if (!res.ok) {
    return { ok: false, message: res.error.message };
  }

  refresh();
  return {
    ok: true,
    message: `Exception ${exceptionId} resolved in exception-escalation-svc.`,
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
