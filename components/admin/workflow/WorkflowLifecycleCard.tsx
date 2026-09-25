"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, PlayCircle, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { LookupById } from "@/components/admin/shared";
import {
  initiateWorkflowAction,
  submitWorkflowDecisionAction,
  lookupWorkflowHistory,
  type WorkflowInitiateState,
  type WorkflowDecisionState,
} from "@/app/admin/commercial-ops/actions";

const IDLE_INITIATE: WorkflowInitiateState = { status: "idle" };
const IDLE_DECISION: WorkflowDecisionState = { status: "idle" };

export function WorkflowLifecycleCard() {
  const [initiateState, initiateSubmit, initiatePending] = useActionState(
    initiateWorkflowAction,
    IDLE_INITIATE
  );

  const [decisionState, decisionSubmit, decisionPending] = useActionState(
    submitWorkflowDecisionAction,
    IDLE_DECISION
  );

  return (
    <div className="space-y-6">
      {/* ── Step 1: Initiate Workflow ────────────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-800 dark:bg-navy-800 dark:text-navy-200">
              1
            </span>
            <div>
              <CardTitle>Initiate a Governed Workflow (workflow-svc :8090)</CardTitle>
              <CardDescription>
                Create a new multi-stage approval instance. Emits <code className="font-mono text-xs text-navy-700 dark:text-navy-300">workflow.started</code> to Kafka.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={initiateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="workflow_type" className={LABEL}>
                  Workflow Type
                </label>
                <select id="workflow_type" name="workflow_type" defaultValue="PURCHASE_APPROVAL" className={FIELD}>
                  <option value="PURCHASE_APPROVAL">PURCHASE_APPROVAL</option>
                  <option value="CAPEX_AUTHORIZATION">CAPEX_AUTHORIZATION</option>
                  <option value="EXPENSE_REIMBURSEMENT">EXPENSE_REIMBURSEMENT</option>
                </select>
                <p className={HINT}>Standard governance workflow type</p>
              </div>

              <div>
                <label htmlFor="stage_name" className={LABEL}>
                  Initial Stage Name
                </label>
                <input
                  id="stage_name"
                  name="stage_name"
                  defaultValue="Manager Review & Approval"
                  placeholder="e.g. Finance Approval"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Approval gateway title</p>
              </div>

              <div>
                <label htmlFor="approver_principal_id" className={LABEL}>
                  Designated Approver (SoD Enforced)
                </label>
                <select
                  id="approver_principal_id"
                  name="approver_principal_id"
                  defaultValue="55555555-5555-5555-5555-555555555555"
                  className={FIELD}
                >
                  <option value="55555555-5555-5555-5555-555555555555">Elena Rostova (CFO / Finance Lead)</option>
                  <option value="44444444-4444-4444-4444-444444444444">Dr. Alistair Vance (Tax Governance Lead)</option>
                </select>
                <p className={HINT}>Must differ from initiator (Lingaraj)</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={initiatePending} size="sm">
                <PlayCircle className="mr-1.5 h-4 w-4" />
                {initiatePending ? "Initiating…" : "Initiate Workflow"}
              </Button>
            </div>

            {initiateState.status === "created" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Workflow Initiated Successfully!</span>
                </div>
                <p className="text-xs">
                  Event <code className="font-mono font-bold">workflow.started</code> published to Kafka topic <code className="font-mono">zoiko.workflow.events</code>.
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-semibold">Workflow Instance ID:</span>
                  <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                    {initiateState.instanceId}
                  </code>
                </div>
              </div>
            )}

            {initiateState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{initiateState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 2: Submit Decision / Approve ─────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-800 dark:bg-navy-800 dark:text-navy-200">
              2
            </span>
            <div>
              <CardTitle>Submit Workflow Decision / Approval</CardTitle>
              <CardDescription>
                Decide a pending stage. Emits <code className="font-mono text-xs text-navy-700 dark:text-navy-300">approval.granted</code> with comments to Kafka.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={decisionSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="decision_workflow_id" className={LABEL}>
                  Workflow Instance ID <span className="text-slate-400">(from Step 1)</span>
                </label>
                <input
                  id="decision_workflow_id"
                  name="workflow_instance_id"
                  defaultValue={initiateState.instanceId ?? ""}
                  placeholder="Paste UUID from Step 1"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>The workflow instance to decide</p>
              </div>

              <div>
                <label htmlFor="decision_action" className={LABEL}>
                  Decision Action
                </label>
                <select id="decision_action" name="decision_action" defaultValue="APPROVE" className={FIELD}>
                  <option value="APPROVE">APPROVE (Grant Approval)</option>
                  <option value="REJECT">REJECT (Decline Requisition)</option>
                </select>
                <p className={HINT}>Executed as Elena Rostova (CFO)</p>
              </div>

              <div>
                <label htmlFor="comments" className={LABEL}>
                  Approval Comments / Rationale
                </label>
                <input
                  id="comments"
                  name="comments"
                  defaultValue="Approved within Q3 hardware budget limits"
                  placeholder="Enter comments or audit rationale"
                  className={FIELD}
                />
                <p className={HINT}>Audit justification stored with event</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={decisionPending} size="sm">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {decisionPending ? "Submitting…" : "Submit Decision"}
              </Button>
            </div>

            {decisionState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{decisionState.message}</span>
              </div>
            )}

            {decisionState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{decisionState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 3: Query Workflow History ────────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-800 dark:bg-navy-800 dark:text-navy-200">
              3
            </span>
            <div>
              <CardTitle>Look up Workflow History (workflow-history-svc :8097)</CardTitle>
              <CardDescription>
                Durable audit verification: Query the append-only transition log stored from Kafka by <code className="font-mono text-xs">workflow-history-svc</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LookupById
            action={lookupWorkflowHistory}
            inputName="lookup_workflow_id"
            label="Workflow instance ID (UUID)"
            placeholder="Paste your generated workflow instance ID"
            hint="Inspect all transitions, approval stages, comments, and event payloads recorded by workflow-history-svc."
            buttonLabel="Look up History"
          />
        </CardContent>
      </Card>
    </div>
  );
}
