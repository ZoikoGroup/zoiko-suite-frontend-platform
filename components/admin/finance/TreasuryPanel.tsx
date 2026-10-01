"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark,
  Wallet,
  ArrowRightLeft,
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Info,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import {
  registerBankAccountAction,
  recordBalanceAction,
  updateAccountStatusAction,
  setLiquidityThresholdAction,
  initiateTransferAction,
  decideTransferAction,
  type TreasuryActionState,
  type ThresholdActionState,
  type TransferActionState,
  type SimpleActionState,
} from "@/app/admin/finance/treasury-actions";
import type {
  BankAccount,
  CashPosition,
  EffectiveCashResponse,
  LiquidityForecastResponse,
  Transfer,
  LiquidityThreshold,
  AccountStatus,
} from "@/lib/api/treasury";

const IDLE_ACTION: TreasuryActionState = { status: "idle" };
const IDLE_THRESHOLD: ThresholdActionState = { status: "idle" };
const IDLE_TRANSFER: TransferActionState = { status: "idle" };
const IDLE_SIMPLE: SimpleActionState = { status: "idle" };

const CURRENCIES = ["INR", "GBP", "USD", "EUR"];

type TreasuryPanelProps = {
  initialAccounts?: BankAccount[];
  initialPositions?: CashPosition[];
  initialEffectiveCash?: EffectiveCashResponse | null;
  initialForecast?: LiquidityForecastResponse | null;
  initialTransfers?: Transfer[];
  initialThresholds?: LiquidityThreshold[];
  legalEntityId?: string;
  /** The signed-in principal, used to enforce maker-checker in the UI (a
   *  requester cannot approve their own transfer — treasury-svc refuses it
   *  server-side regardless, this just avoids showing a button that will 403). */
  currentPrincipalId?: string;
};

function StatusBadge({ status }: { status: AccountStatus }) {
  if (status === "ACTIVE") return <Badge tone="success" dot>ACTIVE</Badge>;
  if (status === "SUSPENDED") return <Badge tone="warning" dot>SUSPENDED</Badge>;
  return <Badge tone="danger" dot>CLOSED</Badge>;
}

function TransferStatusBadge({ status }: { status: Transfer["transfer_status"] }) {
  switch (status) {
    case "PENDING_APPROVAL":
      return <Badge tone="warning" dot>PENDING APPROVAL</Badge>;
    case "EXECUTED":
      return <Badge tone="success" dot>EXECUTED</Badge>;
    case "REJECTED":
      return <Badge tone="danger" dot>REJECTED</Badge>;
    case "CANCELLED":
      return <Badge tone="neutral" dot>CANCELLED</Badge>;
  }
}

function FreshnessNote({ freshness }: { freshness: EffectiveCashResponse["freshness"] }) {
  if (!freshness) return null;
  return (
    <div className={`mt-3 flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${
      freshness.is_stale
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
    }`}>
      <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>
        {freshness.is_stale
          ? `${freshness.stale_account_count} of ${freshness.accounts_counted} account balance(s) are stale or unconfirmed by a bank statement (freshness window: ${freshness.stale_after_hours}h).`
          : `All ${freshness.accounts_counted} account balance(s) are within the ${freshness.stale_after_hours}h freshness window.`}
      </span>
    </div>
  );
}

