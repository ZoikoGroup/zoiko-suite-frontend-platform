"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createRightsRequest,
  getRightsRequest,
  recordIdentityVerification,
  attachDiscoveryManifest,
  listDiscoveryManifests,
  closeRightsRequest,
  listRightsRequestsBySubject,
  attachWFCProcessRef,
  type RightFamily,
  type Outcome,
  type CreateRightsRequestInput,
  type RecordIdentityVerificationInput,
  type AttachDiscoveryManifestInput,
  type CloseRightsRequestInput,
  type AttachWFCProcessRefInput,
} from "@/lib/api/privacy-rights";
import type { RightsActionState } from "./rights-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) throw new Error("unauthenticated");
  return decoded;
}

const EXPIRED: RightsActionState = {
  status: "error",
  message: "Session expired — please log in again.",
};

export async function createRightsRequestAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  const rightFamily = String(formData.get("right_family") ?? "").trim() as RightFamily;
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const requesterRef = String(formData.get("requester_ref") ?? "").trim();
  const submittedVia = String(formData.get("submitted_via") ?? "").trim();

  if (!subjectRef || !rightFamily) {
    return {
      status: "error",
      action: "create",
      message: "subject_ref and right_family are required.",
    };
  }

  const input: CreateRightsRequestInput = {
    tenant_id: identity.tenantId,
    subject_ref: subjectRef,
    right_family: rightFamily,
    jurisdiction: jurisdiction || undefined,
    requester_ref: requesterRef || undefined,
    submitted_via: submittedVia || undefined,
  };

  const res = await createRightsRequest(input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "create",
      message: res.error.message || "Failed to intake data rights request.",
      error: res.error.message,
    };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    action: "create",
    message: `Rights Request Intake Created: ${res.data.request_id} (Status: ${res.data.status})`,
    request: res.data,
    manifests: [],
  };
}

export async function recordIdentityVerificationAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const verifiedStr = String(formData.get("verified") ?? "true").trim();
  const verified = verifiedStr === "true";
  const method = String(formData.get("method") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!requestId || !method) {
    return {
      status: "error",
      action: "verify",
      message: "request_id and method are required for identity assurance.",
    };
  }

  const input: RecordIdentityVerificationInput = {
    verified,
    method,
    note: note || undefined,
  };

  const res = await recordIdentityVerification(requestId, input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "verify",
      message: res.error.message || `Failed to record identity verification: ${res.error.message}`,
      error: res.error.message,
    };
  }

  // Fetch current manifests to preserve full context
  const manRes = await listDiscoveryManifests(requestId, identity);
  const manifests = manRes.ok && Array.isArray(manRes.data) ? manRes.data : [];

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    action: "verify",
    message: `Identity Verification Recorded: Verified=${verified ? "TRUE" : "FALSE"}, New Status=${res.data.request.status}`,
    request: res.data.request,
    manifests,
  };
}

export async function attachDiscoveryManifestAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const contentHash = String(formData.get("content_hash") ?? "").trim();
  const candidateCountRaw = formData.get("candidate_count");
  const candidateCount = candidateCountRaw !== null ? parseInt(String(candidateCountRaw), 10) : NaN;
  const evidenceRef = String(formData.get("evidence_ref") ?? "").trim();

  if (!requestId || !domain || !contentHash || isNaN(candidateCount) || candidateCount < 0) {
    return {
      status: "error",
      action: "manifest",
      message: "request_id, domain, content_hash, and candidate_count (>= 0) are required.",
    };
  }

  const input: AttachDiscoveryManifestInput = {
    domain,
    content_hash: contentHash,
    candidate_count: candidateCount,
    evidence_ref: evidenceRef || undefined,
  };

  const res = await attachDiscoveryManifest(requestId, input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "manifest",
      message: res.error.message || "Failed to attach discovery manifest.",
      error: res.error.message,
    };
  }

  // Refetch manifests to update workbench
  const manRes = await listDiscoveryManifests(requestId, identity);
  const manifests = manRes.ok && Array.isArray(manRes.data) ? manRes.data : [];

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    action: "manifest",
    message: `Discovery Manifest Attached for domain "${domain}" (${candidateCount} candidates discovered).`,
    request: res.data.request,
    manifests,
  };
}

