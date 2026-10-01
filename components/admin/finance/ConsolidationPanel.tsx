"use client";

import { useActionState } from "react";
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FileCheck,
  RotateCcw,
  Search,
  Building2,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared/JsonBlock";
import { ResultBanner } from "@/components/admin/shared/ResultBanner";
import {
  startConsolidationRunAction,
  createEliminationProposalAction,
  approveConsolidationAdjustmentAction,
  postConsolidationAdjustmentAction,
  reverseConsolidationAdjustmentAction,
  lookupConsolidationRunAction,
  lookupConsolidationAdjustmentAction,
  type ConsolidationRunActionState,
  type ConsolidationAdjustmentActionState,
} from "@/app/admin/finance/consolidation-actions";
import { IDLE_LOOKUP, type LookupState } from "@/components/admin/shared/lookup";

const IDLE_RUN: ConsolidationRunActionState = { status: "idle" };
const IDLE_ADJ: ConsolidationAdjustmentActionState = { status: "idle" };

export function ConsolidationPanel() {
  const [runState, runSubmit, runPending] = useActionState(
    startConsolidationRunAction,
    IDLE_RUN
  );

  const [proposalState, proposalSubmit, proposalPending] = useActionState(
    createEliminationProposalAction,
    IDLE_ADJ
  );

  const [approveState, approveSubmit, approvePending] = useActionState(
    approveConsolidationAdjustmentAction,
    IDLE_ADJ
  );

  const [postState, postSubmit, postPending] = useActionState(
    postConsolidationAdjustmentAction,
    IDLE_ADJ
  );

  const [reverseState, reverseSubmit, reversePending] = useActionState(
    reverseConsolidationAdjustmentAction,
    IDLE_ADJ
  );

  const [lookupRunState, lookupRunSubmit, lookupRunPending] = useActionState(
    lookupConsolidationRunAction,
    IDLE_LOOKUP
  );

  const [lookupAdjState, lookupAdjSubmit, lookupAdjPending] = useActionState(
    lookupConsolidationAdjustmentAction,
    IDLE_LOOKUP
  );

  return (
    <div className="space-y-6" id="consolidation-service">
      {/* ── Step 1: Start Consolidation Run ───────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>1. Initiate Group Consolidation Run (consolidation-svc :8106)</CardTitle>
              <CardDescription>
                ACC-13: Queries trial balances across group subsidiaries in <code className="font-mono text-xs">general-ledger-svc (:8098)</code>, eliminates reciprocal balances from <code className="font-mono text-xs">intercompany-accounting-svc (:8105)</code>, and generates cryptographically signed snapshots.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={runSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cons_group_legal_entity_id" className={LABEL}>
                  Parent Group Legal Entity ID
                </label>
                <select id="cons_group_legal_entity_id" name="group_legal_entity_id" defaultValue="22222222-2222-2222-2222-222222222222" className={FIELD}>
                  <option value="22222222-2222-2222-2222-222222222222">US Operations Corp (22222222-2222-2222-2222-222222222222)</option>
                  <option value="11111111-1111-1111-1111-111111111111">UK Operating Entity (11111111-1111-1111-1111-111111111111)</option>
                </select>
                <p className={HINT}>Parent consolidation book entity</p>
              </div>

              <div>
                <label htmlFor="cons_child_legal_entity_ids" className={LABEL}>
                  Subsidiary Child Legal Entity IDs (comma-separated)
                </label>
                <input
                  id="cons_child_legal_entity_ids"
                  name="child_legal_entity_ids"
                  defaultValue="11111111-1111-1111-1111-111111111111"
                  placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>Child subsidiaries whose trial balances are rolled up</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cons_fiscal_period" className={LABEL}>
                  Fiscal Period
                </label>
                <input
                  id="cons_fiscal_period"
                  name="fiscal_period"
                  defaultValue="2026-Q1"
                  placeholder="e.g. 2026-Q1"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Fiscal period for consolidation rollup</p>
              </div>

              <div>
                <label htmlFor="cons_target_currency" className={LABEL}>
                  Target Presentation Currency
                </label>
                <select id="cons_target_currency" name="target_currency" defaultValue="GBP" className={FIELD}>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
                <p className={HINT}>Group reporting presentation currency</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={runPending} size="sm">
                <Layers className="mr-1.5 h-4 w-4" />
                {runPending ? "Consolidating…" : "Run Group Consolidation"}
              </Button>
            </div>

            {runState.status === "success" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{runState.message}</span>
                </div>
                {runState.runId && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">Consolidation Run ID:</span>
                    <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                      {runState.runId}
                    </code>
                  </div>
                )}
              </div>
            )}

            {runState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{runState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 2: Create Elimination Proposal ───────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>2. Propose Elimination / Consolidation Adjustment (ACC-12)</CardTitle>
              <CardDescription>
                Propose governed top-side elimination adjustment. Must balance, must target an entity with a completed run, and cannot exceed matched intercompany balances.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={proposalSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="adj_group_legal_entity_id" className={LABEL}>
                  Group Legal Entity ID
                </label>
                <select id="adj_group_legal_entity_id" name="group_legal_entity_id" defaultValue="22222222-2222-2222-2222-222222222222" className={FIELD}>
                  <option value="22222222-2222-2222-2222-222222222222">US Operations Corp (22222222-2222-2222-2222-222222222222)</option>
                  <option value="11111111-1111-1111-1111-111111111111">UK Operating Entity (11111111-1111-1111-1111-111111111111)</option>
                </select>
              </div>

              <div>
                <label htmlFor="adj_fiscal_period" className={LABEL}>
                  Fiscal Period
                </label>
                <input
                  id="adj_fiscal_period"
                  name="fiscal_period"
                  defaultValue="2026-Q1"
                  className={FIELD}
                  required
                />
              </div>

              <div>
                <label htmlFor="adj_adjustment_type" className={LABEL}>
                  Adjustment Type
                </label>
                <select id="adj_adjustment_type" name="adjustment_type" defaultValue="MANUAL" className={FIELD}>
                  <option value="MANUAL">MANUAL (Top-Side Reclassification)</option>
                  <option value="ELIMINATION">ELIMINATION (Intercompany Elimination)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="adj_description" className={LABEL}>
                Description / Rationale
              </label>
              <input
                id="adj_description"
                name="description"
                defaultValue="Top-side consolidation adjustment: Intercompany management fee elimination"
                className={FIELD}
                required
              />
            </div>

            {/* Line 1 */}
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 space-y-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Adjustment Line 1</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  id="account_code_1"
                  name="account_code_1"
                  defaultValue="2010"
                  placeholder="Account Code (e.g. 2010)"
                  className={FIELD}
                  required
                />
                <input
                  id="debit_amount_1"
                  name="debit_amount_1"
                  type="number"
                  step="0.01"
                  defaultValue="75000.00"
                  placeholder="Debit Amount"
                  className={FIELD}
                  required
                />
                <input
                  id="credit_amount_1"
                  name="credit_amount_1"
                  type="number"
                  step="0.01"
                  defaultValue="0.00"
                  placeholder="Credit Amount"
                  className={FIELD}
                  required
                />
              </div>
            </div>

            {/* Line 2 */}
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 space-y-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Adjustment Line 2</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  id="account_code_2"
                  name="account_code_2"
                  defaultValue="1010"
                  placeholder="Account Code (e.g. 1010)"
                  className={FIELD}
                  required
                />
                <input
                  id="debit_amount_2"
                  name="debit_amount_2"
                  type="number"
                  step="0.01"
                  defaultValue="0.00"
                  placeholder="Debit Amount"
                  className={FIELD}
                  required
                />
                <input
                  id="credit_amount_2"
                  name="credit_amount_2"
                  type="number"
                  step="0.01"
                  defaultValue="75000.00"
                  placeholder="Credit Amount"
                  className={FIELD}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={proposalPending} size="sm">
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                {proposalPending ? "Submitting…" : "Create Adjustment Proposal"}
              </Button>
            </div>

            {proposalState.status === "success" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{proposalState.message}</span>
                </div>
                {proposalState.adjustmentId && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">Adjustment ID:</span>
                    <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                      {proposalState.adjustmentId}
                    </code>
                  </div>
                )}
              </div>
            )}

            {proposalState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{proposalState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 3: Governance & Lifecycle Transitions ────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>3. Governance & Lifecycle Actions (Approve, Post to GL, Reverse)</CardTitle>
              <CardDescription>
                Enforces maker/checker separation, posts approved adjustments into <code className="font-mono text-xs">general-ledger-svc (:8098)</code>, or executes auditable reversals.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 3a: Maker/Checker Approve form */}
          <form action={approveSubmit} className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="approve_adjustment_id" className={LABEL}>
                  Adjustment ID (to Approve)
                </label>
                <input
                  id="approve_adjustment_id"
                  name="adjustment_id"
                  defaultValue={proposalState.adjustmentId ?? ""}
                  placeholder="Paste Adjustment UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>Must be in PENDING_APPROVAL status</p>
              </div>

              <div>
                <label htmlFor="approver_principal_id" className={LABEL}>
                  Approver Principal (Maker/Checker SoD Reviewer)
                </label>
                <select
                  id="approver_principal_id"
                  name="approver_principal_id"
                  defaultValue="55555555-5555-5555-5555-555555555555"
                  className={FIELD}
                >
                  <option value="55555555-5555-5555-5555-555555555555">
                    Elena Rostova (CFO / Finance Lead)
                  </option>
                  <option value="33333333-3333-3333-3333-333333333333">
                    Lingaraj (Platform Administrator)
                  </option>
                  <option value="99999999-9999-9999-9999-999999999999">
                    Dr. Maya Lin (Audit & Security Officer)
                  </option>
                </select>
                <p className={HINT}>Must differ from adjustment creator to satisfy SoD</p>
              </div>
            </div>

            <Button type="submit" size="sm" loading={approvePending} className="bg-blue-600 hover:bg-blue-700">
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {approvePending ? "Approving…" : "Approve Consolidation Adjustment"}
            </Button>

            {approveState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{approveState.message}</span>
              </div>
            )}
            {approveState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{approveState.message}</span>
              </div>
            )}
          </form>

          {/* Post to GL form */}
          <form action={postSubmit} className="space-y-3">
            <div>
              <label htmlFor="post_adjustment_id" className={LABEL}>
                Consolidation Adjustment ID (to Post to GL)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="post_adjustment_id"
                  name="adjustment_id"
                  defaultValue={proposalState.adjustmentId ?? ""}
                  placeholder="Paste Adjustment UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <Button type="submit" size="sm" loading={postPending} className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
                  <FileCheck className="mr-1.5 h-4 w-4" />
                  {postPending ? "Posting…" : "Post to GL Consolidation Book"}
                </Button>
              </div>
            </div>

            {postState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{postState.message}</span>
              </div>
            )}
            {postState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{postState.message}</span>
              </div>
            )}
          </form>

          {/* Reverse form */}
          <form action={reverseSubmit} className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reverse_adjustment_id" className={LABEL}>
                  Adjustment ID (to Reverse)
                </label>
                <input
                  id="reverse_adjustment_id"
                  name="adjustment_id"
                  defaultValue={proposalState.adjustmentId ?? ""}
                  placeholder="Paste Adjustment UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
              </div>

              <div>
                <label htmlFor="reversal_reason" className={LABEL}>
                  Reversal Audit Reason
                </label>
                <input
                  id="reversal_reason"
                  name="reversal_reason"
                  defaultValue="Audit adjustment: Recalibrated subsidiary management allocation spread"
                  className={FIELD}
                  required
                />
              </div>

              <div>
                <label htmlFor="superseded_by_adjustment_id" className={LABEL}>
                  Superseding Replacement Adjustment ID (Optional)
                </label>
                <input
                  id="superseded_by_adjustment_id"
                  name="superseded_by_adjustment_id"
                  placeholder="Leave blank unless snapshot exists"
                  className={`${FIELD} font-mono text-xs`}
                />
                <p className={HINT}>Required only if a signed snapshot already exists for this period</p>
              </div>
            </div>

            <Button type="submit" size="sm" loading={reversePending} variant="secondary" className="border-rose-300 text-rose-800 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300">
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {reversePending ? "Reversing…" : "Reverse Adjustment"}
            </Button>

            {reverseState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{reverseState.message}</span>
              </div>
            )}
            {reverseState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{reverseState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 4: Audit Lookup & Snapshot Verification ──────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>4. Look up Consolidation Run & Signed Snapshots</CardTitle>
              <CardDescription>
                Queries live database state, cryptographic HMAC-SHA256 signatures, and child entity balance contributions in <code className="font-mono text-xs">consolidation-svc (:8106)</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={lookupRunSubmit} className="space-y-4">
            <div>
              <label htmlFor="lookup_run_id" className={LABEL}>
                Consolidation Run ID (UUID)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="lookup_run_id"
                  name="lookup_run_id"
                  defaultValue={runState.runId ?? ""}
                  placeholder="Paste Consolidation Run UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <Button type="submit" size="sm" loading={lookupRunPending} className="shrink-0">
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  {lookupRunPending ? "Reading…" : "Look up Run & Snapshots"}
                </Button>
              </div>
            </div>

            <ResultBanner tone={lookupRunState.status === "found" ? "success" : lookupRunState.status === "error" ? "error" : "neutral"} message={lookupRunState.message}>
              {lookupRunState.status === "found" && <JsonBlock value={lookupRunState.record} />}
            </ResultBanner>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
