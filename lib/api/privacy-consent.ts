import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

export type ConsentAction = "GRANTED" | "DENIED";
export type ConsentStatus = "NOT_REQUESTED" | "GRANTED" | "DENIED" | "WITHDRAWN";

export type ConsentReceipt = {
  consent_receipt_id: string;
  tenant_id?: string;
  subject_ref: string;
  purpose_id: string;
  notice_version_id?: string;
  action: ConsentAction;
  capture_channel: string;
  actor_principal_id: string;
  correlation_id?: string;
  created_at: string;
};

export type WithdrawalReceipt = {
  withdrawal_receipt_id: string;
  tenant_id?: string;
  consent_receipt_id: string;
  withdrawn_by_principal_id: string;
  channel: string;
  created_at: string;
};

export type ConsentResolution = {
  subject_ref: string;
  purpose_id: string;
  status: ConsentStatus;
  latest_receipt?: ConsentReceipt;
  withdrawal_receipt?: WithdrawalReceipt;
};

export type PreferenceAssertion = {
  preference_assertion_id: string;
  tenant_id?: string;
  subject_ref: string;
  channel_or_purpose: string;
  value: string;
  source: string;
  created_at: string;
};

export type PrivacyNotice = {
  notice_id: string;
  tenant_id?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type RecordConsentInput = {
  subject_ref: string;
  purpose_id: string;
  notice_version_id?: string;
  action: ConsentAction;
  capture_channel: string;
};

export async function recordConsent(
  input: RecordConsentInput,
  identity: Identity
): Promise<ApiWriteResult<ConsentReceipt>> {
  return apiPost<ConsentReceipt>(
    "privacyConsent",
    "/privacy/consents",
    {
      tenant_id: identity.tenantId,
      subject_ref: input.subject_ref,
      purpose_id: input.purpose_id,
      notice_version_id: input.notice_version_id || undefined,
      action: input.action,
      capture_channel: input.capture_channel,
    },
    { identity }
  );
}

export async function getConsentStatus(
  subjectRef: string,
  purposeId: string,
  identity?: Identity
): Promise<ApiResult<ConsentResolution>> {
  const query = new URLSearchParams({
    subject_ref: subjectRef,
    purpose_id: purposeId,
  });
  return apiGet<ConsentResolution>(
    "privacyConsent",
    `/privacy/consents?${query.toString()}`,
    { identity }
  );
}

export async function withdrawConsent(
  consentReceiptId: string,
  channel: string,
  identity: Identity
): Promise<ApiWriteResult<WithdrawalReceipt>> {
  return apiPost<WithdrawalReceipt>(
    "privacyConsent",
    `/privacy/consents/${encodeURIComponent(consentReceiptId)}/withdraw`,
    { channel },
    { identity }
  );
}

export async function setPreference(
  input: {
    subject_ref: string;
    channel_or_purpose: string;
    value: string;
    source: string;
  },
  identity: Identity
): Promise<ApiWriteResult<PreferenceAssertion>> {
  return apiPost<PreferenceAssertion>(
    "privacyConsent",
    "/privacy/preferences",
    {
      tenant_id: identity.tenantId,
      subject_ref: input.subject_ref,
      channel_or_purpose: input.channel_or_purpose,
      value: input.value,
      source: input.source,
    },
    { identity }
  );
}

export async function getPreference(
  subjectRef: string,
  channelOrPurpose: string,
  identity?: Identity
): Promise<ApiResult<PreferenceAssertion>> {
  const query = new URLSearchParams({
    subject_ref: subjectRef,
    channel_or_purpose: channelOrPurpose,
  });
  return apiGet<PreferenceAssertion>(
    "privacyConsent",
    `/privacy/preferences?${query.toString()}`,
    { identity }
  );
}

export async function createNotice(
  input: {
    locale: string;
    audience: string;
    content_hash: string;
  },
  identity: Identity
): Promise<ApiWriteResult<PrivacyNotice>> {
  return apiPost<PrivacyNotice>(
    "privacyConsent",
    "/privacy/notices",
    {
      tenant_id: identity.tenantId,
      locale: input.locale,
      audience: input.audience,
      content_hash: input.content_hash,
    },
    { identity }
  );
}
