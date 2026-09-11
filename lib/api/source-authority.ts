// source-authority-svc (:8150) — which connected system's value to trust.
//
// Per docs/original_doc/zoiko_suite_doc7.txt §D1-D3 and §K1 this service answers
// one question: for a given field on a given entity, which of the systems that
// reported a value should be believed, right now. It composes two things that
// are deliberately kept apart, and the split is the thing to understand before
// reading anything else on this page.
//
//  1. PRECEDENCE RULES (source_authority_maps) are PLATFORM-WIDE reference
//     data. "ADP outranks the HR spreadsheet for PAYROLL_GROSS_PAY" is a
//     statement about which connected SYSTEM is trusted; it is not about
//     anyone's payroll, and every tenant sees the same ranking.
//  2. NORMALIZED FACTS are TENANT business data. A fact is one value about one
//     business entity — an employee's gross pay, a counterparty's billing
//     contact — and it belongs to exactly one tenant.
//
// That boundary did not exist until this pass. normalized_facts had no tenant
// column at all, so every tenant's facts sat in one pool; the envelope
// middleware defaults to write-strict, which admits reads with no envelope; and
// the resolve endpoint is deliberately ungated on authorization because every
// service needs it cheaply and often. The three together meant
// GET /v1/source-authority/resolve returned raw fact values for any entity_ref
// in the platform, to anything that could reach the port — and entity_ref is
// free text no registry constrains, so guessing one was the whole of the access
// control.
//
// Four more properties shape this page:
//
//  - AMBIGUITY IS AN ANSWER, NOT A FAILURE. Two equally-ranked sources that
//    disagree do not get resolved by picking one. §D2 requires blocking, so the
//    service reports ambiguous=true with both values and a conflict_route, and
//    the caller is expected to stop.
//  - A SOURCE NOBODY HAS RANKED IS NAMED, NOT DROPPED. The resolver used to
//    INNER JOIN facts to rules, so a source reporting values with no precedence
//    rule was invisible rather than outranked — its disagreement never
//    surfaced. Those sources now come back in unmapped_sources.
//  - FACTS ARE APPEND-ONLY. A correction is a new observation with a later
//    observed_at, never an edit. Nothing here can rewrite what a source said.
//  - A RULE IS ENDED, NEVER EDITED. Supersede closes a rule's window and
//    records who closed it; the rule's own terms stay exactly as recorded, so a
//    resolution made last week is still explained by the row that made it.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** Wire shape. Field names match the Go json tags exactly. */
export type SourceAuthorityMap = {
  source_authority_map_id: string;
  field_family: string;
  source_system: string;
  /** Lower number wins. 1 beats 2. */
  precedence_rank: number;
  conflict_route: string;
  allowed_correction_path?: string | null;
  effective_from: string;
  effective_to?: string | null;
  created_at: string;
  created_by_principal_id: string;
  correlation_id?: string | null;
  superseded_at?: string | null;
  superseded_by_principal_id?: string | null;
};

export const AUTHORITY_CLASSES = ["AUTHORITATIVE", "DERIVED", "CACHED"] as const;
export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];

export type NormalizedFact = {
  normalized_fact_id: string;
  tenant_id: string;
  field_family: string;
  entity_ref: string;
  source_system: string;
  source_record: string;
  source_version?: string | null;
  /** Free-form JSONB. Rendered as JSON, never interpreted. */
  fact_value: unknown;
  observed_at: string;
  effective_at: string;
  transformation_version?: string | null;
  authority_class: AuthorityClass;
  created_at: string;
  created_by_principal_id: string;
  correlation_id?: string | null;
};

export type FactResolution = {
  field_family: string;
  entity_ref: string;
  ambiguous: boolean;
  authoritative_fact?: NormalizedFact | null;
  conflicting_facts?: NormalizedFact[] | null;
  conflict_route?: string | null;
  /** Sources that reported a value and have no precedence rule in force. */
  unmapped_sources?: string[] | null;
};

/**
 * Read the precedence register.
 *
 * Omitting fieldFamily returns the whole register. It used to be a required
 * parameter, which meant a caller had to already know the exact family string
 * to see anything — the register could not be browsed, and a typo answered with
 * an empty list rather than a refusal.
 *
 * includeSuperseded widens the read from "the rules in force now" to the full
 * history. The narrow read is the default deliberately: a list mixing live and
 * ended rules with no way to tell them apart is how an operator concludes a
 * source is ranked twice.
 */
