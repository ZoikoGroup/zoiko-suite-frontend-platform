// Sample-data panels for the Finance domain overview.
//
// Nothing in this file calls a backend — every export returns hardcoded rows, so
// the panels built on it show the domain's shape rather than its contents. Two
// live, writable Finance clients exist alongside it and are NOT here:
// lib/api/general-ledger.ts and lib/api/accounts-payable.ts, read by the journal
// and payables registers at the top of /admin/finance.
//
// The journal entries that used to live here are gone rather than relabelled.
// general-ledger-svc is wired now, so a second, fictional set of journals would
// not be "the domain's shape" — it would be a competing answer to a question the
// page already answers truthfully a few hundred pixels higher up.
//
// Ports below are as published in deployments/docker-compose.yml, re-checked
// against it. Six of the nine listed here were previously wrong — including
// accounts-payable-svc at 8102, which is bank-reconciliation-svc's port — and
// nothing caught it because no call site existed to break.
// - general-ledger-svc (8098) — see lib/api/general-ledger.ts
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
