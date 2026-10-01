// Server-side API client for privacy-purpose-registry-svc (:8151) — PRV-01,
// the registry of lawful-processing purposes and processing activities
// (GDPR Article 30 "Record of Processing Activities"/ROPA) that the other
// privacy services (consent, transfer, rights) validate against.
//
// Field names and routes mirror the real service's domain types exactly
// (services/privacy-purpose-registry-svc/internal/domain/types.go) — this
// service previously had zero frontend wiring at all (only a config.ts
// entry nobody imported, and a decorative label string on the Transfer
// workbench that never called it).

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

// ── Purposes ──────────────────────────────────────────────────────────────────

export type PurposeVersionStatus = "DRAFT" | "PUBLISHED";

export type PurposeVersion = {
  purpose_version_id: string;
  purpose_id: string;
  statement: string;
  compatibility_class: string;
  lawful_basis_refs: string[];
  version_status: PurposeVersionStatus;
  effective_from: string;
  supersedes_version_id?: string;
  created_at: string;
  created_by_principal_id: string;
};

export async function listPurposes(identity?: Identity): Promise<ApiResult<{ data: PurposeVersion[]; count: number }>> {
  return apiGet<{ data: PurposeVersion[]; count: number }>("privacyPurposeRegistry", "/privacy/purposes", { identity });
}

export async function getPurpose(purposeId: string, identity?: Identity): Promise<ApiResult<PurposeVersion>> {
  return apiGet<PurposeVersion>(
    "privacyPurposeRegistry",
    `/privacy/purposes/${encodeURIComponent(purposeId)}`,
    { identity }
  );
}

export type CreatePurposeInput = {
  statement: string;
  compatibility_class: string;
  lawful_basis_refs: string[];
  effective_from?: string;
};

export async function createPurpose(
  input: CreatePurposeInput,
  identity: Identity
): Promise<ApiWriteResult<PurposeVersion>> {
  const body: Record<string, unknown> = {
    tenant_id: identity.tenantId,
    statement: input.statement,
    compatibility_class: input.compatibility_class,
    lawful_basis_refs: input.lawful_basis_refs,
  };
  if (input.effective_from) body.effective_from = new Date(input.effective_from).toISOString();
  return apiPost<PurposeVersion>("privacyPurposeRegistry", "/privacy/purposes", body, { identity });
}

export async function publishPurposeVersion(
  purposeId: string,
  versionId: string,
  identity: Identity
): Promise<ApiWriteResult<PurposeVersion>> {
  return apiPost<PurposeVersion>(
    "privacyPurposeRegistry",
    `/privacy/purposes/${encodeURIComponent(purposeId)}/versions/${encodeURIComponent(versionId)}/publish`,
    {},
    { identity }
  );
}

// ── Processing Activities ─────────────────────────────────────────────────────

export type PrivacyRole = "CONTROLLER" | "PROCESSOR" | "JOINT_CONTROLLER";
export type NoticeConsentDependency = "REQUIRED" | "NOT_REQUIRED" | "CONDITIONAL";
export type DPIATIAStatus = "RESOLVED" | "REVIEW_REQUIRED" | "NOT_REQUIRED";

export type ActivityVersionStatus =
  | "DRAFT"
  | "VALIDATED"
  | "SUBMITTED"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | "RETIRED";

export type ValidationFinding = { code: string; field: string; message: string };

export type ProcessingActivityVersion = {
  activity_version_id: string;
  activity_id: string;
  privacy_role: PrivacyRole;
  owner: string;
  purpose_ids: string[];
  subject_classes: string[];
  data_categories: string[];
  sources: string[];
  recipients: string[];
  jurisdictions: string[];
  retention_rule_refs: string[];
  transfer_refs: string[];
  notice_consent_dependency?: NoticeConsentDependency;
  dpia_tia_status?: DPIATIAStatus;
  version_status: ActivityVersionStatus;
  validation_findings?: ValidationFinding[];
  rejection_reason?: string;
  effective_from?: string;
  supersedes_version_id?: string;
  created_at: string;
  created_by_principal_id: string;
};

export async function listROPA(
  filters: { role?: string; jurisdiction?: string } = {},
  identity?: Identity
): Promise<ApiResult<{ data: ProcessingActivityVersion[]; count: number }>> {
  return apiGet<{ data: ProcessingActivityVersion[]; count: number }>("privacyPurposeRegistry", "/privacy/ropa", {
    identity,
    query: { role: filters.role, jurisdiction: filters.jurisdiction },
  });
}

