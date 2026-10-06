"use server";

// Server Actions for the audit-events domain.
//
// The audit event store is read-only by design: events are immutable once
// written, and the only write-like operation is triggering a cryptographic
// chain verification (which is a POST to the service but changes nothing in
// the store). These actions expose:
//
//  1. verifyChainAction    — trigger SHA-256 chain verification on the log
//  2. exportAuditLogAction — serialise events to JSON for download
//
// Domain/date/search/status filtering of the visible ledger is handled
// entirely client-side in AuditEventLedgerPanel — there is no separate
// filter Server Action, since the backend has no "domain" query parameter
// to push that filter down to (see lib/api/audit-events.ts).
//
// None of these actions are authorised decisions about the data — they surface
// what audit-event-store-svc returns without adding policy.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import { getAuditEvents, verifyAuditChain } from "@/lib/api/audit-events";
import type { VerifyChainState, ExportState } from "./state";

// The service now requires a verified principal (401 without one) and tenant
// scope (400 without X-Tenant-Id) on every read — see lib/api/audit-events.ts.
// Mirrors governance/actions.ts's requireIdentity: same session cookie, same
// shape, no separate login flow for this page.
async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

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
  try {
    const identity = await requireIdentity();
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
  const result = await getAuditEvents(identity);

  if (result.data.length === 0) {
    return {
      status: "empty",
      message: "The audit log is empty — there is nothing to export.",
    };
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    event_count: result.data.length,
    hash_chain_verified: result.summary.hashChainVerified,
    is_mock_data: result.isMock,
    events: result.data,
  };

  const filename = `audit-log-${new Date().toISOString().split("T")[0]}.json`;

  return {
    status: "exported",
    payload: JSON.stringify(exportData, null, 2),
    filename,
    message: `${result.data.length} events exported${result.isMock ? " (mock data — connect audit-event-store-svc for live records)" : ""}. Click the download link to save the file.`,
  };
}
