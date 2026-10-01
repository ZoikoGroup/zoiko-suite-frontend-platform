"use client";

import { useState, useTransition } from "react";
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
  Send,
  Lock,
  Copy,
  Receipt,
  Sparkles,
  AlertOctagon,
  Eye,
} from "lucide-react";
import {
  preparePaymentAttemptAction,
  submitPaymentAttemptAction,
  retryPaymentAttemptAction,
  cancelPaymentAttemptAction,
  resolveAmbiguousPaymentAttemptAction,
  quarantinePaymentAttemptAction,
  fetchAttemptReceiptAction,
  fetchAttemptEvidenceAction,
  refreshPaymentAttemptsAction,
  type PaymentInitiationActionState,
} from "@/app/admin/finance/payment-initiation-actions";
import type {
  PaymentInitiationAttempt,
  AttemptStatus,
  ProviderReceipt,
  AttemptEvidence,
} from "@/lib/api/payment-initiation";

const STATUS_CONFIG: Record<
  AttemptStatus,
  { label: string; badge: string; dot: string; description: string }
> = {
  PREPARED: {
    label: "Prepared",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    dot: "bg-blue-500",
    description: "Durable record committed prior to external network call. Ready for transmission.",
  },
  SUBMITTED: {
    label: "Submitted",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
    description: "Transmitted to bank/PSP adapter. Provider request ID and response reference captured.",
  },
  PENDING_UNKNOWN: {
    label: "Pending Unknown",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
    description: "External network timeout or unconfirmed state. UNKNOWN is a first-class financial state.",
  },
  REJECTED_BEFORE_SUBMISSION: {
    label: "Rejected",
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
    description: "Rejected by provider adapter validation before payment execution.",
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dot: "bg-slate-400",
    description: "Pre-submission cancellation executed by authorized operator.",
  },
  QUARANTINED: {
    label: "Quarantined",
    badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
    dot: "bg-purple-500",
    description: "Held in quarantine for operator review due to detected anomaly or compliance hold.",
  },
};

