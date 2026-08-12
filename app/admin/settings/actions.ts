"use server";

// Server Actions that WRITE to configuration-feature-flag-svc (:8086).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  upsertFeatureFlag,
  upsertConfigEntry,
  getConfigEntry,
  getFeatureFlag,
  explainConfigurationError,
} from "@/lib/api/configuration";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { ConfigActionState, FlagActionState } from "./state";

// Writes end in refresh(), not revalidatePath. Nothing on this route is cached
// — cacheComponents is off and every panel reads cookies() for the session — so
// there was no cache for revalidatePath to invalidate, while in a Server
// Function it additionally refreshes every previously visited page. refresh()
// re-renders just this route, which is what these actions actually want.

/**
 * The principal a write is attributed to.
 *
 * The service's column is `created_by_principal_id` and is TEXT, so anything is
 * accepted — but every other service in the suite attributes to the principal
 * UUID, and rows written with an email here cannot be joined against them. The
 * session's principal id is the correct value.
 */
async function requirePrincipal(): Promise<string> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return session.principalId;
}

/** The session's tenant, for scoping a write to this tenant rather than the
 *  environment-wide global default. The column is UUID, so a readable id would
 *  fail inside the driver and surface as a 503 rather than a 400. */
async function sessionTenant(): Promise<string | undefined> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  return session?.tenantId;
}

/**
 * Create or re-assert a feature flag from the form.
 *
 * Returns the backend's own verdict: 201 means a new version was written, 200
 * means the submitted state already matched and the service deliberately did
 * nothing.
 */
export async function submitFlag(
  _previous: FlagActionState,
  formData: FormData,
): Promise<FlagActionState> {
  let principalId: string;
  try {
    principalId = await requirePrincipal();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const key = String(formData.get("key") ?? "").trim();
  const environment = String(formData.get("environment") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  const rolloutRaw = String(formData.get("rollout_percentage") ?? "").trim();

  if (!key) return { status: "error", message: "Flag key is required." };
  if (!environment) return { status: "error", message: "Environment is required." };

  let rolloutPercentage: number | undefined;
  if (rolloutRaw !== "") {
    const parsed = Number(rolloutRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      return { status: "error", message: "Rollout must be a whole number between 0 and 100." };
    }
    rolloutPercentage = parsed;
  }

  const result = await upsertFeatureFlag({
    key,
    enabled,
    environment,
    rolloutPercentage,
    principalId,
  });

  if (!result.ok) {
    return { status: "error", message: explainConfigurationError(result.error.message), key };
  }

  refresh();

  return result.status === 201
    ? {
        status: "created",
        key,
        message: `Transition recorded — ${key} is now ${enabled ? "enabled" : "disabled"} in ${environment}.`,
      }
    : {
        status: "unchanged",
        key,
        message: `No change — ${key} was already ${enabled ? "enabled" : "disabled"} in ${environment}. Nothing written.`,
      };
}

/**
 * Flip an existing flag. Same append-only write as submitFlag; the rollout
 * percentage is carried over so a toggle doesn't silently reset it.
 */
export async function toggleFlag(formData: FormData): Promise<void> {
  const principalId = await requirePrincipal();

  const key = String(formData.get("key") ?? "");
  const environment = String(formData.get("environment") ?? "");
  const nextEnabled = formData.get("next_enabled") === "true";
  const rolloutRaw = String(formData.get("rollout_percentage") ?? "");

  await upsertFeatureFlag({
    key,
    enabled: nextEnabled,
    environment,
    rolloutPercentage: rolloutRaw === "" ? undefined : Number(rolloutRaw),
    principalId,
  });

  refresh();
}

/**
 * Record a config value.
 *
 * The value is parsed as JSON before sending. The service stores raw JSON, so an
 * unquoted string is a parse error there rather than a stored string — catching
 * it here says "strings need quotes" instead of surfacing a 400 invalid_json.
 */
export async function submitConfigEntry(
  _previous: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  let principalId: string;
  try {
    principalId = await requirePrincipal();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const key = String(formData.get("key") ?? "").trim();
  const environment = String(formData.get("environment") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();
  const scope = String(formData.get("scope") ?? "tenant").trim();

  if (!key) return { status: "error", message: "Config key is required." };
  if (!environment) return { status: "error", message: "Environment is required." };
  if (!valueRaw) return { status: "error", message: "A value is required." };

  let value: unknown;
  try {
    value = JSON.parse(valueRaw);
  } catch {
    return {
      status: "error",
      message:
        'The value must be valid JSON. A bare string needs quotes — write "on" rather than on.',
      key,
    };
  }

  const result = await upsertConfigEntry({
    key,
    value,
    environment,
    principalId,
    tenantId: scope === "tenant" ? await sessionTenant() : undefined,
  });

  if (!result.ok) {
    return { status: "error", message: explainConfigurationError(result.error.message), key };
  }

  refresh();

  // 201 covers two different facts the service does not distinguish: the first
  // write at this scope, and a changed value at a scope that already had one.
  // The message must be true of both, so it states the append-only rule
  // conditionally rather than asserting a predecessor was end-dated — on a first
  // write there is no predecessor, and claiming otherwise is simply wrong.
  return result.status === 201
    ? {
        status: "created",
        key,
        message: `Version recorded — ${key} in ${environment} at ${scope === "tenant" ? "tenant" : "environment-wide"} scope. If a value was already effective at this exact scope it has been end-dated, never overwritten.`,
      }
    : {
        status: "unchanged",
        key,
        message: `No change — ${key} already held exactly this value in ${environment} at this scope. Nothing was written.`,
      };
}

/**
 * Read the config entry effective for one exact scope.
 *
 * The exactness matters and is the point of exposing this separately from the
 * list: this route does NOT fall back from a tenant-specific miss to the global
 * default, so a 404 here says nothing about whether a global value exists.
 */
export async function lookupConfigEntry(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const key = String(formData.get("config_key") ?? "").trim();
  if (!key) return { status: "error", message: "Enter a config key." };

  const [name, environment = "local", scope = "tenant"] = key.split(/\s+/);
  const result = await getConfigEntry(
    name,
    environment,
    scope === "tenant" ? await sessionTenant() : undefined,
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message: `Nothing effective for key "${name}" in ${environment} at ${scope} scope. This lookup matches the scope exactly and does not fall back, so a global default may still exist — try "${name} ${environment} global".`,
      };
    }
    return { status: "error", message: explainConfigurationError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

/** Read the feature flag effective for one exact scope. Same no-fallback caveat. */
export async function lookupFeatureFlag(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const key = String(formData.get("flag_key") ?? "").trim();
  if (!key) return { status: "error", message: "Enter a flag key." };

  const [name, environment = "local", scope = "tenant"] = key.split(/\s+/);
  const result = await getFeatureFlag(
    name,
    environment,
    scope === "tenant" ? await sessionTenant() : undefined,
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message: `No flag effective for "${name}" in ${environment} at ${scope} scope. A global default may still exist — try "${name} ${environment} global".`,
      };
    }
    return { status: "error", message: explainConfigurationError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}
