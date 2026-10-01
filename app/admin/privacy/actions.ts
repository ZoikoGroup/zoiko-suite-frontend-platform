"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  recordConsent,
  withdrawConsent,
  getConsentStatus,
  setPreference,
  createNotice,
  approveNotice,
  publishNotice,
  withdrawNotice,
  recordPresentationReceipt,
  type ConsentAction,
} from "@/lib/api/privacy-consent";
import type { LookupState } from "@/components/admin/shared/lookup";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type ConsentActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  receiptId?: string;
  data?: Record<string, unknown>;
};

export async function createNoticeAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const locale = String(formData.get("locale") ?? "en-GB").trim();
  const audience = String(formData.get("audience") ?? "CUSTOMERS").trim();
  const contentHash = String(formData.get("content_hash") ?? "").trim() || "sha256-notice-v1-standard";

  const res = await createNotice({ locale, audience, content_hash: contentHash }, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to create privacy notice." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Privacy notice registered on privacy-consent-svc (:8152)! Notice ID: ${res.data.notice_id}`,
    data: { notice_id: res.data.notice_id },
  };
}

export async function approveNoticeAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const noticeId = String(formData.get("notice_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!noticeId) return { status: "error", message: "Notice ID is required." };

  const res = await approveNotice(noticeId, identity, versionId || undefined);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to approve notice version (Maker cannot self-approve; requires SoD)." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Notice version approved successfully (APPROVED status)! Version ID: ${res.data.notice_version_id}`,
    data: { notice_version_id: res.data.notice_version_id },
  };
}

export async function publishNoticeAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const noticeId = String(formData.get("notice_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!noticeId) return { status: "error", message: "Notice ID is required." };

  const res = await publishNotice(noticeId, identity, versionId || undefined);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to publish notice version (Maker or Approver cannot publish; requires SoD)." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Notice version published successfully (PUBLISHED status)! Prior version superseded. Version ID: ${res.data.notice_version_id}`,
    data: { notice_version_id: res.data.notice_version_id },
  };
}

export async function withdrawNoticeAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const noticeId = String(formData.get("notice_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!noticeId) return { status: "error", message: "Notice ID is required." };

  const res = await withdrawNotice(noticeId, identity, versionId || undefined);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to withdraw notice version." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Notice version withdrawn successfully (WITHDRAWN status)! Version ID: ${res.data.notice_version_id}`,
    data: { notice_version_id: res.data.notice_version_id },
  };
}