export async function getActivityVersion(
  activityId: string,
  versionId: string,
  identity?: Identity
): Promise<ApiResult<ProcessingActivityVersion>> {
  return apiGet<ProcessingActivityVersion>(
    "privacyPurposeRegistry",
    `/privacy/processing-activities/${encodeURIComponent(activityId)}/versions/${encodeURIComponent(versionId)}`,
    { identity }
  );
}

export type CreateActivityInput = {
  privacy_role: PrivacyRole;
  owner: string;
  purpose_ids: string[];
  subject_classes: string[];
  data_categories: string[];
  sources: string[];
  recipients: string[];
  jurisdictions: string[];
  retention_rule_refs: string[];
  transfer_refs: string[];
  notice_consent_dependency?: NoticeConsentDependency;
  dpia_tia_status?: DPIATIAStatus;
};

function activityBody(input: CreateActivityInput, tenantId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tenant_id: tenantId,
    privacy_role: input.privacy_role,
    owner: input.owner,
    purpose_ids: input.purpose_ids,
    subject_classes: input.subject_classes,
    data_categories: input.data_categories,
    sources: input.sources,
    recipients: input.recipients,
    jurisdictions: input.jurisdictions,
    retention_rule_refs: input.retention_rule_refs,
    transfer_refs: input.transfer_refs,
  };
  if (input.notice_consent_dependency) body.notice_consent_dependency = input.notice_consent_dependency;
  if (input.dpia_tia_status) body.dpia_tia_status = input.dpia_tia_status;
  return body;
}

export async function createActivity(
  input: CreateActivityInput,
  identity: Identity
): Promise<ApiWriteResult<ProcessingActivityVersion>> {
  return apiPost<ProcessingActivityVersion>(
    "privacyPurposeRegistry",
    "/privacy/processing-activities",
    activityBody(input, identity.tenantId),
    { identity }
  );
}

type ActivityTransition = "validate" | "submit" | "approve" | "suspend" | "resume" | "retire";

async function transitionActivity(
  activityId: string,
  versionId: string,
  action: ActivityTransition,
  identity: Identity
): Promise<ApiWriteResult<ProcessingActivityVersion>> {
  return apiPost<ProcessingActivityVersion>(
    "privacyPurposeRegistry",
    `/privacy/processing-activities/${encodeURIComponent(activityId)}/versions/${encodeURIComponent(versionId)}/${action}`,
    {},
    { identity }
  );
}

export const validateActivityVersion = (activityId: string, versionId: string, identity: Identity) =>
  transitionActivity(activityId, versionId, "validate", identity);
export const submitActivityVersion = (activityId: string, versionId: string, identity: Identity) =>
  transitionActivity(activityId, versionId, "submit", identity);
export const approveActivityVersion = (activityId: string, versionId: string, identity: Identity) =>
  transitionActivity(activityId, versionId, "approve", identity);
export const suspendActivityVersion = (activityId: string, versionId: string, identity: Identity) =>
  transitionActivity(activityId, versionId, "suspend", identity);
export const resumeActivityVersion = (activityId: string, versionId: string, identity: Identity) =>
  transitionActivity(activityId, versionId, "resume", identity);
export const retireActivityVersion = (activityId: string, versionId: string, identity: Identity) =>
  transitionActivity(activityId, versionId, "retire", identity);

export async function rejectActivityVersion(
  activityId: string,
  versionId: string,
  reason: string,
  identity: Identity
): Promise<ApiWriteResult<ProcessingActivityVersion>> {
  return apiPost<ProcessingActivityVersion>(
    "privacyPurposeRegistry",
    `/privacy/processing-activities/${encodeURIComponent(activityId)}/versions/${encodeURIComponent(versionId)}/reject`,
    { reason },
    { identity }
  );
}

export async function activateActivityVersion(
  activityId: string,
  versionId: string,
  effectiveFrom: string | undefined,
  identity: Identity
): Promise<ApiWriteResult<ProcessingActivityVersion>> {
  const body: Record<string, unknown> = {};
  if (effectiveFrom) body.effective_from = new Date(effectiveFrom).toISOString();
  return apiPost<ProcessingActivityVersion>(
    "privacyPurposeRegistry",
    `/privacy/processing-activities/${encodeURIComponent(activityId)}/versions/${encodeURIComponent(versionId)}/activate`,
    body,
    { identity }
  );
}
