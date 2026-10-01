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
  is_proxy?: boolean;
  representative_subject_ref?: string;
  representative_authority_ref?: string;
  representative_evidence?: string;
  affirmative_action_type?: string;
  affirmative_evidence?: string;
  consent_request?: ConsentRequest;
};

export type ConsentRequest = {
  purpose_id: string;
  scope?: string;
  data_context?: string;
  recipient_context?: string;
  technology_context?: string;
  required_status?: string;
  notice_version_id?: string;
  policy_package?: string;
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

export type NoticeVersion = {
  notice_version_id: string;
  notice_id: string;
  locale: string;
  audience: string;
  content_hash: string;
  version_status: "DRAFT" | "APPROVED" | "PUBLISHED" | "WITHDRAWN" | "SUPERSEDED";
  supersedes_version_id?: string;
  effective_from?: string;
  approved_by_principal_id?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type PresentationReceipt = {
  presentation_receipt_id: string;
  tenant_id?: string;
  notice_version_id: string;
  subject_ref: string;
  channel: string;
  locale: string;
  created_at: string;
  session_ref?: string;
  template_version?: string;
  delivery_evidence?: string;
};

export type RecordConsentInput = {
  subject_ref: string;
  purpose_id: string;
  notice_version_id?: string;
  action: ConsentAction;
  capture_channel: string;
  is_proxy?: boolean;
  representative_subject_ref?: string;
  representative_authority_ref?: string;
  representative_evidence?: string;
  affirmative_action_type?: string;
  affirmative_evidence?: string;
  consent_request?: ConsentRequest;
};

export type RecordPresentationInput = {
  subject_ref: string;
  channel: string;
  locale: string;
  session_ref?: string;
  template_version?: string;
  delivery_evidence?: string;
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
      is_proxy: input.is_proxy,
      representative_subject_ref: input.representative_subject_ref || undefined,
      representative_authority_ref: input.representative_authority_ref || undefined,
      representative_evidence: input.representative_evidence || undefined,
      affirmative_action_type: input.affirmative_action_type || undefined,
      affirmative_evidence: input.affirmative_evidence || undefined,
      consent_request: input.consent_request || undefined,
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

export async function approveNotice(
  noticeId: string,
  identity: Identity,
  versionId?: string
): Promise<ApiWriteResult<NoticeVersion>> {
  const endpoint = versionId
    ? `/privacy/notices/${encodeURIComponent(noticeId)}/versions/${encodeURIComponent(versionId)}/approve`
    : `/privacy/notices/${encodeURIComponent(noticeId)}/approve`;
  return apiPost<NoticeVersion>("privacyConsent", endpoint, {}, { identity });
}

export async function publishNotice(
  noticeId: string,
  identity: Identity,
  versionId?: string
): Promise<ApiWriteResult<NoticeVersion>> {
  const endpoint = versionId
    ? `/privacy/notices/${encodeURIComponent(noticeId)}/versions/${encodeURIComponent(versionId)}/publish`
    : `/privacy/notices/${encodeURIComponent(noticeId)}/publish`;
  return apiPost<NoticeVersion>("privacyConsent", endpoint, {}, { identity });
}

export async function withdrawNotice(
  noticeId: string,
  identity: Identity,
  versionId?: string
): Promise<ApiWriteResult<NoticeVersion>> {
  const endpoint = versionId
    ? `/privacy/notices/${encodeURIComponent(noticeId)}/versions/${encodeURIComponent(versionId)}/withdraw`
    : `/privacy/notices/${encodeURIComponent(noticeId)}/withdraw`;
  return apiPost<NoticeVersion>("privacyConsent", endpoint, {}, { identity });
}

export async function recordPresentationReceipt(
  noticeId: string,
  input: RecordPresentationInput,
  identity: Identity,
  versionId?: string
): Promise<ApiWriteResult<PresentationReceipt>> {
  const endpoint = versionId
    ? `/privacy/notices/${encodeURIComponent(noticeId)}/versions/${encodeURIComponent(versionId)}/presentation-receipts`
    : `/privacy/notices/${encodeURIComponent(noticeId)}/presentation-receipts`;
  return apiPost<PresentationReceipt>(
    "privacyConsent",
    endpoint,
    {
      subject_ref: input.subject_ref,
      channel: input.channel,
      locale: input.locale,
      session_ref: input.session_ref || undefined,
      template_version: input.template_version || undefined,
      delivery_evidence: input.delivery_evidence || undefined,
    },
    { identity }
  );
}

export async function getNotice(
  noticeId: string,
  asOf?: string,
  identity?: Identity
): Promise<ApiResult<NoticeVersion>> {
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return apiGet<NoticeVersion>(
    "privacyConsent",
    `/privacy/notices/${encodeURIComponent(noticeId)}${query}`,
    { identity }
  );
}
