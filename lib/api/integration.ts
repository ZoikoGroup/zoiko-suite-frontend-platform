// lib/api/integration.ts
// Server-side typed API client for Group 10: Integration & Extensibility services.
// All functions return ApiResult<T> and never throw; a failed read is returned
// as an error for the caller to show, never as an empty list.
//
// Routes, query parameters and response shapes are the services' own
// (fix/blocks-6-10-final; docs/architecture/blocks-8-10-frontend-contract-handoff.md
// in the backend repo), checked against the running services. The tenant comes
// from the X-Tenant-Id header the identity sets.
//
// None of these connectors has a real provider adapter yet (bank APIs, HRIS,
// DocuSign/Adobe, market data). They fail closed with 503 rather than simulate
// success; the panels show that refusal as it is.

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

function listOf<T>(res: ApiResult<Record<string, unknown>>, key: string, label: string): ApiResult<T[]> {
  if (!res.ok) return res;
  const items = res.data?.[key];
  if (!Array.isArray(items)) {
    return { ok: false, error: { kind: "malformed", message: `${label} answered without a "${key}" list` } };
  }
  return { ok: true, data: items as T[] };
}

const entityQuery = (identity: Identity) => ({ legal_entity_id: identity.legalEntityId });

// ── Connectivity API Bridge ──────────────────────────────────────────────────

