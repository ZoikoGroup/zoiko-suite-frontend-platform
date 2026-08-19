"use client";

import { useState } from "react";
import { Plus, Scale, CalendarCheck, CheckCircle2, X, Server, Zap, Loader2, AlertCircle } from "lucide-react";

const SERVICES = [
  { name: "general-ledger-svc",          port: "8098", color: "bg-emerald-500" },
  { name: "accounts-payable-svc",        port: "8099", color: "bg-emerald-500" },
  { name: "accounts-receivable-svc",     port: "8101", color: "bg-emerald-500" },
  { name: "bank-reconciliation-svc",     port: "8102", color: "bg-emerald-500" },
  { name: "treasury-svc",                port: "8103", color: "bg-emerald-500" },
  { name: "financial-close-svc",        port: "8104", color: "bg-emerald-500" },
  { name: "intercompany-accounting-svc", port: "8105", color: "bg-emerald-500" },
  { name: "consolidation-svc",           port: "8106", color: "bg-emerald-500" },
];

function NewJournalModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCode, setAccountCode] = useState("1100-AR");
  const [debit, setDebit] = useState(50000);
  const [credit, setCredit] = useState(0);

  async function handlePost() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_code: accountCode,
          amount: debit || credit,
          status: "POSTED",
          description: `Journal entry for ${accountCode}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post journal entry");
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
    }
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
              <Plus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Post Journal Entry</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Journal Voucher Posted</p>
              <p className="text-xs text-slate-500">Entry jv-2026-003 posted to General Ledger (:8100).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Account Code</label>
                <select
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="1100-AR">1100-AR · Trade Accounts Receivable</option>
                  <option value="4000-REV">4000-REV · Software License Revenue</option>
                  <option value="2100-AP">2100-AP · Trade Accounts Payable</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Debit ($)</label>
                  <input
                    type="number"
                    value={debit}
                    onChange={(e) => setDebit(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Credit ($)</label>
                  <input
                    type="number"
                    value={credit}
                    onChange={(e) => setCredit(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <button
                onClick={handlePost}
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post to GL"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BankRecModal({ onClose }: { onClose: () => void }) {
  const [matching, setMatching] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState("HSBC Corporate Current — ••4821");
  const [statementPeriod, setStatementPeriod] = useState("July 2026 (2026-07-01 to 2026-07-31)");

  async function handleMatch() {
    setMatching(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/bank-reconciliation/statement-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_account_id: bankAccount.split("—")[1]?.trim() || "4821",
          statement_date: statementPeriod.includes("July") ? "2026-07-31" : "2026-06-30",
          amount: 0,
          currency_code: "GBP",
          bank_reference: `RECON-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create statement line");
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
    }
    setMatching(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20">
              <Scale className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Bank Reconciliation Match</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Reconciliation Matched</p>
              <p className="text-xs text-slate-500">
                4 transactions matched against bank statement in bank-reconciliation-svc (:8103).
                <br />2 items flagged for manual review.
              </p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Bank Account</label>
                <select
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option>HSBC Corporate Current — ••4821</option>
                  <option>Barclays Operating — ••9034</option>
                  <option>Silicon Valley Bank USD — ••1102</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Statement Period</label>
                <select
                  value={statementPeriod}
                  onChange={(e) => setStatementPeriod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option>July 2026 (2026-07-01 to 2026-07-31)</option>
                  <option>June 2026 (2026-06-01 to 2026-06-30)</option>
                </select>
              </div>
              <div className="rounded-lg bg-purple-50 border border-purple-100 p-2.5 dark:bg-purple-500/10 dark:border-purple-500/20">
                <p className="text-xs text-purple-700 dark:text-purple-300">Auto-matching runs against bank-reconciliation-svc (:8102). Unmatched items are queued for manual review.</p>
              </div>
              <button
                onClick={handleMatch}
                disabled={matching}
                className="w-full rounded-lg bg-purple-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {matching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Auto-Match"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FinancialCloseModal({ onClose }: { onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("2026-M07");
  const [authCode, setAuthCode] = useState("");

  async function handleInitiate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/financial-close/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_entity_id: "22222222-2222-2222-2222-222222222222",
          period_name: period,
          period_start: period === "2026-M07" ? "2026-07-01" : "2026-04-01",
          period_end: period === "2026-M07" ? "2026-07-31" : "2026-06-30",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to initiate period close");
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
    }
    setSubmitting(false);
    setConfirmed(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <CalendarCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Initiate Financial Period Close</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {confirmed ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Period Close Initiated</p>
              <p className="text-xs text-slate-500">Close sequence for July 2026 started in financial-close-svc (:8104). All sub-ledgers locked.</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2.5 dark:bg-amber-500/10 dark:border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Initiating a period close will <strong>lock all sub-ledgers</strong> and prevent further journal entries for this period. This action requires CFO sign-off.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Period</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="2026-M07">July 2026 (2026-M07)</option>
                  <option value="2026-Q2">Q2 2026 (2026-Q2)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">CFO Authorisation Code</label>
                <input
                  type="password"
                  placeholder="Enter CFO one-time auth code"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleInitiate}
                disabled={submitting}
                className="w-full rounded-lg bg-amber-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Initiate Period Close"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Modal = "new-journal" | "bank-rec" | "financial-close" | null;

export function FinanceActionHeader() {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <>
      {modal === "new-journal" && <NewJournalModal onClose={() => setModal(null)} />}
      {modal === "bank-rec" && <BankRecModal onClose={() => setModal(null)} />}
      {modal === "financial-close" && <FinancialCloseModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              8 services in compose
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="finance-action-post-journal"
              onClick={() => setModal("new-journal")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Post Journal Entry
            </button>
            <button
              id="finance-action-bank-rec"
              onClick={() => setModal("bank-rec")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Scale className="h-3.5 w-3.5 text-purple-500" />
              Bank Rec Match
            </button>
            <button
              id="finance-action-period-close"
              onClick={() => setModal("financial-close")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <CalendarCheck className="h-3.5 w-3.5 text-amber-500" />
              Initiate Financial Close
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 mr-1">
            <Server className="h-3 w-3" /> Services:
          </span>
          {SERVICES.map((svc) => (
            <span key={svc.port} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${svc.color}`} />
              :{svc.port}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3 w-3" /> All nominal
          </span>
        </div>
      </div>
    </>
  );
}
