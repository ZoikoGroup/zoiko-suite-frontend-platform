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
  /** The caller's own verified tenant, forwarded as X-Tenant-Id. Distinct from
   *  `tenantId`, which is the SCOPE being written and may be absent (global). */
  callerTenantId: string;
};

/**
 * Current version of every feature flag in the caller's tenant, plus the
 * environment-wide globals that apply to it.
 *
 * `callerTenantId` is required. An omitted tenant filter used to mean "no
 * filter" on this route — every tenant's flags — so the console was reading
 * other tenants' feature state. The service now scopes the list to the verified
 * header and includes the globals alongside it.
 */
export async function listFeatureFlags(
  callerTenantId: string,
  environment?: string,
): Promise<ApiResult<FeatureFlag[]>> {
  const result = await apiGet<FeatureFlag[]>("configuration", "/v1/flags", {
    query: { environment },
    identity: { tenantId: callerTenantId },
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

export async function listConfigEntries(
  callerTenantId: string,
  environment?: string,
): Promise<ApiResult<ConfigEntry[]>> {
  const result = await apiGet<ConfigEntry[]>("configuration", "/v1/config", {
    query: { environment },
    identity: { tenantId: callerTenantId },
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
  return apiPost<FeatureFlag>(
    "configuration",
    "/v1/flags",
    {
      key: input.key,
      enabled: input.enabled,
      environment: input.environment,
      created_by_principal_id: input.principalId,
      ...(input.rolloutPercentage === undefined
        ? {}
        : { rollout_percentage: input.rolloutPercentage }),
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    },
    { identity: { principalId: input.principalId, tenantId: input.callerTenantId } },
  );
}

// ─── Config entries, and single-key lookups ──────────────────────────────────
//
// A note on scoping that applies to every read below. Both resources are keyed
// on the tuple (key, environment, tenant_id), and the single-key GETs match that
// tuple EXACTLY — there is no fallback from a tenant-specific miss to the global
// default. So a 404 from GET /v1/flags/{key}?environment=prod does not mean the
// flag is unset; it means it is unset *at that exact scope*, and a global default
// may well exist. The list endpoints behave differently again: omitting
// tenant_id there is no longer a filter at all: the list is scoped to the
// caller's verified tenant plus the globals that apply to it. It used to mean
// "no filter", returning entries across ALL tenants, which is what made this
// console's tables a cross-tenant read.
//
// So an omitted tenant_id still means two different things on the two route
// shapes — "exactly the global scope" on a single-key lookup, "my tenant and the
// globals" on a list — which is worth stating rather than letting a reader
// assume.

export type UpsertConfigInput = {
  key: string;
  /** Any JSON value. Sent as-is — the service stores it as raw JSON, so a string
   *  config value must still be a JSON string, not a bare token. */
  value: unknown;
  environment: string;
  /** Omit for the environment-wide global default. */
  tenantId?: string;
  principalId: string;
  /** The caller's own verified tenant, forwarded as X-Tenant-Id. */
  callerTenantId: string;
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
  return apiPost<ConfigEntry>(
    "configuration",
    "/v1/config",
    {
      key: input.key,
      value: input.value,
      environment: input.environment,
      created_by_principal_id: input.principalId,
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    },
    { identity: { principalId: input.principalId, tenantId: input.callerTenantId } },
  );
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
  callerTenantId: string,
  tenantId?: string,
): Promise<ApiResult<ConfigEntry>> {
  return apiGet<ConfigEntry>("configuration", `/v1/config/${encodeURIComponent(key)}`, {
    query: { environment, tenant_id: tenantId },
    identity: { tenantId: callerTenantId },
  });
}

/** The feature flag currently effective for an exact tuple. See the scoping note
 *  above before reading a 404 as "not set". */
export async function getFeatureFlag(
  key: string,
  environment: string,
  callerTenantId: string,
  tenantId?: string,
): Promise<ApiResult<FeatureFlag>> {
  return apiGet<FeatureFlag>("configuration", `/v1/flags/${encodeURIComponent(key)}`, {
    query: { environment, tenant_id: tenantId },
    identity: { tenantId: callerTenantId },
  });
}

/** Environments the console offers. Free-text in the service. */
export const ENVIRONMENTS = ["local", "dev", "staging", "prod"] as const;

/** How an environment name reads to someone who does not deploy the platform. */
const ENVIRONMENT_LABEL: Record<string, string> = {
  local: "a developer's own machine",
  dev: "the development system",
  staging: "the rehearsal system, used to test before going live",
  prod: "the live system real people use",
};

/**
 * An environment name, as a phrase rather than a deployment shorthand.
 *
 * The column is free text, so an unrecognised value is returned as stored
 * rather than guessed at — inventing a description for an environment this
 * console has never heard of would be a claim about where a setting takes
 * effect, which is exactly the fact a reader is relying on.
 */
export function describeEnvironment(environment: string): string | undefined {
  return ENVIRONMENT_LABEL[environment?.trim().toLowerCase()];
}

/** Whether a record applies to one organisation or to a whole environment. */
export function describeScope(tenantId: string | null): {
  /** Badge text and column value. */
  label: string;
  /** A phrase that slots into a sentence, e.g. "it is off for …". Names no
   *  environment, so a caller can add one without saying it twice. */
  phrase: string;
  meaning: string;
  tone: "neutral" | "info";
} {
  return tenantId
    ? {
        label: "This organisation only",
        phrase: "your organisation",
        meaning: "It applies to your organisation and leaves every other one unaffected.",
        tone: "neutral",
      }
    : {
        label: "Everyone in this environment",
        phrase: "every organisation",
        meaning:
          "It is the default for every organisation in this environment. An organisation " +
          "that has its own value set uses that instead of this one.",
        tone: "info",
      };
}

export type FlagExplanation = {
  /** One line answering "is this feature on?" */
  headline: string;
  /** A paragraph saying what that means in practice. */
  meaning: string;
  /** Badge text. */
  shortLabel: string;
  tone: "success" | "warning" | "neutral";
  /** Plain wording for the rollout percentage, or undefined when it adds nothing. */
  reach?: string;
};

/**
 * A feature flag, in plain English.
 *
 * The three facts a reader needs are not the three columns. `enabled` alone does
 * not answer "is this feature on for my people", because a flag that is enabled
 * at 20% is on for a fifth of them — and one that is DISABLED at 20% is off for
 * everyone, the percentage being dormant rather than active. Reporting "Enabled,
 * 20%" leaves the reader to combine those themselves, which is the step they get
 * wrong.
 */
export function explainFlag(flag: FeatureFlag): FlagExplanation {
  const feature = flag.key || "This feature";
  const rollout = clampPercentage(flag.rollout_percentage);
  const where = describeScope(flag.tenant_id).phrase;

  if (!flag.enabled) {
    return {
      headline: `${feature} is switched off`,
      meaning:
        `Nobody has this feature. It is off for ${where} in ${flag.environment}. ` +
        (rollout < 100
          ? `The ${rollout}% share recorded alongside it does nothing while the feature is off — ` +
            "it is the share that would apply if it were switched back on."
          : "Switching it on would give it to everyone in this scope."),
      shortLabel: "Off",
      tone: "neutral",
      reach: rollout < 100 ? `Would reach ${rollout}% if switched on` : undefined,
    };
  }

  if (rollout === 0) {
    return {
      headline: `${feature} is switched on, but nobody has it yet`,
      meaning:
        "The feature is on and its share is set to 0%, so no one is actually getting it. " +
        "This is the normal starting point for a staged release: raise the share to let " +
        "people in a few at a time.",
      shortLabel: "On — nobody yet",
      tone: "warning",
      reach: "Reaching 0% of people",
    };
  }

  if (rollout < 100) {
    return {
      headline: `${feature} is switched on for ${rollout}% of people`,
      meaning:
        `Roughly ${rollout} in every 100 people get this feature and the rest do not, ` +
        "so two people can genuinely see different behaviour. The service picks who, " +
        "not this console.",
      shortLabel: `On — ${rollout}%`,
      tone: "warning",
      reach: `Reaching ${rollout}% of people`,
    };
  }

  return {
    headline: `${feature} is switched on for everyone`,
    meaning: `Everyone covered by this record — ${where} in ${flag.environment} — has this feature.`,
    shortLabel: "On for everyone",
    tone: "success",
    reach: "Reaching everyone",
  };
}

/** Guard the display against a percentage outside the range the column allows. */
function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * A one-line description of what kind of thing a config value is.
 *
 * Sits above the value itself rather than replacing it. A reader looking at a
 * settings table needs to know at a glance whether a row holds a single number
 * or a block of settings; the value is then rendered in full underneath.
 */
export function describeConfigValue(value: unknown): string {
  if (value === null) return "Deliberately set to nothing";
  if (value === undefined) return "No value recorded";
  if (typeof value === "boolean") return value ? "Turned on" : "Turned off";
  if (typeof value === "number") return "A number";
  if (typeof value === "string") return value.trim() === "" ? "Empty text" : "A piece of text";

  if (Array.isArray(value)) {
    if (value.length === 0) return "An empty list";
    return `A list of ${value.length} ${value.length === 1 ? "entry" : "entries"}`;
  }

  if (typeof value === "object") {
    const count = Object.keys(value as Record<string, unknown>).length;
    if (count === 0) return "A setting with nothing in it";
    return `A setting with ${count} ${count === 1 ? "part" : "parts"}`;
  }

  return "A value";
}

/**
 * What the user typed, as the value to store — plus what was assumed.
 *
 * The column is `jsonb`, so the service stores structured data and rejects a
 * bare token: typing `Europe/London` used to come back as "the value must be
 * valid JSON. A bare string needs quotes", which asks a non-developer to know a
 * wire format in order to set a timezone. The overwhelmingly common intents —
 * a number, a word, a yes/no — are unambiguous, so they are read as what they
 * plainly are.
 *
 * What this deliberately does NOT do is rescue a broken structure. If the text
 * opens with `{` or `[` it was meant as structured data, and storing a
 * half-typed object as a piece of text would record something the services
 * reading it cannot use, silently and under the reader's own key. That case
 * still reports the problem.
 *
 * `note` is returned so the caller can state the assumption rather than apply it
 * quietly. It is undefined when the text needed no interpretation.
 */
export function interpretConfigValue(
  raw: string,
): { ok: true; value: unknown; note?: string } | { ok: false; message: string } {
  const text = raw.trim();
  if (!text) return { ok: false, message: "Enter what the setting should be set to." };

  const structured = text.startsWith("{") || text.startsWith("[");

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    if (structured) {
      return {
        ok: false,
        message:
          "That looks like a setting with several parts, but it could not be read — check it " +
          "for a missing bracket, comma, or quote mark. Each name needs double quotes around " +
          'it, like { "hour": 17 }.',
      };
    }
  }

  // A yes/no answer, in the words the form itself offers. Only these two: "on"
  // and "off" are left as text, because plenty of settings legitimately hold
  // the literal string "off" as one option among several, and turning it into
  // `false` would change what the setting says.
  const lower = text.toLowerCase();
  if (lower === "yes") return { ok: true, value: true, note: 'Saved as yes (recorded as true).' };
  if (lower === "no") return { ok: true, value: false, note: 'Saved as no (recorded as false).' };

  return {
    ok: true,
    value: text,
    note: `Saved as the text "${text}".`,
  };
}

/**
 * A config value as a single line, for a table cell.
 *
 * Only for values that genuinely fit on one line. Anything structured returns
 * undefined rather than a truncated rendering, so the caller shows the readable
 * row list instead of a value clipped mid-way — a half-shown setting reads as
 * the whole setting.
 */
export function configValueOneLine(value: unknown): string | undefined {
  if (value === null) return "Nothing";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-GB", { maximumFractionDigits: 6 });
  if (typeof value === "string") return value.trim() === "" ? "Empty" : value;
  return undefined;
}

/** Turn a backend failure into something an operator can act on. */
export function explainConfigurationError(message: string): string {
  if (message.includes("rollout_percentage")) {
    return "The share of people who get the feature has to be between 0 and 100.";
  }
  if (message.includes("missing_field")) {
    const field = message.split("missing_field").pop()?.trim();
    if (field?.includes("enabled")) {
      return "Say whether the feature should be on or off. The service will not guess — on an append-only record, \"left blank\" and \"off\" are two different statements and it refuses to turn one into the other.";
    }
    if (field?.includes("environment")) {
      return "Choose which environment this applies to. A setting that names no environment has nowhere to take effect.";
    }
    if (field?.includes("value")) {
      return "A value is required — there is nothing to record without one.";
    }
    return `A required field was empty: ${field || "check the form"}.`;
  }
  if (message.includes("invalid_json")) {
    return "The service could not read the value that was sent. Check it for a stray bracket, comma, or quote mark.";
  }
  if (message.includes("config_entry_not_found")) {
    return "Nothing is set for that exact combination of name, environment, and scope. A shared default for the whole environment may still exist — this lookup does not go looking for one.";
  }
  if (message.includes("feature_flag_not_found")) {
    return "No setting exists for that feature at that exact environment and scope. A shared default for the whole environment may still exist — this lookup does not go looking for one.";
  }
  if (message.includes("scope_race_conflict")) {
    return "Someone else recorded a value for this exact key, environment, and scope at the same moment. Nothing of yours was written — submit it again and it will go through.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "That write was addressed to a different organisation than the one you are signed in to, so the service refused it. Nothing was written.";
  }
  if (message.includes("tenant_scope_missing") || message.includes("missing_principal")) {
    return "The request reached the service without a verified identity, so it was refused. Sign out and in again; if it keeps happening the gateway is not passing your session through.";
  }
  if (message.includes("authorization_denied")) {
    return "Your account is not permitted to change configuration. Nothing was written — ask an administrator to grant the permission.";
  }
  if (message.includes("authz_unavailable")) {
    return "The permission check could not be completed, so the change was refused rather than allowed unchecked. Nothing was written — try again shortly.";
  }
  if (message.includes("store_unavailable")) {
    return "The configuration service could not reach its database. Nothing was written.";
  }
  return message;
}
