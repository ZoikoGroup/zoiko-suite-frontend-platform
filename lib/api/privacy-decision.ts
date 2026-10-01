// Server-side API client for privacy-decision-svc (:8153) — PRV-03 of
// ZS-SVC-W-001 (Purpose Binding & Runtime Data-Use Decision Service).
//
// Evaluates data-use decisions against live state from
// PRV-01 (purpose & activity registry), PRV-02 (consent registry),
// PRV-05 (transfer service), and retention-registry-svc (legal holds).

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity, type EnvelopeOptions } from "./client";

export type ProposedOperation =
  | "COLLECT"
  | "ACCESS"
  | "USE"
  | "COMBINE"
  | "INFER"
  | "DISCLOSE"
  | "EXPORT"
  | "TRAIN_MODEL"
  | "PROFILE"
  | "RETAIN"
  | "DELETE"
  | "ANONYMIZE";

export type DecisionResult = "PERMIT" | "RESTRICT" | "BLOCK" | "REVIEW_REQUIRED" | "INDETERMINATE";

export type SubjectContextInput = {
  subject_ref?: string;
  subject_class?: string; // CUSTOMER, EMPLOYEE, PROSPECT, USER, VENDOR, MINOR
  age_band?: string; // MINOR, ADULT, SENIOR, UNKNOWN
  residency?: string;
  jurisdiction?: string;
  relationship?: string;
};

export type DataContextInput = {
  data_categories?: string[];
  data_category?: string;
  sensitivity_flags?: string[]; // SENSITIVE, SPECIAL_CATEGORY, HEALTH, BIOMETRIC, CHILD_DATA, HIGH_RISK
  source?: string; // DIRECT, DERIVED, THIRD_PARTY, PUBLIC
  classification?: string; // PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, ANONYMOUS
};

export type RecipientContextInput = {
  recipient_ref?: string;
  recipient_type?: string; // INTERNAL, THIRD_PARTY, PROCESSOR, SUBPROCESSOR, AUTHORITY
  destination_jurisdiction?: string;
  transfer_mechanism_id?: string;
};

export type TransferCheckInput = {
  relationship_id?: string;
  transfer_mechanism_id?: string;
  destination_jurisdiction?: string;
  assessment_check?: boolean;
};

export type DecisionConstraint = {
  type: string; // FIELD_MINIMIZATION, REDACTION, RECIPIENT_LIMITATION, RETENTION_CONDITION, PURPOSE_LIMITATION
  description?: string;
  parameters?: Record<string, unknown>;
};

export type ConsentCheckInput = {
  required: boolean;
  receipt_id?: string;
};

export type LegalHoldCheckInput = {
  record_class: string;
  entity_ref?: string;
};

export type EvaluateDecisionInput = {
  tenant_id?: string;
  subject_ref: string;
  processing_activity_id: string;
  activity_version_id?: string;
  purpose_id: string;
  purpose_version_id?: string;
  proposed_operation: ProposedOperation;
  subject_context?: SubjectContextInput;
  data_context?: DataContextInput;
  secondary_purpose_id?: string;
  proposed_secondary_purpose?: string;
  recipient_context?: RecipientContextInput;
  consent_check?: ConsentCheckInput;
  legal_hold_check?: LegalHoldCheckInput;
  transfer_check?: TransferCheckInput;
  deidentification_control_ref?: string;
};

export type PrivacyDecision = {
  decision_id: string;
  tenant_id?: string | null;
  input_fingerprint?: string;
  subject_ref: string;
  subject_context?: SubjectContextInput | null;
  data_context?: DataContextInput | null;
  processing_activity_id: string;
  activity_version_id?: string | null;
  purpose_id: string;
  purpose_version_id?: string | null;
  secondary_purpose_id?: string | null;
  proposed_operation: ProposedOperation;
  recipient_context?: RecipientContextInput | null;
  result: DecisionResult;
  reason_codes: string[];
  constraints?: DecisionConstraint[];
  consent_receipt_id?: string | null;
  notice_version_id?: string | null;
  legal_hold_id?: string | null;
  transfer_decision_id?: string | null;
  actor_principal_id: string;
  correlation_id?: string | null;
  decided_at: string;
};

export async function evaluatePrivacyDecision(
  input: EvaluateDecisionInput,
  identity?: Identity,
  idempotencyKey?: string
): Promise<ApiWriteResult<PrivacyDecision>> {
  const options: EnvelopeOptions = {};
  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
  }
  return apiPost<PrivacyDecision>("privacyDecision", "/privacy/decisions", input, {
    identity,
    ...options,
  });
}

export async function getPrivacyDecision(
  decisionId: string,
  identity?: Identity
): Promise<ApiResult<PrivacyDecision>> {
  return apiGet<PrivacyDecision>(
    "privacyDecision",
    `/privacy/decisions/${encodeURIComponent(decisionId)}`,
    { identity }
  );
}
