"use server";

// Server Actions for source-authority-svc (:8150).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// Two service properties shape everything below:
//
//  - PRECEDENCE RULES are platform-wide; NORMALIZED FACTS are tenant data. The
//    tenant travels on every call regardless, because the service now requires
//    it on the fact routes and ignores it on the rule routes — sending it
//    always is simpler than deciding per call, and the service is the authority
//    on which routes care.
//  - EVERY WRITE IS IDEMPOTENT ON correlation_id. It is minted once per render
//    of the page, not per attempt, so retrying the same submission replays
//    rather than writing twice.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  AUTHORITY_CLASSES,
  createSourceAuthorityMap,
  explainSourceAuthorityError,
  recordNormalizedFact,
  supersedeSourceAuthorityMap,
  type AuthorityClass,
} from "@/lib/api/source-authority";
import {
  type CreateMapState,
  type RecordFactState,
  type SupersedeMapState,
} from "./state";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

/**
 * datetime-local submits `2026-10-05T14:00` — local time, no seconds, no zone.
 * Go's time.Time parses RFC3339 and rejects that outright, so the service
 * answers `must be RFC3339` and says nothing about the real cause. Converted
 * once here rather than at each call site.
 */
function asRFC3339(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── Record a precedence rule ────────────────────────────────────────────────

export async function createSourceAuthorityMapAction(
  _prev: CreateMapState,
  formData: FormData,
): Promise<CreateMapState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const fieldFamily = String(formData.get("field_family") ?? "").trim();
  const sourceSystem = String(formData.get("source_system") ?? "").trim();
  const rankRaw = String(formData.get("precedence_rank") ?? "").trim();
  const conflictRoute = String(formData.get("conflict_route") ?? "").trim();
  const allowedCorrectionPath = String(formData.get("allowed_correction_path") ?? "").trim();
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!fieldFamily) return { status: "error", message: "A field family is required — the rule ranks a source for one family of fields." };
  if (!sourceSystem) return { status: "error", message: "A source system is required." };
  if (!conflictRoute) {
    return {
      status: "error",
      message:
        "A conflict route is required. When two equally-ranked sources disagree the service blocks rather than guessing, and this is what it tells the caller to do next — without it, an ambiguous resolution is a dead end.",
    };
  }

  const precedenceRank = Number(rankRaw);
  if (!Number.isInteger(precedenceRank) || precedenceRank < 1) {
    return {
      status: "error",
      message: "Precedence rank must be a whole number of 1 or more. Lower wins — rank 1 beats rank 2.",
    };
  }

  const effectiveFrom = asRFC3339(effectiveFromRaw);
  if (!effectiveFrom) return { status: "error", message: "A start time is required — a precedence rule is effective-dated." };
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key for this rule." };
  }

  const result = await createSourceAuthorityMap({
    identity,
    fieldFamily,
    sourceSystem,
    precedenceRank,
    conflictRoute,
    allowedCorrectionPath: allowedCorrectionPath || undefined,
    effectiveFrom,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainSourceAuthorityError(message) };
    // 403 and 409 are both governance answers here: no grant, or an attempt to
    // restate a rule that is immutable by design.
    if (status === 403 || status === 409) return { status: "refused", message: explainSourceAuthorityError(message) };
    return { status: "error", message: explainSourceAuthorityError(message) };
  }

  refresh();

  if (result.status === 200) {
    return {
      status: "replayed",
      map: result.data,
      message: `This correlation id already ranked ${result.data.source_system} at ${result.data.precedence_rank} for ${result.data.field_family}, so nothing was written. The service answered 200, not an error.`,
    };
  }
  return {
    status: "created",
    map: result.data,
    message: `${result.data.source_system} now ranks ${result.data.precedence_rank} for ${result.data.field_family}. The rule is immutable — to change the ranking later, end this rule and record a new one.`,
  };
}

// ─── End a precedence rule ───────────────────────────────────────────────────

