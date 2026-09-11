import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

export type MechanismType =
  | "STANDARD_CONTRACTUAL_CLAUSES"
  | "BINDING_CORPORATE_RULES"
  | "ADEQUACY_DECISION"
  | "DEROGATION";

export type TransferMechanism = {
  mechanism_id: string;
  tenant_id?: string;
  mechanism_type: MechanismType;
  evidence_ref?: string;
  conditions?: string;
  valid_from: string;
  valid_until?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type RelationshipStatus = "ACTIVE" | "INACTIVE";

export type ProcessorRelationship = {
  relationship_id: string;
  tenant_id?: string;
  controller_ref: string;
  processor_ref: string;
  service: string;
  processing_instructions?: string;
  purpose_activity_refs: string[];
  data_categories: string[];
  subject_classes: string[];
  contract_evidence_ref?: string;
  jurisdictions: string[];
  status: RelationshipStatus;
  created_at: string;
  created_by_principal_id: string;
};

export type Subprocessor = {
  subprocessor_id: string;
  tenant_id?: string;
  relationship_id: string;
  provider_identity: string;
  service: string;
  purpose?: string;
  data_scope?: string;
  processing_locations: string[];
  onward_subprocessors: string[];
  notification_approval_model?: string;
  contract_evidence_ref?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type AssessmentOutcome = "APPROVE" | "REMEDIATE" | "REJECT";

export type TransferAssessment = {
  assessment_id: string;
  tenant_id?: string;
  relationship_id: string;
  outcome: AssessmentOutcome;
  reviewer_principal_id: string;
  residual_risk?: string;
  evidence_ref?: string;
  review_trigger_at?: string;
  created_at: string;
};

export type DecisionResult = "AUTHORIZED" | "BLOCKED" | "REVIEW_REQUIRED";

export type TransferDecision = {
  decision_id: string;
  tenant_id?: string;
  relationship_id: string;
  transfer_mechanism_id: string;
  destination_jurisdiction?: string;
  assessment_id?: string;
  result: DecisionResult;
  reason_codes: string[];
  actor_principal_id: string;
  correlation_id?: string;
  decided_at: string;
};

// ── Input Interfaces ─────────────────────────────────────────────────────────

export type CreateTransferMechanismInput = {
  mechanism_type: MechanismType;
  evidence_ref?: string;
  conditions?: string;
  valid_from?: string;
  valid_until?: string;
};

export type CreateProcessorRelationshipInput = {
  controller_ref: string;
  processor_ref: string;
  service: string;
  processing_instructions?: string;
  purpose_activity_refs?: string[];
  data_categories?: string[];
  subject_classes?: string[];
  contract_evidence_ref?: string;
  jurisdictions?: string[];
};

export type AttachSubprocessorInput = {
  provider_identity: string;
  service: string;
  purpose?: string;
  data_scope?: string;
  processing_locations?: string[];
  onward_subprocessors?: string[];
  notification_approval_model?: string;
  contract_evidence_ref?: string;
};

export type RecordTransferAssessmentInput = {
  relationship_id: string;
  outcome: AssessmentOutcome;
  residual_risk?: string;
  evidence_ref?: string;
  review_trigger_at?: string;
};

export type EvaluateTransferInput = {
  relationship_id: string;
  transfer_mechanism_id: string;
  destination_jurisdiction?: string;
  assessment_required: boolean;
};

function toRFC3339(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("T")) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T23:59:59Z`);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function createTransferMechanism(
  input: CreateTransferMechanismInput,
  identity: Identity
): Promise<ApiWriteResult<TransferMechanism>> {
  const body: Record<string, unknown> = {
    tenant_id: identity.tenantId,
    mechanism_type: input.mechanism_type,
  };
  if (input.evidence_ref?.trim()) body.evidence_ref = input.evidence_ref.trim();
  if (input.conditions?.trim()) body.conditions = input.conditions.trim();
  const validFromIso = toRFC3339(input.valid_from);
  if (validFromIso) body.valid_from = validFromIso;
  const validUntilIso = toRFC3339(input.valid_until);
  if (validUntilIso) body.valid_until = validUntilIso;

  return apiPost<TransferMechanism>(
    "privacyTransfer",
    "/privacy/transfer-mechanisms",
    body,
    { identity }
  );
}

export async function getTransferMechanism(
  mechanismID: string,
  identity?: Identity
): Promise<ApiResult<TransferMechanism>> {
  return apiGet<TransferMechanism>(
    "privacyTransfer",
    `/privacy/transfer-mechanisms/${encodeURIComponent(mechanismID)}`,
    { identity }
  );
}

export async function createProcessorRelationship(
  input: CreateProcessorRelationshipInput,
  identity: Identity
): Promise<ApiWriteResult<ProcessorRelationship>> {
  return apiPost<ProcessorRelationship>(
    "privacyTransfer",
    "/privacy/processor-relationships",
    {
      tenant_id: identity.tenantId,
      controller_ref: input.controller_ref,
      processor_ref: input.processor_ref,
      service: input.service,
      processing_instructions: input.processing_instructions,
      purpose_activity_refs: input.purpose_activity_refs ?? [],
      data_categories: input.data_categories ?? [],
      subject_classes: input.subject_classes ?? [],
      contract_evidence_ref: input.contract_evidence_ref,
      jurisdictions: input.jurisdictions ?? [],
    },
    { identity }
  );
}

export async function listProcessorRelationships(
  identity?: Identity
): Promise<ApiResult<{ data: ProcessorRelationship[]; count: number }>> {
  return apiGet<{ data: ProcessorRelationship[]; count: number }>(
    "privacyTransfer",
    "/privacy/processor-relationships",
    { identity }
  );
}

export async function getProcessorRelationship(
  relationshipID: string,
  identity?: Identity
): Promise<ApiResult<ProcessorRelationship>> {
  return apiGet<ProcessorRelationship>(
    "privacyTransfer",
    `/privacy/processor-relationships/${encodeURIComponent(relationshipID)}`,
    { identity }
  );
}

export async function updateRelationshipStatus(
  relationshipID: string,
  status: RelationshipStatus,
  identity: Identity
): Promise<ApiWriteResult<ProcessorRelationship>> {
  return apiPost<ProcessorRelationship>(
    "privacyTransfer",
    `/privacy/processor-relationships/${encodeURIComponent(relationshipID)}/status`,
    { status },
    { identity }
  );
}

export async function attachSubprocessor(
  relationshipID: string,
  input: AttachSubprocessorInput,
  identity: Identity
): Promise<ApiWriteResult<Subprocessor>> {
  return apiPost<Subprocessor>(
    "privacyTransfer",
    `/privacy/processor-relationships/${encodeURIComponent(relationshipID)}/subprocessors`,
    {
      provider_identity: input.provider_identity,
      service: input.service,
      purpose: input.purpose,
      data_scope: input.data_scope,
      processing_locations: input.processing_locations ?? [],
      onward_subprocessors: input.onward_subprocessors ?? [],
      notification_approval_model: input.notification_approval_model,
      contract_evidence_ref: input.contract_evidence_ref,
    },
    { identity }
  );
}

export async function listSubprocessors(
  relationshipID: string,
  identity?: Identity
): Promise<ApiResult<{ data: Subprocessor[]; count: number }>> {
  return apiGet<{ data: Subprocessor[]; count: number }>(
    "privacyTransfer",
    `/privacy/processor-relationships/${encodeURIComponent(relationshipID)}/subprocessors`,
    { identity }
  );
}

export async function recordTransferAssessment(
  input: RecordTransferAssessmentInput,
  identity: Identity
): Promise<ApiWriteResult<TransferAssessment>> {
  const body: Record<string, unknown> = {
    relationship_id: input.relationship_id,
    outcome: input.outcome,
  };
  if (input.residual_risk?.trim()) body.residual_risk = input.residual_risk.trim();
  if (input.evidence_ref?.trim()) body.evidence_ref = input.evidence_ref.trim();
  const reviewTriggerIso = toRFC3339(input.review_trigger_at);
  if (reviewTriggerIso) body.review_trigger_at = reviewTriggerIso;

  return apiPost<TransferAssessment>(
    "privacyTransfer",
    "/privacy/transfer-assessments",
    body,
    { identity }
  );
}

export async function getLatestAssessment(
  relationshipID: string,
  identity?: Identity
): Promise<ApiResult<TransferAssessment | { relationship_id: string; assessment: null }>> {
  return apiGet<TransferAssessment | { relationship_id: string; assessment: null }>(
    "privacyTransfer",
    `/privacy/transfer-assessments?relationship_id=${encodeURIComponent(relationshipID)}`,
    { identity }
  );
}

export async function evaluateTransfer(
  input: EvaluateTransferInput,
  identity: Identity
): Promise<ApiWriteResult<TransferDecision>> {
  return apiPost<TransferDecision>(
    "privacyTransfer",
    "/privacy/transfer-decisions",
    {
      tenant_id: identity.tenantId,
      relationship_id: input.relationship_id,
      transfer_mechanism_id: input.transfer_mechanism_id,
      destination_jurisdiction: input.destination_jurisdiction,
      assessment_required: input.assessment_required,
    },
    { identity }
  );
}

export async function getTransferDecision(
  decisionID: string,
  identity?: Identity
): Promise<ApiResult<TransferDecision>> {
  return apiGet<TransferDecision>(
    "privacyTransfer",
    `/privacy/transfer-decisions/${encodeURIComponent(decisionID)}`,
    { identity }
  );
}
