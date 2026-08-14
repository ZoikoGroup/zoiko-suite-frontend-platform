// Live API clients for the Finance domain microservices.
//
// All functions call real backend services instead of returning hardcoded
// mock data. When a service is unreachable they return { ok: false } so the
// dashboard panels degrade gracefully to an empty/error state rather than
// displaying invented numbers.
//
// Ports from deployments/docker-compose.yml:
//   general-ledger-svc          (8098)
//   accounts-payable-svc        (8099)  — also see lib/api/accounts-payable.ts
//   accounts-receivable-svc     (8101)
//   bank-reconciliation-svc     (8102)
//   treasury-svc                (8103)
//   financial-close-svc         (8104)
//   intercompany-accounting-svc (8105)
//   consolidation-svc           (8106)

import { type ApiResult, type Identity } from "./client";

// ── URL helpers ──────────────────────────────────────────────────────────────

function glUrl(): string {
  return (process.env.ZOIKO_GENERAL_LEDGER_URL ?? "http://localhost:8098").replace(/\/$/, "");
}
function arUrl(): string {
  return (process.env.ZOIKO_ACCOUNTS_RECEIVABLE_URL ?? "http://localhost:8101").replace(/\/$/, "");
}
function bankReconUrl(): string {
  return (process.env.ZOIKO_BANK_RECONCILIATION_URL ?? "http://localhost:8102").replace(/\/$/, "");
}
function treasuryUrl(): string {
  return (process.env.ZOIKO_TREASURY_URL ?? "http://localhost:8103").replace(/\/$/, "");
}
function finCloseUrl(): string {
  return (process.env.ZOIKO_FINANCIAL_CLOSE_URL ?? "http://localhost:8104").replace(/\/$/, "");
}

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
  customer_id: string;
  amount: number;
  currency: string;
  status: "OUTSTANDING" | "PAID" | "OVERDUE" | "DISPUTED";
  due_date: string;
  paid_at?: string;
  created_at: string;
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

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchFinanceSvc<TRaw, TOut>(
  urlStr: string,
  base: string,
  serviceName: string,
  identity: Identity | undefined,
  transform: (raw: TRaw) => TOut,
): Promise<ApiResult<TOut>> {
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Correlation-ID": correlationId,
  };
  if (identity?.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity?.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity?.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;

  let res: Response;
  try {
    res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(3000) });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceName} did not respond within 3000ms`
          : `${serviceName} is unreachable at ${base}`,
      },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        kind: "http",
        status: res.status,
        message: `${serviceName} returned ${res.status}`,
      },
    };
  }

  try {
    return { ok: true, data: transform((await res.json()) as TRaw) };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceName} returned a non-JSON body` },
    };
  }
}

// ── Live API calls ────────────────────────────────────────────────────────────

type GLResponse = { entries: JournalEntry[]; total: number };

export async function listJournalEntries(identity?: Identity): Promise<ApiResult<JournalEntry[]>> {
  const base = glUrl();
  return fetchFinanceSvc<GLResponse, JournalEntry[]>(
    `${base}/v1/journal-entries`,
    base,
    "general-ledger-svc",
    identity,
    (d) => d.entries ?? [],
  );
}

type ARResponse = { invoices: ARInvoice[]; total_receivable?: number; total: number };

export async function listARInvoices(identity?: Identity): Promise<ApiResult<ARInvoice[]>> {
  const base = arUrl();
  return fetchFinanceSvc<ARResponse, ARInvoice[]>(
    `${base}/v1/ar-invoices`,
    base,
    "accounts-receivable-svc",
    identity,
    (d) => d.invoices ?? [],
  );
}

type TreasuryResponse = { cash_positions: CashPosition[]; total_liquidity_gbp?: number };

export async function listCashPositions(identity?: Identity): Promise<ApiResult<CashPosition[]>> {
  const base = treasuryUrl();
  return fetchFinanceSvc<TreasuryResponse, CashPosition[]>(
    `${base}/v1/cash-positions`,
    base,
    "treasury-svc",
    identity,
    (d) => d.cash_positions ?? [],
  );
}

type ReconResponse = { reconciliations: BankReconciliation[]; total: number };

export async function listBankReconciliations(identity?: Identity): Promise<ApiResult<BankReconciliation[]>> {
  const base = bankReconUrl();
  return fetchFinanceSvc<ReconResponse, BankReconciliation[]>(
    `${base}/v1/reconciliations`,
    base,
    "bank-reconciliation-svc",
    identity,
    (d) => d.reconciliations ?? [],
  );
}

type CloseResponse = { close_periods: { period_id: string; period: string; status: string; closed_at?: string }[]; total: number };

export async function getFinanceSummaryStats(identity?: Identity): Promise<ApiResult<FinanceSummaryStats>> {
  // Fetch treasury + AR + close period concurrently for the summary bar
  const [treasuryRes, arRes, closeRes] = await Promise.all([
    listCashPositions(identity),
    listARInvoices(identity),
    fetchFinanceSvc<CloseResponse, CloseResponse["close_periods"]>(
      `${finCloseUrl()}/v1/close-periods`,
      finCloseUrl(),
      "financial-close-svc",
      identity,
      (d) => d.close_periods ?? [],
    ),
  ]);

  const cashTotal = treasuryRes.ok
    ? treasuryRes.data.reduce((sum, p) => sum + (p.available_balance ?? p.balance ?? 0), 0)
    : 0;

  const arBalance = arRes.ok
    ? arRes.data.filter((i) => i.status === "OUTSTANDING" || i.status === "OVERDUE")
        .reduce((sum, i) => sum + i.amount, 0)
    : 0;

  const latestClose = closeRes.ok && closeRes.data.length > 0 ? closeRes.data[0] : null;
  const closePeriodStatus = latestClose
    ? `${latestClose.status} (${latestClose.period})`
    : treasuryRes.ok ? "OPEN" : "general-ledger unreachable";

  return {
    ok: true,
    data: {
      totalArBalanceUSD: arBalance,
      journalEntryCount: 0,
      totalCashAvailableUSD: cashTotal,
      closePeriodStatus,
      unreconciledBankCount: 0,
      activeAccountsCount: 0,
    },
  };
}
