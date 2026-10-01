"use client";

import { useState, useId } from "react";
import {
  Receipt,
  PackageCheck,
  FileText,
  CheckCircle2,
  AlertCircle,
  Undo2,
  ShieldCheck,
  Building2,
  ArrowRight,
  Search,
  Layers,
  FileCheck,
  Clock,
  Sparkles,
  Ban,
  Scale,
  DollarSign,
  Loader2,
} from "lucide-react";
import {
  actionCreateReceipt,
  actionAmendReceipt,
  actionAttachEvidence,
  actionRecordServiceAcceptance,
  actionConfirmReceipt,
  actionRejectReceipt,
  actionReverseReceipt,
  actionFetchReceiptDetails,
  actionFetchPOReceipts,
  type ReceiptActionState,
} from "@/app/admin/commercial-ops/receipt-actions";
import type {
  GoodsServiceReceipt,
  ReceiptEvidence,
  ReceiptAccountingEvent,
  ReceivedToDateSummary,
  ReceiptType,
} from "@/lib/api/goods-service-receipt";

const FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const LABEL = "mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300";

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  DRAFT: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
  },
  PENDING_CONFIRMATION: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  CONFIRMED: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  REJECTED: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
  },
  PARTIALLY_REVERSED: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-800 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
  },
  FULLY_REVERSED: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-300 dark:border-slate-700",
  },
};

export type ActiveAction =
  | "create"
  | "amend"
  | "evidence"
  | "acceptance"
  | "confirm"
  | "reject"
  | "reverse"
  | "lookup_po"
  | "lookup_receipt"
  | "refresh"
  | null;

