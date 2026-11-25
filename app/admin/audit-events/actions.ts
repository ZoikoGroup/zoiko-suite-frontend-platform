"use server";

// Server Actions for the audit-events domain (audit-event-store-svc, :8084).
//
// Server Actions are reachable by direct POST, not only through this UI, so
// the session is verified inside every action rather than relying on the
// proxy's /admin matcher — same discipline as app/admin/governance/actions.ts.
//
// Every one of these calls is authorized at the PLATFORM scope on the backend
// (AUDIT_EVENT_READ / AUDIT_ARCHIVE_MANAGE against a fixed platform scope id,
// not the caller's tenant), and fails closed — 503 — if authorization-svc
// itself cannot be reached. A 403 here means the signed-in principal genuinely
// lacks that platform-level grant, not a tenant-scoping gap.
//
// Two generations of actions live here side by side:
//  - verifyChainAction / filterAuditEventsAction / exportAuditLogAction: the
//    original, simpler surface (client-side filter/export over one page of
//    getAuditEvents()). Not currently wired to a page, kept for whatever
//    consumes them next.
//  - verifyChain / createArchiveAction / lookupArchive / verifyArchiveAction:
//    the richer surface (server-side filters, archive sealing/lookup/
//    re-verification) this page's own panels use.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  getAuditEvents,
  verifyAuditChain,
  verifyEventsChain,
  createArchive,
  getArchive,
  verifyArchive,
  listVerifications,
  explainAuditEventError,
} from "@/lib/api/audit-events";
import type { VerifyChainState, FilterState, ExportState, AuditDomain } from "./state";
import type {
  ChainVerifyState,
  CreateArchiveState,
  ArchiveLookupState,
  VerifyArchiveState,
} from "./state";

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

// ─── Original surface: verify / filter (client-side) / export ──────────────

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

// ─── Richer surface: full-chain verify, archive seal/lookup/re-verify ──────

/**
 * Walk the full hash chain and report whether it is intact.
 *
 * Distinct from the `hash_chain_valid` flag a filtered event page carries —
 * this checks the whole store the tenant can see, not just the rows a filter
 * happened to return.
 */
export async function verifyChain(
  _previous: ChainVerifyState,
  _formData: FormData,
): Promise<ChainVerifyState> {
  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };

  const result = await verifyEventsChain(identity);
  if (!result.ok) {
    return { status: "error", message: explainAuditEventError(result.error.message) };
  }

  return {
    status: "checked",
    result: result.data,
    message: result.data.verified
      ? `Chain intact — ${result.data.checked_events} events checked, no break found.`
      : `Chain verification FAILED across ${result.data.checked_events} events. Treat this as a store-integrity incident, not a filter problem.`,
  };
}

/** Seal an archive over [from_sequence, to_sequence]. */
export async function createArchiveAction(
  _previous: CreateArchiveState,
  formData: FormData,
): Promise<CreateArchiveState> {
  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };

  const fromRaw = String(formData.get("from_sequence") ?? "").trim();
  const toRaw = String(formData.get("to_sequence") ?? "").trim();
  const fromSequence = Number(fromRaw);
  const toSequence = Number(toRaw);

  if (!fromRaw || !Number.isFinite(fromSequence)) {
    return { status: "error", message: "From sequence must be a number." };
  }
  if (!toRaw || !Number.isFinite(toSequence)) {
    return { status: "error", message: "To sequence must be a number." };
  }

  const result = await createArchive({ fromSequence, toSequence, identity });
  if (!result.ok) {
    return { status: "error", message: explainAuditEventError(result.error.message) };
  }

  refresh();

  return result.status === 201
    ? {
        status: "sealed",
        archive: result.data,
        message: `Sealed archive covering sequences ${fromSequence}–${toSequence} (${result.data.event_count} events). This archive is now permanent and cannot be edited.`,
      }
    : {
        status: "replayed",
        archive: result.data,
        message:
          "An archive for this exact request already existed and nothing new was written. Nothing is wrong, but no new archive was sealed.",
      };
}

/** Look up an archive by id, together with its full verification history. */
export async function lookupArchive(
  _previous: ArchiveLookupState,
  formData: FormData,
): Promise<ArchiveLookupState> {
  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };

  const archiveId = String(formData.get("archive_id") ?? "").trim();
  if (!archiveId) return { status: "error", message: "Enter an archive ID." };

  const archiveResult = await getArchive(archiveId, identity);
  if (!archiveResult.ok) {
    if (archiveResult.error.status === 404) {
      return {
        status: "missing",
        message:
          "No archive with that id is visible to your organisation — either it does not exist, or it belongs to another tenant.",
      };
    }
    return { status: "error", message: explainAuditEventError(archiveResult.error.message) };
  }

  const verificationsResult = await listVerifications(archiveId, identity);
  if (!verificationsResult.ok) {
    return { status: "error", message: explainAuditEventError(verificationsResult.error.message) };
  }

  return {
    status: "found",
    message: "",
    record: { archive: archiveResult.data, verifications: verificationsResult.data },
  };
}

/**
 * Re-verify one archive against the current store.
 *
 * `archiveId` is passed explicitly (via a hidden field) rather than read off
 * prior lookup state — this action appends a new, independent verification
 * row every time it runs, and nothing it reads decides whether to run.
 */
export async function verifyArchiveAction(
  _previous: VerifyArchiveState,
  formData: FormData,
): Promise<VerifyArchiveState> {
  const identity = await requireIdentity();
  if (!identity) return { status: "error", message: SESSION_EXPIRED };

  const archiveId = String(formData.get("archive_id") ?? "").trim();
  if (!archiveId) return { status: "error", message: "No archive id was supplied." };

  const result = await verifyArchive(archiveId, identity);
  if (!result.ok) {
    return { status: "error", message: explainAuditEventError(result.error.message) };
  }

  refresh();

  return result.data.result === "VERIFIED"
    ? {
        status: "verified",
        verification: result.data,
        message: "Verified — this archive still matches the chain exactly as sealed.",
      }
    : {
        status: "diverged",
        verification: result.data,
        message: `DIVERGED — the chain no longer matches this archive starting at sequence ${result.data.first_divergent_sequence}. Treat this as a store-integrity incident.`,
      };
}
