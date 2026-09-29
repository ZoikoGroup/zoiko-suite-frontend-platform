// lib/api/security-trust.ts
// Server-side typed API client for Group 9: Security & Trust services.
// All functions return ApiResult<T> — never throw — so individual panels degrade
// gracefully if a service is unreachable.
//
// Rewritten against the real backend (zoiko-suite-backend, services/*), not
// guessed conventions. Two things every route here shares that earlier code
// didn't know about:
//  - List routes wrap their array as { data: [...], count: N }, not a
//    resource-named key. Single-resource reads/writes return the bare object.
//  - carta-svc is NOT a cap-table/equity service despite the name. It's a
//    zero-trust access-risk engine (Gartner's "Continuous Adaptive Risk and
//    Trust Assessment"): POST /v1/carta/evaluate takes a subject's device
//    trust, location, and requested action, and returns ALLOW / STEP_UP_MFA /
//    ISOLATE / DENY with a trust score. The previous version of this file
//    modeled equity grants and vesting schedules here — that was never a real
//    endpoint on this service.

import { apiGet, apiPost } from "./client";

type ListEnvelope<T> = { data: T[]; count: number };

// ── mTLS Management ─────────────────────────────────────────────────────────

export type CertStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "PENDING";

export type MtlsCertificate = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  service_name: string;
  common_name: string;
  issuer: string;
  serial_number: string;
  fingerprint: string;
  certificate_pem: string;
  valid_from: string;
  valid_to: string;
  rotation_days: number;
  auto_rotate: boolean;
  status: CertStatus;
  created_at: string;
  updated_at: string;
};

/** Only returned once, at issuance/rotation time — never stored or re-readable. */
export type ProvisionCertResult = {
  certificate: MtlsCertificate;
  private_key_pem: string;
  ca_certificate_pem: string;
};

export type PolicyAction = "ALLOW" | "DENY";

export type CommunicationPolicy = {
  id: string;
  tenant_id: string;
  policy_name: string;
  source_service: string;
  target_service: string;
  action: PolicyAction;
  requires_mtls: boolean;
  created_at: string;
};

export async function listMtlsCertificates(tenantId: string) {
  const res = await apiGet<ListEnvelope<MtlsCertificate>>("mtlsManagement", "/v1/mtls/certificates", {
    query: { tenant_id: tenantId },
  });
  if (!res.ok) return res;
  return { ok: true as const, data: res.data.data };
}

export async function provisionMtlsCertificate(
  tenantId: string,
  body: { legal_entity_id: string; service_name: string; common_name: string; rotation_days?: number; auto_rotate?: boolean }
) {
  return apiPost<ProvisionCertResult>("mtlsManagement", "/v1/mtls/certificates", {
    tenant_id: tenantId,
    ...body,
  });
}

export async function rotateMtlsCertificate(tenantId: string, certId: string) {
  return apiPost<ProvisionCertResult>("mtlsManagement", `/v1/mtls/certificates/${certId}/rotate`, {
    tenant_id: tenantId,
  });
}

export async function listMtlsPolicies(tenantId: string) {
  const res = await apiGet<ListEnvelope<CommunicationPolicy>>("mtlsManagement", "/v1/mtls/policies", {
    query: { tenant_id: tenantId },
  });
  if (!res.ok) return res;
  return { ok: true as const, data: res.data.data };
}

// ── SIEM Integration ────────────────────────────────────────────────────────

export type SiemPlatform = "SPLUNK" | "DATADOG" | "ELASTIC" | "SENTINEL" | "SYSLOG";
export type EventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SiemExporter = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  name: string;
  platform: SiemPlatform;
  endpoint_url: string;
  // auth_token is never serialised by the backend — write-only.
};

export type SiemEvent = {
  id: string;
  tenant_id: string;
  exporter_id: string;
  source_service: string;
  event_type: string;
  severity: EventSeverity;
  message: string;
  payload?: string;
  status: "DELIVERED" | "FAILED";
  timestamp: string;
};

export async function listSiemEvents(tenantId: string) {
  const res = await apiGet<ListEnvelope<SiemEvent>>("siemIntegration", "/v1/siem/events", {
    query: { tenant_id: tenantId },
  });
  if (!res.ok) return res;
  return { ok: true as const, data: res.data.data };
}

