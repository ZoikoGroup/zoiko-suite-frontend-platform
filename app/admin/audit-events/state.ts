// Shared contract between the audit-events Server Actions and the forms that
// call them. Outside actions.ts because a "use server" file may only export
// async functions.

import type { Archive, ArchiveVerificationRecord, ChainVerification } from "@/lib/api/audit-events";
import type { LookupState } from "@/components/admin/shared/lookup";

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