export function GoodsServiceReceiptWorkbench() {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [activeReceipt, setActiveReceipt] = useState<GoodsServiceReceipt | null>(null);
  const [evidenceList, setEvidenceList] = useState<ReceiptEvidence[]>([]);
  const [accountingEvent, setAccountingEvent] = useState<ReceiptAccountingEvent | null>(null);
  const [receivedToDate, setReceivedToDate] = useState<ReceivedToDateSummary | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // Quick inputs
  const [poSearchId, setPoSearchId] = useState("");
  const [receiptSearchId, setReceiptSearchId] = useState("");
  const [poReceipts, setPoReceipts] = useState<GoodsServiceReceipt[]>([]);
  const [poListSearched, setPoListSearched] = useState(false);

  // Sub-actions modal/tabs
  const [activeActionTab, setActiveActionTab] = useState<"evidence" | "amend" | "acceptance" | "reverse" | "reject">("evidence");

  // Load receipt details helper
  const loadReceiptData = async (receiptId: string) => {
    const res = await actionFetchReceiptDetails(receiptId);
    if (res.error) {
      setFeedback({ type: "error", msg: res.error });
    } else {
      if (res.receipt) setActiveReceipt(res.receipt);
      if (res.evidenceList) setEvidenceList(res.evidenceList);
      if (res.accountingEvent) setAccountingEvent(res.accountingEvent);
      if (res.receivedToDate) setReceivedToDate(res.receivedToDate);
      setFeedback({ type: "info", msg: `Loaded receipt ${receiptId} (${res.receipt?.status})` });
    }
  };

  // Form handlers
  const handleCreateReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setActiveAction("create");
    try {
      const res = await actionCreateReceipt(fd);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to create receipt draft." });
      } else if (res.receipt) {
        setActiveReceipt(res.receipt);
        setEvidenceList([]);
        setAccountingEvent(null);
        setFeedback({ type: "success", msg: res.message || "Receipt draft created successfully." });
        // Refresh PO receipts list if applicable
        if (res.receipt.purchase_order_id) {
          const listRes = await actionFetchPOReceipts(res.receipt.purchase_order_id);
          if (listRes.receipts) setPoReceipts(listRes.receipts);
          if (listRes.receivedToDate) setReceivedToDate(listRes.receivedToDate);
        }
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleAmendReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeReceipt) return;
    const fd = new FormData(e.currentTarget);
    setActiveAction("amend");
    try {
      const res = await actionAmendReceipt(activeReceipt.receipt_id, fd);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to amend receipt." });
      } else if (res.receipt) {
        setActiveReceipt(res.receipt);
        if (res.receivedToDate) setReceivedToDate(res.receivedToDate);
        setFeedback({ type: "success", msg: res.message || "Receipt amended successfully." });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleAttachEvidence = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeReceipt) return;
    const fd = new FormData(e.currentTarget);
    setActiveAction("evidence");
    try {
      const res = await actionAttachEvidence(activeReceipt.receipt_id, fd);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to attach evidence." });
      } else {
        if (res.receipt) setActiveReceipt(res.receipt);
        setFeedback({ type: "success", msg: res.message || "Evidence attached successfully." });
        await loadReceiptData(activeReceipt.receipt_id);
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleRecordServiceAcceptance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeReceipt) return;
    const fd = new FormData(e.currentTarget);
    setActiveAction("acceptance");
    try {
      const res = await actionRecordServiceAcceptance(activeReceipt.receipt_id, fd);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to record service acceptance." });
      } else {
        if (res.receipt) setActiveReceipt(res.receipt);
        setFeedback({ type: "success", msg: res.message || "Service acceptance recorded." });
        await loadReceiptData(activeReceipt.receipt_id);
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!activeReceipt) return;
    setActiveAction("confirm");
    try {
      const res = await actionConfirmReceipt(activeReceipt.receipt_id);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to confirm receipt." });
      } else {
        if (res.receipt) setActiveReceipt(res.receipt);
        if (res.accountingEvent) setAccountingEvent(res.accountingEvent);
        setFeedback({ type: "success", msg: res.message || "Receipt confirmed successfully." });
        await loadReceiptData(activeReceipt.receipt_id);
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleRejectReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeReceipt) return;
    const fd = new FormData(e.currentTarget);
    setActiveAction("reject");
    try {
      const res = await actionRejectReceipt(activeReceipt.receipt_id, fd);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to reject receipt." });
      } else if (res.receipt) {
        setActiveReceipt(res.receipt);
        setFeedback({ type: "info", msg: res.message || "Receipt rejected." });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleReverseReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeReceipt) return;
    const fd = new FormData(e.currentTarget);
    setActiveAction("reverse");
    try {
      const res = await actionReverseReceipt(activeReceipt.receipt_id, fd);
      if (res.status === "error") {
        setFeedback({ type: "error", msg: res.message || "Failed to reverse receipt." });
      } else if (res.receipt) {
        setActiveReceipt(res.receipt);
        setFeedback({ type: "success", msg: res.message || "Receipt reversed successfully." });
        await loadReceiptData(activeReceipt.receipt_id);
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleLookupPO = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!poSearchId.trim()) return;
    setActiveAction("lookup_po");
    try {
      const res = await actionFetchPOReceipts(poSearchId.trim());
      setPoListSearched(true);
      if (res.error) {
        setFeedback({ type: "error", msg: res.error });
      } else {
        setPoReceipts(res.receipts || []);
        if (res.receivedToDate) setReceivedToDate(res.receivedToDate);
        setFeedback({ type: "info", msg: `Found ${res.receipts?.length || 0} receipts for PO ${poSearchId.slice(0, 8)}...` });
      }
    } finally {
      setActiveAction(null);
    }
  };

  const handleLookupReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!receiptSearchId.trim()) return;
    setActiveAction("lookup_receipt");
    try {
      await loadReceiptData(receiptSearchId.trim());
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div id="goods-service-receipt-workbench" className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Receipt className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Goods &amp; Service Receipt Workbench
                </h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-mono font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  AP-04 :8157
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Interlinked (AP-03 &rarr; AP-04 &rarr; AP-05)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Authoritative delivery and milestone acceptance basis. Enforces PO aggregate tolerance against
                <code className="font-mono text-slate-700 dark:text-slate-300"> purchase-order-svc (:8129)</code> and posts real GRNI accruals to
                <code className="font-mono text-slate-700 dark:text-slate-300"> general-ledger-svc (:8098)</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
              <PackageCheck className="h-4 w-4 text-emerald-500" />
              PO Verification: Live
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
              <Scale className="h-4 w-4 text-purple-500" />
              GRNI Accruals: Enabled
            </span>
          </div>
        </div>

        {/* Global Feedback Alert */}
        {feedback && (
          <div
            className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3.5 text-xs font-medium ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : feedback.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
            }`}
          >
            {feedback.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
            {feedback.type === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
            {feedback.type === "info" && <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />}
            <div className="flex-1 break-all">{feedback.msg}</div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* ── Top Grid: Intake Form & Active Receipt Lifecycle ───────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form: Create Goods/Service Receipt Draft (5 Cols) */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                1. Record Goods/Service Receipt
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Initiate a DRAFT receipt against an active Purchase Order
              </p>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              POST /ap04/receipts
            </span>
          </div>

          <form onSubmit={handleCreateReceipt} className="space-y-3.5">
            <div>
              <label htmlFor="purchase_order_id" className={LABEL}>
                Purchase Order ID (UUID) <span className="text-rose-500">*</span>
              </label>
              <input
                id="purchase_order_id"
                name="purchase_order_id"
                required
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className={`${FIELD} font-mono text-xs`}
                value={poSearchId}
                onChange={(e) => setPoSearchId(e.target.value)}
                autoComplete="off"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400 font-medium">Quick Pick PO:</span>
                <button
                  type="button"
                  onClick={() => setPoSearchId("9eba12e2-668b-4187-b1b6-0e755973053c")}
                  className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                  title="PO-000002 (GBP 4,500 budget - £3,000 available)"
                >
                  PO-000002 (&pound;3,000 Open)
                </button>
                <button
                  type="button"
                  onClick={() => setPoSearchId("3b8bc70f-5e0b-47ca-8305-e0dbcd48c52d")}
                  className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                  title="PO-000003 (USD 18,250 budget - full budget open)"
                >
                  PO-000003 ($18,250 Open)
                </button>
                <button
                  type="button"
                  onClick={() => setPoSearchId("9e2793bb-187f-4566-9d8f-04c251fa5ae3")}
                  className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  title="PO-000001 (GBP 1,500 budget - £0 remaining, 100% fulfilled)"
                >
                  PO-000001 (Fulfilled &pound;0)
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Verified live against <code className="font-mono">purchase-order-svc</code>. Must be in ISSUED status.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="receipt_type" className={LABEL}>
                  Receipt Type <span className="text-rose-500">*</span>
                </label>
                <select id="receipt_type" name="receipt_type" defaultValue="GOODS" className={FIELD}>
                  <option value="GOODS">GOODS (Physical Delivery)</option>
                  <option value="SERVICE">SERVICE (Milestone Acceptance)</option>
                </select>
              </div>

              <div>
                <label htmlFor="currency_code" className={LABEL}>
                  Currency <span className="text-rose-500">*</span>
                </label>
                <select id="currency_code" name="currency_code" defaultValue="GBP" className={FIELD}>
                  <option value="GBP">GBP (&pound;)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (&euro;)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="quantity" className={LABEL}>
                  Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue="10.00"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="unit_of_measure" className={LABEL}>
                  Unit of Measure <span className="text-rose-500">*</span>
                </label>
                <input
                  id="unit_of_measure"
                  name="unit_of_measure"
                  required
                  defaultValue="EA"
                  placeholder="EA, HOURS, KG, BOX"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="amount" className={LABEL}>
                  Received Amount <span className="text-rose-500">*</span>
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue="1250.00"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="receipt_date" className={LABEL}>
                  Receipt Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="receipt_date"
                  name="receipt_date"
                  type="date"
                  required
                  defaultValue="2026-09-22"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="location" className={LABEL}>
                  Receiving Location
                </label>
                <input
                  id="location"
                  name="location"
                  defaultValue="London Central Warehouse - Bay 4"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="inspection_result" className={LABEL}>
                  Inspection Result
                </label>
                <select id="inspection_result" name="inspection_result" defaultValue="CONFORMING" className={FIELD}>
                  <option value="CONFORMING">CONFORMING (Passed Q/C)</option>
                  <option value="PASSED">PASSED (Full Acceptance)</option>
                  <option value="SATISFACTORY">SATISFACTORY (Conditional)</option>
                  <option value="DEFECTIVE">DEFECTIVE (Non-conforming)</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60 space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  name="requires_independent_acceptance"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Requires Independent Acceptance (SoD 4-Eyes Check)
              </label>
              <div>
                <label htmlFor="tolerance_exception_ref" className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Tolerance Exception Reference (Optional, to exceed PO ceiling)
                </label>
                <input
                  id="tolerance_exception_ref"
                  name="tolerance_exception_ref"
                  placeholder="e.g. EXC-TOL-2026-004"
                  className={`${FIELD} text-xs py-1.5`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={activeAction === "create"}
              className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-navy-900 py-2.5 text-xs font-semibold text-white shadow transition-all hover:bg-navy-800 hover:shadow-md disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {activeAction === "create" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Submitting to AP-04...
                </>
              ) : (
                "Create Receipt Draft"
              )}
            </button>
          </form>
        </div>

        {/* Panel: Active Receipt Lifecycle & Workflow State (7 Cols) */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  2. Active Receipt Lifecycle &amp; Governance
                </h3>
                {activeReceipt && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-mono font-bold ${
                      STATUS_BADGES[activeReceipt.status]?.bg || "bg-slate-100"
                    } ${STATUS_BADGES[activeReceipt.status]?.text || "text-slate-800"} ${
                      STATUS_BADGES[activeReceipt.status]?.border || "border-slate-200"
                    }`}
                  >
                    {activeReceipt.status}
                  </span>
                )}
              </div>

              {activeReceipt && (
                <button
                  type="button"
                  onClick={async () => {
                    setActiveAction("refresh");
                    try {
                      await loadReceiptData(activeReceipt.receipt_id);
                    } finally {
                      setActiveAction(null);
                    }
                  }}
                  disabled={activeAction === "refresh"}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                >
                  {activeAction === "refresh" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {activeAction === "refresh" ? "Refreshing..." : "Refresh State"}
                </button>
              )}
            </div>

            {/* Lifecycle Pipeline Visualization */}
            <div className="my-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                <div className={`flex items-center gap-1.5 ${activeReceipt ? "text-emerald-700 dark:text-emerald-400 font-bold" : ""}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 text-[10px]">1</span>
                  DRAFT
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <div
                  className={`flex items-center gap-1.5 ${
                    activeReceipt && activeReceipt.status !== "DRAFT"
                      ? "text-blue-700 dark:text-blue-400 font-bold"
                      : ""
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 text-[10px]">2</span>
                  EVIDENCE ATTACHED
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <div
                  className={`flex items-center gap-1.5 ${
                    activeReceipt && ["CONFIRMED", "PARTIALLY_REVERSED", "FULLY_REVERSED"].includes(activeReceipt.status)
                      ? "text-emerald-700 dark:text-emerald-400 font-bold"
                      : ""
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 text-[10px]">3</span>
                  CONFIRMED &amp; GRNI
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <div
                  className={`flex items-center gap-1.5 ${
                    activeReceipt && ["PARTIALLY_REVERSED", "FULLY_REVERSED"].includes(activeReceipt.status)
                      ? "text-purple-700 dark:text-purple-400 font-bold"
                      : ""
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 text-[10px]">4</span>
                  REVERSED
                </div>
              </div>
            </div>

            {/* Active Receipt Metadata Details Card */}
            {activeReceipt ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <div>
                    <span className="text-slate-400 block text-[10px]">RECEIPT ID</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate block" title={activeReceipt.receipt_id}>
                      {activeReceipt.receipt_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">PURCHASE ORDER</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate block" title={activeReceipt.purchase_order_id}>
                      {activeReceipt.purchase_order_id.slice(0, 8)}...
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">AMOUNT / QTY</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      {activeReceipt.currency_code} {activeReceipt.amount.toFixed(2)} ({activeReceipt.quantity} {activeReceipt.unit_of_measure})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">TYPE / INSPECTION</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      {activeReceipt.receipt_type} / {activeReceipt.inspection_result || "N/A"}
                    </span>
                  </div>
                </div>

                {/* Sub-Actions Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveActionTab("evidence")}
                    className={`pb-2 font-medium transition-colors ${
                      activeActionTab === "evidence"
                        ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Attach Evidence
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveActionTab("amend")}
                    disabled={activeReceipt.status !== "DRAFT"}
                    className={`pb-2 font-medium transition-colors disabled:opacity-40 ${
                      activeActionTab === "amend"
                        ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Amend Draft
                  </button>

                  {activeReceipt.receipt_type === "SERVICE" && (
                    <button
                      type="button"
                      onClick={() => setActiveActionTab("acceptance")}
                      disabled={activeReceipt.status !== "DRAFT"}
                      className={`pb-2 font-medium transition-colors disabled:opacity-40 ${
                        activeActionTab === "acceptance"
                          ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Service Milestone Acceptance
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveActionTab("reverse")}
                    disabled={!["CONFIRMED", "PARTIALLY_REVERSED"].includes(activeReceipt.status)}
                    className={`pb-2 font-medium transition-colors disabled:opacity-40 ${
                      activeActionTab === "reverse"
                        ? "border-b-2 border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Reverse Receipt
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveActionTab("reject")}
                    disabled={!["DRAFT", "PENDING_CONFIRMATION"].includes(activeReceipt.status)}
                    className={`pb-2 font-medium transition-colors disabled:opacity-40 ${
                      activeActionTab === "reject"
                        ? "border-b-2 border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Reject Receipt
                  </button>
                </div>

                {/* Tab: Attach Evidence */}
                {activeActionTab === "evidence" && (
                  <form onSubmit={handleAttachEvidence} className="space-y-3 pt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Attach bill of lading, inspection certificate, or receiving slip. Automatically advances receipt to
                      <span className="font-semibold text-blue-600 dark:text-blue-400"> PENDING_CONFIRMATION</span>.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="evidence_ref" className={LABEL}>Evidence Reference *</label>
                        <input id="evidence_ref" name="evidence_ref" required defaultValue="DOC-BOL-2026-0922" className={FIELD} />
                      </div>
                      <div>
                        <label htmlFor="evidence_description" className={LABEL}>Description</label>
                        <input id="evidence_description" name="description" defaultValue="Signed Carrier Delivery Slip &amp; Packing List" className={FIELD} />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={activeAction === "evidence" || !["DRAFT", "PENDING_CONFIRMATION"].includes(activeReceipt.status)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {activeAction === "evidence" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Recording Evidence...
                        </>
                      ) : (
                        "Attach Evidence Attachment"
                      )}
                    </button>
                  </form>
                )}

                {/* Tab: Amend Draft */}
                {activeActionTab === "amend" && (
                  <form onSubmit={handleAmendReceipt} className="space-y-3 pt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Amend receipt quantities or amounts before confirmation. Only permissible in <code className="font-mono">DRAFT</code> status.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="amend_quantity" className={LABEL}>New Quantity</label>
                        <input id="amend_quantity" name="quantity" type="number" step="0.01" defaultValue={activeReceipt.quantity} className={FIELD} />
                      </div>
                      <div>
                        <label htmlFor="amend_amount" className={LABEL}>New Amount</label>
                        <input id="amend_amount" name="amount" type="number" step="0.01" defaultValue={activeReceipt.amount} className={FIELD} />
                      </div>
                      <div>
                        <label htmlFor="amend_inspection" className={LABEL}>Inspection Result</label>
                        <input id="amend_inspection" name="inspection_result" defaultValue={activeReceipt.inspection_result} className={FIELD} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="amend_reason" className={LABEL}>Amendment Reason *</label>
                      <input id="amend_reason" name="reason" required defaultValue="Adjusted quantity after secondary physical recount" className={FIELD} />
                    </div>
                    <button
                      type="submit"
                      disabled={activeAction === "amend" || activeReceipt.status !== "DRAFT"}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50 dark:bg-navy-700"
                    >
                      {activeAction === "amend" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Draft Amendments"
                      )}
                    </button>
                  </form>
                )}

                {/* Tab: Service Acceptance */}
                {activeActionTab === "acceptance" && (
                  <form onSubmit={handleRecordServiceAcceptance} className="space-y-3 pt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Record milestone sign-off for SERVICE receipts. Evaluates 4-eyes Segregation of Duties if flagged.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="svc_evidence_ref" className={LABEL}>Milestone Ref *</label>
                        <input id="svc_evidence_ref" name="evidence_ref" required defaultValue="SIGN-OFF-STAGE-01" className={FIELD} />
                      </div>
                      <div>
                        <label htmlFor="svc_notes" className={LABEL}>Acceptance Notes</label>
                        <input id="svc_notes" name="notes" defaultValue="Sprint deliverable deliverables accepted by project owner" className={FIELD} />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={activeAction === "acceptance" || activeReceipt.status !== "DRAFT"}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {activeAction === "acceptance" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Recording Acceptance...
                        </>
                      ) : (
                        "Record Milestone Acceptance"
                      )}
                    </button>
                  </form>
                )}

                {/* Tab: Reverse Receipt */}
                {activeActionTab === "reverse" && (
                  <form onSubmit={handleReverseReceipt} className="space-y-3 pt-2">
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-950 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200">
                      <p className="font-semibold">Immutability Trigger Rule (§2):</p>
                      <p className="mt-1">
                        Receipt records are strictly immutable and database triggers reject DELETE requests. To correct or refund a confirmed receipt, record a reversal.
                        Remaining unreversed amount: <span className="font-bold">{activeReceipt.currency_code} {(activeReceipt.amount - activeReceipt.reversed_amount).toFixed(2)}</span>.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="reversed_amount" className={LABEL}>Reversal Amount *</label>
                        <input
                          id="reversed_amount"
                          name="reversed_amount"
                          type="number"
                          step="0.01"
                          max={activeReceipt.amount - activeReceipt.reversed_amount}
                          required
                          defaultValue={Math.min(250.00, activeReceipt.amount - activeReceipt.reversed_amount)}
                          className={FIELD}
                        />
                      </div>
                      <div>
                        <label htmlFor="rev_reason" className={LABEL}>Reversal Reason *</label>
                        <input id="rev_reason" name="reason" required defaultValue="Damaged units returned to supplier for credit memo" className={FIELD} />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={activeAction === "reverse" || !["CONFIRMED", "PARTIALLY_REVERSED"].includes(activeReceipt.status)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      {activeAction === "reverse" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Executing Reversal...
                        </>
                      ) : (
                        "Execute Reversal (Partial / Full)"
                      )}
                    </button>
                  </form>
                )}

                {/* Tab: Reject Receipt */}
                {activeActionTab === "reject" && (
                  <form onSubmit={handleRejectReceipt} className="space-y-3 pt-2">
                    <p className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                      Rejecting a receipt is terminal. Once rejected, no further modifications or confirmations can be performed.
                    </p>
                    <div>
                      <label htmlFor="rejection_reason" className={LABEL}>Rejection Reason *</label>
                      <input id="rejection_reason" name="reason" required defaultValue="Goods failed quality inspection on arrival; rejected" className={FIELD} />
                    </div>
                    <button
                      type="submit"
                      disabled={activeAction === "reject" || !["DRAFT", "PENDING_CONFIRMATION"].includes(activeReceipt.status)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                    >
                      {activeAction === "reject" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Rejecting...
                        </>
                      ) : (
                        "Confirm Terminal Rejection"
                      )}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400 dark:border-slate-800">
                <Receipt className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                No receipt selected. Create a draft using the form on the left or search below.
              </div>
            )}
          </div>

          {/* PO Tolerance Ceiling Guard Banner */}
          {activeReceipt && receivedToDate && (receivedToDate.net_confirmed_amount + activeReceipt.amount > receivedToDate.po_total_amount) && !activeReceipt.tolerance_exception_ref && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    PO Budget Ceiling Notice (Tolerance Rejection Guard)
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    PO <code className="font-mono">{receivedToDate.purchase_order_id.slice(0, 8)}...</code> has total budget{" "}
                    <span className="font-bold">{activeReceipt.currency_code} {receivedToDate.po_total_amount.toFixed(2)}</span> with{" "}
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{activeReceipt.currency_code} {receivedToDate.net_confirmed_amount.toFixed(2)}</span> already confirmed (remaining open balance:{" "}
                    <span className="font-bold">{activeReceipt.currency_code} {Math.max(0, receivedToDate.po_total_amount - receivedToDate.net_confirmed_amount).toFixed(2)}</span>).
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Confirming this <span className="font-bold">{activeReceipt.currency_code} {activeReceipt.amount.toFixed(2)}</span> receipt will exceed the PO tolerance and be rejected by <code className="font-mono">goods-service-receipt-svc</code> (HTTP 409).
                    To confirm successfully, either: <strong>1)</strong> amend amount within remaining balance, <strong>2)</strong> reverse a prior receipt, or <strong>3)</strong> select an open PO like <code className="font-mono">PO-000002</code> (£3,000 open).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Confirm Button Bar */}
          {activeReceipt && (
            <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Ready to finalize?
                </p>
                <p className="text-[11px] text-slate-400">
                  Validates PO aggregate tolerance and posts GRNI entry to general ledger.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={activeAction === "confirm" || !["DRAFT", "PENDING_CONFIRMATION"].includes(activeReceipt.status)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow transition-all hover:bg-emerald-500 disabled:opacity-40"
              >
                {activeAction === "confirm" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Validating &amp; Posting GRNI...
                  </>
                ) : (
                  "Confirm Receipt (POST /confirm)"
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Inter-Service Audit: GRNI Accounting & Evidence Details ───────────── */}
      {activeReceipt && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* GRNI General Ledger Posting Status */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  GRNI Accrual Accounting (general-ledger-svc :8098)
                </h4>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Idempotent by Receipt ID
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {accountingEvent ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Accounting Status:</span>
                    <span
                      className={`font-bold ${
                        accountingEvent.status === "POSTED"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {accountingEvent.status}
                    </span>
                  </div>
                  {accountingEvent.journal_id && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-slate-500">General Ledger Journal ID:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {accountingEvent.journal_id}
                      </span>
                    </div>
                  )}
                  {accountingEvent.failure_reason && (
                    <div className="mt-1 text-rose-600 dark:text-rose-400">
                      Reason: {accountingEvent.failure_reason}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-slate-400 border-t border-slate-200 pt-1.5 dark:border-slate-700">
                    Debit: 2100-GRNI-ACCRUAL | Credit: 2000-ACCOUNTS-PAYABLE
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-slate-400">
                  Receipt not yet confirmed. GRNI journal will be posted automatically upon confirmation.
                </div>
              )}

              {receivedToDate && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/20 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    PO Received-To-Date Aggregate:
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[10px]">PO TOTAL</span>
                      <span className="font-mono font-bold">{activeReceipt.currency_code} {receivedToDate.po_total_amount.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">CONFIRMED NET</span>
                      <span className="font-mono font-bold text-emerald-600">{activeReceipt.currency_code} {receivedToDate.net_confirmed_amount.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">RECEIPTS COUNT</span>
                      <span className="font-mono font-bold">{receivedToDate.receipt_count}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Attached Evidence Log */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Attached Evidence &amp; Audit Trail ({evidenceList.length})
                </h4>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Append-only
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs max-h-48 overflow-y-auto">
              {evidenceList.length > 0 ? (
                evidenceList.map((ev) => (
                  <div
                    key={ev.evidence_id}
                    className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {ev.evidence_ref}
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                        {ev.description || "No description"}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {ev.created_at.slice(0, 19).replace("T", " ")}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-slate-400">
                  No evidence attached to this receipt yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Receipts Register & PO Lookup ─────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Goods/Service Receipts Register &amp; PO History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Query receipts across purchase orders or inspect historical audit lines
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Lookup by PO */}
            <form onSubmit={handleLookupPO} className="flex items-center gap-2">
              <input
                value={poSearchId}
                onChange={(e) => setPoSearchId(e.target.value)}
                placeholder="Lookup by PO UUID..."
                className="h-8 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-800 font-mono outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 w-52"
              />
              <button
                type="submit"
                disabled={activeAction === "lookup_po"}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                {activeAction === "lookup_po" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Find PO"
                )}
              </button>
            </form>

            {/* Lookup by Receipt ID */}
            <form onSubmit={handleLookupReceipt} className="flex items-center gap-2">
              <input
                value={receiptSearchId}
                onChange={(e) => setReceiptSearchId(e.target.value)}
                placeholder="Direct Receipt UUID..."
                className="h-8 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-800 font-mono outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 w-52"
              />
              <button
                type="submit"
                disabled={activeAction === "lookup_receipt"}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                {activeAction === "lookup_receipt" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load"
                )}
              </button>
            </form>
          </div>
        </div>

        {/* PO Receipts Table */}
        <div className="mt-4 overflow-x-auto">
          {poReceipts.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Receipt ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Quantity</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {poReceipts.map((rcpt) => (
                  <tr
                    key={rcpt.receipt_id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${
                      activeReceipt?.receipt_id === rcpt.receipt_id ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {rcpt.receipt_id.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 px-3 font-semibold">{rcpt.receipt_type}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          STATUS_BADGES[rcpt.status]?.bg || "bg-slate-100"
                        } ${STATUS_BADGES[rcpt.status]?.text || "text-slate-800"} ${
                          STATUS_BADGES[rcpt.status]?.border || "border-slate-200"
                        }`}
                      >
                        {rcpt.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {rcpt.quantity} {rcpt.unit_of_measure}
                    </td>
                    <td className="py-2.5 px-3 font-semibold">
                      {rcpt.currency_code} {rcpt.amount.toFixed(2)}
                      {rcpt.reversed_amount > 0 && (
                        <span className="ml-1 text-[10px] text-purple-600">
                          (-{rcpt.reversed_amount.toFixed(2)})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{rcpt.location || "Default"}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{rcpt.receipt_date.slice(0, 10)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => loadReceiptData(rcpt.receipt_id)}
                        className="rounded bg-navy-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400">
              {poListSearched
                ? "No receipts found for this Purchase Order."
                : "Enter a Purchase Order ID above to list its receipts or create a new receipt."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