export type BridgeEndpoint = {
  bridge_id: string;
  connection_id: string;
  tenant_id: string;
  legal_entity_id: string;
  bridge_name: string;
  provider_name: string;
  protocol: string;
  endpoint_url: string;
  auth_type: string;
  status: string;
  sync_mode: string;
  destination_host: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export async function listBridges(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("connectivityApiBridge", "/v1/bridges", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<BridgeEndpoint>(res, "bridges", "connectivity-api-bridge-svc");
}

// ── Banking Connector ────────────────────────────────────────────────────────

export type BankConnection = {
  connection_id: string;
  account_id: string;
  tenant_id: string;
  legal_entity_id: string;
  bank_name: string;
  bic: string;
  /** Masked by the service, e.g. "****5678". */
  account_number: string;
  /** Masked by the service. */
  iban: string;
  currency: string;
  status: string;
  health_status: string;
  created_at: string;
  updated_at: string;
};

export async function listBankConnections(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("bankingConnector", "/v1/banking/connections", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<BankConnection>(res, "connections", "banking-connector-svc");
}

// ── HRIS Connector ───────────────────────────────────────────────────────────

export type HrisIntegration = {
  integration_id: string;
  sync_id: string;
  tenant_id: string;
  legal_entity_id: string;
  provider_name: string;
  api_endpoint: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listHrisIntegrations(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("hrisConnector", "/v1/hris/integrations", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<HrisIntegration>(res, "integrations", "hris-connector-svc");
}

/** POST /v1/hris/sync. Fails closed (503) until a real HRIS adapter is configured. */
export async function triggerHrisSync(identity: Identity, integrationId: string, syncType = "EMPLOYEES") {
  return apiPost<Record<string, unknown>>(
    "hrisConnector",
    "/v1/hris/sync",
    { integration_id: integrationId, sync_type: syncType },
    { identity, purposeContext: "integration.hris.sync" },
  );
}

// ── eSignature Integration ──────────────────────────────────────────────────

export type EsignatureEnvelope = {
  envelope_id: string;
  tenant_id: string;
  legal_entity_id: string;
  provider: string;
  document_title: string;
  signer_email: string;
  signer_name: string;
  status: "PENDING" | "SENT" | "DELIVERED" | "SIGNED" | "VOIDED";
  external_ref: string;
  created_at: string;
  updated_at: string;
};

export async function listEsignatureEnvelopes(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>("esignatureIntegration", "/v1/esignature/envelopes", {
    identity,
    query: entityQuery(identity),
  });
  return listOf<EsignatureEnvelope>(res, "envelopes", "esignature-integration-svc");
}

// ── External Data Feeds ──────────────────────────────────────────────────────

export type ExternalDataFeedSubscription = {
  feed_id: string;
  tenant_id: string;
  legal_entity_id: string;
  provider: string;
  feed_type: "MARKET_DATA" | "CREDIT_SCORE" | "COMPANY_INFO" | "FX_RATE" | "ESG_DATA";
  symbol: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listExternalDataFeeds(identity: Identity) {
  const res = await apiGet<Record<string, unknown>>(
    "externalDataFeed",
    "/v1/external-data-feeds/subscriptions",
    { identity, query: entityQuery(identity) },
  );
  return listOf<ExternalDataFeedSubscription>(res, "subscriptions", "external-data-feed-svc");
}

// ── Writes ─────────────────────────────────────────────────────────────────────
//
// Each body is what the reader entered plus the session's legal entity. A
// blank optional field is not sent. Registering a connection records it in the
// service; it does not connect to a bank, HRIS, signature or data provider
// (none has an adapter in this build). Checked live on the zv stack, 2026-11-06.

function compact(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== ""));
}

export async function createBridge(
  identity: Identity,
  body: { bridge_name: string; provider_name: string; protocol: string; endpoint_url: string; auth_type: string },
) {
  return apiPost<BridgeEndpoint>("connectivityApiBridge", "/v1/bridges", { ...body, legal_entity_id: identity.legalEntityId }, { identity, purposeContext: "integration.bridge.register" });
}

/** The service answers with the account number and IBAN; the console does not display them. */
export async function createBankConnection(
  identity: Identity,
  body: { bank_name: string; bic: string; account_number: string; iban?: string; currency: string; account_type?: string },
) {
  return apiPost<BankConnection & { account_type?: string }>(
    "bankingConnector",
    "/v1/banking/connections",
    compact({ ...body, legal_entity_id: identity.legalEntityId }),
    { identity, purposeContext: "integration.banking.connection" },
  );
}

export async function createHrisIntegration(
  identity: Identity,
  body: { provider_name: string; sync_type: string; direction: string; api_endpoint: string },
) {
  return apiPost<HrisIntegration & { sync_type?: string; direction?: string }>(
    "hrisConnector",
    "/v1/hris/integrations",
    { ...body, legal_entity_id: identity.legalEntityId },
    { identity, purposeContext: "integration.hris.sync" },
  );
}

export async function createDataFeedSubscription(identity: Identity, body: { provider: string; feed_type: string; symbol: string }) {
  return apiPost<ExternalDataFeedSubscription>(
    "externalDataFeed",
    "/v1/external-data-feeds/subscriptions",
    { ...body, legal_entity_id: identity.legalEntityId },
    { identity, purposeContext: "integration.datafeed.subscribe" },
  );
}

// ── eSignature: envelopes and signature profiles ──────────────────────────────

/**
 * POST /v1/esignature/envelopes. No provider adapter exists in this build, so
 * the service answers 503 esignature_provider_not_configured and records
 * nothing; the caller shows that refusal as it is.
 */
export async function createEsignatureEnvelope(
  identity: Identity,
  body: { document_title: string; signer_email: string; signer_name: string; provider: string },
) {
  return apiPost<EsignatureEnvelope>(
    "esignatureIntegration",
    "/v1/esignature/envelopes",
    { ...body, legal_entity_id: identity.legalEntityId },
    { identity, purposeContext: "integration.esignature.envelope" },
  );
}

export type SignatureAssuranceLevel = "SES" | "AES" | "QES";
export type SignatureIdentityRequirement = "EMAIL_ONLY" | "KBA" | "GOV_ID" | "VIDEO_ID";

/** The governed terms an envelope is signed under. DRAFT → ACTIVE (terms fixed) → RETIRED. */
export type SignatureProfile = {
  profile_id: string;
  tenant_id: string;
  legal_entity_id: string;
  assurance_level: SignatureAssuranceLevel;
  jurisdiction: string;
  identity_requirement: SignatureIdentityRequirement;
  witness_required: boolean;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  created_by_principal_id: string;
  created_at: string;
  activated_at?: string;
  retired_at?: string;
};

export async function createSignatureProfile(
  identity: Identity,
  body: { assurance_level: string; jurisdiction: string; identity_requirement: string; witness_required: boolean },
) {
  return apiPost<SignatureProfile>(
    "esignatureIntegration",
    "/v1/esignature/profiles",
    { ...body, legal_entity_id: identity.legalEntityId },
    { identity, purposeContext: "integration.esignature.profile" },
  );
}

/** The service has no profile list route; a profile is read by its id. Another tenant's id answers 404. */
export async function getSignatureProfile(identity: Identity, profileId: string) {
  return apiGet<SignatureProfile>("esignatureIntegration", `/v1/esignature/profiles/${encodeURIComponent(profileId)}`, { identity });
}

export async function transitionSignatureProfile(identity: Identity, profileId: string, to: "activate" | "retire") {
  return apiPost<SignatureProfile>(
    "esignatureIntegration",
    `/v1/esignature/profiles/${encodeURIComponent(profileId)}/${to}`,
    {},
    { identity, purposeContext: "integration.esignature.profile" },
  );
}