export function PaymentInitiationWorkbench({
  initialAttempts = [],
  legalEntityId = "22222222-2222-2222-2222-222222222222",
}: {
  initialAttempts?: PaymentInitiationAttempt[];
  legalEntityId?: string;
}) {
  const [attempts, setAttempts] = useState<PaymentInitiationAttempt[]>(initialAttempts);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    initialAttempts[0]?.attempt_id || null,
  );
  const [isPending, startTransition] = useTransition();
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Form State
  const [payerAccountRef, setPayerAccountRef] = useState("BARCLAYS-OPERATING-01");
  const [payeeRef, setPayeeRef] = useState("VND-CISCO-GLOBAL");
  const [amount, setAmount] = useState("28500.00");
  const [currency, setCurrency] = useState("GBP");
  const [paymentReference, setPaymentReference] = useState("");
  const [sourceReference, setSourceReference] = useState(`PO-INV-${Date.now().toString().slice(-6)}`);
  const [payerAccountVerified, setPayerAccountVerified] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(
    `INIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
  );

  // Modals state
  const [receiptModal, setReceiptModal] = useState<ProviderReceipt | null>(null);
  const [evidenceModal, setEvidenceModal] = useState<AttemptEvidence | null>(null);
  const [resolveModalId, setResolveModalId] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<"SUBMITTED" | "REJECTED_BEFORE_SUBMISSION">("SUBMITTED");
  const [resolveNote, setResolveNote] = useState("");
  const [quarantineModalId, setQuarantineModalId] = useState<string | null>(null);
  const [quarantineReason, setQuarantineReason] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateNewIdempotencyKey = () => {
    setIdempotencyKey(`INIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
  };

  const applyPreset = (preset: "standard" | "timeout" | "reject") => {
    generateNewIdempotencyKey();
    if (preset === "standard") {
      setPayerAccountRef("BARCLAYS-OPERATING-01");
      setPayeeRef("VND-CISCO-GLOBAL");
      setAmount("28500.00");
      setCurrency("GBP");
      setPaymentReference("Standard corporate wire transfer");
      setPayerAccountVerified(true);
    } else if (preset === "timeout") {
      setPayerAccountRef("HSBC-SETTLEMENT-02");
      setPayeeRef("VND-MICROSOFT-CORP");
      setAmount("14250.00");
      setCurrency("USD");
      setPaymentReference("SIMULATE_TIMEOUT: High-latency network gateway test");
      setPayerAccountVerified(true);
    } else if (preset === "reject") {
      setPayerAccountRef("CITI-TREASURY-03");
      setPayeeRef("VND-UNKNOWN-VENDOR");
      setAmount("9500.00");
      setCurrency("EUR");
      setPaymentReference("SIMULATE_REJECT: Sanctions check simulation");
      setPayerAccountVerified(true);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const reloadAttempts = async () => {
    const res = await refreshPaymentAttemptsAction(legalEntityId);
    if (res.ok && res.data) {
      setAttempts(res.data);
    }
  };

  const handlePrepare = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionFeedback(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await preparePaymentAttemptAction({ status: "idle" }, fd);
      if (res.status === "success") {
        setActionFeedback({ type: "success", text: res.message || "Payment attempt prepared." });
        if (res.data) {
          const newAttempt = res.data as PaymentInitiationAttempt;
          setAttempts((prev) => [newAttempt, ...prev]);
          setSelectedAttemptId(newAttempt.attempt_id);
          generateNewIdempotencyKey();
        }
      } else {
        setActionFeedback({ type: "error", text: res.message || "Preparation failed." });
      }
    });
  };

  const handleSubmit = (attemptId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await submitPaymentAttemptAction(attemptId);
      if (res.status === "success") {
        const updated = res.data as PaymentInitiationAttempt;
        setAttempts((prev) => prev.map((a) => (a.attempt_id === attemptId ? updated : a)));
        setActionFeedback({ type: "success", text: res.message || "Attempt submitted." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Submission failed." });
      }
    });
  };

  const handleRetry = (attemptId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await retryPaymentAttemptAction(attemptId);
      if (res.status === "success") {
        const updated = res.data as PaymentInitiationAttempt;
        setAttempts((prev) => prev.map((a) => (a.attempt_id === attemptId ? updated : a)));
        setActionFeedback({ type: "success", text: res.message || "Attempt re-submitted." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Retry failed." });
      }
    });
  };

  const handleCancel = (attemptId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await cancelPaymentAttemptAction(attemptId);
      if (res.status === "success") {
        const updated = res.data as PaymentInitiationAttempt;
        setAttempts((prev) => prev.map((a) => (a.attempt_id === attemptId ? updated : a)));
        setActionFeedback({ type: "success", text: res.message || "Attempt cancelled." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Cancellation failed." });
      }
    });
  };

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveModalId) return;
    setActionFeedback(null);
    startTransition(async () => {
      const res = await resolveAmbiguousPaymentAttemptAction(
        resolveModalId,
        resolveStatus,
        resolveNote,
      );
      if (res.status === "success") {
        const updated = res.data as PaymentInitiationAttempt;
        setAttempts((prev) => prev.map((a) => (a.attempt_id === resolveModalId ? updated : a)));
        setActionFeedback({ type: "success", text: res.message || "Ambiguity resolved." });
        setResolveModalId(null);
        setResolveNote("");
      } else {
        setActionFeedback({ type: "error", text: res.message || "Resolution failed." });
      }
    });
  };

  const handleQuarantineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quarantineModalId) return;
    setActionFeedback(null);
    startTransition(async () => {
      const res = await quarantinePaymentAttemptAction(quarantineModalId, quarantineReason);
      if (res.status === "success") {
        const updated = res.data as PaymentInitiationAttempt;
        setAttempts((prev) => prev.map((a) => (a.attempt_id === quarantineModalId ? updated : a)));
        setActionFeedback({ type: "success", text: res.message || "Attempt quarantined." });
        setQuarantineModalId(null);
        setQuarantineReason("");
      } else {
        setActionFeedback({ type: "error", text: res.message || "Quarantine failed." });
      }
    });
  };

  const handleOpenReceipt = async (attemptId: string) => {
    const res = await fetchAttemptReceiptAction(attemptId);
    if (res.ok && res.data) {
      setReceiptModal(res.data);
    } else {
      setActionFeedback({ type: "error", text: res.error || "Failed to load receipt." });
    }
  };

  const handleOpenEvidence = async (attemptId: string) => {
    const res = await fetchAttemptEvidenceAction(attemptId);
    if (res.ok && res.data) {
      setEvidenceModal(res.data);
    } else {
      setActionFeedback({ type: "error", text: res.error || "Failed to load audit evidence." });
    }
  };

  const filteredAttempts = attempts.filter((a) => {
    const matchesStatus = statusFilter === "ALL" || a.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      a.attempt_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.idempotency_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.payer_account_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.payee_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.source_reference.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeAttempt = attempts.find((a) => a.attempt_id === selectedAttemptId);

  // KPI calculations
  const totalCount = attempts.length;
  const preparedCount = attempts.filter((a) => a.status === "PREPARED").length;
  const submittedCount = attempts.filter((a) => a.status === "SUBMITTED").length;
  const pendingUnknownCount = attempts.filter((a) => a.status === "PENDING_UNKNOWN").length;
  const exceptionCount = attempts.filter(
    (a) =>
      a.status === "QUARANTINED" ||
      a.status === "CANCELLED" ||
      a.status === "REJECTED_BEFORE_SUBMISSION",
  ).length;

  return (
    <div id="payment-initiation-adapter" className="space-y-6">
      {/* Header and KPI bar */}
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl dark:border-slate-800">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
                  BNK-06 • Port 8162
                </span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Service Online
                </span>
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <Landmark className="h-6 w-6 text-indigo-400" />
                Payment Initiation Adapter Workbench
              </CardTitle>
              <CardDescription className="text-xs text-slate-300 max-w-3xl">
                Durable pre-submission boundary and idempotent transmission to external banking/PSP networks.
                Guarantees persistent attempt recording before network calls, structurally prevents duplicate payment IDs
                on timeout via idempotent retries, and enforces immutable authorized amounts.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={reloadAttempts}
                disabled={isPending}
                className="border-slate-700 bg-slate-800/80 text-xs text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Refresh State
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 border-t border-slate-800 pt-4">
            <div className="rounded-lg bg-slate-800/50 p-3 ring-1 ring-white/10">
              <span className="text-[11px] font-medium text-slate-400">Total Attempts</span>
              <p className="mt-1 text-xl font-bold text-white">{totalCount}</p>
            </div>
            <div className="rounded-lg bg-blue-950/40 p-3 ring-1 ring-blue-500/20">
              <span className="text-[11px] font-medium text-blue-300">Prepared (Presubmit)</span>
              <p className="mt-1 text-xl font-bold text-blue-400">{preparedCount}</p>
            </div>
            <div className="rounded-lg bg-emerald-950/40 p-3 ring-1 ring-emerald-500/20">
              <span className="text-[11px] font-medium text-emerald-300">Submitted to Bank</span>
              <p className="mt-1 text-xl font-bold text-emerald-400">{submittedCount}</p>
            </div>
            <div className="rounded-lg bg-amber-950/40 p-3 ring-1 ring-amber-500/20">
              <span className="text-[11px] font-medium text-amber-300">Pending Unknown</span>
              <p className="mt-1 text-xl font-bold text-amber-400">{pendingUnknownCount}</p>
            </div>
            <div className="rounded-lg bg-rose-950/40 p-3 ring-1 ring-rose-500/20">
              <span className="text-[11px] font-medium text-rose-300">Quarantine & Exception</span>
              <p className="mt-1 text-xl font-bold text-rose-400">{exceptionCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action feedback banner */}
      {actionFeedback && (
        <div
          className={`flex items-center justify-between rounded-lg p-3.5 text-xs font-medium shadow-sm transition-all ${
            actionFeedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800"
              : "bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Prepare Payment Attempt Form Card */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Prepare Payment Initiation Attempt
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Creates a durable PREPARED attempt record. Authorized financial attributes cannot be altered once stored.
              </CardDescription>
            </div>
            {/* Simulation Presets */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset("standard")}
                className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              >
                Standard Wire
              </button>
              <button
                type="button"
                onClick={() => applyPreset("timeout")}
                className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                Simulate Timeout
              </button>
              <button
                type="button"
                onClick={() => applyPreset("reject")}
                className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
              >
                Simulate Rejection
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handlePrepare} className="space-y-4">
            <input type="hidden" name="legal_entity_id" value={legalEntityId} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payer Account Ref <span className="text-rose-500">*</span>
                </label>
                <input
                  id="init-payer-account-ref"
                  type="text"
                  name="payer_account_ref"
                  required
                  value={payerAccountRef}
                  onChange={(e) => setPayerAccountRef(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
                  placeholder="BARCLAYS-OPERATING-01"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payee Ref <span className="text-rose-500">*</span>
                </label>
                <input
                  id="init-payee-ref"
                  type="text"
                  name="payee_ref"
                  required
                  value={payeeRef}
                  onChange={(e) => setPayeeRef(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
                  placeholder="VND-CISCO-GLOBAL"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Amount <span className="text-rose-500">*</span>
                </label>
                <input
                  id="init-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="amount"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="28500.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Currency <span className="text-rose-500">*</span>
                </label>
                <select
                  id="init-currency"
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="GBP">GBP - British Pound</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="INR">INR - Indian Rupee</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Source Reference (Instruction / PO)
                </label>
                <input
                  type="text"
                  name="source_reference"
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
                  placeholder="RUN-INST-001"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment Reference (Wire Memo)
                </label>
                <input
                  type="text"
                  name="payment_reference"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Invoice 9481 Settlement"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Idempotency Key <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateNewIdempotencyKey}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                  >
                    Regenerate
                  </button>
                </div>
                <input
                  type="text"
                  name="idempotency_key"
                  required
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>

            {/* Attestation Gate */}
            <div className="rounded-lg bg-indigo-50/50 p-3 border border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900/40">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="payer_account_verified"
                  value="true"
                  checked={payerAccountVerified}
                  onChange={(e) => setPayerAccountVerified(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  <strong className="text-indigo-900 dark:text-indigo-200">
                    Caller Attestation of Payer Account Verification:
                  </strong>{" "}
                  I formally attest that the paying bank account reference has been verified and is active.
                  (BNK-06 requires this gate; payment cannot be prepared from unverified accounts).
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                id="init-prepare-button"
                type="submit"
                disabled={isPending}
                className="bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
              >
                {isPending ? "Preparing Attempt..." : "Prepare Payment Attempt"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Attempts Register & Search */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Payment Initiation Attempts Register
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Authoritative record of prepared and transmitted payment initiation attempts.
              </CardDescription>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="init-search-input"
                  type="text"
                  placeholder="Search ID, account, payee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-52 rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <select
                id="init-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="ALL">All Statuses ({attempts.length})</option>
                <option value="PREPARED">Prepared ({preparedCount})</option>
                <option value="SUBMITTED">Submitted ({submittedCount})</option>
                <option value="PENDING_UNKNOWN">Pending Unknown ({pendingUnknownCount})</option>
                <option value="QUARANTINED">Quarantined</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REJECTED_BEFORE_SUBMISSION">Rejected</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredAttempts.length === 0 ? (
            <div className="p-12 text-center">
              <Landmark className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                No payment initiation attempts found
              </p>
              <p className="text-xs text-slate-500">
                {searchQuery || statusFilter !== "ALL"
                  ? "Try clearing filters to see existing records."
                  : "Use the form above to prepare the first payment initiation attempt."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="border-b border-slate-200 bg-slate-50/80 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <tr>
                    <th className="px-3.5 py-2.5">Attempt ID / Idempotency Key</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5">Payer Account</th>
                    <th className="px-3.5 py-2.5">Payee Reference</th>
                    <th className="px-3.5 py-2.5">Amount</th>
                    <th className="px-3.5 py-2.5">Execution Date</th>
                    <th className="px-3.5 py-2.5 text-right">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAttempts.map((a) => {
                    const cfg = STATUS_CONFIG[a.status] || {
                      label: a.status,
                      badge: "bg-slate-100 text-slate-700",
                      dot: "bg-slate-400",
                      description: "",
                    };
                    const isSelected = selectedAttemptId === a.attempt_id;
                    return (
                      <tr
                        key={a.attempt_id}
                        onClick={() => setSelectedAttemptId(a.attempt_id)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60 ${
                          isSelected ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""
                        }`}
                      >
                        <td className="px-3.5 py-3">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-slate-900 dark:text-slate-100">
                            <span>{a.attempt_id.slice(0, 8)}...</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(a.attempt_id, a.attempt_id);
                              }}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Copy full Attempt ID"
                            >
                              {copiedId === a.attempt_id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <div
                            className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]"
                            title={a.idempotency_key}
                          >
                            {a.idempotency_key}
                          </div>
                        </td>

                        <td className="px-3.5 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.badge}`}
                            title={cfg.description}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>

                        <td className="px-3.5 py-3 font-mono text-[11px]">
                          {a.payer_account_ref}
                        </td>

                        <td className="px-3.5 py-3 font-mono text-[11px]">
                          {a.payee_ref}
                        </td>

                        <td className="px-3.5 py-3">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {a.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>{" "}
                          <span className="text-[10px] font-medium text-slate-500">{a.currency}</span>
                        </td>

                        <td className="px-3.5 py-3 text-[11px]">
                          {a.execution_date ? a.execution_date.split("T")[0] : "—"}
                        </td>

                        <td className="px-3.5 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Actions for PREPARED */}
                            {a.status === "PREPARED" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSubmit(a.attempt_id)}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 shadow-sm"
                                >
                                  <Send className="h-3 w-3" />
                                  Submit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancel(a.attempt_id)}
                                  disabled={isPending}
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuarantineModalId(a.attempt_id)}
                                  disabled={isPending}
                                  className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                >
                                  Quarantine
                                </button>
                              </>
                            )}

                            {/* Actions for PENDING_UNKNOWN */}
                            {a.status === "PENDING_UNKNOWN" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRetry(a.attempt_id)}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 shadow-sm"
                                  title="Re-executes provider call with identical Idempotency Key"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Retry
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResolveModalId(a.attempt_id)}
                                  disabled={isPending}
                                  className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                                >
                                  Resolve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuarantineModalId(a.attempt_id)}
                                  disabled={isPending}
                                  className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                >
                                  Quarantine
                                </button>
                              </>
                            )}

                            {/* Actions for SUBMITTED */}
                            {a.status === "SUBMITTED" && (
                              <button
                                type="button"
                                onClick={() => handleOpenReceipt(a.attempt_id)}
                                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              >
                                <Receipt className="h-3 w-3" />
                                Receipt
                              </button>
                            )}

                            {/* General Evidence button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEvidence(a.attempt_id)}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              title="View immutable audit event lineage"
                            >
                              <History className="h-3 w-3" />
                              Audit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Attempt Details Card */}
      {activeAttempt && (
        <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Attempt Evidence & Lineage:{" "}
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeAttempt.attempt_id}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Principal: <span className="font-mono">{activeAttempt.created_by_principal_id}</span> · Legal Entity:{" "}
                  <span className="font-mono">{activeAttempt.legal_entity_id}</span>
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    STATUS_CONFIG[activeAttempt.status]?.badge
                  }`}
                >
                  {STATUS_CONFIG[activeAttempt.status]?.label || activeAttempt.status}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleOpenEvidence(activeAttempt.attempt_id)}
                  className="text-xs"
                >
                  <History className="mr-1.5 h-3.5 w-3.5 text-indigo-500" />
                  Full Audit Log
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60 sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Payer Account</span>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {activeAttempt.payer_account_ref}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Payee Reference</span>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {activeAttempt.payee_ref}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Authorized Amount</span>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeAttempt.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  {activeAttempt.currency}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Account Verified Gate</span>
                <p className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Caller Attested Active
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">Idempotency Key</span>
                <p className="font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all select-all">
                  {activeAttempt.idempotency_key}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">Provider Request ID</span>
                <p className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {activeAttempt.provider_request_id || "— (Not yet transmitted)"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">Provider Response Reference</span>
                <p className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {activeAttempt.provider_response_ref || "— (Awaiting acknowledgement)"}
                </p>
              </div>
            </div>

            {activeAttempt.quarantine_reason && (
              <div className="rounded-lg bg-purple-50 p-3 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200 border border-purple-200 dark:border-purple-800">
                <strong>Quarantine Reason:</strong> {activeAttempt.quarantine_reason}
              </div>
            )}

            {activeAttempt.ambiguous_resolution_note && (
              <div className="rounded-lg bg-blue-50 p-3 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                <strong>Operator Ambiguity Resolution Note:</strong> {activeAttempt.ambiguous_resolution_note}
              </div>
            )}

            {activeAttempt.rejection_reason && (
              <div className="rounded-lg bg-rose-50 p-3 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800">
                <strong>Rejection Reason:</strong> {activeAttempt.rejection_reason}
              </div>
            )}

            {/* Timestamps */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                Created: <span className="font-mono">{new Date(activeAttempt.created_at).toLocaleString()}</span>
              </div>
              {activeAttempt.submitted_at && (
                <div>
                  Submitted:{" "}
                  <span className="font-mono text-emerald-600">
                    {new Date(activeAttempt.submitted_at).toLocaleString()}
                  </span>
                </div>
              )}
              {activeAttempt.resolved_at && (
                <div>
                  Resolved:{" "}
                  <span className="font-mono text-blue-600">
                    {new Date(activeAttempt.resolved_at).toLocaleString()}
                  </span>
                </div>
              )}
              <div>
                Last Updated: <span className="font-mono">{new Date(activeAttempt.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipt Modal */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Provider Transmission Receipt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 space-y-2">
                <div>
                  <span className="text-slate-500">Attempt ID</span>
                  <p className="font-mono text-slate-800 dark:text-slate-200">{receiptModal.attempt_id}</p>
                </div>
                <div>
                  <span className="text-slate-500">Provider Request ID</span>
                  <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {receiptModal.provider_request_id}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Provider Response Reference</span>
                  <p className="font-mono text-slate-800 dark:text-slate-200">
                    {receiptModal.provider_response_ref}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                This receipt certifies that the payment instruction was acknowledged by the provider adapter
                and assigned a deterministic external reference.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" id="close-receipt-modal" onClick={() => setReceiptModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Evidence Modal */}
      {evidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Immutable Attempt Audit Trail
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50 space-y-1">
                <div>
                  <span className="text-slate-500">Attempt ID:</span>{" "}
                  <span className="font-mono font-medium">{evidenceModal.attempt_id}</span>
                </div>
                <div>
                  <span className="text-slate-500">Idempotency Key:</span>{" "}
                  <span className="font-mono text-[11px]">{evidenceModal.idempotency_key}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-700 dark:text-slate-300">
                  Recorded Events ({evidenceModal.events.length})
                </h4>
                {evidenceModal.events.length === 0 ? (
                  <p className="text-slate-400 italic">No events recorded yet.</p>
                ) : (
                  <div className="relative border-l-2 border-indigo-200 pl-4 space-y-3 dark:border-indigo-900 ml-2">
                    {evidenceModal.events.map((ev) => (
                      <div key={ev.event_id} className="relative">
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-900" />
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {ev.event_type}
                        </div>
                        {ev.detail && <p className="text-slate-600 dark:text-slate-400 font-mono text-[11px]">{ev.detail}</p>}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Actor: <span className="font-mono">{ev.actor_principal_id}</span> ·{" "}
                          {new Date(ev.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button size="sm" id="close-evidence-modal" onClick={() => setEvidenceModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Ambiguity Modal */}
      {resolveModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleResolveSubmit}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Resolve Ambiguous Submission
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResolveModalId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Attempt <span className="font-mono font-medium">{resolveModalId}</span> is in state PENDING_UNKNOWN.
                As an authorized operator, confirm the external status after manual verification with the bank/PSP.
              </p>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Resolved Outcome
                </label>
                <select
                  value={resolveStatus}
                  onChange={(e) =>
                    setResolveStatus(e.target.value as "SUBMITTED" | "REJECTED_BEFORE_SUBMISSION")
                  }
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="SUBMITTED">SUBMITTED (Bank processed the transfer)</option>
                  <option value="REJECTED_BEFORE_SUBMISSION">REJECTED_BEFORE_SUBMISSION (Bank refused)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Governance & Audit Note <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="resolve-note-textarea"
                  required
                  rows={3}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Explain why this resolution was chosen and reference supporting external documentation..."
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setResolveModalId(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                id="confirm-resolution-button"
                disabled={isPending || !resolveNote.trim()}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Confirm Resolution
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Quarantine Modal */}
      {quarantineModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleQuarantineSubmit}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Quarantine Payment Attempt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuarantineModalId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Move attempt <span className="font-mono font-medium">{quarantineModalId}</span> into quarantine.
                Quarantined attempts cannot be submitted or retried.
              </p>
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Reason for Quarantine <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="quarantine-reason-textarea"
                  required
                  rows={3}
                  value={quarantineReason}
                  onChange={(e) => setQuarantineReason(e.target.value)}
                  placeholder="Suspected duplicate, sanctions alert, payee account discrepancy..."
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setQuarantineModalId(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                id="confirm-quarantine-button"
                disabled={isPending || !quarantineReason.trim()}
                className="bg-purple-600 text-white hover:bg-purple-700"
              >
                Quarantine Attempt
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
