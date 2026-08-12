// Sample-data panels for the Finance domain overview.
//
// Nothing in this file calls a backend — every export returns hardcoded rows, so
// the panels built on it show the domain's shape rather than its contents. The one
// live, writable Finance client is lib/api/accounts-payable.ts, read by the
// payables register at the top of /admin/finance.
//
// Ports below are as published in deployments/docker-compose.yml, re-checked
// against it. Six of the nine listed here were previously wrong — including
// accounts-payable-svc at 8102, which is bank-reconciliation-svc's port — and
// nothing caught it because no call site existed to break.
// - general-ledger-svc (8098)
// - accounts-payable-svc (8099) — see lib/api/accounts-payable.ts
// - accounts-receivable-svc (8101)
// - bank-reconciliation-svc (8102)
// - treasury-svc (8103)
// - financial-close-svc (8104)
// - intercompany-accounting-svc (8105)
// - consolidation-svc (8106)
// - a Chart of Accounts service is named in the domain but does not exist yet in
//   the backend, which is why general-ledger-svc's account_code is unvalidated.

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