export async function listSourceAuthorityMaps(params: {
  identity: Identity;
  fieldFamily?: string;
  sourceSystem?: string;
  includeSuperseded?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<SourceAuthorityMap[]>> {
  return apiGet<SourceAuthorityMap[]>("sourceAuthority", "/v1/source-authority-maps/", {
    identity: params.identity,
    query: {
      field_family: params.fieldFamily,
      source_system: params.sourceSystem,
      include_superseded: params.includeSuperseded ? "true" : undefined,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

/**
 * Record a precedence rule.
 *
 * correlationId is the idempotency key: the service is idempotent on it, so a
 * retried submission resolves to the original rule rather than being refused as
 * a duplicate. Before this pass the field was in the wire contract and read by
 * nothing, so a retry tripped the (field_family, source_system, effective_from)
 * uniqueness index and told the operator their rule conflicted with the one
 * they had just successfully created.
 */
export async function createSourceAuthorityMap(params: {
  identity: Identity;
  fieldFamily: string;
  sourceSystem: string;
  precedenceRank: number;
  conflictRoute: string;
  allowedCorrectionPath?: string;
  effectiveFrom: string;
  correlationId: string;
}): Promise<ApiWriteResult<SourceAuthorityMap>> {
  return apiPost<SourceAuthorityMap>(
    "sourceAuthority",
    "/v1/source-authority-maps/",
    {
      field_family: params.fieldFamily,
      source_system: params.sourceSystem,
      precedence_rank: params.precedenceRank,
      conflict_route: params.conflictRoute,
      ...(params.allowedCorrectionPath ? { allowed_correction_path: params.allowedCorrectionPath } : {}),
      effective_from: params.effectiveFrom,
      correlation_id: params.correlationId,
    },
    { identity: params.identity, correlationId: params.correlationId },
  );
}

/**
 * End a precedence rule's window.
 *
 * This is the operation the service did not have. effective_to existed from the
 * first migration and the resolver always honoured it, but nothing could set
 * it — so the documented way to change a precedence, "a changed precedence is a
 * new row", left BOTH rows in force, the resolver ranked the same source twice
 * and took the better rank, and the demotion silently did nothing.
 *
 * The rule is never edited, only ended: precedence_rank and conflict_route stay
 * exactly as recorded, so a resolution made while it was in force is still
 * explained by the row that made it.
 */
export async function supersedeSourceAuthorityMap(params: {
  identity: Identity;
  sourceAuthorityMapId: string;
  /** RFC3339. Defaults to now, server-side. Must not be in the past. */
  effectiveTo?: string;
  correlationId: string;
}): Promise<ApiWriteResult<SourceAuthorityMap>> {
  return apiPost<SourceAuthorityMap>(
    "sourceAuthority",
    `/v1/source-authority-maps/${encodeURIComponent(params.sourceAuthorityMapId)}/supersede`,
    {
      ...(params.effectiveTo ? { effective_to: params.effectiveTo } : {}),
      correlation_id: params.correlationId,
    },
    { identity: params.identity, correlationId: params.correlationId },
  );
}

/**
 * Read the observations behind a resolution.
 *
 * A resolution asserts an answer; this is what makes it explainable — every
 * source that reported, what each said, and when. Tenant-scoped and gated,
 * because it returns raw fact values.
 */
export async function listNormalizedFacts(params: {
  identity: Identity;
  fieldFamily?: string;
  entityRef?: string;
  sourceSystem?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<NormalizedFact[]>> {
  return apiGet<NormalizedFact[]>("sourceAuthority", "/v1/normalized-facts", {
    identity: params.identity,
    query: {
      field_family: params.fieldFamily,
      entity_ref: params.entityRef,
      source_system: params.sourceSystem,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

/**
 * Record one observation.
 *
 * Append-only: this never edits an existing fact. A correction is a new
 * observation with a later observed_at, which is doc7 §D1's "never silently
 * back-write" — the history of what each source said, and when, is the evidence
 * behind every resolution.
 *
 * factValue is sent as raw JSON. A bare string must still be valid JSON
 * (`"ACTIVE"`, not `ACTIVE`), which is why the form parses before submitting
 * rather than letting the service refuse an unquoted scalar.
 */
export async function recordNormalizedFact(params: {
  identity: Identity;
  fieldFamily: string;
  entityRef: string;
  sourceSystem: string;
  sourceRecord: string;
  sourceVersion?: string;
  factValue: unknown;
  observedAt: string;
  effectiveAt?: string;
  transformationVersion?: string;
  authorityClass?: AuthorityClass;
  correlationId: string;
}): Promise<ApiWriteResult<NormalizedFact>> {
  return apiPost<NormalizedFact>(
    "sourceAuthority",
    "/v1/normalized-facts",
    {
      field_family: params.fieldFamily,
      entity_ref: params.entityRef,
      source_system: params.sourceSystem,
      source_record: params.sourceRecord,
      ...(params.sourceVersion ? { source_version: params.sourceVersion } : {}),
      fact_value: params.factValue,
      observed_at: params.observedAt,
      ...(params.effectiveAt ? { effective_at: params.effectiveAt } : {}),
      ...(params.transformationVersion ? { transformation_version: params.transformationVersion } : {}),
      ...(params.authorityClass ? { authority_class: params.authorityClass } : {}),
      correlation_id: params.correlationId,
    },
    { identity: params.identity, correlationId: params.correlationId },
  );
}

/**
 * Resolve the trusted value for one field on one entity.
 *
 * Three outcomes, and they are genuinely different answers rather than degrees
 * of success:
 *
 *   - authoritative_fact set    — one source outranks the rest, or the top tier
 *                                 agrees. This is the value to act on.
 *   - ambiguous: true           — two equally-ranked sources disagree. §D2
 *                                 requires blocking; conflict_route says where
 *                                 to take it. Acting on either value is wrong.
 *   - neither                   — no source has reported, or none of the
 *                                 sources that did has a precedence rule. Check
 *                                 unmapped_sources before reading this as "no
 *                                 data".
 */
export async function resolveFact(params: {
  identity: Identity;
  fieldFamily: string;
  entityRef: string;
}): Promise<ApiResult<FactResolution>> {
  return apiGet<FactResolution>("sourceAuthority", "/v1/source-authority/resolve", {
    identity: params.identity,
    query: { field_family: params.fieldFamily, entity_ref: params.entityRef },
  });
}

/**
 * Turn a service refusal into something an operator can act on.
 *
 * Most of these are rules the console cannot check for itself, which is exactly
 * when a bare error string leaves the reader with nothing to do next.
 */
export function explainSourceAuthorityError(message: string): string {
  if (message.includes("authority_class must be one of")) {
    return "That is not an authority class. Use AUTHORITATIVE (the source is the system of record), DERIVED (computed from other facts) or CACHED (a copy that may be stale). A misspelling would otherwise store the fact in a class no consumer knows how to weigh.";
  }
  if (message.includes("correlation_id is required")) {
    return "This write needs a correlation id — it is the idempotency key. Without it a retry would append a second observation that no source ever made.";
  }
  if (message.includes("must not be in the past")) {
    return "A precedence rule cannot be ended in the past. Back-dating the window rewrites which rule was in force when earlier resolutions were made, so decisions already taken would stop being explainable by this register. End it now, or schedule a future date.";
  }
  if (message.includes("already been superseded")) {
    return "This rule's window is already closed. Nothing left to end — superseding again would only misattribute who ended it.";
  }
  if (message.includes("must be after the rule")) {
    return "The end of the window must be after the rule's own effective_from, otherwise the rule would cover no time at all.";
  }
  if (message.includes("source authority map not found")) {
    return "No precedence rule with that id.";
  }
  if (message.includes("conflict: source_authority_map already exists")) {
    return "A rule already ranks this source for this field family starting at that instant. Precedence rules are immutable — to change a ranking, supersede the existing rule and record a new one, rather than restating this one.";
  }
  if (message.includes("precedence_rank must be positive")) {
    return "Precedence rank starts at 1, and lower wins — rank 1 beats rank 2. Zero and negatives have no meaning in the ranking.";
  }
  if (message.includes("limit must be between")) {
    return "The read asked for an out-of-range page. limit must be 1–500 and offset must not be negative.";
  }
  if (message.includes("must be true or false")) {
    return "include_superseded takes true or false. It is refused rather than read as false, because answering a request for the full history with the in-force list only reads as an answer.";
  }
  if (message.includes("tenant context missing")) {
    return "The request carried no tenant. Facts are tenant data and this register will not read them without one. Sign in again.";
  }
  if (message.includes("caller identity missing")) {
    return "The register received no verified principal. Sign in again.";
  }
  if (message.includes("not authorized")) {
    return "Your principal lacks the grant for this action. The precedence register needs SOURCE_AUTHORITY_MAP_VIEW to read and SOURCE_AUTHORITY_MAP_CREATE or _SUPERSEDE to change; fact history needs NORMALIZED_FACT_VIEW.";
  }
  if (message.includes("authorization service unavailable")) {
    return "authorization-svc could not be reached, so no grant could be checked. Nothing was written — this service fails closed rather than guessing.";
  }
  if (message.includes("must be RFC3339")) {
    return "A timestamp was not in RFC3339 form. The console converts the date pickers for you, so this usually means a value was pasted in by hand.";
  }
  return message;
}

/** Render a JSONB fact value for display without pretending to interpret it. */
export function formatFactValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
