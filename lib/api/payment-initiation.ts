// Server-side API client for payment-initiation-adapter-svc (:8162) — BNK-06 of
// the Banking, Cash & Treasury baseline.
//
// Transmits approved payment instructions to banks/PSPs through durable,
// idempotent external attempts while preserving exact authorization subjects,
// cryptographic fingerprints, and provider receipts.
//
// Guaranteed invariants enforced:
// 1. Durable attempt persisted before any provider network call (PREPARED).
// 2. Retry reuses the SAME AttemptID and IdempotencyKey (no duplicate payments).
// 3. PENDING_UNKNOWN is a first-class financial state on timeout (never guessed).
// 4. Authorized financial fields (amount, currency, accounts) are immutable once prepared.
// 5. Explicit caller attestation required for payer account verification.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type AttemptStatus =
  | "PREPARED"
  | "SUBMITTED"
  | "PENDING_UNKNOWN"
  | "REJECTED_BEFORE_SUBMISSION"
  | "CANCELLED"
  | "QUARANTINED";

export type RawPaymentInitiationAttempt = {
  AttemptID?: string;
  attempt_id?: string;
  TenantID?: string | null;
  tenant_id?: string | null;
  LegalEntityID?: string;
  legal_entity_id?: string;
  SourceReference?: string;
  source_reference?: string;
  AuthorizationFingerprint?: string;
  authorization_fingerprint?: string;
  PayerAccountRef?: string;
  payer_account_ref?: string;
  PayeeRef?: string;
  payee_ref?: string;
  Amount?: number;
  amount?: number;
  Currency?: string;
  currency?: string;
  ExecutionDate?: string;
  execution_date?: string;
  PaymentReference?: string;
  payment_reference?: string;
  PayerAccountVerified?: boolean;
  payer_account_verified?: boolean;
  IdempotencyKey?: string;
  idempotency_key?: string;
  Status?: AttemptStatus;
  status?: AttemptStatus;
  ProviderRequestID?: string;
  provider_request_id?: string;
  ProviderResponseRef?: string;
  provider_response_ref?: string;
  RejectionReason?: string;
  rejection_reason?: string;
  QuarantineReason?: string;
  quarantine_reason?: string;
  AmbiguousResolutionNote?: string;
  ambiguous_resolution_note?: string;
  SubmittedAt?: string | null;
  submitted_at?: string | null;
  ResolvedAt?: string | null;
  resolved_at?: string | null;
  CreatedByPrincipalID?: string;
  created_by_principal_id?: string;
  CreatedAt?: string;
  created_at?: string;
  UpdatedAt?: string;
  updated_at?: string;
};

export type PaymentInitiationAttempt = {
  attempt_id: string;
  tenant_id?: string | null;
  legal_entity_id: string;
  source_reference: string;
  authorization_fingerprint: string;
  payer_account_ref: string;
  payee_ref: string;
  amount: number;
  currency: string;
  execution_date: string;
  payment_reference: string;
  payer_account_verified: boolean;
  idempotency_key: string;
  status: AttemptStatus;
  provider_request_id: string;
  provider_response_ref: string;
  rejection_reason: string;
  quarantine_reason: string;
  ambiguous_resolution_note: string;
  submitted_at?: string | null;
  resolved_at?: string | null;
  created_by_principal_id: string;
  created_at: string;
  updated_at: string;
};

