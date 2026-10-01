"use client";

import { useState, useTransition, useActionState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
} from "@/components/ui";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Clock,
  ArrowRight,
  FileText,
  Search,
  Check,
  Landmark,
  Radio,
  History,
  Layers,
  Link as LinkIcon,
  RotateCcw,
  Ban,
  Activity,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import {
  recordPaymentStatusAction,
  pollPaymentStatusAction,
  linkStatementAction,
  resolveConflictAction,
  recordReturnAction,
  cancelPaymentAction,
  sendProviderWebhookCallbackAction,
  fetchPaymentHistoryAction,
  fetchFinalityEvidenceAction,
  type PaymentStatusActionState,
} from "@/app/admin/finance/payment-status-actions";
import type {
  PaymentExecutionState,
  StatusEvent,
  FinalityEvidence,
  ExecutionStatus,
} from "@/lib/api/payment-status";

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; badge: string; dot: string; description: string }
> = {
  PREPARED: {
    label: "Prepared",
    badge: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200",
    dot: "bg-slate-400",
    description: "Initial canonical record created. Ready for provider initiation.",
  },
  SUBMITTED: {
    label: "Submitted",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200",
    dot: "bg-indigo-500",
    description: "Transmitted to external banking network / provider adapter.",
  },
  ACCEPTED: {
    label: "Accepted",
    badge: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-200",
    dot: "bg-cyan-500",
    description: "Banking network acknowledged and validated instruction.",
  },
  PENDING: {
    label: "Pending",
    badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200",
    dot: "bg-amber-500",
    description: "Awaiting clearing or settlement window in clearing network.",
  },
  SETTLED: {
    label: "Settled",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200",
    dot: "bg-emerald-500",
    description: "Final funds transfer confirmed. Immutably governed final state.",
  },
  REJECTED: {
    label: "Rejected",
    badge: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200",
    dot: "bg-rose-500",
    description: "Terminal rejection by payment rails or counterparty institution.",
  },
  RETURNED: {
    label: "Returned",
    badge: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200",
    dot: "bg-purple-500",
    description: "Settled transaction returned/reversed via governed return workflow.",
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
    description: "Instruction explicitly cancelled before execution.",
  },
};

type Props = {
  initialPayments?: PaymentExecutionState[];
  unresolvedPayments?: PaymentExecutionState[];
  legalEntityId: string;
};

