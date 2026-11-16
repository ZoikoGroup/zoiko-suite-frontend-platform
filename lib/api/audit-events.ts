import { apiGet, apiPost, type Identity } from "./client";
import { parseEventListResponse, parseVerifyResponse, type AuditEventCounts } from "./audit-event-summary";

export interface AuditEvent {
  id: string;
  correlation_id: string;
  tenant_id: string;
  principal_id: string;
  principal_name: string;
  action: string;
  domain: "tax" | "legal" | "commercial-ops" | "finance" | "payroll" | "hr" | "compliance";
  resource: string;
  resource_id: string;
  status: "AUTHORIZED" | "ESCALATED" | "DENIED" | "COMMITTED";
  timestamp: string;
  hash_signature: string;
  previous_hash: string;
  ip_address: string;
  metadata: Record<string, string | number | boolean>;
}

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
  const res = await apiPost<unknown>("auditEventStore", "/v1/events/verify", {}, { identity });
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
