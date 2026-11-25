// audit-event-store-svc (:8084) — the append-only, audit-grade event store.
//
// 03-microservices.md §14.1: "Stores append-only, audit-grade event records
// correlated to source actions." Critical constraint: "Records must be
// immutable and queryable by actor, entity, action, workflow, or time range."
//
// Two halves to this service's surface:
//
//  1. GET /v1/events + POST /v1/events/verify — Doc 03 §14.1's query API and
//     live hash-chain verification. Every row is linked to the previous one by
//     hash (previous_hash / hash_signature), so a broken link anywhere in the
//     chain is detectable without trusting any single row.
//
//  2. POST /v1/archives, GET /v1/archives/{id}, POST /v1/archives/{id}/verify,
//     GET /v1/archives/{id}/verifications — AUD-10 "Audit Trail / Data
//     Export"'s archive half: a permanent, re-verifiable claim that a sequence
//     range formed an unbroken chain as of its creation. Archives are never
//     mutated after creation (migration 000004's reject_archive_mutation
//     trigger) and an archive can be re-verified many times over its life —
//     every verification attempt is itself a permanent row, never overwritten.
//
// Both halves require X-Principal-Id (401 principal_required without it) and
// are authorized against a PLATFORM scope, not the caller's tenant — this
// service's own SoD model assigns AUDIT_EVENT_READ / AUDIT_ARCHIVE_MANAGE to
// platform-level roles (Compliance Auditor, System Admin), not per-tenant
// business users. A caller without the grant gets 403; if authorization-svc
// itself is unreachable the service fails CLOSED with 503 rather than
// admitting the request — an evidence ledger must never silently open up
// because its authorization dependency is down.
//
// X-Tenant-Id is still mandatory on every route (401 tenant_required without
// it) — it scopes which tenant's events/archives come back, even though the
// permission check itself is platform-wide.
//
// getAuditEvents/verifyAuditChain/ingestAuditEvent below are an older, simpler
// surface over the same two routes (GET /v1/events, POST /v1/events/verify),
// kept because app/admin/overview/executive-dashboard/page.tsx and
// app/admin/audit-events/actions.ts already depend on their shapes. listEvents
// (with full filters) and verifyEventsChain are the richer replacements used
// by this page's own filter bar and verify panel.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import { parseEventListResponse, parseVerifyResponse, type AuditEventCounts } from "./audit-event-summary";

