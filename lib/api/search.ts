// search-indexer-svc (:8096, /search-indexer-svc through the gateway) — the
// secure search control plane, ESR-01..ESR-05 of ZS-SVC-AB-001.
//
// TWO THINGS THIS CONSOLE MUST NOT DO, and both are easy to get wrong:
//
//   1. NEVER send a tenant, actor or purpose in a request BODY. They travel as
//      §4 envelope headers and the service reads them from there. It also
//      refuses unknown body fields outright — so a `tenant_id` in the JSON is
//      a 400, not a silently-ignored field. That refusal is deliberate on the
//      service's side (NP-01): a console that believed its tenant took effect
//      would render an empty result as "that tenant has no data".
//
//   2. NEVER present a 206 as a success. The service answers 206 Partial
//      Content whenever the result set is not exhaustive — an engine shard
//      failure, a candidate whose authorization could not be obtained, a
//      result that could not be hydrated. INV-24 requires partial results to
//      be explicit, and a console that showed "12 results" for a page that
//      silently withheld eight would be the exact failure the invariant
//      exists to prevent. `isPartial` below is what the page branches on.
//
// WHAT A SUPPRESSION IS. The service returns reason codes and counts for
// withheld candidates, and NOTHING that names them (TC-06). That is not an
// oversight to work around — it is the control. The console shows the count
// and the human meaning of the code, and has nothing else to show.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/**
 * Caller identity. Both fields are required here rather than optional.
 *
 * The service runs the canonical envelope middleware in STRICT mode — not the
 * platform's usual write-strict default — because ESR-001
 * TENANT_CONTEXT_MISSING has to be a hard refusal on READS too. A call from
 * this console without both is a 401 before it reaches a handler.
 */
type CallerIdentity = Identity & { principalId: string; tenantId: string };

/**
 * §4 purpose_context values this console asserts, one per kind of access.
 *
 * Not decoration. The service marks purpose_context RequiredOnWrite, every
 * route here is a POST, and §6.1 makes purpose mandatory for governed corpora
 * — so a call without one is refused with ESR-009 PRIVACY_PURPOSE_BLOCKED.
 *
 * Distinct values per operation rather than one blanket string, because the
 * field records WHY a governed corpus was reached and these are genuinely
 * different reasons. An auditor reading the evidence table should be able to
 * tell a routine search from an export without inferring it from the route.
 */
const PURPOSE = {
  /** Running a governed search from the console. */
  search: "SEARCH_OPERATIONS",
  /** Registering a source, drafting or publishing a contract. */
  registry: "SEARCH_REGISTRY_ADMINISTRATION",
  /** Building, validating or activating an index generation. */
  lifecycle: "SEARCH_INDEX_LIFECYCLE",
  /** Removing a record's search visibility on a privacy or records obligation. */
  restriction: "SEARCH_RESTRICTION_PROPAGATION",
  /** Requesting a controlled export of an authorized result set. */
  export: "SEARCH_EXPORT_REQUEST",
} as const;

// ── §11.3 reason codes ───────────────────────────────────────────────────────

/**
 * The canonical meaning of each ESR code, for rendering.
 *
 * Kept as a table rather than read from the response, even though the service
 * sends `reason` alongside `reason_code`, because the console also needs to
 * explain codes that arrive inside a `suppressions` array — where only the
 * code and its meaning travel, and no `detail` exists to fall back on.
 */
export const REASON_MEANINGS: Record<string, string> = {
  "ESR-001": "Tenant context missing",
  "ESR-002": "Scope not registered",
  "ESR-003": "Query operator forbidden",
  "ESR-004": "Query complexity exceeded",
  "ESR-005": "Field not searchable",
  "ESR-006": "Field not returnable",
  "ESR-007": "Partition not authorized",
  "ESR-008": "Authorization indeterminate",
  "ESR-009": "Privacy purpose blocked",
  "ESR-010": "Source resource suppressed",
  "ESR-011": "Index generation not active",
  "ESR-012": "Index stale for scope",
  "ESR-013": "Restriction epoch mismatch",
  "ESR-014": "Source hydration failed",
  "ESR-015": "Result window exceeded",
  "ESR-016": "Export authorization required",
  "ESR-017": "Reindex validation failed",
  "ESR-018": "Restriction propagation failed",
  "ESR-019": "Semantic model mismatch",
  "ESR-020": "Search degraded / partial",
};

