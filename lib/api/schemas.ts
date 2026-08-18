// schema-registry-svc (:8093) — the canonical registry of event payload
// contracts, and the compatibility discipline each one is held to.
//
// 04-data-model.md §17.2 is the governing rule: "all event schemas must be
// centrally registered", "compatibility mode must be declared", and "breaking
// changes require controlled rollout". This console is where that discipline
// is visible rather than implied.
//
// Five properties shape the page and are easy to get wrong:
//
//  1. VERSIONS ARE IMMUTABLE AND APPEND-ONLY. There is no edit and no delete.
//     Evolution registers a new version; the old one stays readable forever.
//     So there is no "update schema" form here, and there should not be.
//
//  2. COMPATIBILITY IS CHECKED AGAINST THE LATEST VERSION ONLY, and only at
//     the top level — the checker reads `properties` and `required` and does
//     not descend into nested objects or arrays. That is a documented v1 limit
//     in the service, not an oversight, and the page says so rather than
//     letting a reader assume a nested breaking change would be caught.
//
//  3. COMPATIBILITY MODE IS PER VERSION, not per event. A contract can be
//     registered BACKWARD for years and then NONE once during a controlled
//     rollout; the register shows which discipline was in force for each
//     version, which is the whole point of recording it.
//
//  4. A LOST VERSION RACE IS 409, NOT 503. Two people registering the same
//     event at once is ordinary, not an outage — the loser is told to re-read
//     and retry, because its schema was checked against a version that is no
//     longer latest. Retrying blindly would skip that check.
//
//  5. PUBLISHING IS AUTHORIZED AND FAILS CLOSED. A caller with no verified
//     principal is 401; one without the SCHEMA_PUBLISH grant is 403; an
//     unreachable authorization-svc is 503 and nothing is written.
//
//  6. READING REQUIRES AN IDENTIFIED CALLER. Every read used to be open, so
//     anything that could reach the port could enumerate the platform's whole
//     event-contract catalogue — every event name, every payload field, and
//     which service owns each one. That is a map of the platform's internals.
//     It is identity only, not a per-entity grant: an event contract is
//     platform-wide reference data with no legal entity of its own, so a grant
//     scoped to one entity would answer a question the data does not have.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape from the backend. Field names match the Go json tags exactly. */
export type EventSchema = {
  event_name: string;
  version: number;
  json_schema: unknown;
  /** The discipline this version was accepted under — BACKWARD or NONE. */
  compatibility_mode: string;
  owning_service?: string;
  registered_by?: string;
  registered_at: string;
};

/**
 * The two modes this service can actually enforce.
 *
 * FORWARD and FULL are deliberately absent: the service refuses any mode it
 * cannot apply rather than accepting it and quietly checking something else,
 * so offering them here would produce a 400 the reader could not explain.
 */
export const COMPATIBILITY_MODES = ["BACKWARD", "NONE"] as const;

export function isExempt(mode: string): boolean {
  return mode === "NONE";
}

/** Every event name with at least one registered version. */
export function listEventNames(identity: Identity): Promise<ApiResult<string[]>> {
  return apiGet<string[]>("schemaRegistry", "/v1/schemas", { identity });
}

/** Every version of one event, oldest first. 404 when the event is unknown. */
export function listVersions(eventName: string, identity: Identity): Promise<ApiResult<EventSchema[]>> {
  return apiGet<EventSchema[]>("schemaRegistry", `/v1/schemas/${encodeURIComponent(eventName)}/versions`, {
    identity,
  });
}

/** The current contract for an event — what a producer must satisfy today. */
export function getLatest(eventName: string, identity: Identity): Promise<ApiResult<EventSchema>> {
  return apiGet<EventSchema>(
    "schemaRegistry",
    `/v1/schemas/${encodeURIComponent(eventName)}/versions/latest`,
    { identity },
  );
}

export function getVersion(
  eventName: string,
  version: number,
  identity: Identity,
): Promise<ApiResult<EventSchema>> {
  return apiGet<EventSchema>(
    "schemaRegistry",
    `/v1/schemas/${encodeURIComponent(eventName)}/versions/${version}`,
    { identity },
  );
}

export type RegisterSchemaInput = {
  json_schema: unknown;
  compatibility_mode?: string;
  owning_service?: string;
};

/**
 * Register the next version of an event's payload schema.
 *
 * 201 on success — the version number is assigned by the service, not the
 * caller. 409 covers two distinct situations the console keeps apart: the
 * proposed schema breaks the current contract (body carries `violations`), or
 * a concurrent registration claimed the version (body says to re-read and
 * retry). Conflating them would send the reader to fix the wrong thing.
 */