export function normalizeAttempt(raw: RawPaymentInitiationAttempt): PaymentInitiationAttempt {
  return {
    attempt_id: raw.attempt_id || raw.AttemptID || "",
    tenant_id: raw.tenant_id ?? raw.TenantID ?? null,
    legal_entity_id: raw.legal_entity_id || raw.LegalEntityID || "",
    source_reference: raw.source_reference || raw.SourceReference || "",
    authorization_fingerprint: raw.authorization_fingerprint || raw.AuthorizationFingerprint || "",
    payer_account_ref: raw.payer_account_ref || raw.PayerAccountRef || "",
    payee_ref: raw.payee_ref || raw.PayeeRef || "",
    amount: Number(raw.amount ?? raw.Amount ?? 0),
    currency: raw.currency || raw.Currency || "GBP",
    execution_date: raw.execution_date || raw.ExecutionDate || new Date().toISOString(),
    payment_reference: raw.payment_reference || raw.PaymentReference || "",
    payer_account_verified: Boolean(raw.payer_account_verified ?? raw.PayerAccountVerified),
    idempotency_key: raw.idempotency_key || raw.IdempotencyKey || "",
    status: (raw.status || raw.Status || "PREPARED") as AttemptStatus,
    provider_request_id: raw.provider_request_id || raw.ProviderRequestID || "",
    provider_response_ref: raw.provider_response_ref || raw.ProviderResponseRef || "",
    rejection_reason: raw.rejection_reason || raw.RejectionReason || "",
    quarantine_reason: raw.quarantine_reason || raw.QuarantineReason || "",
    ambiguous_resolution_note: raw.ambiguous_resolution_note || raw.AmbiguousResolutionNote || "",
    submitted_at: raw.submitted_at ?? raw.SubmittedAt ?? null,
    resolved_at: raw.resolved_at ?? raw.ResolvedAt ?? null,
    created_by_principal_id: raw.created_by_principal_id || raw.CreatedByPrincipalID || "",
    created_at: raw.created_at || raw.CreatedAt || new Date().toISOString(),
    updated_at: raw.updated_at || raw.UpdatedAt || new Date().toISOString(),
  };
}

export type RawAttemptEvent = {
  EventID?: string;
  event_id?: string;
  TenantID?: string | null;
  tenant_id?: string | null;
  AttemptID?: string;
  attempt_id?: string;
  EventType?: string;
  event_type?: string;
  Detail?: string;
  detail?: string;
  ActorPrincipalID?: string;
  actor_principal_id?: string;
  CreatedAt?: string;
  created_at?: string;
};

export type AttemptEvent = {
  event_id: string;
  tenant_id?: string | null;
  attempt_id: string;
  event_type: string;
  detail: string;
  actor_principal_id: string;
  created_at: string;
};

export function normalizeEvent(raw: RawAttemptEvent): AttemptEvent {
  return {
    event_id: raw.event_id || raw.EventID || "",
    tenant_id: raw.tenant_id ?? raw.TenantID ?? null,
    attempt_id: raw.attempt_id || raw.AttemptID || "",
    event_type: raw.event_type || raw.EventType || "",
    detail: raw.detail || raw.Detail || "",
    actor_principal_id: raw.actor_principal_id || raw.ActorPrincipalID || "",
    created_at: raw.created_at || raw.CreatedAt || new Date().toISOString(),
  };
}

export type ProviderReceipt = {
  attempt_id: string;
  provider_request_id: string;
  provider_response_ref: string;
};

export type AttemptEvidence = {
  attempt_id: string;
  authorization_fingerprint: string;
  idempotency_key: string;
  events: AttemptEvent[];
};

export type PrepareAttemptInput = {
  legal_entity_id: string;
  source_reference?: string;
  authorization_fingerprint?: string;
  payer_account_ref: string;
  payee_ref: string;
  amount: number;
  currency: string;
  execution_date?: string;
  payment_reference?: string;
  payer_account_verified: boolean;
  idempotency_key: string;
};

export type ListAttemptsOptions = {
  legalEntityId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listPaymentAttempts(
  identity: Identity,
  options: ListAttemptsOptions = {},
): Promise<ApiResult<PaymentInitiationAttempt[]>> {
  const query: Record<string, string> = {};
  if (options.legalEntityId) query.legal_entity_id = options.legalEntityId;
  if (options.status && options.status !== "ALL") query.status = options.status;
  if (options.search) query.search = options.search;
  if (options.limit) query.limit = String(options.limit);
  if (options.offset) query.offset = String(options.offset);

  const res = await apiGet<RawPaymentInitiationAttempt[]>(
    "paymentInitiationAdapter",
    "/bnk06/attempts",
    {
      identity,
      query: Object.keys(query).length > 0 ? query : undefined,
    },
  );

  if (!res.ok) return res;
  return {
    ok: true,
    data: (res.data || []).map(normalizeAttempt),
  };
}

export async function getPaymentAttempt(
  identity: Identity,
  attemptId: string,
): Promise<ApiResult<PaymentInitiationAttempt>> {
  const res = await apiGet<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}`,
    { identity },
  );

  if (!res.ok) return res;
  return { ok: true, data: normalizeAttempt(res.data) };
}

export async function getProviderReceipt(
  identity: Identity,
  attemptId: string,
): Promise<ApiResult<ProviderReceipt>> {
  return apiGet<ProviderReceipt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/receipt`,
    { identity },
  );
}