/** Wire shape from the backend. Field names match the Go json tags exactly. */
export type AuditEvent = {
  id: string;
  event_id: string;
  event_type: string;
  action: string;
  tenant_id: string;
  legal_entity_id: string;
  principal_id: string;
  principal_name?: string;
  domain?: string;
  resource?: string;
  resource_id?: string;
  status?: string;
  source_service: string;
  schema_version: string;
  /** Free-form JSON — whatever the source service attached to the event. */
  payload: unknown;
  stored_at: string;
  timestamp: string;
  correlation_id: string;
  causation_id?: string;
  sequence_number: number;
  payload_hash: string;
  hash_signature: string;
  previous_hash: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventSummary = AuditEventCounts;

// There used to be a FALLBACK_AUDIT_EVENTS list here: six invented events with
// named principals and synthetic SHA-256 hashes, returned whenever the service
// could not be read, with a summary claiming the chain was verified and a
// throughput of 142/min. On success the summary still hardcoded
// hashChainVerified: true and 180/min. None of it came from a service. A failed
// read is now an error, and every figure in the summary is the service's own.

/**
 * Read one page of audit events from audit-event-store-svc.
 *
 * The service requires X-Principal-Id and X-Tenant-Id and checks
 * AUDIT_EVENT_READ, so the caller's session identity is mandatory.
 */
export async function getAuditEvents(
  identity: Identity,
): Promise<
  { ok: true; data: AuditEvent[]; summary: AuditEventSummary } | { ok: false; error: string }
> {
  const res = await apiGet<unknown>("auditEventStore", "/v1/events", { identity });
  if (!res.ok) return { ok: false, error: res.error.message };

  const parsed = parseEventListResponse<AuditEvent>(res.data);
  if (!parsed.ok) return parsed;
  return { ok: true, data: parsed.events, summary: parsed.summary };
}

/**
 * Ask the service to verify the audit hash chain.
 *
 * Throws when no verdict could be obtained. It used to answer `verified: true`
 * when the service was unreachable, and to treat any response that did not say
 * `false` as intact, so an outage read as "no tampering detected".
 */
export async function verifyAuditChain(identity: Identity): Promise<{
  verified: boolean;
  timestamp: string;
  checkedEvents: number;
}> {
  const res = await apiPost<unknown>(
    "auditEventStore",
    "/v1/events/verify",
    {},
    {
      identity,
      // Live-verified bug fix: this service's §4 policy (internal/envelope/
      // contract.go) requires purpose_context on every material write, and
      // verify is a POST despite reading nothing back that the caller wrote
      // (Policy.materialWrite() keys off HTTP method, not semantics). Without
      // this, the call used to come back 400 envelope_incomplete and this
      // function would throw "canonical input contract violated: ..." instead
      // of ever reaching the chain check.
      purposeContext: "AUDIT_CHAIN_VERIFY",
    },
  );
  if (!res.ok) throw new Error(res.error.message);

  const parsed = parseVerifyResponse(res.data);
  if (!parsed.ok) throw new Error(parsed.error);
  return { verified: parsed.verified, timestamp: parsed.timestamp, checkedEvents: parsed.checkedEvents };
}

// ─── Write: Ingest Audit Event ────────────────────────────────────────────────

export type IngestAuditEventInput = {
  event_type?: string;
  source_module?: string;
  actor?: string;
  action: string;
  resource: string;
  outcome?: string;
  details?: string;
};

/**
 * POST a new audit event to audit-event-store-svc.
 *
 * Used by the service-inputs manual test console to record that a test run
 * was executed, leaving a tamper-evident trace in the audit log chain.
 *
 * Unverified against the live service (unlike every write above it): it sends
 * no identity and posts to /v1/events, a route this service's own
 * RegisterRoutes does not register (only GET /v1/events exists) — so this call
 * likely 404s today. Left as-is since nothing currently calls it; flagging
 * here rather than silently fixing a route nobody has exercised yet.
 */
export async function ingestAuditEvent(
  body: IngestAuditEventInput,
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  const res = await apiPost<{ event_id?: string; id?: string }>(
    "auditEventStore",
    "/v1/events",
    body,
  );

  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }

  return { ok: true, eventId: res.data.event_id ?? res.data.id };
}

// ─── Richer read surface: filters, pagination, full-chain verify, archives ──

export type QueryEventsResult = {
  events: AuditEvent[];
  total: number;
  /** Whether the hash chain across the RETURNED page is intact. A full-store
   *  verification is a separate call — see verifyEventsChain(). */
  hash_chain_valid: boolean;
};

/** Every filter GET /v1/events accepts. All optional, AND-composed. */
export type EventFilters = {
  /** Matches principal_id. */
  actor?: string;
  /** Matches legal_entity_id. */
  entity?: string;
  /** Matches event_type. */
  action?: string;
  /** Matches correlation_id — "every event from this workflow/request". */
  workflow?: string;
  /** RFC3339. The service answers 400 `invalid_from` on anything else. */
  from?: string;
  to?: string;
  /** Service caps at 200 and defaults to 50. */
  limit?: number;
  offset?: number;
  identity?: Identity;
};

/**
 * List audit events with the service's full filter set.
 *
 * Unlike governance-decision-log-svc, this route reports `total` and
 * `hash_chain_valid` alongside the page — so pagination here does not need the
 * "ask for one extra row" probe the Governance log uses.
 */
export async function listEvents(
  filters: EventFilters = {},
): Promise<ApiResult<QueryEventsResult>> {
  return apiGet<QueryEventsResult>("auditEventStore", "/v1/events", {
    identity: filters.identity,
    query: {
      actor: filters.actor,
      entity: filters.entity,
      action: filters.action,
      workflow: filters.workflow,
      from: filters.from,
      to: filters.to,
      limit: filters.limit ?? 50,
      offset: filters.offset,
    },
  });
}

