import type { Identity } from "@/lib/api/client";

// treasury-svc (:8103). Every call carries the caller's verified identity; a
// call without one is refused here rather than silently sent as a default
// principal, which is what this module used to do.

export function treasuryUrl(): string {
  return (process.env.ZOIKO_TREASURY_URL ?? "http://localhost:8103").replace(/\/$/, "");
}

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
export type BalanceSource = "INITIAL" | "BANK_REPORTED" | "TRANSFER";
export type TransferStatus = "PENDING_APPROVAL" | "EXECUTED" | "REJECTED" | "CANCELLED";

export type BankAccount = {
  bank_account_id: string;
  tenant_id: string;
  legal_entity_id: string;
  account_name: string;
  masked_account_number: string;
  bank_identifier: string;
  currency_code: string;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
};

export type CashPosition = {
  bank_account_id: string;
  account_name: string;
  currency_code: string;
  ledger_balance: number;
  available_balance: number;
  as_of_timestamp: string;
  account_status: AccountStatus;
  balance_source: BalanceSource | "";
  /** Older than the freshness window, or never confirmed by a bank figure. */
  is_stale: boolean;
};

export type CashBalance = {
  balance_id: string;
  bank_account_id: string;
  ledger_balance: number;
  available_balance: number;
  as_of_timestamp: string;
  balance_source: BalanceSource;
  source_reference?: string;
};

export type LiquidityThreshold = {
  threshold_id: string;
  tenant_id: string;
  legal_entity_id: string;
  currency_code: string;
  minimum_required_balance: number;
  escalation_email: string;
  created_at: string;
};

export type ThresholdAlertDetail = {
  minimum_required_balance: number;
  is_breached: boolean;
};

export type BalanceFreshness = {
  accounts_counted: number;
  stale_account_count: number;
  oldest_as_of?: string;
  stale_after_hours: number;
  is_stale: boolean;
};

export type EffectiveCashResponse = {
  tenant_id: string;
  legal_entity_id: string;
  currency_code: string;
  current_bank_balance: number;
  pending_ap_commitments: number;
  payroll_obligations: number;
  tax_liabilities: number;
  reserved_pending_approvals: number;
  effective_available_cash: number;
  as_of_timestamp: string;
  threshold_details?: ThresholdAlertDetail | null;
  freshness: BalanceFreshness;
  assumptions: string[];
};

export type ForecastIntervalDetail = {
  interval_days: number;
  expected_inflows: number;
  expected_outflows: number;
  forecasted_balance: number;
};

export type LiquidityForecastResponse = {
  tenant_id: string;
  legal_entity_id: string;
  currency_code: string;
  current_cash_balance: number;
  as_of_timestamp: string;
  forecast_7_day: ForecastIntervalDetail;
  forecast_30_day: ForecastIntervalDetail;
  forecast_90_day: ForecastIntervalDetail;
  freshness: BalanceFreshness;
  assumptions: string[];
};

export type Transfer = {
  transfer_id: string;
  tenant_id: string;
  source_bank_account_id: string;
  target_bank_account_id: string;
  source_legal_entity_id: string;
  target_legal_entity_id: string;
  transfer_type: "SAME_ENTITY" | "CROSS_ENTITY";
  amount: number;
  currency_code: string;
  purpose: string;
  value_date?: string;
  correlation_id: string;
  transfer_status: TransferStatus;
  requested_by: string;
  decided_by?: string;
  decision_reason?: string;
  decided_at?: string;
  executed_at?: string;
  created_at: string;
  updated_at: string;
};

export type RegisterBankAccountInput = {
  legal_entity_id: string;
  account_name: string;
  masked_account_number: string;
  bank_identifier: string;
  currency_code: string;
};

export type RecordBalanceInput = {
  ledger_balance: number;
  available_balance: number;
  as_of_timestamp: string;
  source_reference: string;
};

export type SetThresholdInput = {
  legal_entity_id: string;
  currency_code: string;
  minimum_required_balance: number;
  escalation_email: string;
};

export type InitiateTransferInput = {
  source_bank_account_id: string;
  target_bank_account_id: string;
  amount: number;
  currency_code: string;
  correlation_id: string;
  purpose?: string;
  value_date?: string;
};

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: { kind: string; message: string; status?: number; code?: string } };

type ResolvedIdentity = Required<Pick<Identity, "principalId" | "tenantId" | "legalEntityId">> &
  Pick<Identity, "envelopeJwt">;

function resolveIdentity(identity?: Identity): ResolvedIdentity | null {
  if (!identity?.principalId || !identity.tenantId || !identity.legalEntityId) return null;
  return {
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    legalEntityId: identity.legalEntityId,
    envelopeJwt: identity.envelopeJwt,
  };
}

function buildHeaders(identity: ResolvedIdentity, purpose: string, idempotencyKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Tenant-Id": identity.tenantId,
    "X-Principal-Id": identity.principalId,
    "X-Legal-Entity-Id": identity.legalEntityId,
    "X-Request-Id": `req-${crypto.randomUUID()}`,
    "X-Source-Channel": "web",
    "X-Purpose-Context": purpose,
    "X-Correlation-ID": crypto.randomUUID(),
  };
  if (idempotencyKey) {
    h["Idempotency-Key"] = idempotencyKey;
  }
  if (identity.envelopeJwt) {
    h.Authorization = `Bearer ${identity.envelopeJwt}`;
  }
  return h;
}

type ErrorBody = {
  error?: string;
  message?: string;
  detail?: string;
  violations?: { field: string; reason: string }[];
};