export function PaymentStatusWorkbench({
  initialPayments = [],
  unresolvedPayments = [],
  legalEntityId,
}: Props) {
  const [payments, setPayments] = useState<PaymentExecutionState[]>(initialPayments);
  const [filterTab, setFilterTab] = useState<"ALL" | "UNRESOLVED" | "IN_FLIGHT" | "SETTLED" | "TERMINAL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentExecutionState | null>(null);
  const [historyEvents, setHistoryEvents] = useState<StatusEvent[]>([]);
  const [finalityEvidence, setFinalityEvidence] = useState<FinalityEvidence | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Active action modal states
  const [activeModal, setActiveModal] = useState<
    "NONE" | "POLL" | "LINK_STATEMENT" | "RESOLVE_CONFLICT" | "RECORD_RETURN" | "CANCEL" | "WEBHOOK"
  >("NONE");
  const [targetPayment, setTargetPayment] = useState<PaymentExecutionState | null>(null);

  // Form action states
  const [recordState, recordAction, isRecordPending] = useActionState<PaymentStatusActionState, FormData>(
    recordPaymentStatusAction,
    { status: "idle" }
  );
  const [pollState, pollAction, isPollPending] = useActionState<PaymentStatusActionState, FormData>(
    pollPaymentStatusAction,
    { status: "idle" }
  );
  const [statementState, statementAction, isStatementPending] = useActionState<PaymentStatusActionState, FormData>(
    linkStatementAction,
    { status: "idle" }
  );
  const [resolveState, resolveAction, isResolvePending] = useActionState<PaymentStatusActionState, FormData>(
    resolveConflictAction,
    { status: "idle" }
  );
  const [returnState, returnAction, isReturnPending] = useActionState<PaymentStatusActionState, FormData>(
    recordReturnAction,
    { status: "idle" }
  );
  const [cancelState, cancelAction, isCancelPending] = useActionState<PaymentStatusActionState, FormData>(
    cancelPaymentAction,
    { status: "idle" }
  );
  const [webhookState, webhookAction, isWebhookPending] = useActionState<PaymentStatusActionState, FormData>(
    sendProviderWebhookCallbackAction,
    { status: "idle" }
  );

  const [, startTransition] = useTransition();

  // Metrics
  const totalCount = payments.length;
  const unresolvedCount = payments.filter((p) => p.has_open_conflict).length;
  const settledCount = payments.filter((p) => p.status === "SETTLED").length;
  const inFlightCount = payments.filter((p) =>
    ["PREPARED", "SUBMITTED", "ACCEPTED", "PENDING"].includes(p.status)
  ).length;
  const terminalCount = payments.filter((p) =>
    ["REJECTED", "RETURNED", "CANCELLED"].includes(p.status)
  ).length;

  // Filtered payments
  const filteredPayments = payments.filter((p) => {
    // Tab filtering
    if (filterTab === "UNRESOLVED" && !p.has_open_conflict) return false;
    if (
      filterTab === "IN_FLIGHT" &&
      !["PREPARED", "SUBMITTED", "ACCEPTED", "PENDING"].includes(p.status)
    )
      return false;
    if (filterTab === "SETTLED" && p.status !== "SETTLED") return false;
    if (
      filterTab === "TERMINAL" &&
      !["REJECTED", "RETURNED", "CANCELLED"].includes(p.status)
    )
      return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = p.payment_id.toLowerCase().includes(q);
      const matchProv = p.provider_request_id.toLowerCase().includes(q);
      const matchSource = p.source_reference.toLowerCase().includes(q);
      const matchStatus = p.status.toLowerCase().includes(q);
      if (!matchId && !matchProv && !matchSource && !matchStatus) return false;
    }

    return true;
  });

  const handleOpenDetails = async (payment: PaymentExecutionState) => {
    setSelectedPayment(payment);
    setIsLoadingHistory(true);
    try {
      const [history, evidence] = await Promise.all([
        fetchPaymentHistoryAction(payment.payment_id),
        fetchFinalityEvidenceAction(payment.payment_id),
      ]);
      setHistoryEvents(history);
      setFinalityEvidence(evidence);
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openAction = (
    modal: "POLL" | "LINK_STATEMENT" | "RESOLVE_CONFLICT" | "RECORD_RETURN" | "CANCEL" | "WEBHOOK",
    payment: PaymentExecutionState
  ) => {
    setTargetPayment(payment);
    setActiveModal(modal);
  };

  return (
    <Card className="border-navy-200 dark:border-navy-800 shadow-md">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-5 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                <Radio className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Payment Status & Finality Confirmation Workbench
                </CardTitle>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-navy-700 dark:text-navy-300">BNK-07</span>
                  <span>•</span>
                  <span>Banking, Cash & Treasury Baseline</span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live Local Backend (:8163)
                  </span>
                </div>
              </div>
            </div>
            <CardDescription className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-3xl">
              Resolves and preserves canonical provider/network payment execution state and finality.
              Validates real HMAC-SHA256 signed callbacks, guarantees monotonic non-regression of governed
              settlement, enforces idempotency, and isolates bank statement discrepancies into investigable conflicts.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                startTransition(() => {
                  window.location.reload();
                });
              }}
              className="text-xs"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Global Action State Message */}
        {[recordState, pollState, statementState, resolveState, returnState, cancelState, webhookState].map(
          (st, idx) =>
            st.message && (
              <div
                key={idx}
                className={`mt-4 rounded-lg p-3 text-xs flex items-center justify-between border ${
                  st.status === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
                    : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {st.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  )}
                  <span>{st.message}</span>
                </div>
              </div>
            )
        )}

        {/* Statistics Bar */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Tracked</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalCount}</span>
              <span className="text-xs text-slate-400">records</span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/20 shadow-xs">
            <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wider">In-Flight</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-blue-800 dark:text-blue-200">{inFlightCount}</span>
              <span className="text-xs text-blue-600/70">active</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20 shadow-xs">
            <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Settled (Final)</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{settledCount}</span>
              <span className="text-xs text-emerald-600/70">cleared</span>
            </div>
          </div>

          <div className={`rounded-xl border p-3 shadow-xs transition-colors ${
            unresolvedCount > 0
              ? "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          }`}>
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-amber-800 dark:text-amber-300">
              <span>Open Conflicts</span>
              {unresolvedCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-amber-900 dark:text-amber-100">{unresolvedCount}</span>
              <span className="text-xs text-amber-700/70">mismatches</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Terminal / Closed</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{terminalCount}</span>
              <span className="text-xs text-slate-400">finalized</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Register Initial Execution State Card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-navy-600 dark:text-navy-400" />
                Register New Payment Execution State
              </h3>
              <p className="text-xs text-slate-500">
                Initializes canonical state tracking in PREPARED status. Correlates upstream AP-11 payment runs or BNK-06 provider attempts.
              </p>
            </div>
          </div>

          <form action={recordAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input type="hidden" name="legal_entity_id" value={legalEntityId} />
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Legal Entity ID
              </label>
              <input
                type="text"
                readOnly
                value={legalEntityId}
                className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Provider Request ID
              </label>
              <input
                type="text"
                name="provider_request_id"
                required
                placeholder="e.g. PRV-REQ-2026-0928-01"
                defaultValue={`PRV-REQ-${Date.now().toString().slice(-6)}`}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-navy-500 focus:ring-1 focus:ring-navy-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Source Reference (Instruction / Run Ref)
              </label>
              <input
                type="text"
                name="source_reference"
                required
                placeholder="e.g. INS-BNK-7741"
                defaultValue={`INS-BNK-${Date.now().toString().slice(-4)}`}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-navy-500 focus:ring-1 focus:ring-navy-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex items-end">
              <Button
                type="submit"
                disabled={isRecordPending}
                className="w-full bg-navy-900 text-white hover:bg-navy-800 dark:bg-navy-600 dark:hover:bg-navy-500 text-xs h-8"
              >
                {isRecordPending ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Register Execution State
              </Button>
            </div>
          </form>
        </div>

        {/* Filter Tabs and Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "ALL", label: "All Executions", count: totalCount },
              { id: "UNRESOLVED", label: "Conflicts", count: unresolvedCount, alert: unresolvedCount > 0 },
              { id: "IN_FLIGHT", label: "In-Flight", count: inFlightCount },
              { id: "SETTLED", label: "Settled", count: settledCount },
              { id: "TERMINAL", label: "Terminal", count: terminalCount },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as typeof filterTab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  filterTab === tab.id
                    ? "bg-navy-900 text-white dark:bg-navy-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                    tab.alert
                      ? "bg-amber-500 text-white"
                      : filterTab === tab.id
                      ? "bg-navy-800 text-slate-200 dark:bg-navy-700"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID, Ref, Status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-navy-500 focus:ring-1 focus:ring-navy-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Payment Records Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="px-4 py-3">Payment ID / References</th>
                  <th className="px-4 py-3">Current Status</th>
                  <th className="px-4 py-3">Finality & Source</th>
                  <th className="px-4 py-3">Conflict State</th>
                  <th className="px-4 py-3">Last Updated</th>
                  <th className="px-4 py-3 text-right">Governed Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No payment execution records match current filter.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const statusMeta = STATUS_CONFIG[p.status] || STATUS_CONFIG.PREPARED;
                    return (
                      <tr
                        key={p.payment_id}
                        className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                          p.has_open_conflict ? "bg-amber-50/30 dark:bg-amber-950/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                            {p.payment_id}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Req:</span>
                            <span className="font-mono">{p.provider_request_id || "—"}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Src:</span>
                            <span className="font-mono">{p.source_reference || "—"}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusMeta.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                            {statusMeta.label}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200 text-[11px]">
                            {p.finality_source || "PENDING_CONFIRMATION"}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {p.mapping_version || "default"}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {p.has_open_conflict ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                              Conflict Open
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Synchronized
                            </span>
                          )}
                          {p.conflict_reason && (
                            <div className="mt-1 max-w-xs truncate text-[10px] text-amber-700 dark:text-amber-300" title={p.conflict_reason}>
                              {p.conflict_reason}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-[11px] text-slate-500">
                          {new Date(p.updated_at).toLocaleString()}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* History Details Button */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenDetails(p)}
                              title="Inspect Append-Only Audit History & Evidence"
                              className="h-7 px-2 text-[11px]"
                            >
                              <History className="h-3 w-3 mr-1 text-slate-500" />
                              History
                            </Button>

                            {/* Poll Status Button */}
                            {!["SETTLED", "REJECTED", "RETURNED", "CANCELLED"].includes(p.status) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openAction("POLL", p)}
                                title="Attest / Poll Provider Status"
                                className="h-7 px-2 text-[11px] text-blue-700 border-blue-200 hover:bg-blue-50 dark:text-blue-300"
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Poll
                              </Button>
                            )}

                            {/* Webhook Callback Simulator */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openAction("WEBHOOK", p)}
                              title="Simulate HMAC-SHA256 Signed Provider Callback"
                              className="h-7 px-2 text-[11px] text-purple-700 border-purple-200 hover:bg-purple-50 dark:text-purple-300"
                            >
                              <KeyRound className="h-3 w-3 mr-1" />
                              Webhook
                            </Button>

                            {/* Link Statement Button */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openAction("LINK_STATEMENT", p)}
                              title="Link Bank Statement Confirmation"
                              className="h-7 px-2 text-[11px] text-slate-700 border-slate-300"
                            >
                              <LinkIcon className="h-3 w-3 mr-1" />
                              Statement
                            </Button>

                            {/* Resolve Conflict Button (Only if has open conflict) */}
                            {p.has_open_conflict && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openAction("RESOLVE_CONFLICT", p)}
                                title="Resolve Conflict with Exceptional Override"
                                className="h-7 px-2 text-[11px] bg-amber-500 text-white hover:bg-amber-600 border-amber-600"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            )}

                            {/* Record Return (Only from SETTLED) */}
                            {p.status === "SETTLED" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openAction("RECORD_RETURN", p)}
                                title="Record Return / Reversal"
                                className="h-7 px-2 text-[11px] text-purple-700 border-purple-300 hover:bg-purple-50"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Return
                              </Button>
                            )}

                            {/* Cancel Payment (Only PREPARED / SUBMITTED) */}
                            {["PREPARED", "SUBMITTED"].includes(p.status) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openAction("CANCEL", p)}
                                title="Cancel Pre-Execution Payment"
                                className="h-7 px-2 text-[11px] text-rose-700 border-rose-300 hover:bg-rose-50"
                              >
                                <Ban className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Slide-Out Drawer / Modal: Audit History & Evidence ── */}
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
            <div className="h-full w-full max-w-xl bg-white p-6 shadow-2xl overflow-y-auto dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <History className="h-4 w-4 text-navy-600" />
                    Audit History & Finality Evidence
                  </h3>
                  <div className="mt-1 font-mono text-xs text-slate-500">
                    ID: {selectedPayment.payment_id}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedPayment(null)}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>

              {isLoadingHistory ? (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-navy-600" />
                  <span>Loading append-only event trail...</span>
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {/* Finality Evidence Block */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Cryptographic Finality Evidence
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Canonical Status:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {selectedPayment.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Finality Source:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                          {selectedPayment.finality_source || "Awaiting Finality"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Mapping Version:</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300">
                          {selectedPayment.mapping_version || "iso20022-camt054"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Open Conflict:</span>
                        <span
                          className={`font-semibold ${
                            selectedPayment.has_open_conflict ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {selectedPayment.has_open_conflict ? "YES (Blocked)" : "NO (Clean)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Events Timeline */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3">
                      Append-Only Event Ledger ({historyEvents.length} events)
                    </h4>
                    <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                      {historyEvents.length === 0 ? (
                        <div className="text-xs text-slate-500 py-3 pl-6">No historical events recorded.</div>
                      ) : (
                        historyEvents.map((evt) => (
                          <div key={evt.event_id} className="relative pl-7 text-xs">
                            <span className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-navy-600 dark:border-slate-900" />
                            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-[11px]">
                                  {evt.event_type}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(evt.created_at).toLocaleTimeString()}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                                {evt.from_status && (
                                  <>
                                    <span className="font-mono">{evt.from_status}</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                  </>
                                )}
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {evt.to_status}
                                </span>
                              </div>
                              {evt.provider_event_ref && (
                                <div className="mt-1 text-[10px] font-mono text-purple-600 dark:text-purple-400">
                                  Ref: {evt.provider_event_ref}
                                </div>
                              )}
                              {evt.detail && (
                                <div className="mt-1 text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded dark:bg-slate-900">
                                  {evt.detail}
                                </div>
                              )}
                              <div className="mt-1.5 text-[9px] text-slate-400 font-mono">
                                Actor: {evt.actor_principal_id}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Modal: Poll Status ── */}
        {activeModal === "POLL" && targetPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Poll External Payment Status
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Attest real-world payment finality status observed on bank or provider portal.
              </p>

              <form
                action={async (fd) => {
                  await pollAction(fd);
                  setActiveModal("NONE");
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payment_id" value={targetPayment.payment_id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reported Status
                  </label>
                  <select
                    name="reported_status"
                    required
                    defaultValue="SETTLED"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="ACCEPTED">ACCEPTED (Bank accepted instruction)</option>
                    <option value="PENDING">PENDING (In clearing pipeline)</option>
                    <option value="SETTLED">SETTLED (Funds confirmed settled)</option>
                    <option value="REJECTED">REJECTED (Payment failed / rejected)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Provider Event Ref
                  </label>
                  <input
                    type="text"
                    name="provider_event_ref"
                    defaultValue={`POLL-EVT-${Date.now().toString().slice(-6)}`}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveModal("NONE")}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isPollPending} className="bg-navy-900 text-white">
                    {isPollPending ? "Applying..." : "Submit Poll Status"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Link Statement ── */}
        {activeModal === "LINK_STATEMENT" && targetPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Link Bank Statement Confirmation
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Links bank statement evidence. If statement disagrees with current canonical status ({targetPayment.status}),
                an open STATUS_CONFLICT will automatically be raised.
              </p>

              <form
                action={async (fd) => {
                  await statementAction(fd);
                  setActiveModal("NONE");
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payment_id" value={targetPayment.payment_id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Statement Reference
                  </label>
                  <input
                    type="text"
                    name="statement_reference"
                    required
                    defaultValue={`STMT-LINE-${Date.now().toString().slice(-6)}`}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Statement Reported Status
                  </label>
                  <select
                    name="reported_status"
                    required
                    defaultValue={targetPayment.status}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="SETTLED">SETTLED (Confirmed in bank ledger)</option>
                    <option value="REJECTED">REJECTED (Dishonored / returned on statement)</option>
                    <option value="PENDING">PENDING (Pending float / uncleared)</option>
                  </select>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveModal("NONE")}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isStatementPending} className="bg-navy-900 text-white">
                    {isStatementPending ? "Linking..." : "Link Statement Confirmation"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Webhook Simulator ── */}
        {activeModal === "WEBHOOK" && targetPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-purple-600" />
                Simulate Provider Webhook Callback
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Dispatches a POST request to <code className="font-mono text-purple-700 dark:text-purple-300">/bnk07/webhooks/provider-callback</code> with genuine HMAC-SHA256 signature verification over raw body.
              </p>

              <form
                action={async (fd) => {
                  await webhookAction(fd);
                  setActiveModal("NONE");
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payment_id" value={targetPayment.payment_id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reported Execution Status
                  </label>
                  <select
                    name="reported_status"
                    required
                    defaultValue="SETTLED"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="ACCEPTED">ACCEPTED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="SETTLED">SETTLED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Provider Event Reference
                  </label>
                  <input
                    type="text"
                    name="provider_event_ref"
                    required
                    defaultValue={`WH-EVT-${Date.now().toString().slice(-6)}`}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5 dark:border-purple-900 dark:bg-purple-950/20">
                  <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 font-medium">
                    <input type="checkbox" name="invalid_signature" value="true" className="rounded" />
                    <span>Test Negative Path: Send Forged / Invalid Signature</span>
                  </label>
                  <p className="mt-1 text-[10px] text-slate-500">
                    If checked, sends an invalid HMAC header to verify payment-status-svc rejects the forged callback with 401 Unauthorized.
                  </p>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveModal("NONE")}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isWebhookPending} className="bg-purple-700 hover:bg-purple-800 text-white">
                    {isWebhookPending ? "Sending..." : "Dispatch Signed Webhook"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Resolve Conflict ── */}
        {activeModal === "RESOLVE_CONFLICT" && targetPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Resolve Payment Status Conflict
              </h3>
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200">
                <strong>Discrepancy:</strong> {targetPayment.conflict_reason || "Disagreement between external statements and provider execution state."}
              </div>

              <form
                action={async (fd) => {
                  await resolveAction(fd);
                  setActiveModal("NONE");
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payment_id" value={targetPayment.payment_id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Resolved Final Status
                  </label>
                  <select
                    name="final_status"
                    required
                    defaultValue="SETTLED"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="SETTLED">SETTLED (Final funds cleared upon bank manual investigation)</option>
                    <option value="REJECTED">REJECTED (Confirmed failed / reversed)</option>
                    <option value="CANCELLED">CANCELLED (Voided)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Exceptional Resolution Justification
                  </label>
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    placeholder="Enter audit evidence and justification for overriding finality..."
                    defaultValue="Bank liaison verified cleared MT940 statement ledger credit."
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveModal("NONE")}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isResolvePending} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {isResolvePending ? "Resolving..." : "Confirm Finality Override"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Record Return ── */}
        {activeModal === "RECORD_RETURN" && targetPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-purple-600" />
                Record Return / Reversal
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Governed reversal workflow: moves a SETTLED transaction into RETURNED.
              </p>

              <form
                action={async (fd) => {
                  await returnAction(fd);
                  setActiveModal("NONE");
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payment_id" value={targetPayment.payment_id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Provider Return Ref
                  </label>
                  <input
                    type="text"
                    name="provider_event_ref"
                    defaultValue={`RET-EVT-${Date.now().toString().slice(-6)}`}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    name="reason"
                    required
                    defaultValue="Counterparty bank reported beneficiary account invalid / closed"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveModal("NONE")}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isReturnPending} className="bg-purple-700 text-white">
                    {isReturnPending ? "Recording..." : "Record Governed Return"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Cancel Payment ── */}
        {activeModal === "CANCEL" && targetPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Ban className="h-4 w-4 text-rose-600" />
                Cancel Payment Execution
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Pre-execution cancellation for PREPARED or SUBMITTED instruction.
              </p>

              <form
                action={async (fd) => {
                  await cancelAction(fd);
                  setActiveModal("NONE");
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payment_id" value={targetPayment.payment_id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cancellation Reason
                  </label>
                  <input
                    type="text"
                    name="reason"
                    required
                    defaultValue="Duplicate submission detected prior to bank transmission"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveModal("NONE")}>
                    Close
                  </Button>
                  <Button type="submit" size="sm" disabled={isCancelPending} className="bg-rose-600 hover:bg-rose-700 text-white">
                    {isCancelPending ? "Cancelling..." : "Confirm Cancellation"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
