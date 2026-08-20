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

/**
 * general-ledger-svc's journal HEADER, as it actually comes back.
 *
 * This was `JournalEntry` with `entry_id`, `account_code`, `account_name`,
 * `debit`, `credit`, `currency` and a `POSTED | DRAFT | REVERSED` status — a
 * line-level shape for a route that returns headers, with a status vocabulary
 * the service has never used. It described nothing that exists.
 *
 * The service's own statuses are DRAFT -> VALIDATED -> FINALIZED, plus REVERSED
 * for a header that has been reversed. Lines live under
 * GET /v1/journals/{journal_id}; this route returns headers only, which is all
 * the summary bar needs to count.
 */
export type JournalHeader = {
  journal_id: string;
  tenant_id: string;
  legal_entity_id: string;
  fiscal_period: string;
  status: "DRAFT" | "VALIDATED" | "FINALIZED" | "REVERSED";
  reversal_of_journal_id?: string | null;
  description: string;
  created_at: string;
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

/**
 * accounts-receivable-svc's customer invoice, as it actually comes back.
 *
 * Every field here was wrong. The status union was
 * `OUTSTANDING | PAID | OVERDUE | DISPUTED` — the service has never emitted
 * OUTSTANDING or DISPUTED, and has no equivalent of either — and the money was
 * `currency` against a service that sends `currency_code`, so the summary bar
 * would have rendered `undefined` had the route ever resolved. See
 * lib/api/accounts-receivable.ts for the full typed client; this stays minimal
 * because the summary bar wants one number.
 */
export type ARInvoice = {
  invoice_id: string;
  customer_id: string;
  amount: number;
  currency_code: string;
  status: "ISSUED" | "SENT" | "OVERDUE" | "PAID";
  due_date: string;
  payment_received_at?: string | null;
  created_at: string;
};

/**
 * bank-reconciliation-svc's statement LINE, as it actually comes back.
 *
 * This was `BankReconciliation` with `recon_id`, `period`, `matched_count` and
 * `unmatched_count` — a per-period rollup object this service does not have and
 * has no route for. It reconciles individual statement lines, and the count of
 * what is still outstanding has to be derived from their statuses.
 */
export type StatementLine = {
  statement_line_id: string;
  tenant_id: string;
  legal_entity_id: string;
  bank_account_id: string;
  statement_date: string;
  amount: number;
  currency_code: string;
  bank_reference: string;
  status: "UNMATCHED" | "MATCHED" | "EXCEPTION";
};

/**
 * financial-close-svc's fiscal period, as it actually comes back.
 *
 * The old inline type expected `{ close_periods: [{ period_id, period, status,
 * closed_at }] }`. The service returns a BARE ARRAY of these, with
 * `period_name` and `close_status` — so even a resolving call would have
 * rendered `undefined (undefined)` in the close tile.
 */
export type FiscalPeriod = {
  fiscal_period_id: string;
  tenant_id: string;
  legal_entity_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  close_status: "OPEN" | "CLOSED" | "LOCKED";
  close_locked_at?: string | null;
};

/**
 * The headline figures, each independently unavailable.
 *
 * Every field used to be a plain number and every failure became 0 — so a
 * service that was down, a route that 404'd and a genuinely empty register all
 * rendered identically as "0", which for a receivables balance or a pending-rec
 * count reads as a clean bill of health. `null` means "not known", and the tiles
 * say so instead of showing a figure.
 *
 * `activeAccountsCount` is gone rather than zeroed: it counted chart-of-accounts
 * entries, and no chart-of-accounts service exists in this platform, so there was
 * never anything for it to count.
 */
export type FinanceSummaryStats = {
  /** Sum of unpaid invoice amounts, ACROSS CURRENCIES — no service here holds an
   *  FX rate, so this is a mixed-currency total and is labelled as one. */
  arBalanceMixedCurrency: number | null;
  journalCount: number | null;
  /** Also mixed-currency, and from a service that has never run here. */
  cashAvailableMixedCurrency: number | null;
  /** e.g. "OPEN (2026-08)". null when the period could not be read. */
  closePeriodStatus: string | null;
  /** UNMATCHED + EXCEPTION statement lines: what is still to reconcile. */
  unreconciledBankCount: number | null;
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
//
// EVERY ROUTE IN THIS SECTION WAS WRONG. Each called a path its service does not
// serve and unwrapped an envelope it does not send, so each 404'd and each
// `?? []` turned the miss into an empty list. Nothing errored and nothing warned:
// the Finance headline figures were derived from five 404s.
//
// Routes and shapes re-verified against each service's RegisterRoutes and domain
// types on 20 Aug 2026:
//
//   was called              | actually served       | shape        | status
//   ------------------------|-----------------------|--------------|--------
//   /v1/ar-invoices         | /v1/invoices/         | bare array   | fixed
//   /v1/journal-entries     | /v1/journals          | bare array   | fixed
//   /v1/reconciliations     | /v1/statement-lines   | bare array   | fixed
//   /v1/close-periods       | /v1/close/periods     | bare array   | fixed
//   /v1/cash-positions      | treasury-svc, unknown | unverified   | STILL WRONG
//
// treasury-svc is the one left: it is not one of the gap-closed services, it has
// never run on this machine, and nothing in this repo says what it serves. Rather
// than guess a path, the call is left as it is and its failure is now reported as
// unavailable rather than folded into a zero — see FinanceSummaryStats.
//
// This layer also duplicates apiGet: its own URL helpers bypass the DEFAULTS
// registry in config.ts, and its own fetchFinanceSvc drops structured error
// bodies. That divergence is how the paths drifted unnoticed in the first place,
// and it is still here.

/**
 * Journal headers for the caller's tenant.
 *
 * Scoped by the X-Tenant-Id header alone: general-ledger-svc refuses a
 * ?tenant_id= that disagrees with it, so none is sent. `?limit` is capped by the
 * service; the summary bar only needs the count of what it returns, and that
 * bound is stated on the tile rather than being presented as a total.
 */
export async function listJournals(identity?: Identity): Promise<ApiResult<JournalHeader[]>> {
  const base = glUrl();
  return fetchFinanceSvc<JournalHeader[], JournalHeader[]>(
    `${base}/v1/journals?limit=200`,
    base,
    "general-ledger-svc",
    identity,
    (d) => d ?? [],
  );
}

/**
 * The receivables register, for the summary bar's AR balance.
 *
 * THE ROUTE AND THE SHAPE WERE BOTH WRONG. This called `/v1/ar-invoices` and
 * unwrapped `d.invoices`; accounts-receivable-svc serves `/v1/invoices/` and
 * returns a BARE ARRAY. So every call 404'd, `d.invoices ?? []` turned the miss
 * into an empty list, and the summary bar has reported a nil AR balance for as
 * long as this function has existed. It is the same defect as the four siblings
 * around it — see the note above listJournalEntries.
 *
 * For the full register, and for writes, use lib/api/accounts-receivable.ts. This
 * stays because the summary bar wants one number and not a typed lifecycle.
 */
export async function listARInvoices(identity?: Identity): Promise<ApiResult<ARInvoice[]>> {
  const base = arUrl();
  return fetchFinanceSvc<ARInvoice[], ARInvoice[]>(
    `${base}/v1/invoices/`,
    base,
    "accounts-receivable-svc",
    identity,
    (d) => d ?? [],
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

/**
 * Statement lines for the caller's tenant.
 *
 * There is no "reconciliations" resource — this service reconciles individual
 * statement lines, so what is outstanding is derived from their statuses.
 */
export async function listStatementLines(identity?: Identity): Promise<ApiResult<StatementLine[]>> {
  const base = bankReconUrl();
  return fetchFinanceSvc<StatementLine[], StatementLine[]>(
    `${base}/v1/statement-lines?limit=200`,
    base,
    "bank-reconciliation-svc",
    identity,
    (d) => d ?? [],
  );
}

/**
 * Fiscal periods for one legal entity.
 *
 * legal_entity_id is REQUIRED by the service, and the read is authorized
 * (CLOSE_VIEW) as well as tenant-scoped — the only read in this file that is,
 * which is why it needs the principal and the entity from the session and not
 * just the tenant.
 */
export async function listFiscalPeriods(identity?: Identity): Promise<ApiResult<FiscalPeriod[]>> {
  const base = finCloseUrl();
  if (!identity?.legalEntityId) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "financial-close-svc needs a legal entity, and the session carries none",
      },
    };
  }
  const q = new URLSearchParams({ legal_entity_id: identity.legalEntityId });
  return fetchFinanceSvc<FiscalPeriod[], FiscalPeriod[]>(
    `${base}/v1/close/periods?${q}`,
    base,
    "financial-close-svc",
    identity,
    (d) => d ?? [],
  );
}

/**
 * The headline figures, each read independently.
 *
 * Every one that cannot be read is null rather than 0 — see FinanceSummaryStats.
 * The whole call still succeeds when individual reads fail, because "receivables
 * are known, treasury is not" is a more useful answer than one blanket failure.
 */
export async function getFinanceSummaryStats(identity?: Identity): Promise<ApiResult<FinanceSummaryStats>> {
  const [treasuryRes, arRes, closeRes, journalRes, reconRes] = await Promise.all([
    listCashPositions(identity),
    listARInvoices(identity),
    listFiscalPeriods(identity),
    listJournals(identity),
    listStatementLines(identity),
  ]);

  const cashTotal = treasuryRes.ok
    ? treasuryRes.data.reduce((sum, p) => sum + (p.available_balance ?? p.balance ?? 0), 0)
    : null;

  // Everything not yet paid. This filtered on `OUTSTANDING || OVERDUE`, and
  // OUTSTANDING is not a status this service has ever emitted — so even once the
  // route resolved, the balance would have counted only invoices somebody had
  // explicitly declared late and silently excluded every ISSUED and SENT one,
  // i.e. most of what customers actually owe.
  //
  // NOTE: this sums across currencies. No service in this suite holds an FX rate,
  // so the figure is a mixed-currency total and the tile that shows it says so
  // rather than labelling it USD. The per-currency breakdown the receivables
  // register shows is the honest form — see summariseReceivables.
  const arBalance = arRes.ok
    ? arRes.data.filter((i) => i.status !== "PAID").reduce((sum, i) => sum + i.amount, 0)
    : null;

  // The most recently STARTING period is the one being closed. The service does
  // not promise an order, so picking data[0] — as this did — was picking a row at
  // the database's convenience and calling it current.
  const latestClose =
    closeRes.ok && closeRes.data.length > 0
      ? [...closeRes.data].sort(
          (a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime(),
        )[0]
      : null;
  // A close status was invented here twice over: it fell back to the literal
  // "OPEN" when the close read failed but the TREASURY read succeeded — two
  // unrelated services — and to "general-ledger unreachable" when neither did,
  // naming a third service that was never called.
  const closePeriodStatus = latestClose
    ? `${latestClose.close_status} (${latestClose.period_name})`
    : closeRes.ok
      ? "no period registered"
      : null;

  return {
    ok: true,
    data: {
      arBalanceMixedCurrency: arBalance,
      journalCount: journalRes.ok ? journalRes.data.length : null,
      cashAvailableMixedCurrency: cashTotal,
      closePeriodStatus,
      unreconciledBankCount: reconRes.ok
        ? reconRes.data.filter((l) => l.status !== "MATCHED").length
        : null,
    },
  };
}
