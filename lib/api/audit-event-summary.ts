// Pure response handling for audit-event-store-svc, kept free of imports so
// tests/audit-event-summary.test.mjs can load it with node --test directly.
//
// Contracts, from services/audit-event-store-svc/internal (zoiko-suite-backend):
//   GET  /v1/events        -> { events: AuditEventRecord[], total, hash_chain_valid }
//   POST /v1/events/verify -> { verified, checkedEvents, checked_events, timestamp }

export type AuditEventCounts = {
  /** The service's `total` for the query, which can exceed the page returned. */
  totalEvents: number;
  /** Events actually returned in this page; the per-status counts cover these only. */
  returnedEvents: number;
  /** The service's hash_chain_valid. It verifies the returned page, not the whole log. */
  hashChainVerified: boolean;
  authorizedCount: number;
  escalatedCount: number;
  deniedCount: number;
};

export type ParsedEventList<E> =
  | { ok: true; events: E[]; summary: AuditEventCounts }
  | { ok: false; error: string };

/**
 * Read a GET /v1/events body. Anything that is not the documented shape is an
 * error, never an empty log and never a verified chain.
 */
export function parseEventListResponse<E extends { status?: string }>(raw: unknown): ParsedEventList<E> {
  const body = raw as { events?: unknown; total?: unknown; hash_chain_valid?: unknown } | null;
  if (!body || typeof body !== "object" || !Array.isArray(body.events)) {
    return { ok: false, error: "audit-event-store-svc returned an event list in an unexpected shape" };
  }
  if (typeof body.hash_chain_valid !== "boolean") {
    return { ok: false, error: "audit-event-store-svc did not report hash_chain_valid" };
  }
  const events = body.events as E[];
  const count = (status: string) => events.filter((e) => e.status === status).length;
  return {
    ok: true,
    events,
    summary: {
      totalEvents: typeof body.total === "number" ? body.total : events.length,
      returnedEvents: events.length,
      hashChainVerified: body.hash_chain_valid,
      authorizedCount: count("AUTHORIZED"),
      escalatedCount: count("ESCALATED"),
      deniedCount: count("DENIED"),
    },
  };
}

export type ParsedVerification =
  | { ok: true; verified: boolean; checkedEvents: number; timestamp: string }
  | { ok: false; error: string };

/**
 * Read a POST /v1/events/verify body. The chain is intact only when the service
 * says `verified: true`; a missing or non-boolean verdict is an error, not a pass.
 */
export function parseVerifyResponse(raw: unknown): ParsedVerification {
  const body = raw as {
    verified?: unknown;
    checkedEvents?: unknown;
    checked_events?: unknown;
    timestamp?: unknown;
  } | null;
  if (!body || typeof body !== "object" || typeof body.verified !== "boolean") {
    return { ok: false, error: "audit-event-store-svc returned no verification verdict" };
  }
  const checked =
    typeof body.checkedEvents === "number"
      ? body.checkedEvents
      : typeof body.checked_events === "number"
        ? body.checked_events
        : null;
  if (checked === null || typeof body.timestamp !== "string") {
    return { ok: false, error: "audit-event-store-svc returned an incomplete verification result" };
  }
  return { ok: true, verified: body.verified, checkedEvents: checked, timestamp: body.timestamp };
}