function describeError(status: number, body: ErrorBody | null): { message: string; code?: string } {
  if (!body) return { message: `treasury-svc returned ${status}` };
  if (body.violations?.length) {
    return {
      code: body.error,
      message: `Request refused: ${body.violations.map((v) => `${v.field} (${v.reason})`).join("; ")}`,
    };
  }
  const text = body.message || body.detail || body.error || `treasury-svc returned ${status}`;
  return { code: body.error, message: text };
}

async function request<T>(
  path: string,
  identity: Identity | undefined,
  opts: { method?: "GET" | "POST"; body?: unknown; purpose: string; idempotencyKey?: string },
): Promise<ApiResult<T>> {
  const who = resolveIdentity(identity);
  if (!who) {
    return { ok: false, error: { kind: "unauthenticated", message: "No signed-in identity — please log in again." } };
  }
  const method = opts.method ?? "GET";
  try {
    const res = await fetch(`${treasuryUrl()}${path}`, {
      method,
      headers: buildHeaders(
        who,
        opts.purpose,
        method === "POST" ? (opts.idempotencyKey ?? `idem-${crypto.randomUUID()}`) : undefined,
      ),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const { message, code } = describeError(res.status, parsed as ErrorBody | null);
      return { ok: false, error: { kind: "http", status: res.status, message, code } };
    }
    return { ok: true, data: parsed as T, status: res.status };
  } catch (err) {
    return { ok: false, error: { kind: "network", message: `treasury-svc unreachable: ${String(err)}` } };
  }
}

const q = encodeURIComponent;

export function listBankAccounts(legalEntityId: string, identity?: Identity) {
  return request<BankAccount[]>(`/v1/treasury/accounts?legal_entity_id=${q(legalEntityId)}`, identity, {
    purpose: "TREASURY_ACCOUNT_MANAGEMENT",
  });
}

export function listCashPositions(legalEntityId: string, identity?: Identity) {
  return request<CashPosition[]>(`/v1/treasury/positions?legal_entity_id=${q(legalEntityId)}`, identity, {
    purpose: "TREASURY_POSITION_MANAGEMENT",
  });
}

export function registerBankAccount(input: RegisterBankAccountInput, identity?: Identity) {
  return request<BankAccount>("/v1/treasury/accounts", identity, {
    method: "POST",
    body: input,
    purpose: "TREASURY_ACCOUNT_MANAGEMENT",
  });
}

export function updateAccountStatus(
  bankAccountId: string,
  accountStatus: AccountStatus,
  reason: string,
  identity?: Identity,
) {
  return request<BankAccount>(`/v1/treasury/accounts/${q(bankAccountId)}/status`, identity, {
    method: "POST",
    body: { account_status: accountStatus, reason },
    purpose: "TREASURY_ACCOUNT_MANAGEMENT",
  });
}

/**
 * Records a bank-reported balance. idempotencyKey should be stable per
 * submission so a double-submit is recorded once.
 */
export function recordBankBalance(
  bankAccountId: string,
  input: RecordBalanceInput,
  idempotencyKey: string,
  identity?: Identity,
) {
  return request<CashBalance>(`/v1/treasury/accounts/${q(bankAccountId)}/balances`, identity, {
    method: "POST",
    body: input,
    purpose: "TREASURY_POSITION_MANAGEMENT",
    idempotencyKey,
  });
}

export function setLiquidityThreshold(input: SetThresholdInput, identity?: Identity) {
  return request<LiquidityThreshold>("/v1/treasury/thresholds", identity, {
    method: "POST",
    body: input,
    purpose: "TREASURY_THRESHOLD_MANAGEMENT",
  });
}

export function listThresholds(legalEntityId: string, identity?: Identity) {
  return request<LiquidityThreshold[]>(`/v1/treasury/thresholds?legal_entity_id=${q(legalEntityId)}`, identity, {
    purpose: "TREASURY_THRESHOLD_MANAGEMENT",
  });
}

export function getEffectiveCash(legalEntityId: string, currencyCode: string, identity?: Identity) {
  return request<EffectiveCashResponse>(
    `/v1/treasury/effective-cash?legal_entity_id=${q(legalEntityId)}&currency_code=${q(currencyCode)}`,
    identity,
    { purpose: "TREASURY_POSITION_MANAGEMENT" },
  );
}

export function getLiquidityForecast(legalEntityId: string, currencyCode: string, identity?: Identity) {
  return request<LiquidityForecastResponse>(
    `/v1/treasury/forecasts?legal_entity_id=${q(legalEntityId)}&currency_code=${q(currencyCode)}`,
    identity,
    { purpose: "TREASURY_POSITION_MANAGEMENT" },
  );
}

/** Maker step: creates the transfer PENDING_APPROVAL. No money moves yet. */
export function initiateTransfer(input: InitiateTransferInput, identity?: Identity) {
  return request<Transfer>("/v1/treasury/transfers", identity, {
    method: "POST",
    body: input,
    purpose: "TREASURY_TRANSFER_MANAGEMENT",
    idempotencyKey: input.correlation_id,
  });
}

export function listTransfers(legalEntityId: string, identity?: Identity, status?: TransferStatus) {
  const s = status ? `&status=${q(status)}` : "";
  return request<Transfer[]>(`/v1/treasury/transfers?legal_entity_id=${q(legalEntityId)}&limit=50${s}`, identity, {
    purpose: "TREASURY_TRANSFER_MANAGEMENT",
  });
}

/** Checker step: approve (executes the movement), reject, or — for the maker — cancel. */
export function decideTransfer(
  transferId: string,
  decision: "approve" | "reject" | "cancel",
  reason: string,
  identity?: Identity,
) {
  return request<Transfer>(`/v1/treasury/transfers/${q(transferId)}/${decision}`, identity, {
    method: "POST",
    body: { reason },
    purpose: "TREASURY_TRANSFER_MANAGEMENT",
  });
}