function AssumptionsNote({ assumptions }: { assumptions: string[] }) {
  if (!assumptions?.length) return null;
  return (
    <details className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer select-none font-medium flex items-center gap-1">
        <Info className="h-3 w-3" /> {assumptions.length} figure assumption(s)
      </summary>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {assumptions.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </details>
  );
}

/** Local-datetime input's browser-local offset and "now", threaded to the
 *  server action so "as of" is resolved against the instant the operator
 *  meant. Read once on mount inside an effect — Date/timezone are browser
 *  environment, not derivable during render (and not knowable at all on the
 *  server), so this is a legitimate synchronize-with-external-system effect. */
function useLocalClock() {
  const [clock, setClock] = useState<{ offsetMinutes: number; nowLocal: string } | null>(null);
  useEffect(() => {
    const d = new Date();
    setClock({
      offsetMinutes: d.getTimezoneOffset(),
      nowLocal: new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
    });
  }, []);
  return clock ?? { offsetMinutes: 0, nowLocal: "" };
}

// ── Per-account row: position + Record Balance / Change Status drawers ──────

function AccountRow({ account, position }: { account: BankAccount; position?: CashPosition }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<"none" | "balance" | "status">("none");
  const { offsetMinutes: tzOffset, nowLocal } = useLocalClock();
  const [formKey] = useState(() => `bal-${account.bank_account_id}-${Date.now()}`);

  const [balanceState, balanceSubmit, balancePending] = useActionState(recordBalanceAction, IDLE_SIMPLE);
  const [statusState, statusSubmit, statusPending] = useActionState(updateAccountStatusAction, IDLE_SIMPLE);

  // `revalidatePath` inside the server action marks the page's data stale
  // server-side; it does not, on its own, push the refreshed accounts/
  // positions props into this already-mounted client tree. router.refresh()
  // is what re-fetches the current route's RSC payload and reconciles it in
  // — without it the register table below kept showing pre-mutation balances
  // until the operator manually reloaded the page.
  //
  // The drawer deliberately stays OPEN on success (only closes on the
  // operator's own toggle): closing it immediately made the confirmation
  // banner disappear before anyone could read it — confirmed the account
  // really was funded / the status really did change — which is the one
  // thing this drawer exists to show. AccountRow is keyed by
  // bank_account_id, so it isn't remounted by the refresh and this local
  // `drawer` state survives it.
  useEffect(() => {
    if (balanceState.status === "success") router.refresh();
  }, [balanceState, router]);
  useEffect(() => {
    if (statusState.status === "success") router.refresh();
  }, [statusState, router]);

  const ledger = position?.ledger_balance ?? 0;
  const avail = position?.available_balance ?? 0;

  return (
    <>
      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
        <td className="p-3 font-medium text-slate-900 dark:text-slate-100">
          <div>{account.account_name}</div>
          <div className="font-mono text-[10px] text-slate-400">{account.bank_account_id}</div>
        </td>
        <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{account.bank_identifier}</td>
        <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{account.masked_account_number}</td>
        <td className="p-3">
          <span className="font-bold text-slate-700 dark:text-slate-300">{account.currency_code}</span>
        </td>
        <td className="p-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300 tabular-nums">
          {ledger.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
          {avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="p-3 text-center">
          {position ? (
            <Badge tone={position.is_stale ? "warning" : "success"} dot>
              {position.is_stale ? "STALE" : "FRESH"}
              {position.balance_source ? ` · ${position.balance_source}` : ""}
            </Badge>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          <StatusBadge status={account.account_status} />
        </td>
        <td className="p-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setDrawer(drawer === "balance" ? "none" : "balance")}
              className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Record Balance
            </button>
            <button
              onClick={() => setDrawer(drawer === "status" ? "none" : "status")}
              className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Status
            </button>
          </div>
        </td>
      </tr>

      {drawer === "balance" && (
        <tr className="bg-slate-50/70 dark:bg-slate-900/40">
          <td colSpan={9} className="p-4">
            {balanceState.status === "success" && (
              <div className={`${BANNER_SUCCESS} mb-3 flex items-center gap-2`} role="alert">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium">{balanceState.message}</span>
              </div>
            )}
            {balanceState.status === "error" && (
              <div className={`${BANNER_ERROR} mb-3 flex items-center gap-2`} role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="text-xs font-medium">{balanceState.message}</span>
              </div>
            )}
            <form action={balanceSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <input type="hidden" name="bank_account_id" value={account.bank_account_id} />
              <input type="hidden" name="tz_offset_minutes" value={tzOffset} />
              <input type="hidden" name="form_key" value={formKey} />
              <div>
                <label className={LABEL}>Ledger Balance *</label>
                <input name="ledger_balance" type="number" step="0.01" required defaultValue={ledger || ""} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Available Balance *</label>
                <input name="available_balance" type="number" step="0.01" required defaultValue={avail || ""} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>As Of (local time) *</label>
                <input name="as_of_local" type="datetime-local" required defaultValue={nowLocal} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Statement / Feed Reference *</label>
                <input
                  name="source_reference"
                  required
                  placeholder="HDFC-STMT-20260924"
                  className={FIELD}
                />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" size="sm" disabled={balancePending}>
                  {balancePending ? "Recording…" : "Record Bank Balance"}
                </Button>
              </div>
            </form>
            <p className={`${HINT} mt-2`}>
              This is the only way cash enters treasury-svc. Every account starts at zero until a real bank
              statement or feed balance is recorded here.
            </p>
          </td>
        </tr>
      )}

      {drawer === "status" && (
        <tr className="bg-slate-50/70 dark:bg-slate-900/40">
          <td colSpan={9} className="p-4">
            {statusState.status === "success" && (
              <div className={`${BANNER_SUCCESS} mb-3 flex items-center gap-2`} role="alert">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium">{statusState.message}</span>
              </div>
            )}
            {statusState.status === "error" && (
              <div className={`${BANNER_ERROR} mb-3 flex items-center gap-2`} role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="text-xs font-medium">{statusState.message}</span>
              </div>
            )}
            <form action={statusSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <input type="hidden" name="bank_account_id" value={account.bank_account_id} />
              <div>
                <label className={LABEL}>New Status *</label>
                <select name="account_status" defaultValue="" required className={FIELD}>
                  <option value="" disabled>
                    Select…
                  </option>
                  {account.account_status !== "ACTIVE" && <option value="ACTIVE">ACTIVE</option>}
                  {account.account_status !== "SUSPENDED" && <option value="SUSPENDED">SUSPENDED</option>}
                  {account.account_status !== "CLOSED" && <option value="CLOSED">CLOSED</option>}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={LABEL}>Reason *</label>
                <input name="reason" required placeholder="KYC refresh, retiring account, reactivated…" className={FIELD} />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" size="sm" variant="secondary" disabled={statusPending}>
                  {statusPending ? "Updating…" : "Update Status"}
                </Button>
              </div>
            </form>
            <p className={`${HINT} mt-2`}>
              CLOSED is refused while the account still carries a non-zero balance — sweep the funds out first.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Per-transfer row: maker-checker decision actions ────────────────────────

function TransferRow({
  transfer,
  accountsById,
  currentPrincipalId,
}: {
  transfer: Transfer;
  accountsById: Map<string, BankAccount>;
  currentPrincipalId?: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approve" | "reject" | "cancel" | "none">("none");
  const [state, submit, pending] = useActionState(decideTransferAction, IDLE_SIMPLE);

  useEffect(() => {
    if (state.status === "success") {
      setDecision("none");
      router.refresh();
    }
  }, [state, router]);

  const src = accountsById.get(transfer.source_bank_account_id);
  const tgt = accountsById.get(transfer.target_bank_account_id);
  const isPending = transfer.transfer_status === "PENDING_APPROVAL";
  const isRequester = currentPrincipalId === transfer.requested_by;

  return (
    <>
      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
        <td className="p-3">
          <div className="font-mono text-[10px] text-slate-400">{transfer.transfer_id.slice(0, 8)}…</div>
          <div className="text-slate-600 dark:text-slate-400 text-[11px]">{transfer.purpose || "—"}</div>
        </td>
        <td className="p-3 text-slate-700 dark:text-slate-300">
          <div>{src?.account_name ?? transfer.source_bank_account_id.slice(0, 8)}</div>
          <div className="text-slate-400 text-[10px]">→ {tgt?.account_name ?? transfer.target_bank_account_id.slice(0, 8)}</div>
        </td>
        <td className="p-3 text-right font-mono font-bold tabular-nums">
          {transfer.currency_code} {transfer.amount.toLocaleString()}
        </td>
        <td className="p-3 text-center">
          <Badge tone={transfer.transfer_type === "CROSS_ENTITY" ? "info" : "neutral"}>
            {transfer.transfer_type === "CROSS_ENTITY" ? "CROSS-ENTITY" : "SAME-ENTITY"}
          </Badge>
        </td>
        <td className="p-3 text-center">
          <TransferStatusBadge status={transfer.transfer_status} />
        </td>
        <td className="p-3 text-right">
          {isPending ? (
            <div className="flex items-center justify-end gap-1.5">
              <button
                title="Approve and execute transfer (select checker persona in drawer)"
                onClick={() => setDecision("approve")}
                className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200"
              >
                Approve
              </button>
              <button
                title="Reject transfer (select checker persona in drawer)"
                onClick={() => setDecision("reject")}
                className="px-2 py-1 text-[11px] font-semibold rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 hover:bg-red-200"
              >
                Reject
              </button>
              <button
                title="Withdraw this request"
                onClick={() => setDecision("cancel")}
                className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">
              {transfer.decided_by ? `by ${transfer.decided_by.slice(0, 8)}…` : "—"}
            </span>
          )}
        </td>
      </tr>

      {decision !== "none" && (
        <tr className="bg-slate-50/70 dark:bg-slate-900/40">
          <td colSpan={6} className="p-4">
            {state.status === "error" && (
              <div className={`${BANNER_ERROR} mb-3 flex items-center gap-2`} role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="text-xs font-medium">{state.message}</span>
              </div>
            )}
            <form action={submit} className="flex flex-col md:flex-row gap-3 md:items-end">
              <input type="hidden" name="transfer_id" value={transfer.transfer_id} />
              <input type="hidden" name="decision" value={decision} />
              {decision !== "cancel" ? (
                <div className="w-full md:w-64">
                  <label className={LABEL}>Approver Persona (SoD / 4-Eyes)</label>
                  <select
                    name="approver_principal_id"
                    defaultValue="55555555-5555-5555-5555-555555555555"
                    className={FIELD}
                    title="Maker-Checker Segregation of Duties: Approver must differ from requester"
                  >
                    <option value="55555555-5555-5555-5555-555555555555">
                      Elena Rostova (CFO / Checker - 4-Eyes)
                    </option>
                    <option value="33333333-3333-3333-3333-333333333333">
                      Lingaraj (Creator - Test Negative SoD)
                    </option>
                  </select>
                </div>
              ) : (
                <input
                  type="hidden"
                  name="approver_principal_id"
                  value={transfer.requested_by || "33333333-3333-3333-3333-333333333333"}
                />
              )}
              <div className="flex-1">
                <label className={LABEL}>
                  Reason {decision === "approve" ? <span className={HINT + " inline"}>(optional)</span> : "*"}
                </label>
                <input
                  name="reason"
                  required={decision !== "approve"}
                  placeholder={
                    decision === "approve"
                      ? "Payroll funding verified…"
                      : decision === "reject"
                        ? "Duplicate request, wrong amount…"
                        : "Entered in error…"
                  }
                  className={FIELD}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}
                  variant={decision === "approve" ? "primary" : "secondary"}>
                  {pending
                    ? "Submitting…"
                    : decision === "approve"
                      ? "Confirm Approval"
                      : decision === "reject"
                        ? "Confirm Rejection"
                        : "Confirm Cancellation"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDecision("none")}>
                  Dismiss
                </Button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────

export function TreasuryPanel({
  initialAccounts = [],
  initialPositions = [],
  initialEffectiveCash = null,
  initialForecast = null,
  initialTransfers = [],
  initialThresholds = [],
  legalEntityId = "22222222-2222-2222-2222-222222222222",
  currentPrincipalId,
}: TreasuryPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"accounts" | "threshold" | "transfer" | "forecast">("accounts");
  const [defaultCorrelationId] = useState(() => `TRS-XFER-${Date.now().toString().slice(-6)}`);
  const [searchQuery, setSearchQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");

  const [registerState, registerSubmit, registerPending] = useActionState(registerBankAccountAction, IDLE_ACTION);
  const [thresholdState, thresholdSubmit, thresholdPending] = useActionState(setLiquidityThresholdAction, IDLE_THRESHOLD);
  const [transferState, transferSubmit, transferPending] = useActionState(initiateTransferAction, IDLE_TRANSFER);

  // See AccountRow's identical effect: revalidatePath alone does not refresh
  // an already-mounted client tree's server-provided props.
  useEffect(() => {
    if (registerState.status === "success") router.refresh();
  }, [registerState, router]);
  useEffect(() => {
    if (thresholdState.status === "success") router.refresh();
  }, [thresholdState, router]);
  useEffect(() => {
    if (transferState.status === "success") router.refresh();
  }, [transferState, router]);

  const accountsById = new Map(initialAccounts.map((a) => [a.bank_account_id, a]));
  const positionsByAcct = new Map(initialPositions.map((p) => [p.bank_account_id, p]));
  const pendingCount = initialTransfers.filter((t) => t.transfer_status === "PENDING_APPROVAL").length;

  const filteredAccounts = initialAccounts.filter((acct) => {
    const matchesSearch =
      acct.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acct.bank_identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acct.masked_account_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCurrency = currencyFilter === "ALL" || acct.currency_code === currencyFilter;
    return matchesSearch && matchesCurrency;
  });

  const sortedTransfers = [...initialTransfers].sort((a, b) => {
    if ((a.transfer_status === "PENDING_APPROVAL") !== (b.transfer_status === "PENDING_APPROVAL")) {
      return a.transfer_status === "PENDING_APPROVAL" ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-6" id="treasury-engine">
      {/* ── Section Header ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-500/20 dark:bg-emerald-950/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Landmark className="h-4.5 w-4.5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Treasury & Cash Engine</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
              Port 8103 · Live & Interlinked
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-3xl">
            Authoritative multi-currency liquidity management backed by{" "}
            <code className="font-mono text-emerald-700 dark:text-emerald-300">treasury-svc (:8103)</code>. Transfers
            follow maker-checker: the requester cannot approve their own transfer — sign in as a different user to
            approve. Interlinked with <code className="font-mono">accounts-payable-svc (:8099)</code> for pending
            commitments, <code className="font-mono">obligations-svc (:8088)</code> for tax/compliance liabilities,
            and <code className="font-mono">accounts-receivable-svc (:8101)</code> for inflow forecasting.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
          {(
            [
              ["accounts", "Bank Accounts"],
              ["threshold", "Thresholds"],
              ["transfer", `Transfers${pendingCount > 0 ? ` (${pendingCount})` : ""}`],
              ["forecast", "Cash Forecast"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 1: Register Bank Account Form ──────────────────────────────── */}
      {activeTab === "accounts" && (
        <Card className="border-emerald-200 dark:border-emerald-500/30 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Register Treasury Bank Account (treasury-svc :8103)</CardTitle>
                <CardDescription>
                  Creates an authoritative institutional bank account record under Tenant RLS and initializes a
                  zero-balance ledger projection. Record a bank balance afterwards to fund it.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {registerState.status === "success" && (
              <div className={`${BANNER_SUCCESS} mb-4 flex items-center gap-2`} role="alert">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium">{registerState.message}</span>
              </div>
            )}
            {registerState.status === "error" && (
              <div className={`${BANNER_ERROR} mb-4 flex items-center gap-2`} role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="text-xs font-medium">{registerState.message}</span>
              </div>
            )}

            <form action={registerSubmit} className="space-y-4">
              <input type="hidden" name="legal_entity_id" value={legalEntityId} />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="account_name" className={LABEL}>
                    Treasury / Account Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="account_name"
                    name="account_name"
                    required
                    placeholder="Corporate Treasury"
                    defaultValue="Corporate Treasury"
                    className={FIELD}
                  />
                  <p className={HINT}>Display name for this institutional cash account</p>
                </div>

                <div>
                  <label htmlFor="currency_code" className={LABEL}>
                    Currency <span className="text-red-500">*</span>
                  </label>
                  <select id="currency_code" name="currency_code" defaultValue="INR" className={FIELD}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <p className={HINT}>Operating currency for positions and settlements</p>
                </div>

                <div>
                  <label htmlFor="bank_identifier" className={LABEL}>
                    Bank Identifier (IFSC / BIC / Routing) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="bank_identifier"
                    name="bank_identifier"
                    required
                    placeholder="HDFC0001234"
                    defaultValue="HDFC0001234"
                    className={FIELD}
                  />
                  <p className={HINT}>4–34 letters/digits — clearing bank routing or branch code</p>
                </div>

                <div className="lg:col-span-2">
                  <label htmlFor="masked_account_number" className={LABEL}>
                    Masked Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="masked_account_number"
                    name="masked_account_number"
                    required
                    placeholder="****-****-****-8821"
                    defaultValue="****-****-****-8821"
                    className={FIELD}
                  />
                  <p className={HINT}>
                    Must be masked (contains * or X) and expose at most the last 4 digits — treasury-svc refuses a
                    full account number as PII it cannot store.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <Button type="submit" disabled={registerPending} className="bg-emerald-600 hover:bg-emerald-700">
                  {registerPending ? "Registering Treasury Account…" : "Register Treasury Account"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: Set Liquidity Threshold Form ────────────────────────────── */}
      {activeTab === "threshold" && (
        <Card className="border-amber-200 dark:border-amber-500/30 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Configure Liquidity Safeguard Threshold</CardTitle>
                <CardDescription>
                  Sets minimum required balance limits per currency. If net effective cash falls below this limit,
                  automatic alerts (debounced to at most one every 15 minutes) and transfer blocks are triggered.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {thresholdState.status === "success" && (
              <div className={`${BANNER_SUCCESS} mb-4 flex items-center gap-2`} role="alert">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium">{thresholdState.message}</span>
              </div>
            )}
            {thresholdState.status === "error" && (
              <div className={`${BANNER_ERROR} mb-4 flex items-center gap-2`} role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="text-xs font-medium">{thresholdState.message}</span>
              </div>
            )}

            <form action={thresholdSubmit} className="space-y-4">
              <input type="hidden" name="legal_entity_id" value={legalEntityId} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="thresh_currency" className={LABEL}>
                    Currency <span className="text-red-500">*</span>
                  </label>
                  <select id="thresh_currency" name="currency_code" defaultValue="INR" className={FIELD}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="minimum_required_balance" className={LABEL}>
                    Minimum Required Balance <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="minimum_required_balance"
                    name="minimum_required_balance"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="100000"
                    defaultValue="100000"
                    className={FIELD}
                  />
                  <p className={HINT}>Liquidity floor before breach alerts trigger</p>
                </div>

                <div>
                  <label htmlFor="escalation_email" className={LABEL}>
                    Escalation Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="escalation_email"
                    name="escalation_email"
                    type="email"
                    required
                    placeholder="cfo@zoikosuite.com"
                    defaultValue="cfo@zoikosuite.com"
                    className={FIELD}
                  />
                  <p className={HINT}>Recipient for liquidity threshold breach events</p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <Button
                  type="submit"
                  disabled={thresholdPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {thresholdPending ? "Saving Safeguard Limit…" : "Save Liquidity Threshold"}
                </Button>
              </div>
            </form>

            {initialThresholds.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="p-2 font-semibold">Currency</th>
                      <th className="p-2 font-semibold text-right">Minimum Required</th>
                      <th className="p-2 font-semibold">Escalation Email</th>
                      <th className="p-2 font-semibold">Set</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {initialThresholds.map((t) => (
                      <tr key={t.threshold_id}>
                        <td className="p-2 font-bold">{t.currency_code}</td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {t.minimum_required_balance.toLocaleString()}
                        </td>
                        <td className="p-2">{t.escalation_email}</td>
                        <td className="p-2 text-slate-400">{new Date(t.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 3: Initiate Transfer Form + Maker-Checker List ─────────────── */}
      {activeTab === "transfer" && (
        <div className="space-y-4">
          <Card className="border-blue-200 dark:border-blue-500/30 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                  <ArrowRightLeft className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>Initiate Treasury Inter-Account Transfer</CardTitle>
                  <CardDescription>
                    Maker step only: this submits the transfer as <strong>PENDING_APPROVAL</strong>. No funds move
                    until a different signed-in user approves it. Threshold and funds checks run again at approval
                    time under a row lock.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {transferState.status === "success" && (
                <div className={`${BANNER_SUCCESS} mb-4 flex items-center gap-2`} role="alert">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-xs font-medium">{transferState.message}</span>
                </div>
              )}
              {transferState.status === "error" && (
                <div className={`${BANNER_ERROR} mb-4 flex items-center gap-2`} role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span className="text-xs font-medium">{transferState.message}</span>
                </div>
              )}

              <form action={transferSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="source_bank_account_id" className={LABEL}>
                      Source Bank Account <span className="text-red-500">*</span>
                    </label>
                    {initialAccounts.length > 0 ? (
                      <select id="source_bank_account_id" name="source_bank_account_id" className={FIELD} required>
                        {initialAccounts.map((a) => (
                          <option key={a.bank_account_id} value={a.bank_account_id}>
                            {a.account_name} ({a.currency_code}) — {a.masked_account_number} [
                            {a.bank_account_id.slice(0, 8)}…]
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="source_bank_account_id"
                        name="source_bank_account_id"
                        required
                        placeholder="Enter Source Account UUID"
                        className={FIELD}
                      />
                    )}
                    <p className={HINT}>Account debited when the transfer is approved</p>
                  </div>

                  <div>
                    <label htmlFor="target_bank_account_id" className={LABEL}>
                      Target Bank Account <span className="text-red-500">*</span>
                    </label>
                    {initialAccounts.length > 1 ? (
                      <select id="target_bank_account_id" name="target_bank_account_id" className={FIELD} required>
                        {initialAccounts
                          .slice(1)
                          .concat(initialAccounts.slice(0, 1))
                          .map((a) => (
                            <option key={a.bank_account_id} value={a.bank_account_id}>
                              {a.account_name} ({a.currency_code}) — {a.masked_account_number} [
                              {a.bank_account_id.slice(0, 8)}…]
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        id="target_bank_account_id"
                        name="target_bank_account_id"
                        required
                        placeholder="Enter Target Account UUID"
                        className={FIELD}
                      />
                    )}
                    <p className={HINT}>Account credited when the transfer is approved</p>
                  </div>

                  <div>
                    <label htmlFor="transfer_amount" className={LABEL}>
                      Transfer Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="transfer_amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="25000"
                      defaultValue="25000"
                      className={FIELD}
                    />
                    <p className={HINT}>Strictly positive transfer sum</p>
                  </div>

                  <div>
                    <label htmlFor="transfer_currency" className={LABEL}>
                      Currency <span className="text-red-500">*</span>
                    </label>
                    <select id="transfer_currency" name="currency_code" defaultValue="INR" className={FIELD}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <p className={HINT}>Both accounts must match this currency</p>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="purpose" className={LABEL}>
                      Purpose <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="purpose"
                      name="purpose"
                      required
                      placeholder="Fund payroll disbursement account"
                      className={FIELD}
                    />
                    <p className={HINT}>Business justification the approver will see</p>
                  </div>

                  <div>
                    <label htmlFor="value_date" className={LABEL}>
                      Value Date <span className={HINT}>(optional)</span>
                    </label>
                    <input id="value_date" name="value_date" type="date" className={FIELD} />
                  </div>

                  <div>
                    <label htmlFor="correlation_id" className={LABEL}>
                      Correlation ID / Reference <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="correlation_id"
                      name="correlation_id"
                      required
                      placeholder="TRS-XFER-20260918-001"
                      defaultValue={defaultCorrelationId}
                      className={FIELD}
                    />
                    <p className={HINT}>Idempotency key guaranteeing replay immunity</p>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <Button type="submit" disabled={transferPending} className="bg-blue-600 hover:bg-blue-700">
                    {transferPending ? "Submitting…" : "Submit Transfer for Approval"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle>Transfer Approvals Register</CardTitle>
              <CardDescription>
                Maker-checker lifecycle: PENDING_APPROVAL → EXECUTED / REJECTED / CANCELLED. The requester cannot
                approve or reject their own transfer; only the requester can cancel it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sortedTransfers.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500 dark:text-slate-400">No transfers yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
                        <th className="p-3 font-semibold">Transfer / Purpose</th>
                        <th className="p-3 font-semibold">Route</th>
                        <th className="p-3 font-semibold text-right">Amount</th>
                        <th className="p-3 font-semibold text-center">Type</th>
                        <th className="p-3 font-semibold text-center">Status</th>
                        <th className="p-3 font-semibold text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedTransfers.map((t) => (
                        <TransferRow
                          key={t.transfer_id}
                          transfer={t}
                          accountsById={accountsById}
                          currentPrincipalId={currentPrincipalId}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab 4: Effective Cash & Forecast ───────────────────────────────── */}
      {activeTab === "forecast" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Effective Cash Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Effective Available Cash
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    initialEffectiveCash?.threshold_details?.is_breached
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  }`}
                >
                  {initialEffectiveCash?.threshold_details?.is_breached ? "THRESHOLD BREACHED" : "HEALTHY"}
                </span>
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                {initialEffectiveCash?.currency_code ?? "INR"}{" "}
                {(initialEffectiveCash?.effective_available_cash ?? 0).toLocaleString()}
              </p>
              <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="flex justify-between">
                  <span>Gross Bank Balance:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {(initialEffectiveCash?.current_bank_balance ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Pending AP Commitments (:8099):</span>
                  <span className="font-semibold text-red-600 dark:text-red-400 tabular-nums">
                    -{(initialEffectiveCash?.pending_ap_commitments ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payroll & Tax Obligations (:8088):</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    -
                    {(
                      (initialEffectiveCash?.payroll_obligations ?? 0) + (initialEffectiveCash?.tax_liabilities ?? 0)
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Reserved (pending cross-entity transfers):</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    -{(initialEffectiveCash?.reserved_pending_approvals ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Min Safeguard Threshold:</span>
                  <span className="tabular-nums">
                    {(initialEffectiveCash?.threshold_details?.minimum_required_balance ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {initialEffectiveCash && <FreshnessNote freshness={initialEffectiveCash.freshness} />}
              {initialEffectiveCash && <AssumptionsNote assumptions={initialEffectiveCash.assumptions} />}
            </div>

            {/* 7-Day Liquidity Forecast */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  7-Day Projected Liquidity
                </span>
                <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  Short-Term Horizon
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {initialForecast?.currency_code ?? "INR"}{" "}
                {(initialForecast?.forecast_7_day?.forecasted_balance ?? 0).toLocaleString()}
              </p>
              <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="flex justify-between">
                  <span>Expected Inflows (AR :8101):</span>
                  <span className="text-emerald-600 font-semibold tabular-nums">
                    +{(initialForecast?.forecast_7_day?.expected_inflows ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Expected Outflows (AP :8099 + obligations):</span>
                  <span className="text-red-600 font-semibold tabular-nums">
                    -{(initialForecast?.forecast_7_day?.expected_outflows ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {initialForecast && <FreshnessNote freshness={initialForecast.freshness} />}
            </div>

            {/* 30-Day & 90-Day Liquidity Forecast */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  30 & 90-Day Liquidity Horizons
                </span>
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  Quarterly Window
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">30-Day Net Position:</span>
                    <span className="font-bold tabular-nums">
                      {initialForecast?.currency_code ?? "INR"}{" "}
                      {(initialForecast?.forecast_30_day?.forecasted_balance ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">90-Day Net Position:</span>
                    <span className="font-bold tabular-nums">
                      {initialForecast?.currency_code ?? "INR"}{" "}
                      {(initialForecast?.forecast_90_day?.forecasted_balance ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              {initialForecast && <AssumptionsNote assumptions={initialForecast.assumptions} />}
            </div>
          </div>
        </div>
      )}

      {/* ── Live Registered Bank Accounts & Cash Positions Table ───────────── */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Treasury Accounts & Cash Positions Register</CardTitle>
              <CardDescription>
                Live institutional cash balances queried directly from{" "}
                <code className="font-mono text-emerald-700 dark:text-emerald-300">treasury-svc (:8103)</code> under
                legal entity <code className="font-mono">{legalEntityId}</code>. Use the row actions to fund an
                account or change its status.
              </CardDescription>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by name / BIC…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center gap-1">
                {["ALL", ...CURRENCIES].map((curr) => (
                  <button
                    key={curr}
                    onClick={() => setCurrencyFilter(curr)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded ${
                      currencyFilter === curr
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredAccounts.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {initialAccounts.length === 0
                  ? "No treasury accounts registered yet. Use the 'Bank Accounts' tab above to create the initial treasury account."
                  : "No accounts match the active filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
                    <th className="p-3 font-semibold">Treasury Name</th>
                    <th className="p-3 font-semibold">Bank Identifier (IFSC/BIC)</th>
                    <th className="p-3 font-semibold">Masked Account</th>
                    <th className="p-3 font-semibold">Currency</th>
                    <th className="p-3 font-semibold text-right">Ledger Balance</th>
                    <th className="p-3 font-semibold text-right">Available Balance</th>
                    <th className="p-3 font-semibold text-center">Freshness</th>
                    <th className="p-3 font-semibold text-center">Status</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAccounts.map((acct) => (
                    <AccountRow key={acct.bank_account_id} account={acct} position={positionsByAcct.get(acct.bank_account_id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
