// Turning backend payloads into something a non-developer can read.
//
// Several services in this suite carry free-form `jsonb` columns —
// evaluation_context, rule_payload, requirement_payload — and the console used
// to render them, and whole records, as pretty-printed JSON. That is readable to
// whoever wrote the service and to nobody else: braces, snake_case keys, raw
// booleans, ISO timestamps. An operator reading the governance log is answering
// "was this allowed, and why", not inspecting a wire format.
//
// So: keys become sentence-case labels, values become formatted text, and nested
// structures flatten into indented rows. What this does NOT do is change or drop
// a stored value — labels are presentation, values are evidence. The raw JSON
// stays one disclosure away at every call site (see PayloadDetails), because a
// readable summary must not be the only way to see what was actually stored.
//
// Server and client both import this, so it stays free of Node- and DOM-specific
// APIs, the same constraint lib/format.ts works under.

import { formatDate, formatDateTime } from "./format";

/** Shown where a field exists in the payload but holds no value. */
export const NOT_RECORDED = "Not recorded";

/**
 * Words that must not be sentence-cased, and how each one is written.
 *
 * Lowercasing "ID" to "Id" or "VAT" to "Vat" makes a label look like a typo, and
 * these keys are common across the payloads this console renders. A map rather
 * than a set of words to upper-case, because not every one of them is written in
 * full caps: a plural acronym takes a lower-case "s", so `approver_ids` has to
 * reach "Approver IDs" and not "Approver IDS".
 */
const ACRONYMS = new Map(
  [
    "AI", "ML", "API", "URL", "URI", "ID", "IDs", "UUID", "JSON", "SQL", "CSV", "PDF",
    "VAT", "GBP", "USD", "EUR", "IBAN", "BIC", "FX", "GL", "AP", "AR", "PO", "PR",
    "KYC", "AML", "SLA", "SSO", "MFA", "RLS", "UTC", "TZ", "HMRC", "UK", "US", "EU",
    "HR", "IT", "CEO", "CFO", "COO", "URLs", "APIs",
  ].map((display) => [display.toLowerCase(), display] as const),
);

/** ISO 8601 with a time component — what a TIMESTAMPTZ column serialises to. */
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** A bare calendar date — what a DATE column serialises to. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A payload key, as a label a person would read.
 *
 * `policy_version_id` becomes "Policy version ID", `workflowInstanceId` becomes
 * "Workflow instance ID". Sentence case rather than title case, to match the
 * field labels the admin forms already use.
 */
export function humanizeKey(key: string): string {
  // A key written entirely in capitals is a code, not prose — SPEND_LIMIT_V3
  // rather than policyVersionId. Lower-casing it first means each of its words
  // goes through the same path as any other, so it does not come out half
  // sentence-cased and half shouted ("Spend LIMIT V3").
  const source = /[a-z]/.test(key) ? key : key.toLowerCase();

  const words = source
    // camelCase and PascalCase boundaries, including the digit-letter ones that
    // show up in keys like `limitV3`.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.:/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return key;

  return words
    .map((word, index) => {
      const acronym = ACRONYMS.get(word.toLowerCase());
      if (acronym) return acronym;
      // A mixed-case word with an internal capital is left as written — a
      // stored code that survived the split, not something to re-case.
      if (index > 0 && word.length > 1 && word === word.toUpperCase()) return word;
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      return word.toLowerCase();
    })
    .join(" ");
}

/**
 * An UPPER_SNAKE code, as prose.
 *
 * `PAYROLL_RELEASE` becomes "Payroll release". Every call site shows the stored
 * code alongside, so a reader who needs to quote the exact value to support can
 * still see it.
 */
export function humanizeCode(code: string): string {
  const trimmed = code?.trim();
  if (!trimmed) return "";
  // Only rewrite values that actually look like machine codes. Anything already
  // written as prose is shown exactly as stored.
  if (!/^[A-Z0-9][A-Z0-9_\-.]*$/.test(trimmed)) return trimmed;
  return humanizeKey(trimmed.toLowerCase());
}

/** True for values that render as a single line of text. */
function isScalar(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * One payload value, formatted for display.
 *
 * Booleans read as Yes/No, numbers get thousands separators, and timestamps get
 * the same treatment as every other date in the console. Anything else is shown
 * as stored.
 */
export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return NOT_RECORDED;
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return value.toLocaleString("en-GB", { maximumFractionDigits: 6 });
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "Empty";
    if (ISO_DATETIME_RE.test(trimmed)) return formatDateTime(trimmed);
    if (ISO_DATE_RE.test(trimmed)) return formatDate(trimmed);
    return trimmed;
  }

  return String(value);
}

/** One flattened payload field, ready to render. */
export type ReadableRow = {
  /** Dotted path within the payload. Unique, so it doubles as the React key. */
  path: string;
  label: string;
  value: string;
  /** Indentation level; 0 for a top-level field. */
  depth: number;
  /** A heading for the nested rows that follow, not a value of its own. */
  group?: boolean;
  /** The payload named this field but recorded nothing in it. */
  muted?: boolean;
};