export type ChainVerification = {
  verified: boolean;
  /** The service sends both spellings on the wire; this is the canonical one. */
  checked_events: number;
  timestamp: string;
};

/**
 * Verify the full store's hash chain, end to end.
 *
 * Distinct from `hash_chain_valid` on a query page (which only covers the rows
 * returned): this walks every event the tenant can see and confirms each one's
 * previous_hash matches the prior row's hash_signature. A broken link anywhere
 * comes back as `verified: false` — the service does not say where; a snapped
 * chain is a store-integrity incident, not a filterable fact.
 */
export async function verifyEventsChain(identity?: Identity): Promise<ApiResult<ChainVerification>> {
  const result = await apiPost<{ verified: boolean; checkedEvents: number; checked_events: number; timestamp: string }>(
    "auditEventStore",
    "/v1/events/verify",
    {},
    {
      identity,
      // This service's §4 policy (internal/envelope/contract.go) requires
      // purpose_context on every material write, and verify is a POST despite
      // reading nothing back that the caller wrote — see
      // Policy.materialWrite(), which keys off HTTP method, not semantics.
      // Confirmed live: omitting this gets 400 envelope_incomplete.
      purposeContext: "AUDIT_CHAIN_VERIFY",
    },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      verified: result.data.verified,
      checked_events: result.data.checked_events ?? result.data.checkedEvents,
      timestamp: result.data.timestamp,
    },
  };
}

export type Archive = {
  archive_id: string;
  tenant_id: string;
  from_sequence: number;
  to_sequence: number;
  event_count: number;
  archive_digest: string;
  first_event_hash: string;
  last_event_hash: string;
  created_by_principal_id: string;
  created_at: string;
};

export type VerificationResult = "VERIFIED" | "DIVERGED";

export type ArchiveVerificationRecord = {
  verification_id: string;
  archive_id: string;
  tenant_id: string;
  verified_by_principal_id: string;
  verified_at: string;
  result: VerificationResult;
  /** Present only when result is DIVERGED — the first sequence number where the
   *  chain no longer matches what the archive recorded. */
  first_divergent_sequence?: number;
};

export type CreateArchiveInput = {
  fromSequence: number;
  toSequence: number;
  /** Idempotency-Key. Left unset, apiPost generates a fresh one per call — set
   *  this when a resubmit of the SAME archive request must collapse rather
   *  than be evaluated as a second, distinct request. */
  idempotencyKey?: string;
  identity?: Identity;
};

/**
 * Create an archive over [fromSequence, toSequence].
 *
 * 201 means a new archive was sealed. 200 means the Idempotency-Key had
 * already been used for this exact request (same principal, same range) and
 * nothing new was written — the original archive is returned either way.
 * Reusing the same key for a DIFFERENT range or a different principal is a
 * 409 `idempotency_mismatch`, not a silent substitution.
 *
 * The service verifies the chain across the range before sealing it: a break
 * anywhere inside [fromSequence, toSequence] is a 409 `chain_broken` and no
 * archive row is created — there is nothing reproducible to archive.
 */
export async function createArchive(input: CreateArchiveInput): Promise<ApiWriteResult<Archive>> {
  return apiPost<Archive>(
    "auditEventStore",
    "/v1/archives",
    { from_sequence: input.fromSequence, to_sequence: input.toSequence },
    {
      identity: input.identity,
      idempotencyKey: input.idempotencyKey,
      // Required on every material write by this service's §4 policy —
      // confirmed live: omitting it gets 400 envelope_incomplete.
      purposeContext: "AUDIT_ARCHIVE_CREATE",
    },
  );
}

export async function getArchive(archiveId: string, identity?: Identity): Promise<ApiResult<Archive>> {
  return apiGet<Archive>("auditEventStore", `/v1/archives/${encodeURIComponent(archiveId)}`, {
    identity,
  });
}

