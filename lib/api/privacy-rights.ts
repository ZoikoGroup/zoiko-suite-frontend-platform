// Server-side API client for privacy-rights-svc (:8154) — PRV-04 of
// ZS-SVC-W-001 (Data Rights, Complaint & Disclosure Control Service).
//
// Owns case intake, identity-assurance evidence, discovery-manifest evidence,
// and enforces the DISCLOSURE GATE (§15.2): closing as FULFILLED strictly
// requires verified identity and at least one discovery manifest.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type RightFamily =
  | "ACCESS"
  | "RECTIFICATION"
  | "ERASURE"
  | "RESTRICTION"
  | "PORTABILITY"
  | "OBJECTION_WITHDRAWAL"
  | "AUTOMATED_DECISION_CHALLENGE"
  | "COMPLAINT";

export type RequestStatus = "RECEIVED" | "IDENTITY_VERIFIED" | "IN_DISCOVERY" | "CLOSED";

export type Outcome = "FULFILLED" | "REJECTED" | "WITHDRAWN";

export type RightsRequest = {
  request_id: string;
  tenant_id?: string | null;
  subject_ref: string;
  right_family: RightFamily;
  jurisdiction?: string;
  requester_ref?: string;
  submitted_via?: string;
  status: RequestStatus;
  identity_verified: boolean;
  outcome?: Outcome | null;
  response_evidence_hash?: string | null;
  response_package_version?: number;
  wfc_process_ref?: string | null;
  created_at: string;
  created_by_principal_id: string;
  closed_at?: string | null;
};

export type IdentityVerificationEvent = {
  event_id: string;
  tenant_id?: string | null;
  request_id: string;
  verified: boolean;
  method: string;
  note?: string;
  verified_by_principal_id: string;
  created_at: string;
};

export type DiscoveryManifest = {
  manifest_id: string;
  tenant_id?: string | null;
  request_id: string;
  domain: string;
  content_hash: string;
  candidate_count: number;
  evidence_ref?: string;
  submitted_by_principal_id: string;
  created_at: string;
};

export type CreateRightsRequestInput = {
  tenant_id?: string;
  subject_ref: string;
  right_family: RightFamily;
  jurisdiction?: string;
  requester_ref?: string;
  submitted_via?: string;
};

export type RecordIdentityVerificationInput = {
  verified: boolean;
  method: string;
  note?: string;
};

export type AttachDiscoveryManifestInput = {
  domain: string;
  content_hash: string;
  candidate_count: number;
  evidence_ref?: string;
};

export type CloseRightsRequestInput = {
  outcome: Outcome;
  response_evidence_hash?: string;
  reason?: string;
};

export type AttachWFCProcessRefInput = {
  wfc_process_ref: string;
};

export async function createRightsRequest(
  input: CreateRightsRequestInput,
  identity?: Identity
): Promise<ApiWriteResult<RightsRequest>> {
  return apiPost<RightsRequest>("privacyRights", "/privacy/rights-requests", input, { identity });
}

export async function getRightsRequest(
  requestId: string,
  identity?: Identity
): Promise<ApiResult<RightsRequest>> {
  return apiGet<RightsRequest>(
    "privacyRights",
    `/privacy/rights-requests/${encodeURIComponent(requestId)}`,
    { identity }
  );
}

export type IdentityVerificationResult = {
  event: IdentityVerificationEvent;
  request: RightsRequest;
};

export type AttachDiscoveryManifestResult = {
  manifest: DiscoveryManifest;
  request: RightsRequest;
};

export async function listRightsRequestsBySubject(
  subjectRef: string,
  identity?: Identity
): Promise<ApiResult<RightsRequest[]>> {
  const res = await apiGet<{ data: RightsRequest[]; count: number }>(
    "privacyRights",
    `/privacy/rights-requests?subject_ref=${encodeURIComponent(subjectRef)}`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data?.data) ? res.data.data : [] };
}

export async function recordIdentityVerification(
  requestId: string,
  input: RecordIdentityVerificationInput,
  identity?: Identity
): Promise<ApiWriteResult<IdentityVerificationResult>> {
  return apiPost<IdentityVerificationResult>(
    "privacyRights",
    `/privacy/rights-requests/${encodeURIComponent(requestId)}/identity-verification`,
    input,
    { identity }
  );
}

export async function attachDiscoveryManifest(
  requestId: string,
  input: AttachDiscoveryManifestInput,
  identity?: Identity
): Promise<ApiWriteResult<AttachDiscoveryManifestResult>> {
  return apiPost<AttachDiscoveryManifestResult>(
    "privacyRights",
    `/privacy/rights-requests/${encodeURIComponent(requestId)}/discovery-manifests`,
    input,
    { identity }
  );
}

export async function listDiscoveryManifests(
  requestId: string,
  identity?: Identity
): Promise<ApiResult<DiscoveryManifest[]>> {
  const res = await apiGet<{ data: DiscoveryManifest[]; count: number }>(
    "privacyRights",
    `/privacy/rights-requests/${encodeURIComponent(requestId)}/discovery-manifests`,
    { identity }
  );
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data?.data) ? res.data.data : [] };
}

export async function closeRightsRequest(
  requestId: string,
  input: CloseRightsRequestInput,
  identity?: Identity
): Promise<ApiWriteResult<RightsRequest>> {
  return apiPost<RightsRequest>(
    "privacyRights",
    `/privacy/rights-requests/${encodeURIComponent(requestId)}/close`,
    input,
    { identity }
  );
}

export async function attachWFCProcessRef(
  requestId: string,
  input: AttachWFCProcessRefInput,
  identity?: Identity
): Promise<ApiWriteResult<RightsRequest>> {
  return apiPost<RightsRequest>(
    "privacyRights",
    `/privacy/rights-requests/${encodeURIComponent(requestId)}/wfc-process-ref`,
    input,
    { identity }
  );
}

