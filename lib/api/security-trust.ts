// lib/api/security-trust.ts
// Server-side typed API client for Group 9: Security & Trust services.
// All functions return ApiResult<T> — never throw — so individual panels degrade
// gracefully if a service is unreachable.

import { apiGet, apiPost } from "./client";

// ── mTLS Management ─────────────────────────────────────────────────────────

export type MtlsCertificate = {
  cert_id: string;
  tenant_id: string;
  common_name: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  issued_at: string;
  expires_at: string;
  fingerprint: string;
  created_at: string;
};

export type MtlsListResponse = {
  certificates: MtlsCertificate[];
  total: number;
};

export async function listMtlsCertificates(tenantId: string) {
  return apiGet<MtlsListResponse>("mtlsManagement", "/api/v1/certificates", {
    query: { tenant_id: tenantId },
  });
}

export async function issueMtlsCertificate(
  tenantId: string,
  body: { common_name: string; validity_days?: number }
) {
  return apiPost<{ certificate: MtlsCertificate }>("mtlsManagement", "/api/v1/certificates", {
    tenant_id: tenantId,
    ...body,
  });
}

// ── SIEM Integration ────────────────────────────────────────────────────────

export type SiemEvent = {
  event_id: string;
  tenant_id: string;
  event_type: string;
  source_ip: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  siem_platform: "SPLUNK" | "DATADOG" | "SENTINEL" | "ELASTIC";
  status: "INGESTED" | "ESCALATED" | "RESOLVED";
  occurred_at: string;
  created_at: string;
};

export type SiemEventListResponse = {
  events: SiemEvent[];
  total: number;
};

export async function listSiemEvents(tenantId: string) {
  return apiGet<SiemEventListResponse>("siemIntegration", "/api/v1/events", {
    query: { tenant_id: tenantId },
  });
}

export async function ingestSiemEvent(
  tenantId: string,
  body: {
    event_type: string;
    source_ip: string;
    severity: string;
    description: string;
    platform?: string;
  }
) {
  return apiPost<{ event: SiemEvent }>("siemIntegration", "/api/v1/events", {
    tenant_id: tenantId,
    ...body,
  });
}

// ── Carta Cap Table & Equity ────────────────────────────────────────────────

export type EquityGrant = {
  grant_id: string;
  tenant_id: string;
  legal_entity_id: string;
  grantee_id: string;
  grant_type: "ISO" | "NSO" | "RSU";
  shares: number;
  strike_price: number;
  currency: string;
  vesting_schedule: string;
  status: "DRAFT" | "GRANTED" | "EXERCISED" | "CANCELLED";
  granted_at: string;
  created_at: string;
};

export type CartaCapTableResponse = {
  equity_grants: EquityGrant[];
  cap_table_entries?: Record<string, unknown>[];
  total: number;
};

export async function listEquityGrants(tenantId: string) {
  return apiGet<CartaCapTableResponse>("carta", "/api/v1/equity-grants", {
    query: { tenant_id: tenantId },
  });
}

export async function createEquityGrant(
  tenantId: string,
  body: {
    legal_entity_id?: string;
    grantee_id: string;
    grant_type: string;
    shares: number;
    strike_price: number;
  }
) {
  return apiPost<{ equity_grant: EquityGrant }>("carta", "/api/v1/equity-grants", {
    tenant_id: tenantId,
    ...body,
  });
}

// ── Key Management Service (KMS) ────────────────────────────────────────────

export type KmsKey = {
  key_id: string;
  tenant_id: string;
  key_type: "AES_256" | "RSA_4096" | "ECC_SECP256K1";
  purpose: "DATA_ENCRYPTION" | "SIGNING" | "ENVELOPE_ENCRYPTION";
  algorithm: string;
  status: "ACTIVE" | "ROTATING" | "DEPRECATED" | "REVOKED";
  created_by: string;
  expires_at: string;
  rotation_due_at: string;
  created_at: string;
};

export type KmsKeyListResponse = {
  keys: KmsKey[];
  total: number;
};

export async function listKmsKeys(tenantId: string) {
  return apiGet<KmsKeyListResponse>("keyManagement", "/api/v1/keys", {
    query: { tenant_id: tenantId },
  });
}

export async function rotateKmsKey(
  tenantId: string,
  body: { key_id: string }
) {
  return apiPost<{ key: KmsKey }>("keyManagement", `/api/v1/keys/${body.key_id}/rotate`, {
    tenant_id: tenantId,
  });
}

export async function createKmsKey(
  tenantId: string,
  body: {
    key_type: string;
    purpose: string;
  }
) {
  return apiPost<{ key: KmsKey }>("keyManagement", "/api/v1/keys", {
    tenant_id: tenantId,
    ...body,
  });
}
