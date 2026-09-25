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
import { humanizeKey } from "../humanize";

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

/**
 * Every version of one event, oldest first. 404 when the event is unknown.
 *
 * Paged by the service, defaulting to the first 100 — which for a history is
 * the wrong end of it. A caller that already knows the latest version number
 * can ask for the window that ends at it (see the contract lookup), so a long
 * history shows its most recent versions rather than its founding ones.
 */
export function listVersions(
  eventName: string,
  identity: Identity,
  paging: { limit?: number; offset?: number } = {},
): Promise<ApiResult<EventSchema[]>> {
  return apiGet<EventSchema[]>("schemaRegistry", `/v1/schemas/${encodeURIComponent(eventName)}/versions`, {
    identity,
    query: {
      ...(paging.limit === undefined ? {} : { limit: paging.limit }),
      ...(paging.offset === undefined ? {} : { offset: paging.offset }),
    },
  });
}

/** The service's own paging ceiling, so a caller can ask for the widest page. */
export const MAX_VERSION_PAGE = 500;

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
    return "An empty object permits every payload, so it is not a contract. Name at least one field, so there is something to hold later versions of this event to.";
  }
  if (message.includes("compatibility checker cannot read")) {
    return "The list of fields, or the list of which ones are compulsory, is not in a shape the check can read. It is refused now rather than at the next version — otherwise every later change to this event would be the thing that failed.";
  }
  if (message.includes("compatibility_mode must be")) {
    return "That is not a discipline this registry can apply. It can either check a new version against the current one (recorded as BACKWARD) or record that no check was made (NONE). A mode it cannot apply is refused rather than stored, so the register never claims a discipline it is not keeping to.";
  }
  if (message.includes("owning_service must be at most")) {
    return "The name of the publishing service is longer than the 255 characters the register can hold.";
  }
  if (message.includes("too long for its column")) {
    return "One of the values submitted is longer than the register can hold.";
  }
  if (message.includes("event schema version not found")) {
    return "That version does not exist for this event. Versions are numbered from 1 and run consecutively, and nothing is ever deleted — so a number with no version behind it was never registered.";
  }
  if (message.includes("event schema not found")) {
    return "No event is registered under that name. Names are exact and case-sensitive — entity.status.changed, not Entity.Status.Changed — and an event with no registered version does not appear in the register at all.";
  }
  if (message.includes("caller identity missing")) {
    return "The registry could not tell who was asking. Reading and registering both require a signed-in account. Sign in again.";
  }
  if (message.includes("not authorized to publish")) {
    return "This account does not have permission to publish event contracts (the permission is recorded as SCHEMA_PUBLISH). Contracts are governed, not self-served, so it has to be granted by whoever administers permissions.";
  }
  if (message.includes("limit must be") || message.includes("offset must be")) {
    return "The register was asked for a page it cannot return: between 1 and 500 rows at a time, starting from the first row or later.";
  }
  if (message.includes("version must be")) {
    return "Version numbers are assigned by the registry itself and start at 1.";
  }
  if (message.includes("request body exceeds")) {
    return "The schema is larger than the 1 MB the registry accepts in one request.";
  }
  if (message.includes("schema store unavailable")) {
    return "The registry could not reach its own store, so it refused rather than guessing. Nothing was written.";
  }
  return message;
}

/**
 * A failed read of the register, as a fact about the page rather than the wire.
 *
 * `explainSchemaError` handles what the service says when it refuses. This
 * handles the cases where it says nothing at all — and those were the ones
 * reaching the reader untranslated, because the shared client writes them for
 * whoever is debugging the deployment: "schema-registry-svc is unreachable at
 * http://localhost:8093" names a hostname and a port to an operator who has no
 * way to act on either, and reads as though the contracts themselves were lost.
 */