export async function recordPresentationReceiptAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const noticeId = String(formData.get("notice_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  const channel = String(formData.get("channel") ?? "WEB").trim();
  const locale = String(formData.get("locale") ?? "en-GB").trim();
  const sessionRef = String(formData.get("session_ref") ?? "").trim();
  const templateVersion = String(formData.get("template_version") ?? "").trim();
  const deliveryEvidence = String(formData.get("delivery_evidence") ?? "").trim();

  if (!noticeId || !subjectRef) return { status: "error", message: "Notice ID and Subject Reference are required." };

  const res = await recordPresentationReceipt(
    noticeId,
    {
      subject_ref: subjectRef,
      channel,
      locale,
      session_ref: sessionRef || undefined,
      template_version: templateVersion || undefined,
      delivery_evidence: deliveryEvidence || undefined,
    },
    identity,
    versionId || undefined
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to record presentation receipt." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Presentation receipt recorded! ID: ${res.data.presentation_receipt_id}`,
    data: { presentation_receipt_id: res.data.presentation_receipt_id },
  };
}

export async function recordConsentAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  const purposeId = String(formData.get("purpose_id") ?? "").trim();
  const action = String(formData.get("action") ?? "GRANTED").trim() as ConsentAction;
  const channel = String(formData.get("capture_channel") ?? "WEB_PORTAL").trim();
  const noticeVersionId = String(formData.get("notice_version_id") ?? "").trim();

  // Proxy / Authorized Representative fields (§11.1)
  const isProxy = formData.get("is_proxy") === "true" || formData.get("is_proxy") === "on";
  const repSubject = String(formData.get("representative_subject_ref") ?? "").trim();
  const repAuthority = String(formData.get("representative_authority_ref") ?? "").trim();
  const repEvidence = String(formData.get("representative_evidence") ?? "").trim();

  // Affirmative Action Evidence fields (§10.1)
  const affAction = String(formData.get("affirmative_action_type") ?? "EXPLICIT_CHECKBOX").trim();
  const affEvidence = String(formData.get("affirmative_evidence") ?? "").trim();

  if (!subjectRef) return { status: "error", message: "Data Subject Reference is required." };
  if (!purposeId) return { status: "error", message: "Purpose ID is required." };

  if (isProxy && (!repSubject || !repAuthority)) {
    return {
      status: "error",
      message: "Representative Subject Reference and Representative Authority Reference are mandatory when acting as Proxy (§11.1).",
    };
  }

  const res = await recordConsent(
    {
      subject_ref: subjectRef,
      purpose_id: purposeId,
      action,
      capture_channel: channel,
      notice_version_id: noticeVersionId || undefined,
      is_proxy: isProxy,
      representative_subject_ref: repSubject || undefined,
      representative_authority_ref: repAuthority || undefined,
      representative_evidence: repEvidence || undefined,
      affirmative_action_type: affAction,
      affirmative_evidence: affEvidence || undefined,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to record consent." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    receiptId: res.data.consent_receipt_id,
    message: `Consent ${action} captured in append-only log on :8152! Receipt ID: ${res.data.consent_receipt_id}${res.data.is_proxy ? " (Authorized Proxy Preserved)" : ""}`,
    data: {
      consent_receipt_id: res.data.consent_receipt_id,
      subject_ref: res.data.subject_ref,
      action: res.data.action,
      created_at: res.data.created_at,
      is_proxy: res.data.is_proxy,
    },
  };
}

export async function withdrawConsentAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const receiptId = String(formData.get("consent_receipt_id") ?? "").trim();
  const channel = String(formData.get("channel") ?? "CUSTOMER_SETTINGS").trim();

  if (!receiptId) return { status: "error", message: "Consent Receipt ID is required." };

  const res = await withdrawConsent(receiptId, channel, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to withdraw consent." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Consent successfully withdrawn! Withdrawal Receipt: ${res.data.withdrawal_receipt_id}. Original receipt is preserved untouched in immutable history.`,
    data: { withdrawal_receipt_id: res.data.withdrawal_receipt_id },
  };
}

export async function lookupConsentStatus(
  _previous: LookupState,
  formData: FormData
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  const purposeId = String(formData.get("purpose_id") ?? "").trim();

  if (!subjectRef || !purposeId) {
    return { status: "error", message: "Both Subject Reference and Purpose ID are required." };
  }

  const res = await getConsentStatus(subjectRef, purposeId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to resolve consent status." };
  }

  return {
    status: "found",
    record: res.data,
    message: `Resolved consent status from privacy-consent-svc (:8152): ${res.data.status}`,
  };
}

export async function setPreferenceAction(
  _previous: ConsentActionState,
  formData: FormData
): Promise<ConsentActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const subjectRef = String(formData.get("subject_ref") ?? "").trim();
  const channelOrPurpose = String(formData.get("channel_or_purpose") ?? "MARKETING_EMAIL").trim();
  const value = String(formData.get("value") ?? "ENABLED").trim();
  const source = String(formData.get("source") ?? "PORTAL_PREFERENCES").trim();

  if (!subjectRef) return { status: "error", message: "Subject Reference is required." };

  const res = await setPreference(
    {
      subject_ref: subjectRef,
      channel_or_purpose: channelOrPurpose,
      value,
      source,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to set preference." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Preference assertion recorded in privacy-consent-svc (:8152)! ID: ${res.data.preference_assertion_id}`,
    data: { preference_assertion_id: res.data.preference_assertion_id },
  };
}
