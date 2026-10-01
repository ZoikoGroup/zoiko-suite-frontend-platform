"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  evaluatePrivacyDecision,
  getPrivacyDecision,
  type EvaluateDecisionInput,
  type ProposedOperation,
} from "@/lib/api/privacy-decision";
import type { DecisionActionState } from "./decision-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) throw new Error("unauthenticated");
  return decoded;
}

const EXPIRED: DecisionActionState = {
  status: "error",
  message: "Session expired — please log in again.",
};

export async function evaluateDecisionAction(
  _previous: DecisionActionState,
  formData: FormData
): Promise<DecisionActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  const processingActivityId = String(formData.get("processing_activity_id") ?? "").trim();
  const purposeId = String(formData.get("purpose_id") ?? "").trim();
  const proposedOperation = String(formData.get("proposed_operation") ?? "").trim() as ProposedOperation;
  const secondaryPurposeId = String(formData.get("secondary_purpose_id") ?? "").trim();

  // Subject context
  const subjectClass = String(formData.get("subject_class") ?? "").trim();
  const ageBand = String(formData.get("age_band") ?? "").trim();
  const residency = String(formData.get("residency") ?? "").trim();

  // Data context
  const dataCategory = String(formData.get("data_category") ?? "").trim();
  const sensitivityFlagsRaw = String(formData.get("sensitivity_flags") ?? "").trim();
  const classification = String(formData.get("classification") ?? "").trim();

  // De-identification
  const deidentificationControlRef = String(formData.get("deidentification_control_ref") ?? "").trim();

  // Toggles
  const checkConsent = formData.get("check_consent") === "true";
  const checkLegalHold = formData.get("check_legal_hold") === "true";
  const legalHoldRecordClass = String(formData.get("legal_hold_record_class") ?? "").trim();
  const legalHoldEntityRef = String(formData.get("legal_hold_entity_ref") ?? "").trim();

  // Transfer
  const checkTransfer = formData.get("check_transfer") === "true";
  const transferRelationshipId = String(formData.get("transfer_relationship_id") ?? "").trim();
  const transferMechanismId = String(formData.get("transfer_mechanism_id") ?? "").trim();
  const destinationJurisdiction = String(formData.get("destination_jurisdiction") ?? "").trim();

  if (!subjectRef || !processingActivityId || !purposeId || !proposedOperation) {
    return {
      status: "error",
      message: "subject_ref, processing_activity_id, purpose_id and proposed_operation are required.",
    };
  }

  const input: EvaluateDecisionInput = {
    tenant_id: identity.tenantId,
    subject_ref: subjectRef,
    processing_activity_id: processingActivityId,
    purpose_id: purposeId,
    proposed_operation: proposedOperation,
  };

  if (secondaryPurposeId) {
    input.secondary_purpose_id = secondaryPurposeId;
  }

  if (subjectClass || ageBand || residency) {
    input.subject_context = {
      subject_ref: subjectRef,
      subject_class: subjectClass || undefined,
      age_band: ageBand || undefined,
      residency: residency || undefined,
    };
  }

  if (dataCategory || sensitivityFlagsRaw || classification) {
    const flags = sensitivityFlagsRaw
      ? sensitivityFlagsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    input.data_context = {
      data_category: dataCategory || undefined,
      data_categories: dataCategory ? [dataCategory] : undefined,
      sensitivity_flags: flags,
      classification: classification || undefined,
    };
  }

  if (deidentificationControlRef) {
    input.deidentification_control_ref = deidentificationControlRef;
  }

  if (checkConsent) {
    input.consent_check = { required: true };
  }

  if (checkLegalHold && legalHoldRecordClass) {
    input.legal_hold_check = {
      record_class: legalHoldRecordClass,
      entity_ref: legalHoldEntityRef || undefined,
    };
  }

  if (checkTransfer || proposedOperation === "EXPORT") {
    input.transfer_check = {
      relationship_id: transferRelationshipId || undefined,
      transfer_mechanism_id: transferMechanismId || undefined,
      destination_jurisdiction: destinationJurisdiction || undefined,
    };
  }

  const idempotencyKey = crypto.randomUUID();
  const res = await evaluatePrivacyDecision(input, identity, idempotencyKey);
  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to evaluate privacy decision.",
    };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Decision Evaluated: ${res.data.result}${
      res.data.reason_codes && res.data.reason_codes.length > 0
        ? ` (${res.data.reason_codes.join(", ")})`
        : " (All invariant checks passed)"
    }`,
    decision: res.data,
    decisionId: res.data.decision_id,
  };
}

export async function lookupDecisionAction(
  _previous: DecisionActionState,
  formData: FormData
): Promise<DecisionActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const decisionId = String(formData.get("decision_id") ?? "").trim();
  if (!decisionId) {
    return {
      status: "error",
      message: "Decision ID is required.",
    };
  }

  const res = await getPrivacyDecision(decisionId, identity);
  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to find privacy decision.",
    };
  }

  return {
    status: "success",
    message: `Decision Record Found: ${res.data.result}`,
    decision: res.data,
    decisionId: res.data.decision_id,
  };
}
