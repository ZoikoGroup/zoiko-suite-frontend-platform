import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  period?: string;
};

export type CashPosition = {
  account_id: string;
  bank_name?: string;
  currency: string;
  available_balance: number;
  swept_balance?: number;
  balance?: number;
  status: "ACTIVE" | "LOCKED";
};

export type ARInvoice = {
  invoice_id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  customer_id: string;
  invoice_number?: string;
  amount: number;
  currency?: string;
  currency_code?: string;
  status: "ISSUED" | "SENT" | "OVERDUE" | "PAID" | "OUTSTANDING" | "DISPUTED";
  due_date: string;
  paid_at?: string;
  created_at?: string;
};

export type BankReconciliation = {
  recon_id: string;
  period: string;
  status: string;
  matched_count: number;
  unmatched_count: number;
  created_at: string;
};

export type FinanceSummaryStats = {
  totalArBalanceUSD: number;
  journalEntryCount: number;
  totalCashAvailableUSD: number;
  closePeriodStatus: string;
  unreconciledBankCount: number;
  activeAccountsCount: number;
};

// ── Live API calls ────────────────────────────────────────────────────────────

type GLResponse = { entries: JournalEntry[]; total: number };

export async function listJournalEntries(identity?: Identity): Promise<ApiResult<JournalEntry[]>> {
  const res = await apiGet<GLResponse>("generalLedger", "/v1/journal-entries", { identity });
  if (!res.ok) return res;
  return { ok: true, data: res.data.entries ?? [] };
}

export async function createJournalEntry(
  body: { account_code: string; amount: number; status: string; description?: string },
  identity?: Identity,
): Promise<ApiResult<JournalEntry>> {
  const res = await apiPost<{ entry: JournalEntry }>("generalLedger", "/v1/journal-entries", body, { identity });
  if (!res.ok) return res;
  return { ok: true, data: res.data.entry };
}

type ARResponse = { invoices: ARInvoice[]; total_receivable?: number; total?: number };

export async function listARInvoices(identity?: Identity): Promise<ApiResult<ARInvoice[]>> {
  const res = await apiGet<ARResponse | ARInvoice[]>("accountsReceivable", "/v1/invoices", { identity });
  if (!res.ok) return res;
  const invoices = Array.isArray(res.data) ? res.data : res.data.invoices ?? [];
  return { ok: true, data: invoices };
}

export async function createARInvoice(
  body: Partial<ARInvoice>,
  identity?: Identity,
): Promise<ApiResult<ARInvoice>> {
  const res = await apiPost<{ invoice?: ARInvoice } | ARInvoice>("accountsReceivable", "/v1/invoices", body, { identity });
  if (!res.ok) return res;
  const inv = (res.data as { invoice?: ARInvoice }).invoice ?? (res.data as ARInvoice);
  return { ok: true, data: inv };
}

export async function transitionARInvoice(
  invoiceId: string,
  fromStatus: string,
  toStatus: string,
  identity?: Identity,
): Promise<ApiResult<{ success: boolean; invoice_id: string; new_status: string }>> {
  const res = await apiPost<{ success: boolean; invoice_id: string; new_status: string }>(
    "accountsReceivable",
    `/v1/invoices/${invoiceId}/transition`,
    { from_status: fromStatus, to_status: toStatus },
    { identity },
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

type TreasuryResponse = { cash_positions: CashPosition[]; total_liquidity_gbp?: number };

export async function listCashPositions(identity?: Identity): Promise<ApiResult<CashPosition[]>> {
  const res = await apiGet<TreasuryResponse | CashPosition[]>("treasury", "/v1/cash-positions", { identity });
  if (!res.ok) return res;
  const positions = Array.isArray(res.data) ? res.data : res.data.cash_positions ?? [];
  return { ok: true, data: positions };
}

type ReconResponse = { reconciliations: BankReconciliation[]; total?: number };

export async function listBankReconciliations(identity?: Identity): Promise<ApiResult<BankReconciliation[]>> {
  const res = await apiGet<ReconResponse | BankReconciliation[]>("bankReconciliation", "/v1/reconciliations", { identity });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.reconciliations ?? [];
  return { ok: true, data: list };
}

export async function matchStatementLine(
  statementLineId: string,
  body: { journal_id: string },
  identity?: Identity,
): Promise<ApiResult<unknown>> {
  return apiPost<unknown>("bankReconciliation", `/v1/statement-lines/${statementLineId}/match`, body, { identity });
}

export async function createStatementLine(
  body: {
    bank_account_id: string;
    statement_date: string;
    amount: number;
    currency_code: string;
    bank_reference: string;
  },
  identity?: Identity,
): Promise<ApiResult<unknown>> {
  return apiPost<unknown>("bankReconciliation", "/v1/statement-lines", body, { identity });
}

type CloseResponse = { close_periods?: { period_id: string; period: string; status: string; closed_at?: string }[]; total?: number };

export async function createFiscalPeriod(
  body: { legal_entity_id: string; period_name: string; period_start: string; period_end: string },
  identity?: Identity,
): Promise<ApiResult<unknown>> {
  return apiPost<unknown>("financialClose", "/v1/close/periods", body, { identity });
}

export async function lockFiscalPeriod(
  periodId: string,
  identity?: Identity,
): Promise<ApiResult<unknown>> {
  return apiPost<unknown>("financialClose", `/v1/close/periods/${periodId}/lock`, {}, { identity });
}

export async function getFinanceSummaryStats(identity?: Identity): Promise<ApiResult<FinanceSummaryStats>> {
  const [treasuryRes, arRes, closeRes, glRes, reconRes] = await Promise.all([
    listCashPositions(identity),
    listARInvoices(identity),
    apiGet<CloseResponse | { period_id: string; period: string; status: string }[]>("financialClose", "/v1/close-periods", { identity }),
    listJournalEntries(identity),
    listBankReconciliations(identity),
  ]);

  const cashTotal = treasuryRes.ok
    ? treasuryRes.data.reduce((sum, p) => sum + (p.available_balance ?? p.balance ?? 0), 0)
    : 0;

  const arBalance = arRes.ok
    ? arRes.data.filter((i) => i.status === "OUTSTANDING" || i.status === "OVERDUE" || i.status === "ISSUED" || i.status === "SENT")
        .reduce((sum, i) => sum + (i.amount || 0), 0)
    : 0;

  const closeData = closeRes.ok
    ? (Array.isArray(closeRes.data) ? closeRes.data : closeRes.data.close_periods ?? [])
    : [];
  const latestClose = closeData.length > 0 ? closeData[0] : null;
  const closePeriodStatus = latestClose
    ? `${latestClose.status} (${latestClose.period})`
    : treasuryRes.ok ? "OPEN" : "general-ledger unreachable";

  const unreconciled = reconRes.ok
    ? reconRes.data.reduce((sum, r) => sum + (r.unmatched_count || 0), 0)
    : 0;

  return {
    ok: true,
    data: {
      totalArBalanceUSD: arBalance,
      journalEntryCount: glRes.ok ? glRes.data.length : 0,
      totalCashAvailableUSD: cashTotal,
      closePeriodStatus,
      unreconciledBankCount: unreconciled,
      activeAccountsCount: treasuryRes.ok ? treasuryRes.data.length : 0,
    },
  };
}