export function explainRegistryFailure(error: {
  kind: string;
  status?: number;
  message: string;
}): string {
  if (error.kind === "unreachable" || error.kind === "timeout") {
    return "The registry did not answer, so nothing can be listed here right now. The contracts themselves are unaffected — they are held by the registry, not by this page.";
  }
  if (error.kind === "malformed") {
    return "The registry answered with something this console could not read, so nothing can be listed from it.";
  }
  if (error.status === 401) {
    return "The registry could not tell who was asking, so it refused the read. Sign in again.";
  }
  return explainSchemaError(error.message);
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

// ── Reading a contract in plain English ─────────────────────────────────────
//
// Everything below this line exists because the answers this service gives are
// JSON Schema documents, UPPER_SNAKE mode codes and checker violation strings
// written for the caller that submitted them. The people who actually read this
// page are operators and auditors: they are answering "what must this event
// contain", "was this change checked", and "what broke" — none of which a
// `{"properties":{...},"required":[...]}` blob answers to anyone who has not
// written a producer.
//
// Two rules hold throughout, the same two the rest of the console follows:
//
//  - The stored value is never replaced, only labelled. Every humanised label
//    is rendered with the exact code beside it, because an auditor quoting a
//    contract has to quote what the registry holds, not this console's reading
//    of it.
//  - An unrecognised value never reads as the safe one. A compatibility mode
//    this console has not been taught is reported as "needs checking", never as
//    "checked" — the register exists to show which contracts evolved without a
//    check, and a default that hid one would defeat the page.

export type CompatibilityExplanation = {
  /** Short enough for a badge. */
  label: string;
  /** What the mode did to this particular version. */
  meaning: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
  /** Whether a compatibility check was actually applied to this version. */
  checked: boolean;
  /** The code as stored. Always shown alongside the label. */
  raw: string;
};

const COMPATIBILITY_COPY: Record<string, Omit<CompatibilityExplanation, "raw">> = {
  BACKWARD: {
    label: "Checked against the previous version",
    meaning:
      "Before this version was accepted it was compared with the one before it. It would have been refused if it had dropped a field that has to be there, stopped insisting on one, or changed the kind of value a field carries. The comparison covers the top level of the payload only.",
    tone: "success",
    checked: true,
  },
  NONE: {
    label: "Registered without a check",
    meaning:
      "This version was accepted without being compared to the one before it, so nothing established that it is safe for whoever already reads this event. That is permitted for a change planned with those readers in advance, and it is recorded here so the exemption is visible rather than guessed at from a payload that changed shape.",
    tone: "warning",
    checked: false,
  },
};

/**
 * The evolution discipline one version was accepted under.
 *
 * Recorded per version, not per event, which is the whole reason it is worth
 * showing: a contract can be checked for years and then, once, not be.
 */
export function describeCompatibilityMode(mode: string): CompatibilityExplanation {
  const stored = mode?.trim() ?? "";
  const copy = COMPATIBILITY_COPY[stored];

  if (!copy) {
    return {
      label: "Needs checking",
      meaning:
        "The registry recorded a discipline this console does not recognise, so it cannot say whether this version was compared with the one before it. Do not read it as having been checked.",
      tone: "warning",
      checked: false,
      raw: stored || "(empty)",
    };
  }
  return { ...copy, raw: stored };
}

/**
 * The discipline as it applies to one particular version.
 *
 * A first version was not compared with anything, because there was nothing to
 * compare it with — but the registry still records a mode on it, and reading
 * that mode back as "checked against the previous version" states a comparison
 * that never happened. The register showed exactly that for every event with a
 * single version, which is most of them.
 *
 * The mode on a first version is not merely unapplied, it is not predictive
 * either: each registration declares its own discipline, and it is that
 * declaration which decides whether the next change is compared. So this says
 * what was recorded, and says plainly that nothing was applied.
 */
export function describeVersionDiscipline(mode: string, version: number): CompatibilityExplanation {
  const base = describeCompatibilityMode(mode);
  if (version > 1) return base;

  const recognised = COMPATIBILITY_COPY[mode?.trim() ?? ""] !== undefined;
  return {
    ...base,
    label: "First version",
    meaning: `A first version is not compared with anything — there was nothing to compare it with. The registry recorded ${base.raw} against it, which says what was declared rather than what was applied: every later version declares its own discipline, and it is that declaration which decides whether the change is checked.`,
    tone: recognised ? "info" : "warning",
  };
}

/** The mode label on its own, for a dropdown or a table cell. */
export function compatibilityModeLabel(mode: string): string {
  return describeCompatibilityMode(mode).label;
}

/**
 * A declared JSON Schema type, as the kind of value a person would name.
 *
 * Only the seven types the spec defines are translated. Anything else is shown
 * exactly as declared rather than guessed at — and the registry refuses a type
 * it cannot read as a plain string anyway, so an unknown one here is an unusual
 * type name, not a structure.
 */
const FIELD_TYPE_COPY: Record<string, string> = {
  string: "Text",
  number: "Number",
  integer: "Whole number",
  boolean: "Yes or no",
  object: "Group of fields",
  array: "List",
  null: "Always empty",
};

export function describeFieldType(type: string): string {
  const stored = type?.trim() ?? "";
  if (!stored) return "Any value";
  return FIELD_TYPE_COPY[stored.toLowerCase()] ?? stored;
}

/** One top-level field of a contract, ready to render as a table row. */
export type ContractField = {
  /** The key as a producer must spell it. */
  name: string;
  /** That key as a label. */
  label: string;
  /** The kind of value, in plain English. */
  type: string;
  /** The type exactly as declared; empty when the field declares none. */
  rawType: string;
  required: boolean;
  /** Holds structure of its own, which the compatibility check never opens. */
  nested: boolean;
  /** Named in `required` but absent from `properties` — see readContract. */
  orphaned?: boolean;
};

export type ContractReading = {
  fields: ContractField[];
  requiredCount: number;
  /** Fields whose contents the compatibility check never looks inside. */
  nestedCount: number;
  /** False when the schema is not a field list this can read. */
  readable: boolean;
  /** Why it could not be read, or what is odd about it, when anything is. */
  note?: string;
  /** A title or description the schema's author wrote, when there is one. */
  title?: string;
  description?: string;
};

/**
 * The fields a contract declares, in the order it declares them.
 *
 * This reads exactly what the service's own compatibility checker reads — the
 * top-level `properties` map and the `required` list — and nothing else. That
 * is deliberate: a field table that described nested structure would imply the
 * registry is holding future versions to it, and it is not. What the checker
 * cannot see is flagged instead of described.
 */
export function readContract(jsonSchema: unknown): ContractReading {
  const schema = coerceSchema(jsonSchema);

  if (!schema) {
    return {
      fields: [],
      requiredCount: 0,
      nestedCount: 0,
      readable: false,
      note: "This contract is not stored as a set of fields, so there is nothing to list. The registry refuses such a schema today, which means this one was registered before it did.",
    };
  }

  const title = typeof schema.title === "string" ? schema.title : undefined;
  const description = typeof schema.description === "string" ? schema.description : undefined;

  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : null;

  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : [];

  if (!properties) {
    return {
      fields: [],
      requiredCount: 0,
      nestedCount: 0,
      readable: false,
      title,
      description,
      note: "This contract names no fields, so it does not say what the payload must contain — and it gives the compatibility check nothing to hold later versions to either. Every future version of this event will pass unexamined.",
    };
  }

  const requiredSet = new Set(required);
  const fields: ContractField[] = Object.entries(properties).map(([name, raw]) => {
    const prop =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const rawType = typeof prop.type === "string" ? prop.type : "";
    return {
      name,
      label: humanizeKey(name),
      type: describeFieldType(rawType),
      rawType,
      required: requiredSet.has(name),
      nested:
        rawType === "object" ||
        rawType === "array" ||
        prop.properties !== undefined ||
        prop.items !== undefined,
    };
  });

  // A name in `required` with no entry in `properties` is not a harmless typo.
  // The checker compares the two lists, so the next version of this event gets
  // told that field "was required and has been removed" — a breakage caused by
  // a field that was never declared in the first place. Nothing else in the
  // console would ever surface it.
  const orphaned = required.filter((name) => !(name in properties));
  for (const name of orphaned) {
    fields.push({
      name,
      label: humanizeKey(name),
      type: describeFieldType(""),
      rawType: "",
      required: true,
      nested: false,
      orphaned: true,
    });
  }

  const one = orphaned.length === 1;

  return {
    fields,
    requiredCount: fields.filter((field) => field.required).length,
    nestedCount: fields.filter((field) => field.nested).length,
    readable: true,
    title,
    description,
    note:
      orphaned.length > 0
        ? `${orphaned.map((name) => humanizeKey(name)).join(", ")} ${
            one ? "is listed as compulsory but is" : "are listed as compulsory but are"
          } not among the declared fields. The next version of this event will be refused for dropping ${
            one ? "a field that was" : "fields that were"
          } never declared, so it is worth correcting in a new version now.`
        : undefined,
  };
}

/** "Four fields, two of them compulsory" — the one-line answer for a table cell. */
export function describeContract(jsonSchema: unknown): string {
  const reading = readContract(jsonSchema);
  if (!reading.readable || reading.fields.length === 0) return "No fields declared";

  const total = `${reading.fields.length} field${reading.fields.length === 1 ? "" : "s"}`;
  if (reading.requiredCount === 0) return `${total}, none compulsory`;
  if (reading.requiredCount === reading.fields.length) return `${total}, all compulsory`;
  return `${total}, ${reading.requiredCount} compulsory`;
}

/** Unwrap a schema into an object, tolerating one that arrived double-encoded. */
function coerceSchema(value: unknown): Record<string, unknown> | null {
  let candidate: unknown = value;

  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

export type ViolationKind =
  | "removed"
  | "no-longer-required"
  | "type-changed"
  | "newly-required"
  | "other";

export type ViolationExplanation = {
  kind: ViolationKind;
  /** The field the checker named, as a label. Absent when it named none. */
  field?: string;
  /** What broke, in one line. */
  headline: string;
  /** Why that breaks something, and what to do instead. */
  meaning: string;
  /** The checker's own words, kept verbatim. */
  raw: string;
};

/**
 * One compatibility violation, as the thing the reader has to fix.
 *
 * The checker's strings are precise and unreadable in equal measure. `field
 * "tenant_id" is newly required and existing producers don't populate it` says
 * what happened but not why it matters or what to do instead, and the four
 * shapes it can take need four different responses from the reader.
 *
 * The patterns here are coupled to the wording in the service's compat package,
 * so this fails soft: a violation it cannot parse is shown whole rather than
 * being mangled into the wrong advice.
 */
export function explainViolation(violation: string): ViolationExplanation {
  const raw = violation?.trim() ?? "";

  const removed = raw.match(/field "([^"]+)" was required and has been removed/);
  if (removed) {
    const label = humanizeKey(removed[1]);
    return {
      kind: "removed",
      field: label,
      headline: `${label} has been dropped, and it has to be there`,
      meaning:
        "Everything reading this event today can count on this field arriving. A version without it would break those readers as soon as a publisher used it. Put the field back — or, if dropping it has already been agreed with the people who read this event, register the change without a check so the exemption is on the record.",
      raw,
    };
  }

  const relaxed = raw.match(/field "([^"]+)" was required and is no longer required/);
  if (relaxed) {
    const label = humanizeKey(relaxed[1]);
    return {
      kind: "no-longer-required",
      field: label,
      headline: `${label} is still declared, but is no longer compulsory`,
      meaning:
        "Readers of this event assume the field is always filled in, so nothing they do handles it being absent. Once it is optional, some events will arrive without it. Keep it compulsory, or agree the change with those readers first and register it without a check.",
      raw,
    };
  }

  const retyped = raw.match(/field "([^"]+)" changed type from "([^"]*)" to "([^"]*)"/);
  if (retyped) {
    const label = humanizeKey(retyped[1]);
    return {
      kind: "type-changed",
      field: label,
      headline: `${label} changed from ${describeFieldType(retyped[2])} to ${describeFieldType(retyped[3])}`,
      meaning:
        "Readers of this event expect the old kind of value and cannot make sense of the new one. Changing the kind of value a field carries is a replacement, not an evolution — add a new field alongside the old one, and retire the old one once nothing reads it.",
      raw,
    };
  }

  const tightened = raw.match(/field "([^"]+)" is newly required/);
  if (tightened) {
    const label = humanizeKey(tightened[1]);
    return {
      kind: "newly-required",
      field: label,
      headline: `${label} is now compulsory, and nothing sends it yet`,
      meaning:
        "Whoever publishes this event is not filling this field in today, so making it compulsory would put every event they publish in breach of its own contract. Add it as an optional field, wait until the publisher sends it, then make it compulsory in a later version.",
      raw,
    };
  }

  return {
    kind: "other",
    headline: raw || "The registry refused this version without saying why",
    meaning:
      "This console has not been taught this particular breakage, so the registry's own words are shown above unchanged. It is still a breaking change, and nothing was registered.",
    raw,
  };
}

