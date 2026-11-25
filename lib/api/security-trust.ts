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
//
// Every call carries the caller's identity as headers. These services take the
// tenant from X-Tenant-Id only (a tenant_id query parameter is ignored and a
// body tenant_id is refused), and every list requires legal_entity_id: it is
// the authorization scope, and a list without it is a 400.

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

type ListEnvelope<T> = { data: T[]; count: number };

async function listData<T>(
  service: Parameters<typeof apiGet>[0],
  path: string,
  identity: Identity,
  query: Record<string, string | undefined> = {},
): Promise<ApiResult<T[]>> {
  const res = await apiGet<ListEnvelope<T>>(service, path, {
    identity,
    query: { ...query, legal_entity_id: identity.legalEntityId },
  });
  if (!res.ok) return res;
  if (!Array.isArray(res.data?.data)) {
    return { ok: false, error: { kind: "malformed", message: `${service} answered ${path} without a "data" list` } };
  }
  return { ok: true, data: res.data.data };
}

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

export async function listMtlsCertificates(identity: Identity) {
  return listData<MtlsCertificate>("mtlsManagement", "/v1/mtls/certificates", identity);
}

/**
 * The private key is returned once and never stored, so a replayed request
 * (same Idempotency-Key) is refused with 409 idempotency_secret_not_replayable
 * rather than answered again.
 */
export async function provisionMtlsCertificate(
  identity: Identity,
  body: { service_name: string; common_name: string; rotation_days: number; auto_rotate: boolean }
) {
  return apiPost<ProvisionCertResult>("mtlsManagement", "/v1/mtls/certificates", { ...body, legal_entity_id: identity.legalEntityId }, {
    identity,
    purposeContext: "security.mtls.certificate.issue",
  });
}

export async function rotateMtlsCertificate(identity: Identity, certId: string) {
  return apiPost<ProvisionCertResult>(
    "mtlsManagement",
    `/v1/mtls/certificates/${encodeURIComponent(certId)}/rotate`,
    {},
    { identity, purposeContext: "security.mtls.certificate.rotate" },
  );
}

