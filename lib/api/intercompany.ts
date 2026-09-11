import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

export type MatchStatus =
  | "UNMATCHED"
  | "AWAITING_COUNTERPARTY"
  | "MATCHED"
  | "MISMATCH"
  | "DISPUTED"
  | "RESOLVED";

export type IntercompanyEntry = {
  intercompany_entry_id: string;
  tenant_id: string;
  source_legal_entity_id: string;
  target_legal_entity_id: string;
  source_journal_id: string;
  target_journal_id?: string | null;
  amount: number;
  currency_code: string;
  match_status: MatchStatus;
  mismatch_reason?: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at?: string | null;
  acknowledged_by_principal_id?: string | null;
  disputed_at?: string | null;
  disputed_by_principal_id?: string | null;
  dispute_reason?: string | null;
  resolved_at?: string | null;
  resolved_by_principal_id?: string | null;
  resolution_note?: string | null;
};

export type CreateIntercompanyEntryInput = {
  source_legal_entity_id: string;
  target_legal_entity_id: string;
  source_journal_id: string;
  amount: number;
  currency_code: string;
};

export async function createIntercompanyEntry(
  input: CreateIntercompanyEntryInput,
  identity: Identity
): Promise<ApiWriteResult<IntercompanyEntry>> {
  return apiPost<IntercompanyEntry>(
    "intercompanyAccounting",
    "/v1/intercompany/entries",
    {
      source_legal_entity_id: input.source_legal_entity_id,
      target_legal_entity_id: input.target_legal_entity_id,
      source_journal_id: input.source_journal_id,
      amount: input.amount,
      currency_code: input.currency_code,
    },
    { identity }
  );
}

export async function listIntercompanyEntries(
  identity: Identity,
  filter?: { sourceEntityId?: string; targetEntityId?: string }
): Promise<ApiResult<IntercompanyEntry[]>> {
  const query = new URLSearchParams();
  if (filter?.sourceEntityId) query.set("source_legal_entity_id", filter.sourceEntityId);
  if (filter?.targetEntityId) query.set("target_legal_entity_id", filter.targetEntityId);
  const qStr = query.toString();
  const path = qStr ? `/v1/intercompany/entries?${qStr}` : "/v1/intercompany/entries";

  return apiGet<IntercompanyEntry[]>("intercompanyAccounting", path, { identity });
}

export async function getIntercompanyEntry(
  id: string,
  identity: Identity
): Promise<ApiResult<IntercompanyEntry>> {
  return apiGet<IntercompanyEntry>(
    "intercompanyAccounting",
    `/v1/intercompany/entries/${encodeURIComponent(id)}`,
    { identity }
  );
}

export async function matchIntercompanyEntry(
  id: string,
  targetJournalId: string,
  identity: Identity
): Promise<ApiWriteResult<IntercompanyEntry>> {
  return apiPost<IntercompanyEntry>(
    "intercompanyAccounting",
    `/v1/intercompany/entries/${encodeURIComponent(id)}/match`,
    { target_journal_id: targetJournalId },
    { identity }
  );
}

export async function disputeIntercompanyEntry(
  id: string,
  disputeReason: string,
  identity: Identity
): Promise<ApiWriteResult<IntercompanyEntry>> {
  return apiPost<IntercompanyEntry>(
    "intercompanyAccounting",
    `/v1/intercompany/entries/${encodeURIComponent(id)}/dispute`,
    { dispute_reason: disputeReason },
    { identity }
  );
}

export async function resolveIntercompanyMismatch(
  id: string,
  resolutionNote: string,
  identity: Identity
): Promise<ApiWriteResult<IntercompanyEntry>> {
  return apiPost<IntercompanyEntry>(
    "intercompanyAccounting",
    `/v1/intercompany/entries/${encodeURIComponent(id)}/resolve`,
    { resolution_note: resolutionNote },
    { identity }
  );
}