export type ContractComparison = {
  /** One readable line per change, or empty when nothing changed. */
  lines: string[];
  /** Nothing changed in the part of the payload the registry reads. */
  identical: boolean;
  /** False when one of the two versions is not a field list this can read. */
  readable: boolean;
};

/**
 * What changed between two consecutive versions of a contract.
 *
 * The registry stores each version whole and never a diff, so a reader looking
 * at a history of five versions has five JSON documents and no answer to the
 * only question they asked: what actually changed. This computes that answer
 * from the same two members the service's checker compares, which is also the
 * honest boundary of it — a change inside a nested group is invisible here for
 * exactly the reason it is invisible to the check.
 */
export function compareContracts(previous: unknown, next: unknown): ContractComparison {
  const before = readContract(previous);
  const after = readContract(next);

  if (!before.readable || !after.readable) {
    return { lines: [], identical: false, readable: false };
  }

  const beforeByName = new Map(before.fields.map((field) => [field.name, field]));
  const afterByName = new Map(after.fields.map((field) => [field.name, field]));
  const lines: string[] = [];

  for (const field of after.fields) {
    const old = beforeByName.get(field.name);
    if (!old) {
      lines.push(
        field.required
          ? `Added ${field.label} (${field.type}), compulsory`
          : `Added ${field.label} (${field.type}), optional`,
      );
      continue;
    }
    if (old.rawType !== field.rawType) {
      lines.push(`${field.label} changed from ${old.type} to ${field.type}`);
    }
    if (old.required && !field.required) {
      lines.push(`${field.label} is no longer compulsory`);
    } else if (!old.required && field.required) {
      lines.push(`${field.label} is now compulsory`);
    }
  }

  for (const field of before.fields) {
    if (afterByName.has(field.name)) continue;
    lines.push(
      field.required ? `Removed ${field.label}, which was compulsory` : `Removed ${field.label}`,
    );
  }

  return { lines, identical: lines.length === 0, readable: true };
}