export async function closeRightsRequestAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim() as Outcome;
  const responseEvidenceHash = String(formData.get("response_evidence_hash") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!requestId || !outcome) {
    return {
      status: "error",
      action: "close",
      message: "request_id and outcome (FULFILLED, REJECTED, WITHDRAWN) are required.",
    };
  }

  const input: CloseRightsRequestInput = {
    outcome,
    response_evidence_hash: responseEvidenceHash || undefined,
    reason: reason || undefined,
  };

  const res = await closeRightsRequest(requestId, input, identity);
  if (!res.ok) {
    // Check for disclosure gate invariants
    let friendlyMessage = res.error.message;
    if (res.error.message?.includes("identity not verified") || res.error.status === 422) {
      friendlyMessage = `§15.2 DISCLOSURE GATE REFUSAL (422): ${res.error.message}`;
    }
    return {
      status: "error",
      action: "close",
      message: friendlyMessage,
      error: res.error.message,
    };
  }

  const manRes = await listDiscoveryManifests(requestId, identity);

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    action: "close",
    message: `Case Closed: Outcome=${res.data.outcome}, Closed At=${res.data.closed_at ?? "now"}. Record is permanently immutable.`,
    request: res.data,
    manifests: manRes.ok ? manRes.data : [],
  };
}

export async function lookupRightsRequestAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) {
    return {
      status: "error",
      action: "lookup",
      message: "request_id is required.",
    };
  }

  const [reqRes, manRes] = await Promise.all([
    getRightsRequest(requestId, identity),
    listDiscoveryManifests(requestId, identity),
  ]);

  if (!reqRes.ok) {
    return {
      status: "error",
      action: "lookup",
      message: reqRes.error.message || `No rights request found for ID ${requestId}`,
    };
  }

  return {
    status: "success",
    action: "lookup",
    message: `Loaded case ${reqRes.data.request_id} [${reqRes.data.right_family}] - Status: ${reqRes.data.status}`,
    request: reqRes.data,
    manifests: manRes.ok ? manRes.data : [],
  };
}

export async function listSubjectRequestsAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  if (!subjectRef) {
    return {
      status: "error",
      action: "list_subject",
      message: "subject_ref is required.",
    };
  }

  const res = await listRightsRequestsBySubject(subjectRef, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "list_subject",
      message: res.error.message || `Failed to search requests for subject ${subjectRef}`,
    };
  }

  return {
    status: "success",
    action: "list_subject",
    message: `Found ${res.data.length} case(s) for subject "${subjectRef}"`,
    subjectRequests: res.data,
  };
}

export async function attachWFCProcessRefAction(
  _previous: RightsActionState,
  formData: FormData
): Promise<RightsActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const wfcProcessRef = String(formData.get("wfc_process_ref") ?? "").trim();

  if (!requestId || !wfcProcessRef) {
    return {
      status: "error",
      action: "wfc_ref",
      message: "request_id and wfc_process_ref are required.",
    };
  }

  const input: AttachWFCProcessRefInput = {
    wfc_process_ref: wfcProcessRef,
  };

  const res = await attachWFCProcessRef(requestId, input, identity);
  if (!res.ok) {
    return {
      status: "error",
      action: "wfc_ref",
      message: res.error.message || "Failed to attach WFC process reference.",
      error: res.error.message,
    };
  }

  // Fetch current manifests to preserve full context
  const manRes = await listDiscoveryManifests(requestId, identity);
  const manifests = manRes.ok && Array.isArray(manRes.data) ? manRes.data : [];

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    action: "wfc_ref",
    message: `WFC Process Reference Attached: ${wfcProcessRef}`,
    request: res.data,
    manifests,
  };
}