export async function listSiemExporters(tenantId: string) {
  const res = await apiGet<ListEnvelope<SiemExporter>>("siemIntegration", "/v1/siem/exporters", {
    query: { tenant_id: tenantId },
  });
  if (!res.ok) return res;
  return { ok: true as const, data: res.data.data };
}

export async function createSiemExporter(
  tenantId: string,
  body: { legal_entity_id: string; name: string; platform: SiemPlatform; endpoint_url: string; auth_token?: string }
) {
  return apiPost<SiemExporter>("siemIntegration", "/v1/siem/exporters", {
    tenant_id: tenantId,
    ...body,
  });
}

// ── Key Management Service (KMS) ────────────────────────────────────────────

export type KeyModel = "SYSTEM_MANAGED" | "BYOK" | "HYOK";
export type KeyProvider = "AWS_KMS" | "AZURE_KEY_VAULT" | "GCP_KMS" | "HASHICORP_VAULT" | "EXTERNAL_HSM";
export type KeyState = "ENABLED" | "DISABLED" | "PENDING_ROTATION" | "REVOKED";

export type CustomerKey = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  key_alias: string;
  key_model: KeyModel;
  key_provider: KeyProvider;
  external_key_arn: string;
  key_version: number;
  state: KeyState;
  rotation_count: number;
  last_rotated_at?: string;
  created_at: string;
  updated_at: string;
};

export async function listKmsKeys(tenantId: string) {
  const res = await apiGet<ListEnvelope<CustomerKey>>("keyManagement", "/v1/keys", {
    query: { tenant_id: tenantId },
  });
  if (!res.ok) return res;
  return { ok: true as const, data: res.data.data };
}

export async function registerKmsKey(
  tenantId: string,
  body: { legal_entity_id: string; key_alias: string; key_provider: KeyProvider; key_model?: KeyModel; external_key_arn?: string }
) {
  return apiPost<CustomerKey>("keyManagement", "/v1/keys", {
    tenant_id: tenantId,
    ...body,
  });
}

export async function rotateKmsKey(tenantId: string, keyId: string) {
  return apiPost<CustomerKey>("keyManagement", `/v1/keys/${keyId}/rotate`, {
    tenant_id: tenantId,
  });
}

export async function disableKmsKey(tenantId: string, keyId: string) {
  return apiPost<{ message: string }>("keyManagement", `/v1/keys/${keyId}/disable`, {
    tenant_id: tenantId,
  });
}

// ── Carta (Continuous Adaptive Risk & Trust Assessment) ─────────────────────
//
// A zero-trust access-decision engine — NOT equity/cap-table management.
// Every evaluation scores a subject's request against device trust, location,
// resource sensitivity, and time of day, and returns one of four decisions.

export type CartaDecision = "ALLOW" | "STEP_UP_MFA" | "ISOLATE" | "DENY";
export type CartaRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AccessContext = {
  subject_id: string;
  subject_type: "USER" | "SERVICE_ACCOUNT" | "BOT";
  device_trust_level: number; // 0–100
  ip_address: string;
  is_known_location: boolean;
  resource_sensitivity: "LOW" | "MEDIUM" | "HIGH" | "RESTRICTED";
  action_requested: string;
  time_of_day_hour: number;
};

export type CartaAssessment = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  subject_id: string;
  context: AccessContext;
  trust_score: number;
  risk_level: CartaRiskLevel;
  decision: CartaDecision;
  risk_factors: string[];
  assessment_timestamp: string;
};

export async function evaluateCartaAccess(
  tenantId: string,
  body: { legal_entity_id: string; context: AccessContext }
) {
  return apiPost<CartaAssessment>("carta", "/v1/carta/evaluate", {
    tenant_id: tenantId,
    ...body,
  });
}

export async function listCartaAssessments(tenantId: string) {
  const res = await apiGet<ListEnvelope<CartaAssessment>>("carta", "/v1/carta/assessments", {
    query: { tenant_id: tenantId },
  });
  if (!res.ok) return res;
  return { ok: true as const, data: res.data.data };
}
