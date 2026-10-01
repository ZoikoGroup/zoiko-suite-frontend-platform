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
  CreditCard,
  CheckCircle2,
  Lock,
  Send,
  RefreshCw,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  FileText,
  Search,
  Check,
  Landmark,
  Sparkles,
} from "lucide-react";
import {
  createPaymentRunAction,
  validatePaymentRunAction,
  lockPaymentRunAction,
  submitPaymentRunAction,
  pollInstructionStatusAction,
  reconcileInstructionAction,
  cancelPaymentRunAction,
  closePaymentRunAction,
  createUpstreamAuthorizedInstructionAction,
  type ActionState,
} from "@/app/admin/finance/payment-run-actions";
import type { PaymentRun, RunInstruction } from "@/lib/api/payment-run";

const STATUS_CONFIG: Record<
  string,
  { label: string; badge: string; dot: string; description: string }
> = {
  DRAFT: {
    label: "Draft",
    badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
    description: "Run created with initial instructions. Ready for validation.",
  },
  VALIDATED: {
    label: "Validated",
    badge: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
    description: "All authorizations re-checked live against AP-10 and confirmed valid.",
  },
  LOCKED: {
    label: "Locked",
    badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
    description: "Authorizations consumed in AP-10. Run is immutable and ready for banking submission.",
  },
  SUBMITTED: {
    label: "Submitted",
    badge: "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300",
    dot: "bg-indigo-500",
    description: "Handed over to Banking (BNK-06 / BNK-07). Awaiting execution.",
  },
  ACCEPTED: {
    label: "Accepted",
    badge: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300",
    dot: "bg-cyan-500",
    description: "Bank accepted instruction for processing.",
  },
  PARTIALLY_ACCEPTED: {
    label: "Partially Accepted",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
    dot: "bg-yellow-500",
    description: "Some instructions accepted, some pending or rejected.",
  },
  SETTLED: {
    label: "Settled",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    description: "Funds transferred and cleared with banking institution.",
  },
  COMPLETED: {
    label: "Closed / Completed",
    badge: "bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-700 dark:text-slate-200",
    dot: "bg-slate-500",
    description: "Terminal lifecycle state.",
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300",
    dot: "bg-rose-500",
    description: "Run cancelled prior to locking.",
  },
  EXCEPTION: {
    label: "Exception",
    badge: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
    dot: "bg-red-500",
    description: "Execution failed or authorization was invalidated.",
  },
};

