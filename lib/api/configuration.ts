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
  /** Omit for the environment-wide global default. */
  tenantId?: string;
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
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
  });
}

// ─── Config entries, and single-key lookups ──────────────────────────────────
//
// A note on scoping that applies to every read below. Both resources are keyed
// on the tuple (key, environment, tenant_id), and the single-key GETs match that
// tuple EXACTLY — there is no fallback from a tenant-specific miss to the global
// default. So a 404 from GET /v1/flags/{key}?environment=prod does not mean the
// flag is unset; it means it is unset *at that exact scope*, and a global default
// may well exist. The list endpoints behave differently again: omitting
// tenant_id there means "no filter", returning entries across all tenants rather
// than only the global ones.
//
// Those two readings of an omitted tenant_id are opposite, which is exactly the
// kind of thing a console should state rather than let a reader assume.

export type UpsertConfigInput = {
  key: string;
  /** Any JSON value. Sent as-is — the service stores it as raw JSON, so a string
   *  config value must still be a JSON string, not a bare token. */
  value: unknown;
  environment: string;
  /** Omit for the environment-wide global default. */
  tenantId?: string;
  principalId: string;
};

/**
 * Record a config value.
 *
 * Same append-only versioning as flags: 201 when the value genuinely changed,
 * 200 when it already equalled what was submitted. The service compares the
 * stored JSON to the submitted JSON, so a reordered object counts as a change.
 */
export async function upsertConfigEntry(
  input: UpsertConfigInput,
): Promise<ApiWriteResult<ConfigEntry>> {
  return apiPost<ConfigEntry>("configuration", "/v1/config", {
    key: input.key,
    value: input.value,
    environment: input.environment,
    created_by_principal_id: input.principalId,
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
  });
}

/**
 * The config entry currently effective for an exact (key, environment, tenant)
 * tuple.
 *
 * `environment` is required — the service answers 400 without it.
 */
export async function getConfigEntry(
  key: string,
  environment: string,
  tenantId?: string,
): Promise<ApiResult<ConfigEntry>> {
  return apiGet<ConfigEntry>("configuration", `/v1/config/${encodeURIComponent(key)}`, {
    query: { environment, tenant_id: tenantId },
  });
}

/** The feature flag currently effective for an exact tuple. See the scoping note
 *  above before reading a 404 as "not set". */
export async function getFeatureFlag(
  key: string,
  environment: string,
  tenantId?: string,
): Promise<ApiResult<FeatureFlag>> {
  return apiGet<FeatureFlag>("configuration", `/v1/flags/${encodeURIComponent(key)}`, {
    query: { environment, tenant_id: tenantId },
  });
}

/** Environments the console offers. Free-text in the service. */
export const ENVIRONMENTS = ["local", "dev", "staging", "prod"] as const;

/** Turn a backend failure into something an operator can act on. */
export function explainConfigurationError(message: string): string {
  if (message.includes("rollout_percentage")) {
    return "Rollout percentage must be between 0 and 100.";
  }
  if (message.includes("missing_field")) {
    const field = message.split("missing_field").pop()?.trim();
    if (field?.includes("enabled")) {
      return "The flag state is required. An omitted boolean and `false` are different facts on an append-only log, so the service will not default it.";
    }
    if (field?.includes("environment")) {
      return "Environment is required — a config value with no environment has no scope.";
    }
    if (field?.includes("value")) {
      return "A config value is required, and it must be valid JSON.";
    }
    return `A required field was empty: ${field || "check the form"}.`;
  }
  if (message.includes("invalid_json")) {
    return "The value was not valid JSON. Strings need quotes — write \"on\", not on.";
  }
  if (message.includes("config_entry_not_found")) {
    return "No config entry is effective for that exact key, environment, and tenant. A global default may still exist — this lookup does not fall back to it.";
  }
  if (message.includes("feature_flag_not_found")) {
    return "No flag is effective for that exact key, environment, and tenant. A global default may still exist — this lookup does not fall back to it.";
  }
  if (message.includes("store_unavailable")) {
    return "configuration-feature-flag-svc could not reach its database. Nothing was written.";
  }
  return message;
}
