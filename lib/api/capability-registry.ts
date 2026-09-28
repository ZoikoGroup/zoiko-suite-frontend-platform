import { apiGet, apiPost, apiPut, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./envelope";

// ── Domain Types (doc7 §7: Five Independent Registries) ─────────────────────

export type Capability = {
  capability_id: string;
  capability_code: string;
  module_domain: string;
  version: number;
  dependencies?: string;
  execution_risk_class: string;
  created_at: string;
  created_by_principal_id: string;
};

export type CreateCapabilityInput = {
  capability_code: string;
  module_domain: string;
  version?: number;
  dependencies?: string;
  execution_risk_class: string;
};

export type MarketRelease = {
  market_release_id: string;
  capability_id: string;
  market_code: string;
  language_code?: string;
  legal_approval_status: "APPROVED" | "PENDING" | "REJECTED";
  state: "INTERNAL" | "PILOT" | "BETA" | "GA" | "RESTRICTED" | "SUSPENDED" | "RETIRED";
  effective_from: string;
  effective_to?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type CreateMarketReleaseInput = {
  market_code: string;
  language_code?: string;
  legal_approval_status: string;
  state: string;
  effective_from: string;
};

export type IntegrationCapability = {
  integration_capability_id: string;
  capability_id: string;
  provider_code: string;
  certified: boolean;
  health_status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
  created_at: string;
  updated_at: string;
  created_by_principal_id: string;
};

export type CreateIntegrationCapabilityInput = {
  provider_code: string;
  certified: boolean;
  health_status?: string;
};

export type Release = {
  release_id: string;
  capability_id: string;
  state: "GA" | "BETA" | "PILOT" | "INTERNAL" | "DISABLED" | "INCIDENT_RESTRICTED";
  reason?: string;
  effective_from: string;
  created_at: string;
  created_by_principal_id: string;
};

export type SetReleaseStateInput = {
  state: string;
  reason?: string;
};

export type CapabilityClaim = {
  claim_id: string;
  capability_id: string;
  claim_text: string;
  market_scope?: string;
  wording_owner_principal_id: string;
  approved_by_principal_id: string;
  expiry_review_date?: string;
  created_at: string;
  created_by_principal_id: string;
};

export type CreateCapabilityClaimInput = {
  claim_text: string;
  market_scope?: string;
  wording_owner_principal_id: string;
  approved_by_principal_id: string;
  expiry_review_date?: string;
};

export type CapabilityResolution = {
  capability_code: string;
  enabled: boolean;
  reason_code:
    | "ENABLED"
    | "CAPABILITY_UNKNOWN"
    | "MARKET_BLOCKED"
    | "PROVIDER_UNAVAILABLE"
    | "INCIDENT_RESTRICTED"
    | "DISABLED";
  detail?: string;
};

// ── API Operations ──────────────────────────────────────────────────────────

export async function createCapability(
  input: CreateCapabilityInput,
  identity?: Identity
): Promise<ApiWriteResult<Capability>> {
  return apiPost<Capability>("capabilityRegistry", "/v1/capabilities", input, { identity });
}

export async function getCapability(
  id: string,
  identity?: Identity
): Promise<ApiResult<Capability>> {
  return apiGet<Capability>("capabilityRegistry", `/v1/capabilities/${encodeURIComponent(id)}`, {
    identity,
  });
}

export async function createMarketRelease(
  capabilityId: string,
  input: CreateMarketReleaseInput,
  identity?: Identity
): Promise<ApiWriteResult<MarketRelease>> {
  return apiPost<MarketRelease>(
    "capabilityRegistry",
    `/v1/capabilities/${encodeURIComponent(capabilityId)}/market-releases`,
    input,
    { identity }
  );
}

export async function createIntegrationCapability(
  capabilityId: string,
  input: CreateIntegrationCapabilityInput,
  identity?: Identity
): Promise<ApiWriteResult<IntegrationCapability>> {
  return apiPost<IntegrationCapability>(
    "capabilityRegistry",
    `/v1/capabilities/${encodeURIComponent(capabilityId)}/integration-capabilities`,
    input,
    { identity }
  );
}

export async function listIntegrationCapabilities(
  capabilityId: string,
  identity?: Identity
): Promise<ApiResult<IntegrationCapability[]>> {
  const res = await apiGet<{ integration_capabilities?: IntegrationCapability[] } | IntegrationCapability[]>(
    "capabilityRegistry",
    `/v1/capabilities/${encodeURIComponent(capabilityId)}/integration-capabilities`,
    { identity }
  );
  if (!res.ok) return res;
  let items: IntegrationCapability[] = [];
  if (Array.isArray(res.data)) {
    items = res.data;
  } else if (res.data && Array.isArray((res.data as any).integration_capabilities)) {
    items = (res.data as any).integration_capabilities;
  }
  return { ok: true, data: items };
}

export async function updateIntegrationHealth(
  integrationId: string,
  healthStatus: string,
  identity?: Identity
): Promise<ApiWriteResult<{ status: string }>> {
  return apiPut<{ status: string }>(
    "capabilityRegistry",
    `/v1/integration-capabilities/${encodeURIComponent(integrationId)}/health`,
    { health_status: healthStatus },
    { identity }
  );
}

export async function setReleaseState(
  capabilityId: string,
  input: SetReleaseStateInput,
  identity?: Identity
): Promise<ApiWriteResult<Release>> {
  return apiPost<Release>(
    "capabilityRegistry",
    `/v1/capabilities/${encodeURIComponent(capabilityId)}/release-state`,
    input,
    { identity }
  );
}

export async function createCapabilityClaim(
  capabilityId: string,
  input: CreateCapabilityClaimInput,
  identity?: Identity
): Promise<ApiWriteResult<CapabilityClaim>> {
  return apiPost<CapabilityClaim>(
    "capabilityRegistry",
    `/v1/capabilities/${encodeURIComponent(capabilityId)}/claims`,
    input,
    { identity }
  );
}

export async function listCapabilityClaims(
  capabilityId: string,
  identity?: Identity
): Promise<ApiResult<CapabilityClaim[]>> {
  const res = await apiGet<{ claims?: CapabilityClaim[] } | CapabilityClaim[]>(
    "capabilityRegistry",
    `/v1/capabilities/${encodeURIComponent(capabilityId)}/claims`,
    { identity }
  );
  if (!res.ok) return res;
  let items: CapabilityClaim[] = [];
  if (Array.isArray(res.data)) {
    items = res.data;
  } else if (res.data && Array.isArray((res.data as any).claims)) {
    items = (res.data as any).claims;
  }
  return { ok: true, data: items };
}

export async function resolveCapability(
  capabilityCode: string,
  params?: { market?: string },
  identity?: Identity
): Promise<ApiResult<CapabilityResolution>> {
  const searchParams = new URLSearchParams();
  // Backend handler reads r.URL.Query().Get("market_code") — see
  // handler.go's ResolveCapability. A prior "market" key here meant every
  // market-scoped resolution silently ignored the requested market.
  if (params?.market) searchParams.set("market_code", params.market);
  const qs = searchParams.toString();
  const url = `/v1/capability-resolution/${encodeURIComponent(capabilityCode)}${qs ? `?${qs}` : ""}`;
  return apiGet<CapabilityResolution>("capabilityRegistry", url, { identity });
}