/**
 * How deep to flatten before falling back to raw JSON.
 *
 * Past this depth indentation stops conveying the structure, and a payload
 * nested that far is being inspected rather than read.
 */
const MAX_DEPTH = 4;

/**
 * Flatten an arbitrary JSON payload into readable rows.
 *
 * Accepts anything that can come off the wire, including a string holding
 * double-encoded JSON — which is how a payload arrives back when the caller
 * stringified it before POSTing.
 */
export function readableRows(payload: unknown): ReadableRow[] {
  const value = coerce(payload);

  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    const rows: ReadableRow[] = [];
    value.forEach((item, index) => pushEntry(`Item ${index + 1}`, item, "", 0, rows));
    return rows;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    // Money detection applies to the whole payload as well as to nested
    // objects. `{"amount": 48000, "currency": "GBP"}` is the placeholder the
    // record-a-decision form suggests, so it is the shape most likely to arrive
    // as an entire evaluation_context — and split across an "Amount" row and a
    // "Currency" row it reads worse than the JSON it replaced.
    const money = asMoney(record);
    if (money) return [{ path: "amount", label: "Amount", value: money, depth: 0 }];

    const rows: ReadableRow[] = [];
    for (const [key, item] of Object.entries(record)) {
      pushEntry(key, item, "", 0, rows);
    }
    return rows;
  }

  // A bare scalar payload — a note, a flag, an id on its own.
  return [{ path: "value", label: "Value", value: formatScalar(value), depth: 0 }];
}

/** Unwrap a JSON string, so a double-encoded payload reads like any other. */
function coerce(payload: unknown): unknown {
  if (typeof payload !== "string") return payload;

  const trimmed = payload.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return payload;

  try {
    return JSON.parse(trimmed);
  } catch {
    return payload;
  }
}

function pushEntry(
  key: string,
  value: unknown,
  parentPath: string,
  depth: number,
  rows: ReadableRow[],
): void {
  const path = parentPath ? `${parentPath}.${key}` : key;
  const label = humanizeKey(key);

  if (value === null || value === undefined) {
    rows.push({ path, label, value: NOT_RECORDED, depth, muted: true });
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      rows.push({ path, label, value: "None", depth, muted: true });
      return;
    }

    // A list of plain values reads better on one line than as N indented rows.
    if (value.every(isScalar)) {
      rows.push({ path, label, value: value.map(formatScalar).join(", "), depth });
      return;
    }

    if (depth >= MAX_DEPTH) {
      rows.push({ path, label, value: safeJson(value), depth });
      return;
    }

    rows.push({
      path,
      label,
      value: `${value.length} ${value.length === 1 ? "item" : "items"}`,
      depth,
      group: true,
    });
    value.forEach((item, index) => pushEntry(`Item ${index + 1}`, item, path, depth + 1, rows));
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    // `{"amount": 48000, "currency": "GBP"}` is the shape the record-a-decision
    // form itself suggests, and it reads as money, not as two unrelated fields.
    const money = asMoney(record);
    if (money) {
      rows.push({ path, label, value: money, depth });
      return;
    }

    const entries = Object.entries(record);
    if (entries.length === 0) {
      rows.push({ path, label, value: "Nothing recorded", depth, muted: true });
      return;
    }

    if (depth >= MAX_DEPTH) {
      rows.push({ path, label, value: safeJson(value), depth });
      return;
    }

    rows.push({
      path,
      label,
      value: `${entries.length} ${entries.length === 1 ? "field" : "fields"}`,
      depth,
      group: true,
    });
    for (const [childKey, childValue] of entries) {
      pushEntry(childKey, childValue, path, depth + 1, rows);
    }
    return;
  }

  rows.push({ path, label, value: formatScalar(value), depth });
}

/**
 * Render an `{ amount, currency }` pair as money.
 *
 * Deliberately narrow: exactly those two keys, a finite numeric amount, and a
 * three-letter currency code. A looser match would reformat objects that only
 * coincidentally carry an amount, attaching a currency the payload never named.
 */
function asMoney(record: Record<string, unknown>): string | null {
  const entries = Object.entries(record);
  if (entries.length !== 2) return null;

  let amount: number | null = null;
  let currency: string | null = null;

  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (lower === "amount" && typeof value === "number" && Number.isFinite(value)) {
      amount = value;
    } else if (lower === "currency" && typeof value === "string" && /^[A-Za-z]{3}$/.test(value)) {
      currency = value.toUpperCase();
    }
  }

  if (amount === null || currency === null) return null;

  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    // Intl throws RangeError on a code it does not recognise, and this column
    // accepts any three letters.
    return `${amount.toLocaleString("en-GB")} ${currency}`;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
