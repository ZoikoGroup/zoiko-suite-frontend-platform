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
  interpretConfigValue,
  type ConfigEntry,
  type FeatureFlag,
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

/**
 * The caller's own verified tenant, sent as X-Tenant-Id on every call.
 *
 * Distinct from sessionTenant() below, which answers "which SCOPE is this write
 * for" and is legitimately undefined for a global default. This one is the
 * caller's identity and is never optional: the service refuses a request with no
 * verified scope, because a tenant_id in a body used to be the only thing saying
 * whose configuration was being changed.
 */
async function requireTenantScope(): Promise<string> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return session.tenantId;
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
  const scope = String(formData.get("scope") ?? "tenant").trim();

  if (!key) return { status: "error", message: "Name the feature this setting is for." };
  if (!environment) {
    return { status: "error", message: "Choose which environment this setting applies to." };
  }

  let rolloutPercentage: number | undefined;
  if (rolloutRaw !== "") {
    const parsed = Number(rolloutRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      return {
        status: "error",
        message:
          "The share of people who get the feature has to be a whole number between 0 and 100. Leave it blank to give it to everyone.",
      };
    }
    rolloutPercentage = parsed;
  }

  // The scope is read from the form rather than left off. Every flag written
  // here used to go in with no tenant_id, which the service reads as the
  // environment-wide default for ALL organisations — while the lookup on the
  // same page defaults to this organisation's own scope and does not fall back.
  // So the console wrote one scope, read another, and reported a flag it had
  // just saved as never set.
  const result = await upsertFeatureFlag({
    key,
    enabled,
    environment,
    rolloutPercentage,
    principalId,
    tenantId: scope === "tenant" ? await sessionTenant() : undefined,
    callerTenantId: await requireTenantScope(),
  });

  if (!result.ok) {
    return { status: "error", message: explainConfigurationError(result.error.message), key };
  }

  refresh();

  // The recorded row travels back with the verdict. The form reads the change
  // out of that row rather than restating the inputs: the service, not the form,
  // decides the effective-from stamp and the rollout share when none was sent.
  return result.status === 201
    ? {
        status: "created",
        key,
        flag: result.data,
        message: `Saved. ${key} is now ${enabled ? "switched on" : "switched off"} in ${environment}, and the change is recorded below.`,
      }
    : {
        status: "unchanged",
        key,
        flag: result.data,
        message: `Nothing to change — ${key} was already ${enabled ? "switched on" : "switched off"} in ${environment} with the same share of people, so no new version was recorded. What is in force is shown below.`,
      };
}

/**
 * Flip an existing flag. Same append-only write as submitFlag; the rollout
 * percentage is carried over so a toggle doesn't silently reset it.
 *
 * The row's own scope is carried over for the same reason. Without it, toggling
 * an organisation-specific flag wrote a new version with no tenant_id — the
 * environment-wide default — which leaves the original still in force for this
 * organisation and overrides the default for every OTHER organisation. The
 * button then appeared to do nothing while changing a scope nobody asked about.
 */