export async function listMtlsPolicies(identity: Identity) {
  return listData<CommunicationPolicy>("mtlsManagement", "/v1/mtls/policies", identity);
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
  status: string;
  events_sent: number;
  last_streamed?: string;
  created_at: string;
  updated_at: string;
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

/** Events are scoped to one exporter: GET /v1/siem/events requires exporter_id. */
export async function listSiemEvents(identity: Identity, exporterId: string) {
  return listData<SiemEvent>("siemIntegration", "/v1/siem/events", identity, { exporter_id: exporterId });
}

/** Most exporters read for the events view; one read per exporter. */
const SIEM_EXPORTER_LIMIT = 20;

/**
 * The entity's events across its exporters, newest first. Fails if the
 * exporter list or any exporter's events cannot be read, so a partial view is
 * never shown as the whole.
 */
export async function listSiemEventsForEntity(
  identity: Identity,
): Promise<ApiResult<{ events: SiemEvent[]; exporters: SiemExporter[]; exportersRead: number }>> {
  const exporters = await listSiemExporters(identity);
  if (!exporters.ok) return exporters;
  const read = exporters.data.slice(0, SIEM_EXPORTER_LIMIT);
  const results = await Promise.all(read.map((x) => listSiemEvents(identity, x.id)));
  const events: SiemEvent[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    events.push(...r.data);
  }
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { ok: true, data: { events, exporters: exporters.data, exportersRead: read.length } };
}

export async function listSiemExporters(identity: Identity) {
  return listData<SiemExporter>("siemIntegration", "/v1/siem/exporters", identity);
}

/**
 * Register an exporter. auth_token is write-only: the service seals it and
 * never returns it, and answers 503 credential_sealing_unavailable when no
 * sealing key is configured rather than storing it in the clear.
 */
export async function createSiemExporter(
  identity: Identity,
  body: { name: string; platform: SiemPlatform; endpoint_url: string; auth_token?: string }
) {
  const payload: Record<string, string> = {
    legal_entity_id: identity.legalEntityId ?? "",
    name: body.name,
    platform: body.platform,
    endpoint_url: body.endpoint_url,
  };
  if (body.auth_token) payload.auth_token = body.auth_token;
  return apiPost<SiemExporter>("siemIntegration", "/v1/siem/exporters", payload, {
    identity,
    purposeContext: "security.siem.exporter.register",
  });
}

export async function getSiemExporter(identity: Identity, exporterId: string) {
  return apiGet<SiemExporter>("siemIntegration", `/v1/siem/exporters/${encodeURIComponent(exporterId)}`, {
    identity,
    query: { legal_entity_id: identity.legalEntityId },
  });
}

/**
 * Record an event against an exporter (POST /v1/siem/stream).
 *
 * The service stores the event with status "DELIVERED" and increments the
 * exporter's events_sent, but it has no delivery code: nothing is sent to the
 * exporter's endpoint. Present the stored event as recorded, never delivered
 * (components/admin/security-trust/siem-caveat.ts).
 */
export async function streamSiemEvent(
  identity: Identity,
  body: { exporter_id: string; source_service: string; event_type: string; severity: EventSeverity; message: string; payload?: string }
) {
  const payload: Record<string, string> = {
    exporter_id: body.exporter_id,
    source_service: body.source_service,
    event_type: body.event_type,
    severity: body.severity,
    message: body.message,
  };
  if (body.payload) payload.payload = body.payload;
  return apiPost<SiemEvent>("siemIntegration", "/v1/siem/stream", payload, {
    identity,
    purposeContext: "security.siem.event.record",
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

/**
 * key-management-svc records key metadata only (alias, provider, ARN, version,
 * state). It performs no cryptographic operation: do not present it as a KMS.
 */
export async function listKmsKeys(identity: Identity) {
  return listData<CustomerKey>("keyManagement", "/v1/keys", identity);
}

/**
 * Register a customer key's METADATA (alias, model, provider, external ARN).
 * Nothing is generated, imported or wrapped: the key itself stays in the
 * customer's own KMS/HSM. The service requires external_key_arn for BYOK and
 * HYOK and answers 400 without it; the ARN's format is not checked by it.
 */
export async function registerKmsKey(
  identity: Identity,
  body: { key_alias: string; key_model: KeyModel; key_provider: KeyProvider; external_key_arn?: string }
) {
  const payload: Record<string, string> = {
    legal_entity_id: identity.legalEntityId ?? "",
    key_alias: body.key_alias,
    key_model: body.key_model,
    key_provider: body.key_provider,
  };
  if (body.external_key_arn) payload.external_key_arn = body.external_key_arn;
  return apiPost<CustomerKey>("keyManagement", "/v1/keys", payload, { identity, purposeContext: "security.kms.key.register" });
}

export async function rotateKmsKey(identity: Identity, keyId: string) {
  return apiPost<CustomerKey>("keyManagement", `/v1/keys/${encodeURIComponent(keyId)}/rotate`, {}, {
    identity,
    purposeContext: "security.key.rotate",
  });
}

export async function disableKmsKey(identity: Identity, keyId: string) {
  return apiPost<{ message: string }>("keyManagement", `/v1/keys/${encodeURIComponent(keyId)}/disable`, {}, {
    identity,
    purposeContext: "security.key.disable",
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
  identity: Identity,
  body: { legal_entity_id: string; context: AccessContext }
) {
  return apiPost<CartaAssessment>("carta", "/v1/carta/evaluate", body, { identity, purposeContext: "security.access.evaluate" });
}

export async function listCartaAssessments(identity: Identity) {
  return listData<CartaAssessment>("carta", "/v1/carta/assessments", identity);
}
