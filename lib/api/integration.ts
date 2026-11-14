// lib/api/integration.ts
// Server-side typed API client for Group 10: Integration & Extensibility services.
// All functions return ApiResult<T> — never throw — ensuring modular resilience.

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

// List reads go to the route each service actually serves (verified on the zv
// stack), with the caller's identity. The services answer in different envelopes
// ({ data }, { items }, or a named list); readList takes the named array and the
// wrapper keeps the shape the console already uses.
async function readList<T>(
  service: Parameters<typeof apiGet>[0],
  path: string,
  key: string,
  identity: Identity | undefined,
  query: Record<string, string | undefined> = {},
): Promise<ApiResult<T[]>> {
  const res = await apiGet<Record<string, unknown>>(service, path, { identity, query });
  if (!res.ok) return res;
  const list = res.data?.[key];
  if (list === null || list === undefined) return { ok: true, data: [] };
  if (!Array.isArray(list)) {
    return { ok: false, error: { kind: "malformed", message: `${path} did not return a "${key}" list` } };
  }
  return { ok: true, data: list as T[] };
}


// ── Connectivity API Bridge ──────────────────────────────────────────────────

export type BridgeConnection = {
  connection_id: string;
  tenant_id: string;
  system_name: string;
  protocol: "REST" | "GRAPHQL" | "GRPC" | "SOAP" | "WEBHOOK";
  auth_type: "OAUTH2" | "API_KEY" | "MTLS" | "BASIC";
  status: "ACTIVE" | "DEGRADED" | "INACTIVE";
  last_ping_at: string;
  created_at: string;
};

export type BridgeConnectionListResponse = {
  connections: BridgeConnection[];
  total: number;
};

export async function listBridgeConnections(tenantId: string, identity?: Identity): Promise<ApiResult<BridgeConnectionListResponse>> {
  const res = await readList<BridgeConnectionListResponse["connections"][number]>("connectivityApiBridge", "/v1/api-bridge/connections", "connections", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { connections: res.data, total: res.data.length } as BridgeConnectionListResponse };
}

export async function createBridgeConnection(
  tenantId: string,
  body: {
    system_name: string;
    protocol: string;
    auth_type: string;
  }
) {
  return apiPost<{ connection: BridgeConnection }>(
    "connectivityApiBridge",
    "/api/v1/connections",
    {
      tenant_id: tenantId,
      ...body,
    }
  );
}

// ── Banking Connector ────────────────────────────────────────────────────────

export type BankConnection = {
  connection_id: string;
  tenant_id: string;
  bank_name: string;
  institution_code: string;
  protocol: "OPEN_BANKING" | "SWIFT" | "ACH" | "DIRECT_FEED";
  status: "CONNECTED" | "SYNCING" | "DISCONNECTED" | "ERROR";
  last_sync_at: string;
  sync_lag_seconds: number;
  created_at: string;
};

export type BankConnectionListResponse = {
  connections: BankConnection[];
  total: number;
};

export async function listBankConnections(tenantId: string, identity?: Identity): Promise<ApiResult<BankConnectionListResponse>> {
  const res = await readList<BankConnectionListResponse["connections"][number]>("bankingConnector", "/v1/banking/connections", "connections", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { connections: res.data, total: res.data.length } as BankConnectionListResponse };
}

export async function triggerBankSync(
  tenantId: string,
  connectionId: string
) {
  return apiPost<{ connection: BankConnection }>(
    "bankingConnector",
    `/api/v1/connections/${connectionId}/sync`,
    { tenant_id: tenantId }
  );
}

// ── HRIS Connector ───────────────────────────────────────────────────────────

export type HrisConnection = {
  connection_id: string;
  tenant_id: string;
  hris_system: "WORKDAY" | "BAMBOOHR" | "RIPPLING" | "HIBOB" | "CUSTOM";
  sync_scope: "EMPLOYEES" | "DEPARTMENTS" | "COMPENSATION" | "FULL";
  status: "ACTIVE" | "PAUSED" | "ERROR";
  last_sync_at: string;
  records_synced: number;
  sync_errors: number;
  created_at: string;
};

