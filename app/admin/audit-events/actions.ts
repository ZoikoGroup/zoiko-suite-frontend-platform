"use server";

// Server Actions for audit-event-store-svc (:8084).
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

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import {
  verifyEventsChain,
  createArchive,
  getArchive,
  verifyArchive,
  listVerifications,
  explainAuditEventError,
} from "@/lib/api/audit-events";
import type {
  ChainVerifyState,
  CreateArchiveState,
  ArchiveLookupState,
  VerifyArchiveState,
} from "./state";

async function requireIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return toIdentity(session);
}

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
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

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
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

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
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

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
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

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