export async function getAttemptEvidence(
  identity: Identity,
  attemptId: string,
): Promise<ApiResult<AttemptEvidence>> {
  type RawEvidence = {
    attempt_id: string;
    authorization_fingerprint: string;
    idempotency_key: string;
    events: RawAttemptEvent[];
  };

  const res = await apiGet<RawEvidence>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/evidence`,
    { identity },
  );

  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      attempt_id: res.data.attempt_id,
      authorization_fingerprint: res.data.authorization_fingerprint,
      idempotency_key: res.data.idempotency_key,
      events: (res.data.events || []).map(normalizeEvent),
    },
  };
}

export async function preparePaymentAttempt(
  identity: Identity,
  input: PrepareAttemptInput,
): Promise<ApiWriteResult<PaymentInitiationAttempt>> {
  const payload = {
    LegalEntityID: input.legal_entity_id,
    SourceReference: input.source_reference || `manual-${Date.now()}`,
    AuthorizationFingerprint: input.authorization_fingerprint || `fp-${Date.now().toString(16)}`,
    PayerAccountRef: input.payer_account_ref,
    PayeeRef: input.payee_ref,
    Amount: input.amount,
    Currency: input.currency,
    ExecutionDate: input.execution_date || new Date().toISOString(),
    PaymentReference: input.payment_reference || "",
    PayerAccountVerified: input.payer_account_verified,
    IdempotencyKey: input.idempotency_key,
  };

  const res = await apiPost<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    "/bnk06/attempts",
    payload,
    { identity, idempotencyKey: input.idempotency_key },
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizeAttempt(res.data) };
}

export async function submitPaymentAttempt(
  identity: Identity,
  attemptId: string,
): Promise<ApiWriteResult<PaymentInitiationAttempt>> {
  const res = await apiPost<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/submit`,
    {},
    { identity },
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizeAttempt(res.data) };
}

export async function retryPaymentAttempt(
  identity: Identity,
  attemptId: string,
): Promise<ApiWriteResult<PaymentInitiationAttempt>> {
  const res = await apiPost<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/retry`,
    {},
    { identity },
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizeAttempt(res.data) };
}

export async function cancelPaymentAttempt(
  identity: Identity,
  attemptId: string,
): Promise<ApiWriteResult<PaymentInitiationAttempt>> {
  const res = await apiPost<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/cancel`,
    {},
    { identity },
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizeAttempt(res.data) };
}

export async function resolveAmbiguousPaymentAttempt(
  identity: Identity,
  attemptId: string,
  resolvedStatus: "SUBMITTED" | "REJECTED_BEFORE_SUBMISSION",
  note: string,
): Promise<ApiWriteResult<PaymentInitiationAttempt>> {
  const res = await apiPost<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/resolve-ambiguous`,
    { ResolvedStatus: resolvedStatus, Note: note },
    { identity },
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizeAttempt(res.data) };
}

export async function quarantinePaymentAttempt(
  identity: Identity,
  attemptId: string,
  reason: string,
): Promise<ApiWriteResult<PaymentInitiationAttempt>> {
  const res = await apiPost<RawPaymentInitiationAttempt>(
    "paymentInitiationAdapter",
    `/bnk06/attempts/${attemptId}/quarantine`,
    { Reason: reason },
    { identity },
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizeAttempt(res.data) };
}
