// Server-side API client for payment-status-svc (:8163) — BNK-07 of the
// Banking, Cash & Treasury baseline.
//
// Resolves and preserves canonical provider/network payment execution state
// and finality from authenticated callbacks, polls, bank reports and
// statement evidence. Enforces HMAC-SHA256 signature verification on callbacks,
// governed finality immutability, duplicate idempotency, and conflict isolation.

import crypto from "crypto";
import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import { serviceUrl } from "./config";

export type ExecutionStatus =
  | "PREPARED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PENDING"
  | "SETTLED"
  | "REJECTED"
  | "RETURNED"
  | "CANCELLED";

export type FinalitySource =
  | "PROVIDER_CALLBACK"
  | "STATEMENT"
  | "MANUAL_POLL"
  | "MANUAL_OVERRIDE"
  | "";

export type RawPaymentExecutionState = {
  PaymentID?: string;
  payment_id?: string;
  TenantID?: string | null;
  tenant_id?: string | null;
  LegalEntityID?: string;
  legal_entity_id?: string;
  ProviderRequestID?: string;
  provider_request_id?: string;
  SourceReference?: string;
  source_reference?: string;
  Status?: ExecutionStatus;
  status?: ExecutionStatus;
  FinalitySource?: string;
  finality_source?: string;
  MappingVersion?: string;
  mapping_version?: string;
  HasOpenConflict?: boolean;
  has_open_conflict?: boolean;
  ConflictReason?: string;
  conflict_reason?: string;
  CreatedByPrincipalID?: string;
  created_by_principal_id?: string;
  CreatedAt?: string;
  created_at?: string;
  UpdatedAt?: string;
  updated_at?: string;
};

export type PaymentExecutionState = {
  payment_id: string;
  tenant_id?: string | null;
  legal_entity_id: string;
  provider_request_id: string;
  source_reference: string;
  status: ExecutionStatus;
  finality_source: string;
  mapping_version: string;
  has_open_conflict: boolean;
  conflict_reason: string;
  created_by_principal_id: string;
  created_at: string;
  updated_at: string;
};

export function normalizePayment(raw: RawPaymentExecutionState): PaymentExecutionState {
  return {
    payment_id: raw.payment_id || raw.PaymentID || "",
    tenant_id: raw.tenant_id ?? raw.TenantID ?? null,
    legal_entity_id: raw.legal_entity_id || raw.LegalEntityID || "",
    provider_request_id: raw.provider_request_id || raw.ProviderRequestID || "",
    source_reference: raw.source_reference || raw.SourceReference || "",
    status: (raw.status || raw.Status || "PREPARED") as ExecutionStatus,
    finality_source: raw.finality_source || raw.FinalitySource || "",
    mapping_version: raw.mapping_version || raw.MappingVersion || "",
    has_open_conflict: Boolean(raw.has_open_conflict ?? raw.HasOpenConflict),
    conflict_reason: raw.conflict_reason || raw.ConflictReason || "",
    created_by_principal_id: raw.created_by_principal_id || raw.CreatedByPrincipalID || "",
    created_at: raw.created_at || raw.CreatedAt || new Date().toISOString(),
    updated_at: raw.updated_at || raw.UpdatedAt || new Date().toISOString(),
  };
}

export type RawStatusEvent = {
  EventID?: string;
  event_id?: string;
  TenantID?: string | null;
  tenant_id?: string | null;
  PaymentID?: string;
  payment_id?: string;
  EventType?: string;
  event_type?: string;
  FromStatus?: string;
  from_status?: string;
  ToStatus?: string;
  to_status?: string;
  ProviderEventRef?: string;
  provider_event_ref?: string;
  Detail?: string;
  detail?: string;
  ActorPrincipalID?: string;
  actor_principal_id?: string;
  CreatedAt?: string;
  created_at?: string;
};

export type StatusEvent = {
  event_id: string;
  tenant_id?: string | null;
  payment_id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  provider_event_ref: string;
  detail: string;
  actor_principal_id: string;
  created_at: string;
};

