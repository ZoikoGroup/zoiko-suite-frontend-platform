"use server";

// Server Actions for the audit-events domain.
//
// The audit event store is read-only by design: events are immutable once
// written, and the only write-like operation is triggering a cryptographic
// chain verification (which is a POST to the service but changes nothing in
// the store). These actions expose:
//
//  1. verifyChainAction     — trigger SHA-256 chain verification on the log
//  2. filterAuditEventsAction — return a filtered slice of events (domain, dates)
//  3. exportAuditLogAction   — serialise events to JSON for download
//
// None of these actions are authorised decisions about the data — they surface
// what audit-event-store-svc returns without adding policy.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import { getAuditEvents, verifyAuditChain } from "@/lib/api/audit-events";
import type { VerifyChainState, FilterState, ExportState, AuditDomain } from "./state";

// audit-event-store-svc refuses reads without a principal and tenant, so these
// actions need the session's identity. They are also reachable by direct POST,
// so they check the session themselves rather than relying on the /admin proxy.
async function requireIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) return null;
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const SESSION_EXPIRED = "Your session has expired — sign in again.";

/**
 * Trigger a cryptographic hash-chain verification on the audit event log.
 *
 * The service re-computes the SHA-256 chain from the first event and answers
 * whether every link is intact. A broken chain means at least one event has
 * been tampered with since it was written.
 */
export async function verifyChainAction(
  _previous: VerifyChainState,
  _formData: FormData,
): Promise<VerifyChainState> {
  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };
  try {
    const result = await verifyAuditChain(identity);
    if (result.verified) {
      return {
        status: "verified",
        checkedEvents: result.checkedEvents,
        verifiedAt: result.timestamp,
        message: `Chain intact — ${result.checkedEvents} event${result.checkedEvents === 1 ? "" : "s"} verified at ${new Date(result.timestamp).toLocaleTimeString()}. Every hash link is valid; no tampering has been detected.`,
      };
    }
    return {
      status: "compromised",
      checkedEvents: result.checkedEvents,
      verifiedAt: result.timestamp,
      message: `⚠ Chain verification FAILED — a link in the hash chain is broken. This indicates that one or more audit events have been modified after they were written. Raise a security incident immediately.`,
    };
  } catch (err) {
    return {
      status: "error",
      message: `Chain verification could not be completed: ${err instanceof Error ? err.message : "unknown error"}. The audit event service may be unreachable.`,
    };
  }
}

/**
 * Filter audit events by domain and/or date range.
 *
 * Because the current API client has no server-side filtering parameters, the
 * full event list is fetched and filtered here. This is accurate but not
 * scalable to millions of events — add query parameters to the API client when
 * audit-event-store-svc exposes them.
 */
export async function filterAuditEventsAction(
  _previous: FilterState,
  formData: FormData,
): Promise<FilterState> {
  const domain = (String(formData.get("filter_domain") ?? "").trim() as AuditDomain) || "";
  const dateFrom = String(formData.get("filter_date_from") ?? "").trim();
  const dateTo = String(formData.get("filter_date_to") ?? "").trim();

  if (!domain && !dateFrom && !dateTo) {
    return {
      status: "error",
      message: "Provide at least one filter — domain, start date, or end date.",
    };
  }

  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };

  const result = await getAuditEvents(identity);
  if (!result.ok) {
    return { status: "error", message: `Audit events could not be read: ${result.error}` };
  }

  let events = result.data;

  if (domain) {
    events = events.filter((e) => e.domain === domain);
  }
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    if (isNaN(from)) {
      return { status: "error", message: "Start date is not a valid date." };
    }
    events = events.filter((e) => new Date(e.timestamp).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    if (isNaN(to)) {
      return { status: "error", message: "End date is not a valid date." };
    }
    // Add 24 hours to include the full end day.
    events = events.filter((e) => new Date(e.timestamp).getTime() <= to + 86_400_000);
  }

  if (events.length === 0) {
    const parts = [domain && `domain "${domain}"`, dateFrom && `from ${dateFrom}`, dateTo && `to ${dateTo}`]
      .filter(Boolean)
      .join(", ");
    return {
      status: "empty",
      message: `No events match these filters (${parts}). The current log may not contain any events for that selection.`,
    };
  }

  const parts = [
    domain && `domain "${domain}"`,
    dateFrom && `from ${dateFrom}`,
    dateTo && `to ${dateTo}`,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    status: "filtered",
    message: `${events.length} event${events.length === 1 ? "" : "s"} match ${parts}. The table above has been updated.`,
  };
}

/**
 * Export the current audit event log as a JSON file.
 *
 * Returns the serialised payload in the action state so the client component
 * can trigger a download via a blob URL. This is not a streaming download —
 * it is bounded by the event log size that fits in a single response.
 */
export async function exportAuditLogAction(
  _previous: ExportState,
  _formData: FormData,
): Promise<ExportState> {
  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };

  const result = await getAuditEvents(identity);
  if (!result.ok) {
    return { status: "error", message: `Nothing was exported — audit events could not be read: ${result.error}` };
  }

  if (result.data.length === 0) {
    return {
      status: "empty",
      message: "The audit log is empty — there is nothing to export.",
    };
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    event_count: result.data.length,
    total_matching_events: result.summary.totalEvents,
    // The service's verdict for the events in this export, not the whole log.
    hash_chain_verified: result.summary.hashChainVerified,
    events: result.data,
  };

  const filename = `audit-log-${new Date().toISOString().split("T")[0]}.json`;

  return {
    status: "exported",
    payload: JSON.stringify(exportData, null, 2),
    filename,
    message: `${result.data.length} of ${result.summary.totalEvents} events exported (one page from audit-event-store-svc). Click the download link to save the file.`,
  };
}