export async function toggleFlag(formData: FormData): Promise<void> {
  const principalId = await requirePrincipal();

  const key = String(formData.get("key") ?? "");
  const environment = String(formData.get("environment") ?? "");
  const nextEnabled = formData.get("next_enabled") === "true";
  const rolloutRaw = String(formData.get("rollout_percentage") ?? "");
  const tenantScoped = formData.get("tenant_scoped") === "true";

  await upsertFeatureFlag({
    key,
    enabled: nextEnabled,
    environment,
    rolloutPercentage: rolloutRaw === "" ? undefined : Number(rolloutRaw),
    principalId,
    tenantId: tenantScoped ? await sessionTenant() : undefined,
    callerTenantId: await requireTenantScope(),
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

  if (!key) return { status: "error", message: "Name the setting you want to change." };
  if (!environment) {
    return { status: "error", message: "Choose which environment this setting applies to." };
  }

  // Plain text is accepted and read as what it plainly is. See
  // interpretConfigValue for what it will and will not assume — a half-typed
  // structure is still refused rather than stored as a piece of text.
  const interpreted = interpretConfigValue(valueRaw);
  if (!interpreted.ok) {
    return { status: "error", message: interpreted.message, key };
  }
  const value = interpreted.value;

  const result = await upsertConfigEntry({
    key,
    value,
    environment,
    principalId,
    tenantId: scope === "tenant" ? await sessionTenant() : undefined,
    // The scope being written can be global; the caller writing it cannot.
    callerTenantId: await requireTenantScope(),
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
  // Any assumption made about what was typed is stated, not applied quietly.
  const assumption = interpreted.note ? ` ${interpreted.note}` : "";

  return result.status === 201
    ? {
        status: "created",
        key,
        entry: result.data,
        message:
          `Saved. ${key} now applies to ${scope === "tenant" ? "your organisation" : "everyone"} in ${environment}, ` +
          "and is shown below as it was recorded. If a value was already in force for this exact " +
          `scope, it has been kept as history rather than overwritten.${assumption}`,
      }
    : {
        status: "unchanged",
        key,
        entry: result.data,
        message:
          `Nothing to change — ${key} already held exactly this value in ${environment} for this ` +
          `scope, so no new version was recorded. What is in force is shown below.${assumption}`,
      };
}

/**
 * The three parts of a lookup, out of one space-separated box.
 *
 * The scope word is matched against a small vocabulary rather than the single
 * literal "tenant" the parsing used to compare against. Everything that was not
 * exactly that word fell through to the global default — so a reader who typed
 * "mine", "tenant-only", or a stray trailing space was silently answered about a
 * different scope than the one they asked about, and the miss message then told
 * them to try the scope they had in fact just been given.
 */
const TENANT_WORDS = new Set([
  "tenant",
  "this-organisation",
  "this-organization",
  "organisation",
  "organization",
  "org",
  "mine",
  "us",
]);

const GLOBAL_WORDS = new Set([
  "global",
  "everyone",
  "everybody",
  "default",
  "environment-wide",
  "all",
]);

type ParsedLookup =
  | { ok: true; name: string; environment: string; tenantScoped: boolean; scopeLabel: string }
  | { ok: false; message: string };

function parseLookup(raw: string, noun: string): ParsedLookup {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const name = parts[0];
  if (!name) return { ok: false, message: `Enter the name of the ${noun} to look up.` };

  const environment = parts[1] ?? "local";
  const scopeWord = (parts[2] ?? "tenant").toLowerCase();

  if (!TENANT_WORDS.has(scopeWord) && !GLOBAL_WORDS.has(scopeWord)) {
    return {
      ok: false,
      message: `"${parts[2]}" is not a scope this lookup understands. Write "this-organisation" for your own organisation, or "everyone" for the environment-wide default.`,
    };
  }

  const tenantScoped = TENANT_WORDS.has(scopeWord);
  return {
    ok: true,
    name,
    environment,
    tenantScoped,
    scopeLabel: tenantScoped ? "your organisation" : "everyone in that environment",
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
  _previous: LookupState<ConfigEntry>,
  formData: FormData,
): Promise<LookupState<ConfigEntry>> {
  const parsed = parseLookup(String(formData.get("config_key") ?? ""), "setting");
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const { name, environment, tenantScoped, scopeLabel } = parsed;
  const result = await getConfigEntry(
    name,
    environment,
    await requireTenantScope(),
    tenantScoped ? await sessionTenant() : undefined,
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          `No value is set for "${name}" in ${environment} for ${scopeLabel}. ` +
          (tenantScoped
            ? `That does not mean the setting is unset — this checks one scope exactly and does not look anywhere else. There may be a shared default for the whole environment: try "${name} ${environment} everyone".`
            : "This checks one scope exactly, so your own organisation may still have its own value set."),
      };
    }
    return { status: "error", message: explainConfigurationError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}

/** Read the feature flag effective for one exact scope. Same no-fallback caveat. */
export async function lookupFeatureFlag(
  _previous: LookupState<FeatureFlag>,
  formData: FormData,
): Promise<LookupState<FeatureFlag>> {
  const parsed = parseLookup(String(formData.get("flag_key") ?? ""), "feature");
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const { name, environment, tenantScoped, scopeLabel } = parsed;
  const result = await getFeatureFlag(
    name,
    environment,
    await requireTenantScope(),
    tenantScoped ? await sessionTenant() : undefined,
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          `Nothing has been recorded for "${name}" in ${environment} for ${scopeLabel}, so this console cannot say whether the feature is on. ` +
          (tenantScoped
            ? `This checks one scope exactly. There may be a setting that covers the whole environment: try "${name} ${environment} everyone".`
            : "This checks one scope exactly, so your own organisation may still have its own setting."),
      };
    }
    return { status: "error", message: explainConfigurationError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}