/**
 * Re-verify a sealed archive against the current store.
 *
 * This is how a tamper-evident archive earns that description after the fact:
 * every call appends a new ArchiveVerification row (VERIFIED or DIVERGED) and
 * none of them ever overwrite an earlier one — the full verification history
 * is itself evidence.
 */
export async function verifyArchive(
  archiveId: string,
  identity?: Identity,
): Promise<ApiWriteResult<ArchiveVerificationRecord>> {
  return apiPost<ArchiveVerificationRecord>(
    "auditEventStore",
    `/v1/archives/${encodeURIComponent(archiveId)}/verify`,
    {},
    {
      identity,
      // Required on every material write by this service's §4 policy —
      // confirmed live: omitting it gets 400 envelope_incomplete.
      purposeContext: "AUDIT_ARCHIVE_VERIFY",
    },
  );
}

export async function listVerifications(
  archiveId: string,
  identity?: Identity,
): Promise<ApiResult<ArchiveVerificationRecord[]>> {
  const result = await apiGet<ArchiveVerificationRecord[]>(
    "auditEventStore",
    `/v1/archives/${encodeURIComponent(archiveId)}/verifications`,
    { identity },
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "audit-event-store-svc returned a non-array verification list" },
    };
  }
  return result;
}

/**
 * Turn a backend failure into something an operator can act on.
 *
 * The client folds the error body's `message` field into `ApiError.message` —
 * this service's own `code` (e.g. "tenant_required") is NOT part of that
 * folded text (see readErrorDetail in lib/api/client.ts), so matching is on
 * the literal sentences handler.go sends, not on the machine code.
 */
export function explainAuditEventError(message: string): string {
  if (message.includes("envelope_incomplete")) {
    // Should not happen from this console's own calls — every write here sets
    // purpose_context, and request_id/source_channel/idempotency_key are set
    // automatically by lib/api/client.ts. Left as a real explanation rather
    // than a bare passthrough in case the contract changes under this code.
    return `The request was missing required fields: ${message}`;
  }
  if (message.includes("X-Principal-Id header is required")) {
    return "Your session is missing a principal id — sign in again.";
  }
  if (message.includes("X-Tenant-Id header is required")) {
    return "Your session is missing a tenant id — sign in again.";
  }
  if (message.includes("not authorized to perform this action")) {
    return "You are not authorized for this action. Audit event and archive access is granted at the platform level (Compliance Auditor / System Admin), not per tenant — ask whoever administers those grants.";
  }
  if (message.includes("authorization service unavailable")) {
    return "authorization-svc could not be reached, so the request was refused rather than silently allowed. Nothing was read or written.";
  }
  if (message.includes("limit must be an integer")) {
    return "limit must be an integer between 1 and 200.";
  }
  if (message.includes("offset must be an integer")) {
    return "offset must be an integer of 0 or more.";
  }
  if (message.includes("RFC 3339 timestamp")) {
    return "The date range was not valid RFC3339. Use a full timestamp, e.g. 2026-07-30T00:00:00Z.";
  }
  if (message.includes("from must not be after to")) {
    return "The From date must not be after the To date.";
  }
  if (message.includes("to_sequence must be greater than or equal to from_sequence")) {
    return "to_sequence must be greater than or equal to from_sequence.";
  }
  if (message.includes("no events exist in the requested sequence range")) {
    return "No events exist in that sequence range — nothing to archive.";
  }
  if (message.includes("hash chain is broken")) {
    return "The hash chain is broken somewhere inside that sequence range, so this range cannot be archived as a reproducible claim. This is a store-integrity finding, not a usage mistake — escalate it.";
  }
  if (message.includes("Idempotency-Key was already used")) {
    return "That Idempotency-Key was already used for a different request (a different range, or a different principal). Use a new key, or confirm this is really meant to be the same request.";
  }
  if (message.includes("archive not found")) {
    return "No archive with that id exists, or it is not visible to your tenant.";
  }
  if (message.includes("Idempotency-Key must be at most")) {
    return "The idempotency key is too long (255 characters max).";
  }
  if (message.includes("is unreachable") || message.includes("did not respond")) {
    return "audit-event-store-svc could not be reached. Nothing was read or written.";
  }
  return message;
}