export function registerVersion(
  eventName: string,
  input: RegisterSchemaInput,
  identity: Identity,
  correlationId?: string,
): Promise<ApiWriteResult<EventSchema>> {
  return apiPost<EventSchema>(
    "schemaRegistry",
    `/v1/schemas/${encodeURIComponent(eventName)}/versions`,
    input,
    { identity, correlationId },
  );
}

/**
 * An event name must be a dotted lowercase token, matching the convention
 * every publisher in the platform already follows (jurisdiction.rule.updated,
 * entity.status.changed).
 *
 * The service enforces this too, and the regex here is the same one. It used
 * not to: this comment previously read "the service does not enforce this — it
 * accepts any non-empty string", which meant the primary key of a canonical
 * register was a free-text field defended only by whichever caller happened to
 * be the console. Enforcement belongs in the registry; this copy is the
 * console declining to make a round trip it knows will fail.
 */
const EVENT_NAME_RE = /^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/;

export function isValidEventName(name: string): boolean {
  return EVENT_NAME_RE.test(name.trim());
}

/**
 * Human-readable reason for a refused registry call.
 *
 * The console validates the obvious things itself, so anything reaching here is
 * a rule the service applied that the console did not — which is exactly the
 * case where a bare error string leaves the reader with nothing to act on.
 */
export function explainSchemaError(message: string): string {
  if (message.includes("event name must be dotted lowercase")) {
    return "That event name is not one the registry will accept. Names are dotted lowercase tokens of at least two segments — entity.status.changed — because that is what publishers actually emit, and the name is this register's primary key.";
  }
  if (message.includes("must be a valid JSON object")) {
    return "A schema must be a JSON object. A bare number, string, array or null is well-formed JSON but declares no contract, and storing one as an event's first version would leave that event unable to be evolved at all.";
  }
  if (message.includes("constrains nothing")) {
    return "An empty object permits every payload, so it is not a contract. Declare at least a `properties` map for the compatibility checker to hold future versions to.";
  }
  if (message.includes("compatibility checker cannot read")) {
    return "The `properties` or `required` member is not the shape the compatibility checker reads. This is refused now rather than at the next version, when every future evolution of this event would fail instead.";
  }
  if (message.includes("compatibility_mode must be")) {
    return "That is not a compatibility mode this registry can enforce. Only BACKWARD and NONE are accepted — a mode the service cannot apply is refused rather than recorded, so the register never claims a discipline it is not enforcing.";
  }
  if (message.includes("owning_service must be at most")) {
    return "The owning service name is longer than the registry's 255-character column.";
  }
  if (message.includes("too long for its column")) {
    return "One of the submitted values is wider than its column in the registry.";
  }
  if (message.includes("caller identity missing")) {
    return "The registry received no verified principal. Reads and writes both require one. Sign in again.";
  }
  if (message.includes("not authorized to publish")) {
    return "authorization-svc refused this publication. The principal needs the SCHEMA_PUBLISH grant — event contracts are governed, not self-served.";
  }
  if (message.includes("limit must be") || message.includes("offset must be")) {
    return "The register read asked for an out-of-range page. limit must be 1–500 and offset must not be negative.";
  }
  if (message.includes("version must be")) {
    return "Versions are assigned by the registry and start at 1.";
  }
  if (message.includes("request body exceeds")) {
    return "The schema exceeded the registry's 1 MiB request limit.";
  }
  if (message.includes("schema store unavailable")) {
    return "The registry could not reach its store, so it refused rather than guessing. Nothing was written.";
  }
  return message;
}

/**
 * Pull the compatibility violations out of a refused registration.
 *
 * The service answers a breaking change with `{error, violations: [...]}`, and
 * those strings name the exact field that broke. They are what distinguishes
 * the two different 409s this endpoint returns — a breaking schema, or a lost
 * version race — and the reader's next step is completely different for each:
 * change the schema, or re-read and resubmit.
 *
 * This used to read the violations out of `error.message` with a regex, and it
 * found nothing, because the shared client folds an error body into a single
 * human string using only its `error`/`field`/`message`/`detail` keys —
 * `violations` was dropped before this function ever saw it. Every breaking
 * change was therefore reported to the user as a version race, telling them to
 * retry something that would fail identically forever.
 *
 * It now reads the parsed body the client preserves (see ApiError.body), and
 * keeps the string fallback only for a caller that has nothing else.
 */
export function parseViolations(error: { message: string; body?: unknown }): string[] {
  const body = error.body as { violations?: unknown } | undefined;
  if (body && Array.isArray(body.violations)) {
    return body.violations.map(String);
  }
  // [\s\S] rather than the `s` dotAll flag — the tsconfig target predates it.
  const match = error.message.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