export async function supersedeSourceAuthorityMapAction(
  _prev: SupersedeMapState,
  formData: FormData,
): Promise<SupersedeMapState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const sourceAuthorityMapId = String(formData.get("source_authority_map_id") ?? "").trim();
  if (!sourceAuthorityMapId) return { status: "error", message: "A rule id is required." };

  const effectiveToRaw = String(formData.get("effective_to") ?? "").trim();
  let effectiveTo: string | undefined;
  if (effectiveToRaw) {
    const parsed = asRFC3339(effectiveToRaw);
    if (!parsed) return { status: "error", message: "That end time could not be read." };
    // Checked here as well as in the service: naming the reason before a round
    // trip is cheaper, and the service's own refusal is correct but terse.
    if (new Date(parsed).getTime() < Date.now()) {
      return {
        status: "refused",
        message:
          "A precedence rule cannot be ended in the past. Back-dating the window would rewrite which rule was in force when earlier resolutions were made, so decisions already taken would stop being explainable by this register. Leave the field empty to end it now, or pick a future date.",
      };
    }
    effectiveTo = parsed;
  }

  const correlationId = String(formData.get("correlation_id") ?? "").trim() || crypto.randomUUID();

  const result = await supersedeSourceAuthorityMap({
    identity,
    sourceAuthorityMapId,
    effectiveTo,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainSourceAuthorityError(message) };
    if (status === 403) return { status: "refused", message: explainSourceAuthorityError(message) };
    // 409 is "already ended". Nothing to undo, and not a failed request.
    if (status === 409) return { status: "terminal", message: explainSourceAuthorityError(message) };
    return { status: "error", message: explainSourceAuthorityError(message) };
  }

  refresh();

  const endsAt = result.data.effective_to ? new Date(result.data.effective_to) : null;
  const scheduled = endsAt !== null && endsAt.getTime() > Date.now();
  return {
    status: "superseded",
    map: result.data,
    message: scheduled
      ? `${result.data.source_system} stops being ranked for ${result.data.field_family} at ${endsAt.toLocaleString()}. Until then the rule still decides resolutions.`
      : `${result.data.source_system} is no longer ranked for ${result.data.field_family}. Resolutions from now on fall to the next source down — and if none is ranked, the field resolves to nothing rather than to a guess.`,
  };
}

// ─── Record an observation ───────────────────────────────────────────────────

function parseAuthorityClass(raw: string): AuthorityClass | undefined {
  if (!raw) return undefined;
  return (AUTHORITY_CLASSES as readonly string[]).includes(raw) ? (raw as AuthorityClass) : undefined;
}

export async function recordNormalizedFactAction(
  _prev: RecordFactState,
  formData: FormData,
): Promise<RecordFactState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const fieldFamily = String(formData.get("field_family") ?? "").trim();
  const entityRef = String(formData.get("entity_ref") ?? "").trim();
  const sourceSystem = String(formData.get("source_system") ?? "").trim();
  const sourceRecord = String(formData.get("source_record") ?? "").trim();
  const sourceVersion = String(formData.get("source_version") ?? "").trim();
  const factValueRaw = String(formData.get("fact_value") ?? "").trim();
  const observedAtRaw = String(formData.get("observed_at") ?? "").trim();
  const effectiveAtRaw = String(formData.get("effective_at") ?? "").trim();
  const transformationVersion = String(formData.get("transformation_version") ?? "").trim();
  const authorityClassRaw = String(formData.get("authority_class") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!fieldFamily) return { status: "error", message: "A field family is required." };
  if (!entityRef) return { status: "error", message: "An entity reference is required — a fact is about one business entity." };
  if (!sourceSystem) return { status: "error", message: "A source system is required — a fact is what one system reported." };
  if (!sourceRecord) {
    return {
      status: "error",
      message:
        "A source record is required: the source system's own identifier for the record this value came from. It is what makes the observation traceable back to the system that made it.",
    };
  }
  if (!factValueRaw) return { status: "error", message: "A fact value is required." };

  // fact_value is JSONB. A bare word is not valid JSON, and letting it through
  // produces a parse failure from Postgres rather than an answer an operator
  // can act on — so quote a plain scalar here rather than refusing it.
  let factValue: unknown;
  try {
    factValue = JSON.parse(factValueRaw);
  } catch {
    factValue = factValueRaw;
  }

  const authorityClass = parseAuthorityClass(authorityClassRaw);
  if (authorityClassRaw && !authorityClass) {
    return {
      status: "error",
      message:
        "That is not an authority class. Use AUTHORITATIVE, DERIVED or CACHED — the service refuses anything else rather than storing the fact in a class no consumer knows how to weigh.",
    };
  }

  const observedAt = asRFC3339(observedAtRaw);
  if (!observedAt) {
    return { status: "error", message: "An observation time is required — when the source reported this value." };
  }
  const effectiveAt = effectiveAtRaw ? asRFC3339(effectiveAtRaw) : undefined;
  if (effectiveAtRaw && !effectiveAt) {
    return { status: "error", message: "That effective time could not be read." };
  }
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key for this observation." };
  }

  const result = await recordNormalizedFact({
    identity,
    fieldFamily,
    entityRef,
    sourceSystem,
    sourceRecord,
    sourceVersion: sourceVersion || undefined,
    factValue,
    observedAt,
    effectiveAt: effectiveAt ?? undefined,
    transformationVersion: transformationVersion || undefined,
    authorityClass,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainSourceAuthorityError(message) };
    if (status === 403) return { status: "refused", message: explainSourceAuthorityError(message) };
    return { status: "error", message: explainSourceAuthorityError(message) };
  }

  refresh();

  if (result.status === 200) {
    return {
      status: "replayed",
      fact: result.data,
      message: `This correlation id already recorded an observation from ${result.data.source_system}, so nothing was written. On an append-only fact log that matters: a second row would be an observation no source ever made.`,
    };
  }
  return {
    status: "recorded",
    fact: result.data,
    message: `Recorded what ${result.data.source_system} reported for ${result.data.entity_ref}. This is appended, never an edit — a correction is a later observation, so the history of what each source said stays intact.`,
  };
}
