// Shared contract between the audit-events Server Actions and the forms that
// call them. Outside actions.ts because a "use server" file may only export
// async functions.

import type { Archive, ArchiveVerificationRecord, ChainVerification } from "@/lib/api/audit-events";
import type { LookupState } from "@/components/admin/shared/lookup";

// ─── Original surface's state (verifyChainAction / filterAuditEventsAction /
// exportAuditLogAction in ./actions.ts) ─────────────────────────────────────

export type AuditDomain =
  | "tax"
  | "legal"
  | "commercial-ops"
  | "finance"
  | "payroll"
  | "hr"
  | "compliance"
  | "";

/** Outcome of triggering a chain verification. */
export type VerifyChainState = {
  status: "idle" | "verified" | "compromised" | "error";
  message: string;
  checkedEvents?: number;
  verifiedAt?: string;
};

export const IDLE_VERIFY_STATE: VerifyChainState = { status: "idle", message: "" };

/** Outcome of a filter action (not a mutation — no writes). */
export type FilterState = {
  status: "idle" | "filtered" | "empty" | "error";
  message: string;
};

export const IDLE_FILTER_STATE: FilterState = { status: "idle", message: "" };

/** Outcome of an export action. */
export type ExportState = {
  status: "idle" | "exported" | "empty" | "error";
  message: string;
  /** The exported payload as a JSON string the UI can download. */
  payload?: string;
  filename?: string;
};

export const IDLE_EXPORT_STATE: ExportState = { status: "idle", message: "" };

// ─── Richer surface's state (verifyChain / createArchiveAction / lookupArchive
// / verifyArchiveAction in ./actions.ts) ─────────────────────────────────────

/** Outcome of a full hash-chain verification. */
export type ChainVerifyState = {
  status: "idle" | "checked" | "error";
  message: string;
  result?: ChainVerification;
};

export const IDLE_CHAIN_VERIFY: ChainVerifyState = { status: "idle", message: "" };

/**
 * Outcome of creating an archive.
 *
 * `sealed` and `replayed` are separate states for the same reason the
 * governance log's `recorded`/`replayed` are: 201 means a new permanent
 * archive row was written, 200 means this Idempotency-Key had already sealed
 * one and nothing new happened. A form that reported both as "done" would let
 * a double-click look like a second archive.
 */
export type CreateArchiveState = {
  status: "idle" | "sealed" | "replayed" | "error";
  message: string;
  archive?: Archive;
};

export const IDLE_CREATE_ARCHIVE: CreateArchiveState = { status: "idle", message: "" };

/** One archive, plus its full re-verification history — fetched together
 *  because the archive lookup's whole point is checking on an archive's
 *  integrity over time. */
export type ArchiveLookupResult = {
  archive: Archive;
  verifications: ArchiveVerificationRecord[];
};

export type ArchiveLookupState = LookupState<ArchiveLookupResult>;

export const IDLE_ARCHIVE_LOOKUP: ArchiveLookupState = { status: "idle", message: "" };

/** Outcome of re-verifying one archive. Kept apart from ArchiveLookupState so
 *  a verify action can update just the verification history without re-running
 *  the archive lookup itself. */
export type VerifyArchiveState = {
  status: "idle" | "verified" | "diverged" | "error";
  message: string;
  verification?: ArchiveVerificationRecord;
};

export const IDLE_VERIFY_ARCHIVE: VerifyArchiveState = { status: "idle", message: "" };
