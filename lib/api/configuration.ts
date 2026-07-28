// configuration-feature-flag-svc (:8086) — feature flags and config entries.
//
// This is the one service the console WRITES to. Its store is append-only and
// versioned: POST /v1/flags does not overwrite a row, it records a new version
// and returns
//
//   201 → a real transition was recorded (enabled/rollout actually changed)
//   200 → the submitted state matched the stored state; nothing was written
//
// That distinction is the point of the service, so it is carried all the way
// through to the UI rather than collapsed into "saved".

import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";

/** Wire shape. Field names match the Go json tags exactly. */
export type FeatureFlag = {
  flag_id: string;
  key: string;
  enabled: boolean;
  environment: string;
  tenant_id: string | null;
  rollout_percentage: number;
  effective_from: string;
  effective_to: string | null;
  created_by_principal_id: string;
  created_at: string;
};

export type ConfigEntry = {
  config_id: string;
  key: string;
  value: unknown;
  environment: string;
  tenant_id: string | null;
  effective_from: string;
  effective_to: string | null;
  created_by_principal_id: string;
  created_at: string;
};

export type UpsertFlagInput = {
  key: string;
  enabled: boolean;
  environment: string;
  rolloutPercentage?: number;
  /** Who is making the change — recorded on the new version. */
  principalId: string;
};

/** Current version of every feature flag, newest-changed first. */
export async function listFeatureFlags(environment?: string): Promise<ApiResult<FeatureFlag[]>> {
  const result = await apiGet<FeatureFlag[]>("configuration", "/v1/flags", {
    query: { environment },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "configuration returned a non-array flag list" },
    };
  }

  const flags = [...result.data].sort(
    (a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime(),
  );
  return { ok: true, data: flags };
}

export async function listConfigEntries(environment?: string): Promise<ApiResult<ConfigEntry[]>> {
  const result = await apiGet<ConfigEntry[]>("configuration", "/v1/config", {
    query: { environment },
  });

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "configuration returned a non-array config list" },
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Record a feature-flag state.
 *
 * `enabled` is sent explicitly because the service treats a missing `enabled`
 * as a validation error rather than defaulting it — an omitted boolean and
 * `false` must stay distinguishable on an append-only log.
 */
export async function upsertFeatureFlag(
  input: UpsertFlagInput,
): Promise<ApiWriteResult<FeatureFlag>> {
  return apiPost<FeatureFlag>("configuration", "/v1/flags", {
    key: input.key,
    enabled: input.enabled,
    environment: input.environment,
    created_by_principal_id: input.principalId,
    ...(input.rolloutPercentage === undefined
      ? {}
      : { rollout_percentage: input.rolloutPercentage }),
  });
}
