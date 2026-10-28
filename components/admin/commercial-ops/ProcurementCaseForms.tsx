"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  openProcurementCase,
  approveCase,
  rejectCase,
  issueCaseOrder,
} from "@/app/admin/commercial-ops/actions";
import {
  CURRENCIES,
  IDLE_PROCUREMENT_CASE_STATE,
  type ProcurementCaseActionState,
} from "@/app/admin/commercial-ops/state";
import type { ProcurementCaseStatus } from "@/lib/api/commercial-ops";

const FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

function Feedback({ state }: { state: ProcurementCaseActionState }) {
  if (state.status === "idle") return null;
  const isError = state.status === "error";
  const Icon = isError ? AlertCircle : state.status === "replayed" ? Info : CheckCircle2;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="break-words">{state.message}</span>
    </div>
  );
}

/** Open a procurement case. The spend check runs as part of the create. */
export function OpenProcurementCaseForm() {
  const [state, action, pending] = useActionState<ProcurementCaseActionState, FormData>(
    openProcurementCase,
    IDLE_PROCUREMENT_CASE_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="case_description" className={LABEL}>
            What is being procured
          </label>
          <input id="case_description" name="description" required className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="case_category" className={LABEL}>
            Spend category
          </label>
          <input
            id="case_category"
            name="category"
            required
            placeholder="SOFTWARE"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="case_amount" className={LABEL}>
              Amount
            </label>
            <input
              id="case_amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="case_currency" className={LABEL}>
              Currency
            </label>
            <select id="case_currency" name="currency_code" defaultValue="USD" className={FIELD}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="case_vendor" className={LABEL}>
            Vendor profile ID <span className="font-normal text-slate-400">(optional, UUID)</span>
          </label>
          <input id="case_vendor" name="vendor_profile_id" className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          {pending ? "Opening…" : "Open case"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Checked against the category&apos;s spend limit immediately — over the limit lands SPEND_BLOCKED
        </p>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Row actions for one case, offered only from the status that allows them. */
export function ProcurementCaseActions({
  caseId,
  status,
  isRequester,
}: {
  caseId: string;
  status: ProcurementCaseStatus;
  isRequester: boolean;
}) {
  const [approveState, approveAction, approvePending] = useActionState<ProcurementCaseActionState, FormData>(
    approveCase,
    IDLE_PROCUREMENT_CASE_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ProcurementCaseActionState, FormData>(
    rejectCase,
    IDLE_PROCUREMENT_CASE_STATE,
  );
  const [issueState, issueAction, issuePending] = useActionState<ProcurementCaseActionState, FormData>(
    issueCaseOrder,
    IDLE_PROCUREMENT_CASE_STATE,
  );
  const latest =
    [issueState, rejectState, approveState].find((s) => s.status !== "idle") ?? IDLE_PROCUREMENT_CASE_STATE;

  if (status !== "APPROVAL_PENDING" && status !== "APPROVED") {
    return <Feedback state={latest} />;
  }

  return (
    <div className="mt-3 space-y-2">
      {status === "APPROVAL_PENDING" &&
        (isRequester ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            You opened this case, so someone else has to approve or reject it.
          </p>
        ) : (
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="case_id" value={caseId} />
            <Button type="submit" size="sm" formAction={approveAction} loading={approvePending}>
              Approve
            </Button>
            <input
              name="reason"
              aria-label="Reason to reject"
              placeholder="Reason (required to reject)"
              className={`${FIELD} max-w-64 py-1.5 text-xs`}
              autoComplete="off"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              formAction={rejectAction}
              loading={rejectPending}
            >
              Reject
            </Button>
          </form>
        ))}
      {status === "APPROVED" && (
        <form action={issueAction}>
          <input type="hidden" name="case_id" value={caseId} />
          <Button type="submit" size="sm" loading={issuePending}>
            {issuePending ? "Issuing…" : "Issue purchase order"}
          </Button>
        </form>
      )}
      <Feedback state={latest} />
    </div>
  );
}