export function normalizeEvent(raw: RawStatusEvent): StatusEvent {
  return {
    event_id: raw.event_id || raw.EventID || "",
    tenant_id: raw.tenant_id ?? raw.TenantID ?? null,
    payment_id: raw.payment_id || raw.PaymentID || "",
    event_type: raw.event_type || raw.EventType || "",
    from_status: raw.from_status || raw.FromStatus || "",
    to_status: raw.to_status || raw.ToStatus || "",
    provider_event_ref: raw.provider_event_ref || raw.ProviderEventRef || "",
    detail: raw.detail || raw.Detail || "",
    actor_principal_id: raw.actor_principal_id || raw.ActorPrincipalID || "",
    created_at: raw.created_at || raw.CreatedAt || new Date().toISOString(),
  };
}

export type FinalityEvidence = {
  payment_id: string;
  status: ExecutionStatus;
  finality_source: string;
  mapping_version: string;
};

export type RecordPaymentStatusInput = {
  legal_entity_id: string;
  provider_request_id?: string;
  source_reference?: string;
};

export type PollPaymentStatusInput = {
  reported_status: ExecutionStatus;
  provider_event_ref?: string;
  mapping_version?: string;
};

export type LinkStatementInput = {
  statement_reference: string;
  reported_status: ExecutionStatus;
};

export type ResolveConflictInput = {
  final_status: ExecutionStatus;
  reason: string;
};

export type RecordReturnInput = {
  provider_event_ref?: string;
  reason: string;
};

export type CancelPaymentInput = {
  reason: string;
};

export async function listPayments(
  identity: Identity,
  options?: { legalEntityId?: string; status?: string; search?: string }
): Promise<ApiResult<PaymentExecutionState[]>> {
  const query = new URLSearchParams();
  if (options?.legalEntityId) query.set("legal_entity_id", options.legalEntityId);
  if (options?.status) query.set("status", options.status);
  if (options?.search) query.set("search", options.search);

  const path = `/bnk07/payments${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiGet<{ data: RawPaymentExecutionState[]; count: number }>("paymentStatus", path, {
    identity,
  });

  if (!res.ok) return res;
  return {
    ok: true,
    data: (res.data.data || []).map(normalizePayment),
  };
}

export async function listUnresolvedPayments(
  identity: Identity
): Promise<ApiResult<PaymentExecutionState[]>> {
  const res = await apiGet<{ data: RawPaymentExecutionState[]; count: number }>(
    "paymentStatus",
    "/bnk07/payments/unresolved",
    { identity }
  );

  if (!res.ok) return res;
  return {
    ok: true,
    data: (res.data.data || []).map(normalizePayment),
  };
}

export async function getPaymentStatus(
  identity: Identity,
  paymentId: string
): Promise<ApiResult<PaymentExecutionState>> {
  const res = await apiGet<RawPaymentExecutionState>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}`,
    { identity }
  );

  if (!res.ok) return res;
  return { ok: true, data: normalizePayment(res.data) };
}

export async function getStatusHistory(
  identity: Identity,
  paymentId: string
): Promise<ApiResult<StatusEvent[]>> {
  const res = await apiGet<{ data: RawStatusEvent[]; count: number }>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/history`,
    { identity }
  );

  if (!res.ok) return res;
  return {
    ok: true,
    data: (res.data.data || []).map(normalizeEvent),
  };
}

export async function getFinalityEvidence(
  identity: Identity,
  paymentId: string
): Promise<ApiResult<FinalityEvidence>> {
  return apiGet<FinalityEvidence>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/finality-evidence`,
    { identity }
  );
}

export async function recordPaymentStatus(
  identity: Identity,
  input: RecordPaymentStatusInput
): Promise<ApiWriteResult<PaymentExecutionState>> {
  const res = await apiPost<RawPaymentExecutionState>(
    "paymentStatus",
    "/bnk07/payments",
    {
      LegalEntityID: input.legal_entity_id,
      ProviderRequestID: input.provider_request_id || "",
      SourceReference: input.source_reference || "",
    },
    { identity }
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizePayment(res.data) };
}

