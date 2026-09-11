"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createIntercompanyEntry,
  matchIntercompanyEntry,
  disputeIntercompanyEntry,
  getIntercompanyEntry,
  type IntercompanyEntry,
} from "@/lib/api/intercompany";
import type { LookupState } from "@/components/admin/shared/lookup";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type IntercompanyActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  entryId?: string;
  entry?: IntercompanyEntry;
};

export async function createIntercompanyAction(
  _previous: IntercompanyActionState,
  formData: FormData
): Promise<IntercompanyActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const sourceEntity = String(formData.get("source_legal_entity_id") ?? "").trim();
  const targetEntity = String(formData.get("target_legal_entity_id") ?? "").trim();
  const sourceJournalId = String(formData.get("source_journal_id") ?? "").trim();
  const amountStr = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency_code") ?? "GBP").trim().toUpperCase();

  if (!sourceEntity || !targetEntity || !sourceJournalId || !amountStr) {
    return { status: "error", message: "Source entity, target entity, source journal, and amount are all required." };
  }

  if (sourceEntity === targetEntity) {
    return { status: "error", message: "Negative Rule: Source and Target legal entities cannot be the same (chk_different_entities)." };
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    return { status: "error", message: "Negative Rule: Amount must be a positive number greater than 0.00." };
  }

  const res = await createIntercompanyEntry(
    {
      source_legal_entity_id: sourceEntity,
      target_legal_entity_id: targetEntity,
      source_journal_id: sourceJournalId,
      amount,
      currency_code: currency,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to create intercompany entry." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    entryId: res.data.intercompany_entry_id,
    entry: res.data,
    message: `Intercompany entry recorded successfully on :8105! Status: ${res.data.match_status}, Entry ID: ${res.data.intercompany_entry_id}`,
  };
}

export async function matchIntercompanyAction(
  _previous: IntercompanyActionState,
  formData: FormData
): Promise<IntercompanyActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const entryId = String(formData.get("intercompany_entry_id") ?? "").trim();
  const targetJournalId = String(formData.get("target_journal_id") ?? "").trim();

  if (!entryId || !targetJournalId) {
    return { status: "error", message: "Both Intercompany Entry ID and Target Journal ID are required." };
  }

  const res = await matchIntercompanyEntry(entryId, targetJournalId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to match intercompany entry." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    entryId: res.data.intercompany_entry_id,
    entry: res.data,
    message: `Reciprocal matching evaluated by :8105! Outcome: ${res.data.match_status}${res.data.mismatch_reason ? " (" + res.data.mismatch_reason + ")" : ""}`,
  };
}

export async function disputeIntercompanyAction(
  _previous: IntercompanyActionState,
  formData: FormData
): Promise<IntercompanyActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const entryId = String(formData.get("dispute_entry_id") ?? "").trim();
  const reason = String(formData.get("dispute_reason") ?? "").trim();

  if (!entryId || !reason) {
    return { status: "error", message: "Entry ID and Dispute Reason are required." };
  }

  const res = await disputeIntercompanyEntry(entryId, reason, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to record dispute." };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    entryId: res.data.intercompany_entry_id,
    entry: res.data,
    message: `Intercompany transaction moved to DISPUTED status. Reason: "${reason}".`,
  };
}

export async function lookupIntercompanyEntryAction(
  _previous: LookupState,
  formData: FormData
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const entryId = String(formData.get("lookup_entry_id") ?? "").trim();
  if (!entryId) {
    return { status: "error", message: "Intercompany Entry ID is required." };
  }

  const res = await getIntercompanyEntry(entryId, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Entry not found." };
  }

  return {
    status: "found",
    record: res.data,
    message: `Retrieved Intercompany Entry from intercompany-accounting-svc (:8105) — Status: ${res.data.match_status}`,
  };
}
