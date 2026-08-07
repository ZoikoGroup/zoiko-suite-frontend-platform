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
 * entity.status.changed). The service does not enforce this — it accepts any
 * non-empty string — so this is the console declining to create a registry
 * entry that would not match anything actually published.
 */
const EVENT_NAME_RE = /^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/;

export function isValidEventName(name: string): boolean {
  return EVENT_NAME_RE.test(name.trim());
}

/**
 * Pull the compatibility violations out of a 409 body.
 *
 * The service answers a breaking change with `{error, violations: [...]}`, and
 * those strings name the exact field that broke. Discarding them leaves the
 * reader with "incompatible schema change" and no way to act on it.
 */
export function parseViolations(message: string): string[] {
  // [\s\S] rather than the `s` dotAll flag — the tsconfig target predates it.
  const match = message.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