export type HrisConnectionListResponse = {
  connections: HrisConnection[];
  total: number;
};

export async function listHrisConnections(tenantId: string, identity?: Identity): Promise<ApiResult<HrisConnectionListResponse>> {
  const res = await readList<HrisConnectionListResponse["connections"][number]>("hrisConnector", "/v1/hris/integrations", "integrations", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { connections: res.data, total: res.data.length } as HrisConnectionListResponse };
}

export async function triggerHrisSync(
  tenantId: string,
  connectionId: string
) {
  return apiPost<{ connection: HrisConnection }>(
    "hrisConnector",
    `/api/v1/connections/${connectionId}/sync`,
    { tenant_id: tenantId }
  );
}

// ── eSignature Integration ──────────────────────────────────────────────────

export type EsignatureSignatory = {
  name: string;
  email: string;
  role: string;
  status: "PENDING" | "SIGNED" | "DECLINED";
  signed_at?: string;
};

export type EsignatureEnvelope = {
  envelope_id: string;
  tenant_id: string;
  document_id: string;
  provider: "DOCUSIGN" | "ADOBESIGN" | "INTERNAL";
  signatories: EsignatureSignatory[];
  status: "DRAFT" | "SENT" | "DELIVERED" | "COMPLETED" | "DECLINED" | "VOIDED";
  sent_at: string;
  completed_at: string | null;
  created_at: string;
};

export type EsignatureEnvelopeListResponse = {
  envelopes: EsignatureEnvelope[];
  total: number;
};

export async function listEsignatureEnvelopes(tenantId: string, identity?: Identity): Promise<ApiResult<EsignatureEnvelopeListResponse>> {
  const res = await readList<EsignatureEnvelopeListResponse["envelopes"][number]>("esignatureIntegration", "/v1/esignature/envelopes", "envelopes", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { envelopes: res.data, total: res.data.length } as EsignatureEnvelopeListResponse };
}

export async function sendEsignatureEnvelope(
  tenantId: string,
  body: {
    document_id: string;
    provider?: string;
    signatories: EsignatureSignatory[];
  }
) {
  return apiPost<{ envelope: EsignatureEnvelope }>(
    "esignatureIntegration",
    "/api/v1/envelopes",
    {
      tenant_id: tenantId,
      ...body,
    }
  );
}

// ── External Data Feeds ──────────────────────────────────────────────────────

export type ExternalDataFeedSubscription = {
  subscription_id: string;
  tenant_id: string;
  feed_name: string;
  provider: "REFINITIV" | "BLOOMBERG" | "ECB" | "CUSTOM_API";
  data_type: "FX_RATES" | "SANCTIONS_LIST" | "INTEREST_RATES" | "COMMODITIES";
  status: "ACTIVE" | "PAUSED" | "DISCONNECTED";
  last_received_at: string;
  created_at: string;
};

export type ExternalDataFeedListResponse = {
  subscriptions: ExternalDataFeedSubscription[];
  total: number;
};

export async function listExternalDataFeeds(tenantId: string, identity?: Identity): Promise<ApiResult<ExternalDataFeedListResponse>> {
  const res = await readList<ExternalDataFeedListResponse["subscriptions"][number]>("externalDataFeed", "/v1/external-data-feeds/subscriptions", "subscriptions", identity, { tenant_id: tenantId });
  if (!res.ok) return res;
  return { ok: true, data: { subscriptions: res.data, total: res.data.length } as ExternalDataFeedListResponse };
}

export async function createDataFeedSubscription(
  tenantId: string,
  body: {
    feed_name: string;
    provider: string;
    data_type: string;
  }
) {
  return apiPost<{ subscription: ExternalDataFeedSubscription }>(
    "externalDataFeed",
    "/api/v1/subscriptions",
    {
      tenant_id: tenantId,
      ...body,
    }
  );
}
