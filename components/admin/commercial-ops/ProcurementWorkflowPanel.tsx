import { cookies } from "next/headers";
import { CloudOff, GitBranch, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listProcurementCases,
  explainProcurementCaseError,
  type ProcurementCaseStatus,
} from "@/lib/api/commercial-ops";
import { formatMoney } from "@/lib/format";
import { OpenProcurementCaseForm, ProcurementCaseActions } from "./ProcurementCaseForms";

const STATUS_COLORS: Record<ProcurementCaseStatus, string> = {
  REQUESTED: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  SPEND_BLOCKED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  APPROVAL_PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  APPROVED: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};

/**
 * Procurement cases from procurement-workflow-svc (/v1/procurement-cases):
 * open a case (spend-checked on create), approve or reject it, then issue the
 * purchase order, which completes the case.
 */
export async function ProcurementWorkflowPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view procurement cases."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const res = await listProcurementCases(identity);

  return (
    <div className="space-y-6">
      <OpenProcurementCaseForm />

      {!res.ok ? (
        <PanelEmptyState
          icon={CloudOff}
          tone="warning"
          label="Procurement cases unavailable"
          hint={explainProcurementCaseError(res.error.message)}
        />
      ) : res.data.length === 0 ? (
        <PanelEmptyState
          icon={GitBranch}
          tone="neutral"
          label="No procurement cases yet"
          hint="Open one above. It is spend-checked as soon as it is created."
        />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {res.data.map((c) => (
            <div key={c.case_id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {c.description}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? STATUS_COLORS.REQUESTED}`}
                    >
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {c.category} · spend check {c.spend_check_decision || "—"}
                    {c.spend_check_basis ? ` (${c.spend_check_basis})` : ""}
                    {c.rejection_reason ? ` · rejected: ${c.rejection_reason}` : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {c.case_id}
                    {c.purchase_order_id ? ` → PO ${c.purchase_order_id}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  {formatMoney(c.amount, c.currency_code)}
                </span>
              </div>
              <ProcurementCaseActions
                caseId={c.case_id}
                status={c.status}
                isRequester={c.requested_by_principal_id === session.principalId}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