/**
 * What a reader should DO about a refusal.
 *
 * The service's `detail` says what happened; this says what to change. They
 * are different questions, and a console that only forwarded the first leaves
 * the reader to work out whether the problem is their query, their grants, or
 * the platform.
 */
export function explainReason(code: string | undefined, detail?: string): string {
  const fallback = detail ?? "The request was refused.";
  switch (code) {
    case "ESR-001":
      return "Your session carries no tenant. Sign in again.";
    case "ESR-002":
      return "That search surface has no published contract. Publish one on the Registry tab.";
    case "ESR-003":
      return `${detail ?? "That query uses engine syntax."} Search accepts plain terms — wildcards, regular expressions and engine field names are not query language here.`;
    case "ESR-004":
      return `${detail ?? "The query is too expensive or too short."} Narrow it, ask for fewer facets, or type at least two characters.`;
    case "ESR-005":
    case "ESR-006":
      return `${detail ?? "That field is not exposed on this scope."} The contract decides which fields may be searched, filtered, sorted or returned — see the Registry tab.`;
    case "ESR-007":
      return "This principal may not reach that partition. A workload must act on behalf of a named person.";
    case "ESR-008":
      return "No authorization decision could be obtained, so results were withheld. This is authorization-svc being unreachable, not a permissions problem — retry shortly.";
    case "ESR-009":
      return "A purpose is required for governed search and none was asserted.";
    case "ESR-010":
      return "Suppressed: the current authorization for that record does not permit it. The index hit is not permission.";
    case "ESR-011":
      return "That scope has no active index generation, so there is nothing to search yet. Build and activate one on the Lifecycle tab.";
    case "ESR-013":
      return "A newer restriction has already been applied to that record. The older one was declined so it cannot reopen visibility.";
    case "ESR-014":
      return "The authoritative source could not be read, so the indexed copy was withheld rather than shown as current.";
    case "ESR-015":
      return "That page size or cursor exceeds the result window. Narrow the query, or use an authorized export for a large population.";
    case "ESR-016":
      return "An export is a separately authorized act — search permission does not carry over. This principal needs SEARCH_EXPORT.";
    case "ESR-017":
      return `${detail ?? "Validation failed."} The generation was not activated, and the previously validated one is still serving.`;
    default:
      return fallback;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type Completeness = "COMPLETE" | "PARTIAL" | "DEGRADED" | "UNKNOWN";
export type RetrievalClass = "R0" | "R1" | "R2" | "R3";
export type PropagationState = "PENDING" | "APPLIED" | "VERIFIED" | "FAILED";
export type ContractState = "DRAFT" | "CERTIFIED" | "PUBLISHED" | "RETIRED";
export type GenerationState =
  | "PLANNED" | "BUILDING" | "VALIDATING" | "READY" | "ACTIVE" | "FAILED" | "RETIRED";

export const SENSITIVITY_CLASSES = [
  "PUBLIC", "INTERNAL", "PERSONAL", "FINANCIAL", "HR", "LEGAL_PRIVILEGED", "RESTRICTED",
] as const;

export const FIELD_TYPES = ["KEYWORD", "TEXT", "DATE", "LONG", "DOUBLE", "BOOLEAN"] as const;

export type SearchResult = {
  source_type: string;
  source_id: string;
  source_version: number;
  tenant_id: string;
  legal_entity_id?: string;
  score: number;
  index_generation: string;
  indexed_at?: string;
  retrieval_class: RetrievalClass;
  fields: Record<string, unknown>;
  /**
   * HTML-escaped by the service, with only its own `<mark>` tags as markup.
   * Stored source markup is escaped to visible text first (NP-24), which is
   * what makes it safe to render these through dangerouslySetInnerHTML — and
   * why the page must not add any further escaping of its own, which would
   * show the `<mark>` tags as literal text.
   */
  snippets?: Record<string, string[]>;
  /** INDEX = the projection's view; SOURCE = hydrated from the authoritative record. */
  freshness: "INDEX" | "SOURCE";
};

export type Suppression = {
  reason_code: string;
  meaning: string;
  count: number;
};

export type FacetBucket = { value: string; count: number };

export type SearchResponse = {
  scope: string;
  results: SearchResult[];
  facets?: Record<string, FacetBucket[]>;
  suppressions?: Suppression[];
  completeness_state: Completeness;
  completeness_detail?: string;
  total: number;
  /** False once anything was suppressed — see the note at the top of this file. */
  total_is_exact: boolean;
  next_cursor?: string;
  index_generation: string;
  reason_codes?: string[];
};

export type ScopeField = {
  name: string;
  type: string;
  searchable: boolean;
  filterable: boolean;
  facetable: boolean;
  sortable: boolean;
  returnable: boolean;
  snippet_allowed: boolean;
};

export type Scope = {
  scope: string;
  contract_version: number;
  retrieval_class: RetrievalClass;
  freshness_class: string;
  active: boolean;
  fields: ScopeField[];
};

export type SearchSource = {
  source_id: string;
  owner_service: string;
  source_type: string;
  tenant_scope: string;
  residency_region: string;
  sensitivity_ceiling: string;
  event_topic: string;
  event_types: string[];
  restriction_event_types: string[];
  freshness_class: string;
  max_lag_seconds: number;
  created_at: string;
};

export type FieldDefinition = {
  name: string;
  source_path: string;
  type: string;
  searchable: boolean;
  filterable: boolean;
  facetable: boolean;
  sortable: boolean;
  snippet_allowed: boolean;
  returnable: boolean;
  exportable: boolean;
  sensitivity_class: string;
  analyzer_profile: string;
};

export type IndexContract = {
  contract_id: string;
  source_id: string;
  scope_name: string;
  version: number;
  schema_digest: string;
  publication_state: ContractState;
  freshness_class: string;
  retrieval_class: RetrievalClass;
  analyzer_profile: string;
  authz_action: string;
  fields: FieldDefinition[];
  created_at: string;
  published_at?: string | null;
};

export type IndexGeneration = {
  generation_id: string;
  contract_id: string;
  contract_version: number;
  scope_name: string;
  engine_ref: string;
  validation_state: GenerationState;
  validation_digest: string;
  validation_note: string;
  activated_at?: string | null;
  retired_at?: string | null;
  created_at: string;
};

export type Checkpoint = {
  scope_name: string;
  source_partition: string;
  watermark: number;
  committed_at: string;
  observed_at: string;
  lag_ms: number;
  freshness: "UNKNOWN" | "CURRENT" | "LAGGING" | "STALE";
  indexed_live: number;
  indexed_tombstoned: number;
};

export type Tombstone = {
  tenant_id: string;
  scope_name: string;
  source_type: string;
  source_id: string;
  reason: string;
  epoch: number;
  source_event_id: string;
  effective_at: string;
  propagated_at?: string | null;
  /**
   * When invisibility was PROVEN. Null while the state is APPLIED — §2.2 is
   * explicit that APPLIED is not VERIFIED until search visibility has been
   * tested, and the console must not render the two the same way.
   */
  verified_at?: string | null;
  state: PropagationState;
  failure_reason: string;
};

export type SearchEvidence = {
  evidence_id: string;
  request_id: string;
  correlation_id: string;
  tenant_id: string;
  actor_id: string;
  workload_id: string;
  purpose_context: string;
  scope_name: string;
  /** A SHA-256 digest. The service never stores query text (INV-17, §9.2). */
  query_digest: string;
  mandatory_filters_digest: string;
  plan_digest: string;
  index_generation: string;
  partition_set: string[];
  complexity_score: number;
  result_count: number;
  suppressed_count: number;
  completeness_state: Completeness;
  reason_codes: string[];
  duration_ms: number;
  created_at: string;
};

// ── Tenant plane ─────────────────────────────────────────────────────────────

export type SearchQuery = {
  scope: string;
  query?: string;
  filters?: Record<string, string>;
  requestedFields?: string[];
  facets?: string[];
  sort?: { field: string; desc?: boolean }[];
  size?: number;
  cursor?: string;
  includeSnippets?: boolean;
};

/**
 * Execute a governed search.
 *
 * Returns the 206 case as a SUCCESS with `completeness_state` set, not as an
 * error: the results are real and usable, they are simply not exhaustive.
 * Surfacing it as an error would throw away the results; surfacing it as an
 * ordinary 200 would breach INV-24. Callers branch on `isPartial(response)`.
 */
export async function runSearch(
  input: SearchQuery & CallerIdentity,
): Promise<ApiWriteResult<SearchResponse>> {
  return apiPost<SearchResponse>(
    "searchIndexer",
    "/v1/search",
    {
      scope: input.scope,
      // Empty strings are dropped rather than sent. A blank `query` means
      // "everything within the mandatory filters", which is a legitimate
      // request; sending "" as a query would hit the two-character minimum
      // and be refused with ESR-004 for a search the reader did not make.
      ...(input.query ? { query: input.query } : {}),
      ...(input.filters && Object.keys(input.filters).length ? { filters: input.filters } : {}),
      ...(input.requestedFields?.length ? { requested_fields: input.requestedFields } : {}),
      ...(input.facets?.length ? { facets: input.facets } : {}),
      ...(input.sort?.length ? { sort: input.sort } : {}),
      ...(input.size ? { size: input.size } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.includeSnippets ? { include_snippets: true } : {}),
    },
    {
      identity: identityOf(input),
      purposeContext: PURPOSE.search,
      // A fresh idempotency key per search, deliberately. §11.1 keys this
      // route on "request ID + canonical query digest", and two identical
      // searches a minute apart are two distinct governed accesses that must
      // each produce their own evidence row.
    },
  );
}

/** Whether a response is not exhaustive. The page must say so when it is. */
export function isPartial(r: SearchResponse): boolean {
  return r.completeness_state !== "COMPLETE";
}

/** Total suppressed candidates across every reason code. */
export function suppressedTotal(r: SearchResponse): number {
  return (r.suppressions ?? []).reduce((sum, s) => sum + s.count, 0);
}

export async function listScopes(
  identity: CallerIdentity,
): Promise<ApiResult<{ scopes: Scope[] }>> {
  return apiGet<{ scopes: Scope[] }>("searchIndexer", "/v1/scopes", {
    identity: identityOf(identity),
    purposeContext: PURPOSE.search,
  });
}

export async function listRestrictions(
  input: CallerIdentity & { scope?: string; limit?: number },
): Promise<ApiResult<{ restrictions: Tombstone[] }>> {
  return apiGet<{ restrictions: Tombstone[] }>("searchIndexer", "/v1/restrictions", {
    query: { scope: input.scope, limit: input.limit },
    identity: identityOf(input),
    purposeContext: PURPOSE.restriction,
  });
}

export async function listEvidence(
  input: CallerIdentity & { scope?: string; limit?: number },
): Promise<ApiResult<{ evidence: SearchEvidence[] }>> {
  return apiGet<{ evidence: SearchEvidence[] }>("searchIndexer", "/v1/search-evidence", {
    query: { scope: input.scope, limit: input.limit },
    identity: identityOf(input),
    purposeContext: PURPOSE.search,
  });
}

export async function applyRestriction(
  input: CallerIdentity & {
    scope: string;
    sourceType: string;
    sourceId: string;
    reason: string;
    sourceEventId: string;
  },
): Promise<ApiWriteResult<{ applied: boolean; state: PropagationState; epoch: number; detail?: string }>> {
  return apiPost("searchIndexer", "/v1/restrictions", {
    scope: input.scope,
    source_type: input.sourceType,
    source_id: input.sourceId,
    reason: input.reason,
    source_event_id: input.sourceEventId,
  }, {
    identity: identityOf(input),
    purposeContext: PURPOSE.restriction,
    // Keyed on the source event, which is exactly what the service uses to
    // make a replayed erasure a no-op rather than a second tombstone (NP-47).
    // A fresh key here would defeat that from the console's side.
    idempotencyKey: `restriction:${input.sourceType}:${input.sourceId}:${input.sourceEventId}`,
  });
}

export async function requestExport(
  input: CallerIdentity & { scope: string; reason: string },
): Promise<ApiWriteResult<{ export_id: string; eligible_population: number; status: string; detail: string }>> {
  return apiPost("searchIndexer", "/v1/search-exports", {
    scope: input.scope,
    reason: input.reason,
  }, {
    identity: identityOf(input),
    // The export's OWN purpose, not the search one. INV-29: search permission
    // does not imply bulk-exfiltration permission, and the evidence has to be
    // able to tell the two accesses apart.
    purposeContext: PURPOSE.export,
  });
}

// ── Control plane ────────────────────────────────────────────────────────────

export async function listSources(
  identity: CallerIdentity,
): Promise<ApiResult<{ sources: SearchSource[] }>> {
  return apiGet<{ sources: SearchSource[] }>("searchIndexer", "/v1/search-sources", {
    identity: identityOf(identity),
    purposeContext: PURPOSE.registry,
  });
}

export async function createSource(
  input: CallerIdentity & {
    ownerService: string;
    sourceType: string;
    eventTopic: string;
    eventTypes: string[];
    restrictionEventTypes?: string[];
    sensitivityCeiling?: string;
    residencyRegion?: string;
    freshnessClass?: string;
  },
): Promise<ApiWriteResult<SearchSource>> {
  return apiPost<SearchSource>("searchIndexer", "/v1/search-sources", {
    owner_service: input.ownerService,
    source_type: input.sourceType,
    event_topic: input.eventTopic,
    event_types: input.eventTypes,
    restriction_event_types: input.restrictionEventTypes ?? [],
    ...(input.sensitivityCeiling ? { sensitivity_ceiling: input.sensitivityCeiling } : {}),
    ...(input.residencyRegion ? { residency_region: input.residencyRegion } : {}),
    ...(input.freshnessClass ? { freshness_class: input.freshnessClass } : {}),
  }, {
    identity: identityOf(input),
    purposeContext: PURPOSE.registry,
    // Keyed on the source type, which the service also treats as unique.
    // A double-clicked form produces one registration and one 409, not two
    // registrations racing.
    idempotencyKey: `source:${input.sourceType}`,
  });
}

export async function listContracts(
  input: CallerIdentity & { scope?: string },
): Promise<ApiResult<{ contracts: IndexContract[] }>> {
  return apiGet<{ contracts: IndexContract[] }>("searchIndexer", "/v1/index-contracts", {
    query: { scope: input.scope },
    identity: identityOf(input),
    purposeContext: PURPOSE.registry,
  });
}

export async function createContract(
  input: CallerIdentity & {
    sourceType: string;
    scopeName?: string;
    retrievalClass?: RetrievalClass;
    authzAction: string;
    fields: Partial<FieldDefinition>[];
  },
): Promise<ApiWriteResult<IndexContract>> {
  return apiPost<IndexContract>("searchIndexer", "/v1/index-contracts", {
    source_type: input.sourceType,
    ...(input.scopeName ? { scope_name: input.scopeName } : {}),
    ...(input.retrievalClass ? { retrieval_class: input.retrievalClass } : {}),
    authz_action: input.authzAction,
    fields: input.fields,
  }, {
    identity: identityOf(input),
    purposeContext: PURPOSE.registry,
  });
}

export async function transitionContract(
  input: CallerIdentity & { contractId: string; state: ContractState },
): Promise<ApiWriteResult<IndexContract>> {
  return apiPost<IndexContract>(
    "searchIndexer",
    `/v1/index-contracts/${encodeURIComponent(input.contractId)}/state`,
    { state: input.state },
    {
      identity: identityOf(input),
      purposeContext: PURPOSE.registry,
      idempotencyKey: `contract:${input.contractId}:${input.state}`,
    },
  );
}

export async function listGenerations(
  input: CallerIdentity & { scope?: string },
): Promise<ApiResult<{ generations: IndexGeneration[] }>> {
  return apiGet<{ generations: IndexGeneration[] }>("searchIndexer", "/v1/index-generations", {
    query: { scope: input.scope },
    identity: identityOf(input),
    purposeContext: PURPOSE.lifecycle,
  });
}

export async function createGeneration(
  input: CallerIdentity & { scope: string },
): Promise<ApiWriteResult<IndexGeneration>> {
  return apiPost<IndexGeneration>("searchIndexer", "/v1/index-generations", {
    scope: input.scope,
  }, {
    identity: identityOf(input),
    purposeContext: PURPOSE.lifecycle,
  });
}

export async function transitionGeneration(
  input: CallerIdentity & { generationId: string; state: GenerationState; note?: string },
): Promise<ApiWriteResult<IndexGeneration>> {
  return apiPost<IndexGeneration>(
    "searchIndexer",
    `/v1/index-generations/${encodeURIComponent(input.generationId)}/state`,
    { state: input.state, ...(input.note ? { note: input.note } : {}) },
    {
      identity: identityOf(input),
      purposeContext: PURPOSE.lifecycle,
      // Keyed on the target state. Activating a generation is an atomic alias
      // swap that changes what every caller sees; a double-clicked button must
      // not attempt it twice.
      idempotencyKey: `generation:${input.generationId}:${input.state}`,
    },
  );
}

export async function listCheckpoints(
  input: CallerIdentity & { scope?: string },
): Promise<ApiResult<{ checkpoints: Checkpoint[] }>> {
  return apiGet<{ checkpoints: Checkpoint[] }>("searchIndexer", "/v1/checkpoints", {
    query: { scope: input.scope },
    identity: identityOf(input),
    purposeContext: PURPOSE.lifecycle,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function identityOf(input: CallerIdentity): Identity {
  return {
    principalId: input.principalId,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    envelopeJwt: input.envelopeJwt,
  };
}

/**
 * Pull the reason code out of an error body.
 *
 * The console branches on the CODE, never on the message text. The service
 * sends `{error, detail, reason_code, reason}`, and reason_code is the stable
 * part of that contract — §11.3 calls these "stable reason/error codes", and
 * pattern-matching on `detail` is exactly what a stable code exists to avoid.
 */
export function reasonCodeOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const code = (body as { reason_code?: unknown }).reason_code;
  return typeof code === "string" ? code : undefined;
}

/** Whether a generation state is one a person can act on next. */
export function nextGenerationStates(state: GenerationState): GenerationState[] {
  switch (state) {
    case "PLANNED":
      return ["BUILDING"];
    case "BUILDING":
      return ["VALIDATING"];
    case "VALIDATING":
      // READY runs REAL validation — cross-tenant contamination and
      // completeness against the control-plane ledger. It is not a state
      // write, and it can fail.
      return ["READY"];
    case "READY":
      // §8.1: ACTIVE is reachable only from READY, and the cutover is an
      // atomic alias swap.
      return ["ACTIVE", "RETIRED"];
    case "ACTIVE":
      // Retiring the serving generation is refused until a replacement is
      // active — §8.1's exit from ACTIVE is "RETIRED after replacement".
      return [];
    default:
      return [];
  }
}

export function nextContractStates(state: ContractState): ContractState[] {
  switch (state) {
    case "DRAFT":
      return ["CERTIFIED", "RETIRED"];
    case "CERTIFIED":
      return ["PUBLISHED", "DRAFT", "RETIRED"];
    case "PUBLISHED":
      return ["RETIRED"];
    default:
      return [];
  }
}