export async function pollPaymentStatus(
  identity: Identity,
  paymentId: string,
  input: PollPaymentStatusInput
): Promise<ApiWriteResult<{ payment: PaymentExecutionState; applied: boolean }>> {
  const res = await apiPost<{ payment: RawPaymentExecutionState; applied: boolean }>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/poll`,
    {
      ReportedStatus: input.reported_status,
      ProviderEventRef: input.provider_event_ref || "",
      MappingVersion: input.mapping_version || "iso20022-camt054",
    },
    { identity }
  );

  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: {
      payment: normalizePayment(res.data.payment),
      applied: res.data.applied,
    },
  };
}

export async function linkStatement(
  identity: Identity,
  paymentId: string,
  input: LinkStatementInput
): Promise<ApiWriteResult<{ payment: PaymentExecutionState; conflict_raised: boolean }>> {
  const res = await apiPost<{ payment: RawPaymentExecutionState; conflict_raised: boolean }>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/link-statement`,
    {
      StatementReference: input.statement_reference,
      ReportedStatus: input.reported_status,
    },
    { identity }
  );

  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: {
      payment: normalizePayment(res.data.payment),
      conflict_raised: res.data.conflict_raised,
    },
  };
}

export async function resolveConflict(
  identity: Identity,
  paymentId: string,
  input: ResolveConflictInput
): Promise<ApiWriteResult<PaymentExecutionState>> {
  const res = await apiPost<RawPaymentExecutionState>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/resolve-conflict`,
    {
      FinalStatus: input.final_status,
      Reason: input.reason,
    },
    { identity }
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizePayment(res.data) };
}

export async function recordReturn(
  identity: Identity,
  paymentId: string,
  input: RecordReturnInput
): Promise<ApiWriteResult<PaymentExecutionState>> {
  const res = await apiPost<RawPaymentExecutionState>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/return`,
    {
      ProviderEventRef: input.provider_event_ref || "",
      Reason: input.reason,
    },
    { identity }
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizePayment(res.data) };
}

export async function cancelPayment(
  identity: Identity,
  paymentId: string,
  input: CancelPaymentInput
): Promise<ApiWriteResult<PaymentExecutionState>> {
  const res = await apiPost<RawPaymentExecutionState>(
    "paymentStatus",
    `/bnk07/payments/${encodeURIComponent(paymentId)}/cancel`,
    {
      Reason: input.reason,
    },
    { identity }
  );

  if (!res.ok) return res;
  return { ok: true, status: res.status, data: normalizePayment(res.data) };
}

/**
 * Sends a real HMAC-SHA256 signature-verified webhook callback to BNK-07.
 * Uses the configured shared secret.
 */
export async function sendProviderWebhookCallback(payload: {
  payment_id: string;
  provider_event_ref: string;
  reported_status: ExecutionStatus;
  mapping_version?: string;
  shared_secret?: string;
  invalid_signature?: boolean;
}): Promise<ApiWriteResult<{ payment: PaymentExecutionState; applied: boolean }>> {
  const secret = payload.shared_secret || "dev-only-shared-secret-replace-before-any-real-integration";
  const bodyObj = {
    PaymentID: payload.payment_id,
    ProviderEventRef: payload.provider_event_ref,
    ReportedStatus: payload.reported_status,
    MappingVersion: payload.mapping_version || "iso20022-camt054",
  };

  const rawBody = JSON.stringify(bodyObj);
  let signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (payload.invalid_signature) {
    signature = "invalid-forged-signature-00000000000000000000";
  }

  const baseUrl = serviceUrl("paymentStatus");
  const webhookUrl = `${baseUrl}/bnk07/webhooks/provider-callback`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body: rawBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error) msg = parsed.error;
      } catch {
        // use errText
      }
      return {
        ok: false,
        error: {
          kind: "http",
          status: res.status,
          message: msg,
        },
      };
    }

    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data: {
        payment: normalizePayment(data.payment),
        applied: Boolean(data.applied),
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        kind: "unreachable",
        message: err instanceof Error ? err.message : "payment-status-svc webhook unreachable",
      },
    };
  }
}
