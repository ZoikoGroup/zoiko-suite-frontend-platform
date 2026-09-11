"use client";

import { useState, useActionState, useEffect } from "react";
import {
  Receipt,
  PlusCircle,
  Send,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
  FileCheck2,
  ArrowRight,
  Calculator,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared/JsonBlock";
import { ResultBanner } from "@/components/admin/shared/ResultBanner";
import {
  createVatReturnAction,
  fileVatReturnAction,
  lookupVatReturnAction,
  type VatActionState,
} from "@/app/admin/tax/vat-actions";
import { IDLE_LOOKUP, type LookupState } from "@/components/admin/shared/lookup";
import type { VATReturn } from "@/lib/api/tax";

const IDLE_ACTION: VatActionState = { status: "idle" };
const IDLE_LOOKUP_VAT: LookupState<VATReturn> = { status: "idle", message: "" };

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50",
  FILED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50",
  ACCEPTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-300 dark:border-rose-700/50",
};

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount?.toLocaleString() ?? 0}`;
  }
}

function formatCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "GBP",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function OutputInputBar({ output, input, currency }: { output: number; input: number; currency: string }) {
  const total = output + input;
  if (total === 0) return null;
  const outputPct = Math.round((output / total) * 100);
  const inputPct = 100 - outputPct;

  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <div className="bg-blue-500" style={{ width: `${outputPct}%` }} title={`Output: ${formatCurrency(output, currency)}`} />
        <div className="bg-indigo-300 dark:bg-indigo-800" style={{ width: `${inputPct}%` }} title={`Input: ${formatCurrency(input, currency)}`} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          Out {formatCompact(output, currency)}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-300 dark:bg-indigo-800" />
          In {formatCompact(input, currency)}
        </span>
      </div>
    </div>
  );
}

export function VatGstWorkbench({ initialReturns = [] }: { initialReturns: VATReturn[] }) {
  const [createState, createSubmit, createPending] = useActionState(createVatReturnAction, IDLE_ACTION);
  const [fileState, fileSubmit, filePending] = useActionState(fileVatReturnAction, IDLE_ACTION);
  const [lookupState, lookupSubmit, lookupPending] = useActionState(lookupVatReturnAction, IDLE_LOOKUP_VAT);

  // Form input states for dynamic calculation
  const [outputTaxInput, setOutputTaxInput] = useState("100000");
  const [inputTaxInput, setInputTaxInput] = useState("40000");
  const [currencyInput, setCurrencyInput] = useState("GBP");
  const [activeTab, setActiveTab] = useState<"create" | "file" | "lookup">("create");

  // Quick fill target for filing / lookup
  const [targetReturnId, setTargetReturnId] = useState("");
  const [lookupReturnId, setLookupReturnId] = useState("");

  // Update targetReturnId when creation succeeds
  useEffect(() => {
    if (createState.status === "success" && createState.returnId) {
      setTargetReturnId(createState.returnId);
      setLookupReturnId(createState.returnId);
    }
  }, [createState]);

  const outputVal = parseFloat(outputTaxInput) || 0;
  const inputVal = parseFloat(inputTaxInput) || 0;
  const netPayablePreview = outputVal - inputVal;

  return (
    <div className="space-y-6">
      {/* ── Subtitle & Service Info ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            VAT / GST Periodic Filing Engine
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Backed by <code className="font-mono text-xs text-blue-600 dark:text-blue-400 font-bold">vat-gst-svc (:8127)</code>.
            Governs statutory VAT periods, computes input/output balances, and enforces strict one-way authority filing transitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            vat-gst-svc :8127 Healthy
          </span>
        </div>
      </div>

      {/* ── Action Tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "create"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <PlusCircle className="h-4 w-4" />
          1. Create VAT Return
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("file")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "file"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Send className="h-4 w-4" />
          2. File VAT Return
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lookup")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "lookup"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Search className="h-4 w-4" />
          3. Lookup & Audit Lineage
        </button>
      </div>

      {/* ── Tab 1: Create VAT Return Form ───────────────────────────────── */}
      {activeTab === "create" && (
        <Card className="border-blue-100 dark:border-blue-900/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                <PlusCircle className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Create Statutory VAT Return (vat-gst-svc :8127)</CardTitle>
                <CardDescription>
                  Generates an initial <code className="font-mono text-xs font-bold">DRAFT</code> return. Calculates Net Tax Payable from Output & Input tax.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={createSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="vat-legal-entity" className={LABEL}>Legal Entity ID</label>
                  <input
                    id="vat-legal-entity"
                    name="legal_entity_id"
                    defaultValue="11111111-1111-1111-1111-111111111111"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Zoiko UK Operating Entity</p>
                </div>

                <div>
                  <label htmlFor="vat-jurisdiction" className={LABEL}>Jurisdiction ID</label>
                  <input
                    id="vat-jurisdiction"
                    name="jurisdiction_id"
                    defaultValue="GB"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>HMRC / Statutory Jurisdiction Code</p>
                </div>

                <div>
                  <label htmlFor="vat-tax-reg" className={LABEL}>Tax Registration Number</label>
                  <input
                    id="vat-tax-reg"
                    name="tax_registration_number"
                    defaultValue="GB-987654321"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Official VAT registration ID</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="vat-period" className={LABEL}>Tax Period (e.g. 2026-Q2)</label>
                  <input
                    id="vat-period"
                    name="tax_period"
                    defaultValue="2026-Q2"
                    placeholder="2026-Q2"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Unique per Entity + Jurisdiction</p>
                </div>

                <div>
                  <label htmlFor="vat-currency" className={LABEL}>Reporting Currency</label>
                  <select
                    id="vat-currency"
                    name="currency"
                    value={currencyInput}
                    onChange={(e) => setCurrencyInput(e.target.value)}
                    className={FIELD}
                  >
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                  <p className={HINT}>Statutory currency of return</p>
                </div>

                <div>
                  <label htmlFor="vat-effective-from" className={LABEL}>Effective From Date</label>
                  <input
                    id="vat-effective-from"
                    name="effective_from"
                    type="date"
                    defaultValue="2026-04-01"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Beginning date of filing period</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div>
                  <label htmlFor="vat-sales" className={LABEL}>Total Sales Amount</label>
                  <input
                    id="vat-sales"
                    name="total_sales_amount"
                    type="number"
                    step="any"
                    defaultValue="500000"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Gross taxable sales</p>
                </div>

                <div>
                  <label htmlFor="vat-purchases" className={LABEL}>Total Purchases Amount</label>
                  <input
                    id="vat-purchases"
                    name="total_purchase_amount"
                    type="number"
                    step="any"
                    defaultValue="200000"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Allowable inputs</p>
                </div>

                <div>
                  <label htmlFor="vat-output-tax" className={LABEL}>Output Tax Amount</label>
                  <input
                    id="vat-output-tax"
                    name="output_tax_amount"
                    type="number"
                    step="any"
                    value={outputTaxInput}
                    onChange={(e) => setOutputTaxInput(e.target.value)}
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Tax collected on sales</p>
                </div>

                <div>
                  <label htmlFor="vat-input-tax" className={LABEL}>Input Tax Amount</label>
                  <input
                    id="vat-input-tax"
                    name="input_tax_amount"
                    type="number"
                    step="any"
                    value={inputTaxInput}
                    onChange={(e) => setInputTaxInput(e.target.value)}
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Tax paid on purchases</p>
                </div>
              </div>

              {/* Real-time Calculation Preview */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    Engine Calculation Formula: Net Tax Payable = Output Tax − Input Tax
                  </span>
                </div>
                <div className="text-sm font-bold text-blue-900 dark:text-blue-100">
                  Preview: {netPayablePreview.toLocaleString()} {currencyInput}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createPending} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                  {createPending ? "Submitting to vat-gst-svc..." : "Submit VAT Return (Create Draft)"}
                </Button>
              </div>
            </form>

            {/* Creation Result Banner */}
            {createState.status === "success" && createState.vatReturn && (
              <div className="mt-4 space-y-3">
                <div className={`p-4 rounded-lg border ${BANNER_SUCCESS}`}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{createState.message}</p>
                      <p className="text-xs font-mono">Return ID: {createState.returnId}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetReturnId(createState.returnId ?? "");
                        setActiveTab("file");
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline"
                    >
                      Proceed to File this Return Now <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <JsonBlock value={createState.vatReturn} />
              </div>
            )}

            {createState.status === "error" && (
              <div className="mt-4">
                <ResultBanner
                  tone="error"
                  message={createState.message ?? "Failed to create VAT return"}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: File VAT Return Form ─────────────────────────────────── */}
      {activeTab === "file" && (
        <Card className="border-indigo-100 dark:border-indigo-900/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                <Send className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>File VAT Return with Tax Authority (POST /v1/vat-returns/:id/file)</CardTitle>
                <CardDescription>
                  Transitions the return from <code className="font-mono text-xs font-bold">DRAFT</code> to <code className="font-mono text-xs font-bold text-blue-600">FILED</code>. Emits statutory Kafka event and locks the return.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={fileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="file-return-id" className={LABEL}>VAT Return ID</label>
                  <input
                    id="file-return-id"
                    name="return_id"
                    value={targetReturnId}
                    onChange={(e) => setTargetReturnId(e.target.value)}
                    placeholder="vret-..."
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Paste ID from Step 1 or select a Draft from the table below</p>
                </div>

                <div>
                  <label htmlFor="file-filed-by" className={LABEL}>Filed By (Signatory Officer)</label>
                  <input
                    id="file-filed-by"
                    name="filed_by"
                    defaultValue="Lingaraj (Super Admin)"
                    className={FIELD}
                    required
                  />
                  <p className={HINT}>Authorized legal entity filing representative</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={filePending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                  {filePending ? "Filing with Authority..." : "File Return with Statutory Gateway"}
                </Button>
              </div>
            </form>

            {/* Filing Result Banner */}
            {fileState.status === "success" && fileState.vatReturn && (
              <div className="mt-4 space-y-3">
                <div className={`p-4 rounded-lg border ${BANNER_SUCCESS}`}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{fileState.message}</p>
                      <p className="text-xs font-mono">
                        Status: <span className="font-bold text-blue-600">FILED</span> · Filed By: {fileState.vatReturn.filed_by} · Filed At: {fileState.vatReturn.filed_at}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLookupReturnId(fileState.returnId ?? "");
                        setActiveTab("lookup");
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline"
                    >
                      Inspect Audit Lineage for this Return <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <JsonBlock value={fileState.vatReturn} />
              </div>
            )}

            {fileState.status === "error" && (
              <div className="mt-4">
                <ResultBanner
                  tone="error"
                  message={fileState.message ?? "Failed to file VAT return"}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 3: Lookup & Audit Lineage ───────────────────────────────── */}
      {activeTab === "lookup" && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Search className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Inspect VAT Return Record (GET /v1/vat-returns/:id)</CardTitle>
                <CardDescription>
                  Direct query to <code className="font-mono text-xs">vat-gst-svc</code> to verify statutory audit trail, timestamps, and isolation.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={lookupSubmit} className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    name="return_id"
                    value={lookupReturnId}
                    onChange={(e) => setLookupReturnId(e.target.value)}
                    placeholder="Enter Return ID (e.g. vret-...)"
                    className={FIELD}
                    required
                  />
                </div>
                <Button type="submit" disabled={lookupPending} className="bg-slate-800 hover:bg-slate-900 text-white font-semibold">
                  {lookupPending ? "Querying..." : "Search Return"}
                </Button>
              </div>
            </form>

            {lookupState.status === "found" && lookupState.record && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Status:</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full font-bold mt-1 ${STATUS_COLORS[lookupState.record.status]}`}>
                      {lookupState.record.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Period / Jurisdiction:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 mt-1 block">
                      {lookupState.record.tax_period} ({lookupState.record.jurisdiction_id})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Net Tax Payable:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-1 block text-sm">
                      {formatCurrency(lookupState.record.net_tax_payable, lookupState.record.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Filed By / At:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 mt-1 block">
                      {lookupState.record.filed_by || "Not filed"}
                    </span>
                  </div>
                </div>
                <JsonBlock value={lookupState.record} />
              </div>
            )}

            {lookupState.status === "missing" && (
              <div className="mt-4">
                <ResultBanner tone="warning" message={lookupState.message} />
              </div>
            )}

            {lookupState.status === "error" && (
              <div className="mt-4">
                <ResultBanner tone="error" message={lookupState.message} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Live VAT / GST Returns Table ───────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            Live VAT / GST Returns Register ({initialReturns.length} Total)
          </h4>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Table auto-refreshed via Server Actions
          </span>
        </div>

        {initialReturns.length === 0 ? (
          <div className="p-8 text-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
            <Receipt className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No VAT returns found</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Use Form 1 above to submit a new VAT return to vat-gst-svc.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {["Return ID / Period", "Tax Reg #", "Output vs Input", "Net Payable", "Filed By", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {initialReturns.map((v) => (
                  <tr key={v.return_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{v.tax_period}</div>
                      <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[150px]">{v.return_id}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {v.tax_registration_number}
                    </td>
                    <td className="px-4 py-3">
                      <OutputInputBar output={v.output_tax_amount} input={v.input_tax_amount} currency={v.currency} />
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatCurrency(v.net_tax_payable, v.currency)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {v.filed_by ? (
                        <div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[140px] font-medium">
                            {v.filed_by}
                          </p>
                          {v.filed_at && (
                            <p className="text-[10px] text-slate-400 font-mono">
                              {new Date(v.filed_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_COLORS[v.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {v.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetReturnId(v.return_id);
                              setActiveTab("file");
                              window.scrollTo({ top: 400, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors"
                          >
                            <Send className="h-3 w-3" /> Quick File
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setLookupReturnId(v.return_id);
                            setActiveTab("lookup");
                            window.scrollTo({ top: 400, behavior: "smooth" });
                          }}
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                        >
                          <Search className="h-3 w-3" /> Audit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
