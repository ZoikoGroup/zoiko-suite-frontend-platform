"use client";

import { useActionState, useState } from "react";
import {
  createInvoiceApprovalAction,
  submitApprovalDecisionAction,
  lookupInvoiceApprovalAction,
  type InvoiceApprovalActionState,
  type DecisionActionState,
  type LookupApprovalActionState,
} from "@/app/admin/commercial-ops/invoice-approval-actions";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  FileCheck2,
  FileX2,
  Search,
  ArrowRight,
  UserCheck,
  Building2,
  Workflow,
  Copy,
  Check,
} from "lucide-react";

const initialCreateState: InvoiceApprovalActionState = { status: "idle" };
const initialDecisionState: DecisionActionState = { status: "idle" };
const initialLookupState: LookupApprovalActionState = { status: "idle" };

export function InvoiceApprovalPanel() {
  const [activeTab, setActiveTab] = useState<"initiate" | "decide" | "lookup">("initiate");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [createState, createAction, isCreating] = useActionState(
    createInvoiceApprovalAction,
    initialCreateState
  );

  const [decisionState, decisionAction, isDeciding] = useActionState(
    submitApprovalDecisionAction,
    initialDecisionState
  );

  const [lookupState, lookupAction, isLookingUp] = useActionState(
    lookupInvoiceApprovalAction,
    initialLookupState
  );

  const copyToClipboard = (text: string, idKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idKey);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" id="invoice-approval-panel">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Invoice Approval &amp; Multi-Step Governance Engine
            </h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              invoice-approval-svc :8107
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Governs multi-stage approval routing for vendor invoices from <code className="font-mono text-amber-700 dark:text-amber-400">accounts-payable-svc (:8099)</code>, enforces Segregation of Duties (SoD / 4-Eyes Principle), and correlates with <code className="font-mono text-amber-700 dark:text-amber-400">workflow-svc (:8090)</code>.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("initiate")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "initiate"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            1. Initiate Approval
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("decide")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "decide"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            2. Decide (Approve/Reject)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("lookup")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "lookup"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            3. Verify &amp; Audit Trail
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* ── TAB 1: INITIATE INVOICE APPROVAL ── */}
        {activeTab === "initiate" && (
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Initiate New Approval Workflow
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Submit an invoice created in Accounts Payable to invoice-approval-svc (:8107). Authorization checks <code className="font-mono text-xs">INVOICE_APPROVAL_INITIATE</code>.
              </p>
            </div>

            <form action={createAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Vendor Invoice ID (UUID from accounts-payable-svc)
                  </label>
                  <input
                    type="text"
                    name="invoice_id"
                    required
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    defaultValue={createState.request?.invoice_id || ""}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    Must match an invoice in <code className="font-mono">accounts-payable-svc (:8099)</code> recorded via the Finance page.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Legal Entity ID
                  </label>
                  <input
                    type="text"
                    name="legal_entity_id"
                    required
                    defaultValue="22222222-2222-2222-2222-222222222222"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Invoice Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      name="invoice_amount"
                      required
                      placeholder="45000.00"
                      defaultValue="45000.00"
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Currency Code
                    </label>
                    <select
                      name="currency_code"
                      defaultValue="GBP"
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="GBP">GBP (£)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Required Approval Steps (Routing Hierarchy)
                  </label>
                  <select
                    name="total_steps"
                    defaultValue="1"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="1">1 Step — Single Approval Gate (Standard)</option>
                    <option value="2">2 Steps — Dual Approval (Manager + Finance Director)</option>
                    <option value="3">3 Steps — Executive Escalation Gate</option>
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    Sets <code className="font-mono">total_steps</code>. Each approval advances <code className="font-mono">current_step</code> until final completion.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
                >
                  {isCreating ? "Initiating in invoice-approval-svc..." : "Initiate Approval Request"}
                </button>
              </div>
            </form>

            {/* Create Result Banner */}
            {createState.status === "success" && createState.request && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div className="w-full text-xs text-emerald-900 dark:text-emerald-200">
                    <p className="font-semibold text-sm">{createState.message}</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 font-mono text-[11px] bg-white/70 p-3 rounded border border-emerald-100 dark:bg-slate-900/60 dark:border-slate-800">
                      <div>
                        <span className="text-slate-500">Approval Request ID:</span>
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                          <span className="truncate">{createState.request.approval_request_id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(createState.request!.approval_request_id, "reqId")}
                            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                            title="Copy ID"
                          >
                            {copiedId === "reqId" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Status:</span>
                        <div className="font-bold text-amber-700 dark:text-amber-400">
                          {createState.request.status} (Step {createState.request.current_step} of {createState.request.total_steps})
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Workflow Instance ID:</span>
                        <div className="truncate text-slate-700 dark:text-slate-300">
                          {createState.request.workflow_instance_id}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("decide")}
                        className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                      >
                        Proceed to Decision Tab <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {createState.status === "error" && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Initiation Failed:
                </div>
                <p className="mt-1">{createState.message}</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: SUBMIT DECISION (APPROVE / REJECT) ── */}
        {activeTab === "decide" && (
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Submit Multi-Step Approval Decision
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Execute an approval or rejection on an active request. Demonstrates Segregation of Duties (SoD / 4-Eyes Principle) and authorization gate <code className="font-mono text-xs">INVOICE_APPROVAL_DECIDE</code>.
              </p>
            </div>

            <form action={decisionAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Approval Request ID (UUID)
                  </label>
                  <input
                    type="text"
                    name="approval_request_id"
                    required
                    placeholder="Enter approval_request_id"
                    defaultValue={createState.request?.approval_request_id || ""}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Decision Action
                  </label>
                  <select
                    name="decision"
                    defaultValue="APPROVED"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="APPROVED">APPROVE (Advance Step / Finalize)</option>
                    <option value="REJECTED">REJECT (Terminal Refusal with Audit Reason)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Deciding Principal Identity (Segregation of Duties)
                  </label>
                  <select
                    name="actor_mode"
                    defaultValue="sod"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="sod">
                      SoD Approver (66666666-6666... — Positive Case: Valid 4-Eyes Compliance)
                    </option>
                    <option value="self">
                      Request Creator / Super Admin (33333333-3333... — Negative Case: Self-Approval Blocked)
                    </option>
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-300">Anti-Fraud Protection:</strong> Service enforces <code className="font-mono">self_approval_not_allowed</code> if creator attempts to approve their own request.
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Governance Decision Reason &amp; Audit Notes
                  </label>
                  <textarea
                    name="decision_reason"
                    required
                    rows={2}
                    placeholder="e.g. Three-way match verified against Purchase Order PO-2026-089 and delivery acceptance receipt."
                    defaultValue="Three-way match verified against PO and warehouse receiving note. Budget within limit."
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  disabled={isDeciding}
                  className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 disabled:opacity-50 dark:bg-navy-600 dark:hover:bg-navy-500"
                >
                  {isDeciding ? "Recording Decision in Service..." : "Submit Decision"}
                </button>
              </div>
            </form>

            {/* Decision Result Banner */}
            {decisionState.status === "success" && decisionState.request && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div className="w-full text-xs text-emerald-900 dark:text-emerald-200">
                    <p className="font-semibold text-sm">{decisionState.message}</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 font-mono text-[11px] bg-white/70 p-3 rounded border border-emerald-100 dark:bg-slate-900/60 dark:border-slate-800">
                      <div>
                        <span className="text-slate-500">Updated Status:</span>
                        <div className={`font-bold ${decisionState.request.status === "APPROVED" ? "text-emerald-700 dark:text-emerald-400" : decisionState.request.status === "REJECTED" ? "text-red-700 dark:text-red-400" : "text-amber-700"}`}>
                          {decisionState.request.status}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Step Progress:</span>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          Step {decisionState.request.current_step} of {decisionState.request.total_steps}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Updated At:</span>
                        <div className="text-slate-700 dark:text-slate-300 truncate">
                          {new Date(decisionState.request.updated_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("lookup")}
                        className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                      >
                        Inspect Decision Audit Trail <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {decisionState.status === "error" && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Decision Refused:
                </div>
                <p className="mt-1 font-mono">{decisionState.message}</p>
                {decisionState.message?.includes("self_approval_not_allowed") && (
                  <p className="mt-2 text-slate-600 dark:text-slate-400">
                    💡 <strong>Test Case Passed:</strong> Segregation of duties invariant successfully guarded. To approve, switch Deciding Principal to &ldquo;SoD Approver&rdquo;.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: LOOKUP & AUDIT TRAIL ── */}
        {activeTab === "lookup" && (
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Look up Approval Request &amp; Decisions Audit Trail
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct read from <code className="font-mono text-xs">invoice-approval-svc (:8107)</code> at <code className="font-mono text-xs">GET /v1/invoice-approvals/&#123;id&#125;</code>.
              </p>
            </div>

            <form action={lookupAction} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  name="lookup_request_id"
                  required
                  placeholder="Enter approval_request_id (UUID)"
                  defaultValue={decisionState.requestId || createState.requestId || ""}
                  className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-mono text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={isLookingUp}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {isLookingUp ? "Fetching..." : "Look up"}
              </button>
            </form>

            {lookupState.status === "success" && lookupState.data && (
              <div className="mt-5 space-y-4">
                {/* Request Details */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                        Approval Request Record
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          lookupState.data.request.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : lookupState.data.request.status === "REJECTED"
                            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {lookupState.data.request.status}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-slate-500">
                      Step {lookupState.data.request.current_step} of {lookupState.data.request.total_steps}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">Approval Request ID:</span>
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-200 break-all">
                        {lookupState.data.request.approval_request_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Linked AP Invoice ID:</span>
                      <span className="font-mono font-medium text-amber-700 dark:text-amber-400 break-all">
                        {lookupState.data.request.invoice_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Invoice Amount:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {lookupState.data.request.currency_code} {lookupState.data.request.invoice_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Workflow Instance ID:</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 break-all">
                        {lookupState.data.request.workflow_instance_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Created By Principal:</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 break-all">
                        {lookupState.data.request.created_by_principal_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Created At:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {new Date(lookupState.data.request.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Last Updated:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {new Date(lookupState.data.request.updated_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Decisions Log */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h5 className="font-semibold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3">
                    Decision Audit Chain ({lookupState.data.decisions.length} recorded)
                  </h5>

                  {lookupState.data.decisions.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No decisions submitted yet — request is waiting in PENDING.</p>
                  ) : (
                    <div className="space-y-2">
                      {lookupState.data.decisions.map((dec, idx) => (
                        <div
                          key={dec.approval_decision_id || idx}
                          className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  dec.decision === "APPROVED"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                }`}
                              >
                                {dec.decision}
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                Step #{dec.step_number}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono text-slate-500 text-[11px]">
                                Decider: {dec.decided_by_principal_id}
                              </span>
                            </div>
                            <p className="mt-1.5 text-slate-600 dark:text-slate-300 italic">
                              &ldquo;{dec.decision_reason}&rdquo;
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {new Date(dec.decided_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {lookupState.status === "error" && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Lookup Failed:
                </div>
                <p className="mt-1">{lookupState.message}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