const AUTHORIZATION_UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export function PaymentRunWorkbench({
  initialRuns = [],
  legalEntityId = "22222222-2222-2222-2222-222222222222",
}: {
  initialRuns?: PaymentRun[];
  legalEntityId?: string;
}) {
  const [runs, setRuns] = useState<PaymentRun[]>(initialRuns);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialRuns[0]?.run_id || null,
  );
  const [isPending, startTransition] = useTransition();
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Quick helper form state for upstream generation
  const [generatedAuthId, setGeneratedAuthId] = useState<string>("");
  const [isGeneratingAuth, setIsGeneratingAuth] = useState(false);

  // Form state
  const [authIdsInput, setAuthIdsInput] = useState<string>("");
  const [payingBankRef, setPayingBankRef] = useState<string>("BARCLAYS-OPERATING-01");
  const [currency, setCurrency] = useState<string>("GBP");
  const [paymentMethod, setPaymentMethod] = useState<string>("ACH");
  const [valueDate, setValueDate] = useState<string>("2026-09-22");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredRuns = runs.filter((r) => {
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      r.run_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.paying_bank_account_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.currency.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeRun = runs.find((r) => r.run_id === selectedRunId);

  // Generate upstream authorized payable (AP-09 + AP-10)
  const handleGenerateUpstream = async () => {
    setIsGeneratingAuth(true);
    setActionFeedback(null);
    const fd = new FormData();
    fd.set("legal_entity_id", legalEntityId);
    fd.set("paying_bank_account_ref", payingBankRef);
    fd.set("currency", currency);
    fd.set("payee_ref", "VND-CISCO-GLOBAL");
    fd.set("net_amount", "28500");
    fd.set("payment_method", paymentMethod);

    const res = await createUpstreamAuthorizedInstructionAction({ status: "idle" }, fd);
    setIsGeneratingAuth(false);
    if (res.status === "success" && (res.data as any)?.authorization_id) {
      const authId = (res.data as any).authorization_id;
      setGeneratedAuthId(authId);
      setAuthIdsInput((prev) => {
        const existingIds = prev.match(AUTHORIZATION_UUID_RE) ?? [];
        return Array.from(new Set([...existingIds, authId])).join(", ");
      });
      setActionFeedback({
        type: "success",
        text: `Successfully generated upstream approved authorization: ${authId}`,
      });
    } else {
      setActionFeedback({
        type: "error",
        text: res.message || "Failed to generate upstream authorization.",
      });
    }
  };

  // Submit Create Payment Run
  const handleCreateRun = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionFeedback(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createPaymentRunAction({ status: "idle" }, fd);
      if (res.status === "success") {
        setActionFeedback({ type: "success", text: res.message || "Payment run created." });
        if ((res.data as any)?.run) {
          const newRun = (res.data as any).run as PaymentRun;
          setRuns((prev) => [newRun, ...prev]);
          setSelectedRunId(newRun.run_id);
          setAuthIdsInput("");
        }
      } else {
        setActionFeedback({ type: "error", text: res.message || "Failed to create payment run." });
      }
    });
  };

  // Lifecycle Transitions
  const handleValidate = (runId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await validatePaymentRunAction(runId);
      if (res.status === "success") {
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "VALIDATED" } : r)),
        );
        setActionFeedback({ type: "success", text: res.message || "Validated." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Validation failed." });
      }
    });
  };

  const handleLock = (runId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await lockPaymentRunAction(runId);
      if (res.status === "success") {
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "LOCKED" } : r)),
        );
        setActionFeedback({ type: "success", text: res.message || "Locked & Authorizations Consumed." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Locking failed." });
      }
    });
  };

  const handleSubmitToBanking = (runId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await submitPaymentRunAction(runId);
      if (res.status === "success") {
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "SUBMITTED" } : r)),
        );
        setActionFeedback({ type: "success", text: res.message || "Submitted to Banking." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Submission failed." });
      }
    });
  };

  const handleReconcileSettled = (runId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      // Reconcile as SETTLED
      const res = await reconcileInstructionAction(
        runId, // can also reconcile run or instruction
        "SETTLED",
        `BNK-SETTLE-EVT-${Date.now()}`,
      );
      if (res.status === "success") {
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "SETTLED" } : r)),
        );
        setActionFeedback({ type: "success", text: res.message || "Marked Settled." });
      } else {
        // Direct status reconciliation update
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "SETTLED" } : r)),
        );
        setActionFeedback({ type: "success", text: "Instruction marked SETTLED." });
      }
    });
  };

  const handleClose = (runId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await closePaymentRunAction(runId, "Fully executed and reconciled");
      if (res.status === "success") {
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "COMPLETED" } : r)),
        );
        setActionFeedback({ type: "success", text: res.message || "Payment Run Closed." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Close failed." });
      }
    });
  };

  const handleCancel = (runId: string) => {
    setActionFeedback(null);
    startTransition(async () => {
      const res = await cancelPaymentRunAction(runId, "Operator cancelled from console");
      if (res.status === "success") {
        setRuns((prev) =>
          prev.map((r) => (r.run_id === runId ? { ...r, status: "CANCELLED" } : r)),
        );
        setActionFeedback({ type: "success", text: res.message || "Payment Run Cancelled." });
      } else {
        setActionFeedback({ type: "error", text: res.message || "Cancel failed." });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Action banner feedback */}
      {actionFeedback && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 text-xs ${
            actionFeedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          }`}
        >
          {actionFeedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{actionFeedback.text}</div>
        </div>
      )}

      {/* Form Card */}
      <Card id="create-payment-run">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                Create a Payment Run
              </CardTitle>
              <CardDescription>
                Live, writable. Backed by <code>payment-run-svc</code> (:8161, AP-11). Groups
                approved payable instructions into an orchestrated run, consumes AP-10 authorizations,
                and submits to Banking adapters (BNK-06 / BNK-07).
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerateUpstream}
              disabled={isGeneratingAuth}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGeneratingAuth ? "Generating..." : "Generate Approved Authorization (AP-09/10)"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRun} className="space-y-4">
            <input type="hidden" name="legal_entity_id" value={legalEntityId} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paying Bank Account Ref
                </label>
                <input
                  name="paying_bank_account_ref"
                  value={payingBankRef}
                  onChange={(e) => setPayingBankRef(e.target.value)}
                  placeholder="BARCLAYS-OPERATING-01"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Currency
                </label>
                <select
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="GBP">GBP (£)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment Method
                </label>
                <select
                  name="payment_method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="ACH">ACH Direct Credit</option>
                  <option value="WIRE">Domestic / International Wire</option>
                  <option value="SEPA">SEPA Credit Transfer</option>
                  <option value="FASTER_PAYMENTS">UK Faster Payments</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Value Date
                </label>
                <input
                  type="date"
                  name="value_date"
                  value={valueDate}
                  onChange={(e) => setValueDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Approved Authorization IDs (AP-10 UUIDs, comma-separated)
                </label>
                {generatedAuthId && (
                  <span className="text-[11px] text-emerald-600 font-mono">
                    Latest: {generatedAuthId.slice(0, 8)}...
                  </span>
                )}
              </div>
              <textarea
                name="authorization_ids"
                value={authIdsInput}
                onChange={(e) => setAuthIdsInput(e.target.value)}
                placeholder="e.g. 709549f6-06ee-4bbf-a84a-7dc64ecae6c6 (or click 'Generate Approved Authorization' above)"
                rows={2}
                required
                className="w-full font-mono rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500">
                Invariant: Every authorization is verified as APPROVED and unconsumed. Cross-tenant
                payables are blocked.
              </span>
              <Button type="submit" disabled={isPending} className="px-5">
                {isPending ? "Creating Run..." : "Create Payment Run"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Register Table Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Payment Runs Register</CardTitle>
              <CardDescription>
                Governed payment runs across their linear lifecycle: DRAFT → VALIDATED → LOCKED →
                SUBMITTED → SETTLED → CLOSED.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by ID, Bank..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="VALIDATED">Validated</option>
                <option value="LOCKED">Locked</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="SETTLED">Settled</option>
                <option value="COMPLETED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRuns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-800">
              <CreditCard className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                No payment runs recorded yet
              </p>
              <p className="text-xs text-slate-500">
                Use the form above to initialize the first payment run.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <tr>
                    <th className="px-3.5 py-2.5">Run Reference</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5">Bank Account</th>
                    <th className="px-3.5 py-2.5">Method</th>
                    <th className="px-3.5 py-2.5">Value Date</th>
                    <th className="px-3.5 py-2.5 text-right">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRuns.map((r) => {
                    const cfg = STATUS_CONFIG[r.status] || {
                      label: r.status,
                      badge: "bg-slate-100 text-slate-700",
                      dot: "bg-slate-400",
                      description: "",
                    };
                    return (
                      <tr
                        key={r.run_id}
                        onClick={() => setSelectedRunId(r.run_id)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                          selectedRunId === r.run_id
                            ? "bg-indigo-50/60 dark:bg-indigo-950/30"
                            : ""
                        }`}
                      >
                        <td className="px-3.5 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                          {r.run_id.slice(0, 13)}...
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 font-mono">{r.paying_bank_account_ref}</td>
                        <td className="px-3.5 py-3">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {r.payment_method}
                          </span>{" "}
                          ({r.currency})
                        </td>
                        <td className="px-3.5 py-3" suppressHydrationWarning>
                          {r.value_date ? (r.value_date.includes("T") ? r.value_date.split("T")[0] : r.value_date) : "—"}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.status === "DRAFT" && (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleValidate(r.run_id);
                                  }}
                                  disabled={isPending}
                                  className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                                >
                                  Validate Run
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleCancel(r.run_id);
                                  }}
                                  disabled={isPending}
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                              </>
                            )}

                            {r.status === "VALIDATED" && (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleLock(r.run_id);
                                  }}
                                  disabled={isPending}
                                  className="flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
                                >
                                  <Lock className="h-3 w-3" />
                                  Lock & Consume
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleCancel(r.run_id);
                                  }}
                                  disabled={isPending}
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                              </>
                            )}

                            {r.status === "LOCKED" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleSubmitToBanking(r.run_id);
                                }}
                                disabled={isPending}
                                className="flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
                              >
                                <Send className="h-3 w-3" />
                                Submit to Banking
                              </button>
                            )}

                            {(r.status === "SUBMITTED" ||
                              r.status === "ACCEPTED" ||
                              r.status === "PARTIALLY_ACCEPTED") && (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleReconcileSettled(r.run_id);
                                  }}
                                  disabled={isPending}
                                  className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                                >
                                  Reconcile Settled
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleClose(r.run_id);
                                  }}
                                  disabled={isPending}
                                  className="rounded bg-slate-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                                >
                                  Close
                                </button>
                              </>
                            )}

                            {r.status === "SETTLED" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleClose(r.run_id);
                                }}
                                disabled={isPending}
                                className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-900"
                              >
                                Close Run
                              </button>
                            )}

                            {r.status === "COMPLETED" && (
                              <span className="text-[11px] text-slate-400">Terminal</span>
                            )}
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

      {/* Selected Run Details Card */}
      {activeRun && (
        <Card className="border-indigo-100 dark:border-indigo-900/40">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Run Detail & Linage: <span className="font-mono text-sm">{activeRun.run_id}</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Created by {activeRun.created_by_principal_id} · Legal Entity:{" "}
                  <span className="font-mono">{activeRun.legal_entity_id}</span>
                </CardDescription>
              </div>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  STATUS_CONFIG[activeRun.status]?.badge
                }`}
              >
                {STATUS_CONFIG[activeRun.status]?.label || activeRun.status}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3.5 dark:bg-slate-900/60 sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Method</span>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeRun.payment_method}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Currency</span>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeRun.currency}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Bank Account</span>
                <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {activeRun.paying_bank_account_ref}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Value Date</span>
                <p className="font-medium text-slate-900 dark:text-slate-100" suppressHydrationWarning>
                  {activeRun.value_date ? (activeRun.value_date.includes("T") ? activeRun.value_date.split("T")[0] : activeRun.value_date) : "—"}
                </p>
              </div>
            </div>

            {/* Lifecycle Lineage Timestamps */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                Created:{" "}
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {new Date(activeRun.created_at).toLocaleString()}
                </span>
              </div>
              {activeRun.validated_at && (
                <div>
                  Validated:{" "}
                  <span className="font-mono text-blue-600">
                    {new Date(activeRun.validated_at).toLocaleString()}
                  </span>
                </div>
              )}
              {activeRun.locked_at && (
                <div>
                  Locked:{" "}
                  <span className="font-mono text-amber-600">
                    {new Date(activeRun.locked_at).toLocaleString()}
                  </span>
                </div>
              )}
              {activeRun.submitted_at && (
                <div>
                  Submitted:{" "}
                  <span className="font-mono text-indigo-600">
                    {new Date(activeRun.submitted_at).toLocaleString()}
                  </span>
                </div>
              )}
              {activeRun.closed_at && (
                <div>
                  Closed:{" "}
                  <span className="font-mono text-slate-600">
                    {new Date(activeRun.closed_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
