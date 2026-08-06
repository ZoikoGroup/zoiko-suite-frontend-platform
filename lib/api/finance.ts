// Server-side API clients for the Finance domain services:
// - general-ledger-svc (8100)
// - accounts-receivable-svc (8101)
// - accounts-payable-svc (8102)
// - bank-reconciliation-svc (8103)
// - financial-close-svc (8104)
// - treasury-svc (8105)
// - intercompany-accounting-svc (8106)
// - consolidation-svc (8107)
// - chart-of-accounts-svc (8108)

import { type ApiResult, type Identity } from "./client";

export type JournalEntry = {
  entry_id: string;
  posting_date: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  currency: string;
  status: "POSTED" | "DRAFT" | "REVERSED";
  reference: string;
};

export type CashPosition = {
  account_id: string;
  bank_name: string;
  currency: string;
  available_balance: number;
  swept_balance: number;
  status: "ACTIVE" | "LOCKED";
};

export type FinanceSummaryStats = {
  totalArBalanceUSD: number;
  journalEntryCount: number;
  totalCashAvailableUSD: number;
  closePeriodStatus: string;
  unreconciledBankCount: number;
  activeAccountsCount: number;
};

const MOCK_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    entry_id: "jv-2026-001",
    posting_date: "2026-07-31",
    account_code: "1100-AR",
    account_name: "Trade Accounts Receivable",
    debit: 120000.0,
    credit: 0.0,
    currency: "USD",
    status: "POSTED",
    reference: "INV-2026-0891",
  },
  {
    entry_id: "jv-2026-002",
    posting_date: "2026-07-31",
    account_code: "4000-REV",
    account_name: "Software License Revenue",
    debit: 0.0,
    credit: 120000.0,
    currency: "USD",
    status: "POSTED",
    reference: "INV-2026-0891",
  },
];

const MOCK_CASH_POSITIONS: CashPosition[] = [
  {
    account_id: "bank-op-01",
    bank_name: "JPMorgan Chase — Operating Account",
    currency: "USD",
    available_balance: 4850000.0,
    swept_balance: 10000000.0,
    status: "ACTIVE",
  },
  {
    account_id: "bank-uk-01",
    bank_name: "Barclays Commercial UK — Operating",
    currency: "GBP",
    available_balance: 2400000.0,
    swept_balance: 5000000.0,
    status: "ACTIVE",
  },
];

export async function listJournalEntries(_identity?: Identity): Promise<ApiResult<JournalEntry[]>> {
  return { ok: true, data: MOCK_JOURNAL_ENTRIES };
}

export async function listCashPositions(_identity?: Identity): Promise<ApiResult<CashPosition[]>> {
  return { ok: true, data: MOCK_CASH_POSITIONS };
}

export async function getFinanceSummaryStats(_identity?: Identity): Promise<ApiResult<FinanceSummaryStats>> {
  return {
    ok: true,
    data: {
      totalArBalanceUSD: 1250000,
      journalEntryCount: 1420,
      totalCashAvailableUSD: 7850000,
      closePeriodStatus: "OPEN (2026-M07)",
      unreconciledBankCount: 2,
      activeAccountsCount: 240,
    },
  };
}
