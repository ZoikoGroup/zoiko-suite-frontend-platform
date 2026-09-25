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

  if (!subjectRef) return { status: "error", message: "Data Subject Reference is required." };
  if (!purposeId) return { status: "error", message: "Purpose ID is required." };

  const res = await recordConsent(
    {
      subject_ref: subjectRef,
      purpose_id: purposeId,
      action,
      capture_channel: channel,
      notice_version_id: noticeVersionId || undefined,
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
    message: `Consent ${action} captured in append-only log on :8152! Receipt ID: ${res.data.consent_receipt_id}`,
    data: {
      consent_receipt_id: res.data.consent_receipt_id,
      subject_ref: res.data.subject_ref,
      action: res.data.action,
      created_at: res.data.created_at,
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
