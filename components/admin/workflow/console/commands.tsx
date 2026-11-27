"use client";

// The governed commands of a workflow: the decision bar (Approve, Request
// Changes, Reject, Escalate), the administrative commands (escalate to a named
// owner, cancel, invalidate) and the release check. Each posts to a Server
// Action in app/admin/workflows/actions.ts and carries the row_version the page
// was read at, so a command never lands on a workflow that moved on since —
// workflow-svc answers 412 instead. The service decides every refusal (you
// started it, you decided another stage, you are not this stage's approver);
// the forms only explain.

import { useActionState, useState, type ReactNode } from "react";
import { ArrowUp, Check, PencilLine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { ResultBanner, type BannerTone } from "@/components/admin/shared/ResultBanner";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { decideWorkflowAction, definitionCommandAction, lifecycleAction, verifyReleaseAction } from "@/app/admin/workflows/actions";
import {
  IDLE_DECIDE,
  IDLE_DEFINITION_COMMAND,
  IDLE_LIFECYCLE,
  IDLE_RELEASE,
  type DecideWorkflowState,
  type DefinitionCommandState,
  type LifecycleState,
  type ReleaseState,
} from "@/app/admin/workflows/state";
import { DEFINITION_NEXT, INVALIDATION_REASONS, type DefinitionCommand } from "@/lib/api/workflow";

const TONE: Record<string, BannerTone> = {
  idle: "neutral",
  decided: "success",
  done: "success",
  covered: "success",
  replayed: "neutral",
  "not-covered": "warning",
  refused: "warning",
  error: "error",
};

const MAX = 1000;

const BTN =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Approve / Request Changes / Reject / Escalate on the current stage, with the
 * decision comment. A rejection and a request for changes need the comment
 * (workflow-svc refuses a rejection without one); an approval takes it if
 * given.
 */
export function DecisionBar({
  workflowId,
  rowVersion,
  quorum,
  idempotencyKey,
  layout = "drawer",
  note,
  closed = false,
}: {
  workflowId: string;
  rowVersion?: number;
  /** The current stage is a quorum: an approval or rejection is a vote. */
  quorum: boolean;
  idempotencyKey: string;
  layout?: "drawer" | "page";
  /** Why the service may refuse this viewer (shown above the buttons). */
  note?: ReactNode;
  /** The workflow is finished: only the last command's result is shown. */
  closed?: boolean;
}) {
  const [decided, decide, deciding] = useActionState<DecideWorkflowState, FormData>(decideWorkflowAction, IDLE_DECIDE);
  const [changed, change, changing] = useActionState<LifecycleState, FormData>(lifecycleAction, IDLE_LIFECYCLE);
  const [comment, setComment] = useState("");
  const [last, setLast] = useState<"decide" | "lifecycle" | null>(null);
  const busy = deciding || changing;
  const state = last === "lifecycle" ? changed : decided;
  const message = "message" in state ? state.message : undefined;
  const page = layout === "page";

  if (closed) {
    return message ? <ResultBanner tone={TONE[state.status] ?? "neutral"} message={message} testId="workflow-decision-result" /> : null;
  }

  return (
    <form className="space-y-3" data-testid="workflow-decision">
      <input type="hidden" name="workflow_instance_id" value={workflowId} />
      {rowVersion !== undefined && <input type="hidden" name="row_version" value={rowVersion} />}
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {quorum && <input type="hidden" name="quorum" value="true" />}
      <input type="hidden" name="narrative" value={comment} />

      {page && <p className="text-[14px] font-bold text-navy-950 dark:text-slate-100">Approval Decision</p>}
      {note}

      <div className={cn("grid gap-2", page ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}>
        <button
          type="submit"
          formAction={(fd) => {
            fd.set("decision", "APPROVE");
            setLast("decide");
            decide(fd);
          }}
          disabled={busy}
          className={cn(BTN, "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 dark:border-emerald-600 dark:bg-emerald-600")}
        >
          <Check className="h-4 w-4" />
          {quorum ? "Approve (vote)" : "Approve"}
        </button>
        <button
          type="submit"
          formAction={(fd) => {
            fd.set("command", "request-changes");
            setLast("lifecycle");
            change(fd);
          }}
          disabled={busy}
          className={cn(BTN, "border-navy-300 bg-white text-navy-700 hover:bg-navy-50 dark:border-navy-500/50 dark:bg-slate-900 dark:text-navy-200")}
        >
          <PencilLine className="h-4 w-4" />
          Request Changes
        </button>
        <button
          type="submit"
          formAction={(fd) => {
            fd.set("decision", "REJECT");
            setLast("decide");
            decide(fd);
          }}
          disabled={busy}
          className={cn(BTN, "border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-500/50 dark:bg-slate-900 dark:text-rose-300")}
        >
          <X className="h-4 w-4" />
          Reject
        </button>
        <button
          type="submit"
          formAction={(fd) => {
            fd.set("command", "escalate");
            setLast("lifecycle");
            change(fd);
          }}
          disabled={busy}
          className={cn(BTN, "border-violet-300 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-500/50 dark:bg-slate-900 dark:text-violet-300")}
        >
          <ArrowUp className="h-4 w-4" />
          Escalate
        </button>
      </div>

      <div>
        <label htmlFor={`comment-${workflowId}`} className={page ? "mb-1.5 block text-[13px] font-semibold text-navy-950 dark:text-slate-100" : LABEL}>
          Decision Comment <span className={OPTIONAL}>(required to reject or request changes)</span>
        </label>
        <div className="relative">
          <textarea
            id={`comment-${workflowId}`}
            name="rationale"
            rows={page ? 3 : 2}
            maxLength={MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add your decision rationale, conditions or next steps…"
            className={cn(FIELD, "resize-y pb-6")}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-slate-400">
            {comment.length} / {MAX.toLocaleString()}
          </span>
        </div>
      </div>

      {busy && <p className="text-[12px] text-slate-500 dark:text-slate-400">Submitting…</p>}
      <ResultBanner tone={TONE[state.status] ?? "neutral"} message={message} testId="workflow-decision-result" />
    </form>
  );
}

// ── administrative commands ──────────────────────────────────────────────────

const ESCALATION_REASONS = [
  ["ESCALATE:SLA_BREACH", "The stage deadline passed"],
  ["ESCALATE:APPROVER_UNAVAILABLE", "The approver is unavailable"],
  ["ESCALATE:CONFLICT_OF_INTEREST", "The approver has a conflict of interest"],
  ["ESCALATE:AUTHORITY_INSUFFICIENT", "The approver's authority does not cover it"],
] as const;

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-semibold text-navy-900 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
        {label}
        <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">{children}</div>
    </details>
  );
}

export function AdminCommands({
  workflowId,
  rowVersion,
  idempotencyKey,
  people,
  me,
  open,
}: {
  workflowId: string;
  rowVersion?: number;
  idempotencyKey: string;
  /** Principals who may be named as an escalation owner. */
  people: { id: string; name: string }[];
  me: string;
  open: boolean;
}) {
  const [esc, escalate, escalating] = useActionState<LifecycleState, FormData>(lifecycleAction, IDLE_LIFECYCLE);
  const [cnl, cancel, cancelling] = useActionState<LifecycleState, FormData>(lifecycleAction, IDLE_LIFECYCLE);
  const [inv, invalidate, invalidating] = useActionState<LifecycleState, FormData>(lifecycleAction, IDLE_LIFECYCLE);
  const hidden = (
    <>
      <input type="hidden" name="workflow_instance_id" value={workflowId} />
      {rowVersion !== undefined && <input type="hidden" name="row_version" value={rowVersion} />}
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
    </>
  );
  return (
    <div className="space-y-2">
      {open && (
        <Disclosure label="Escalate to a named owner">
          <form action={escalate} className="space-y-2">
            {hidden}
            <input type="hidden" name="command" value="escalate-to" />
            <div>
              <label htmlFor="esc-target" className={LABEL}>New owner</label>
              <select id="esc-target" name="escalation_target" required defaultValue="" className={FIELD}>
                <option value="" disabled>Choose a person…</option>
                {people.filter((p) => p.id !== me).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className={HINT}>Only this owner may decide the current stage afterwards.</p>
            </div>
            <div>
              <label htmlFor="esc-reason" className={LABEL}>Reason</label>
              <select id="esc-reason" name="reason_code" defaultValue={ESCALATION_REASONS[0][0]} className={FIELD}>
                {ESCALATION_REASONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="esc-text" className={LABEL}>Details <span className={OPTIONAL}>(optional)</span></label>
              <textarea id="esc-text" name="narrative" rows={2} maxLength={1000} className={FIELD} />
            </div>
            <Button type="submit" size="sm" variant="secondary" loading={escalating}>Escalate</Button>
            <ResultBanner tone={TONE[esc.status]} message={"message" in esc ? esc.message : undefined} />
          </form>
        </Disclosure>
      )}
      {open && (
        <Disclosure label="Cancel the workflow">
          <form action={cancel} className="space-y-2">
            {hidden}
            <input type="hidden" name="command" value="cancel" />
            <p className="text-[12px] text-slate-600 dark:text-slate-300">A cancelled workflow is finished: nobody can decide it afterwards.</p>
            <Button type="submit" size="sm" variant="secondary" loading={cancelling}>Cancel workflow</Button>
            <ResultBanner tone={TONE[cnl.status]} message={"message" in cnl ? cnl.message : undefined} />
          </form>
        </Disclosure>
      )}
      <Disclosure label="Invalidate the approval">
        <form action={invalidate} className="space-y-2">
          {hidden}
          <input type="hidden" name="command" value="invalidate" />
          <p className="text-[12px] text-slate-600 dark:text-slate-300">
            When the subject changed after approval, the approval no longer covers it and nothing may be released against it.
          </p>
          <div>
            <label htmlFor="inv-reason" className={LABEL}>Reason</label>
            <select id="inv-reason" name="reason_code" defaultValue={INVALIDATION_REASONS[0].code} className={FIELD}>
              {INVALIDATION_REASONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv-text" className={LABEL}>Details <span className={OPTIONAL}>(optional)</span></label>
            <textarea id="inv-text" name="narrative" rows={2} maxLength={1000} className={FIELD} />
          </div>
          <Button type="submit" size="sm" variant="secondary" loading={invalidating}>Invalidate</Button>
          <ResultBanner tone={TONE[inv.status]} message={"message" in inv ? inv.message : undefined} />
        </form>
      </Disclosure>
    </div>
  );
}

/** Does the approval still cover the subject as it is now? */
export function ReleaseCheck({ workflowId, rowVersion, subjectVersion }: { workflowId: string; rowVersion?: number; subjectVersion?: number | null }) {
  const [state, run, pending] = useActionState<ReleaseState, FormData>(verifyReleaseAction, IDLE_RELEASE);
  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="workflow_instance_id" value={workflowId} />
      {rowVersion !== undefined && <input type="hidden" name="row_version" value={rowVersion} />}
      <div>
        <label htmlFor="rel-fp" className={LABEL}>Subject fingerprint as it is now</label>
        <input id="rel-fp" name="subject_fingerprint" required placeholder="sha256:…" autoComplete="off" className={cn(FIELD, "font-mono text-xs")} />
      </div>
      <div>
        <label htmlFor="rel-ver" className={LABEL}>Subject version <span className={OPTIONAL}>(optional)</span></label>
        <input id="rel-ver" name="subject_version" inputMode="numeric" defaultValue={subjectVersion ?? ""} className={FIELD} />
      </div>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>Check release</Button>
      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined} />
    </form>
  );
}

// ── definition lifecycle (Workflow Library) ──────────────────────────────────

const DEFINITION_LABEL: Record<DefinitionCommand, { label: string; pending: string; primary?: boolean; hint?: string }> = {
  validate: { label: "Send for validation", pending: "Sending…", primary: true, hint: "Someone other than the author approves the route next." },
  approve: { label: "Approve validation", pending: "Approving…", primary: true, hint: "Maker–checker: the author may not approve their own route." },
  reject: { label: "Reject", pending: "Rejecting…" },
  "submit-approval": { label: "Submit for publication", pending: "Submitting…", primary: true },
  publish: { label: "Publish", pending: "Publishing…", primary: true, hint: "New workflows of this type can start from it once published." },
  activate: { label: "Activate", pending: "Activating…", primary: true },
  suspend: { label: "Suspend", pending: "Suspending…", hint: "Nothing new starts from it; running workflows keep their route." },
  retire: { label: "Retire", pending: "Retiring…", hint: "Final: a retired route cannot be brought back." },
  supersede: { label: "Supersede", pending: "Superseding…" },
};

const APPROVE_REASONS = [
  ["REVIEW:ROUTE_VERIFIED", "Route checked: approvers and order are right"],
  ["REVIEW:CONTROLS_CONFIRMED", "Controls confirmed against policy"],
] as const;
const REJECT_REASONS = [
  ["REJECT:POLICY_NOT_MET", "The route does not meet policy"],
  ["REJECT:CONTROL_FAILURE", "A control is missing from the route"],
  ["RETURN:DATA_CORRECTION_REQUIRED", "The route needs correcting"],
] as const;

function DefinitionCommandForm({
  command,
  definitionId,
  rowVersion,
  replacements,
  authoredByMe,
}: {
  command: DefinitionCommand;
  definitionId: string;
  rowVersion?: number;
  replacements: { id: string; label: string }[];
  authoredByMe: boolean;
}) {
  const [state, run, pending] = useActionState<DefinitionCommandState, FormData>(definitionCommandAction, IDLE_DEFINITION_COMMAND);
  const meta = DEFINITION_LABEL[command];
  const reasons = command === "approve" ? APPROVE_REASONS : command === "reject" ? REJECT_REASONS : null;
  const needsFields = !!reasons || command === "publish" || command === "supersede";
  const form = (
    <form action={run} className="space-y-2" data-testid={`definition-${command}`}>
      <input type="hidden" name="workflow_definition_id" value={definitionId} />
      <input type="hidden" name="command" value={command} />
      {rowVersion !== undefined && <input type="hidden" name="row_version" value={rowVersion} />}
      {reasons && (
        <>
          <div>
            <label htmlFor={`${command}-reason`} className={LABEL}>Reason</label>
            <select id={`${command}-reason`} name="reason_code" defaultValue={reasons[0][0]} className={FIELD}>
              {reasons.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${command}-text`} className={LABEL}>Details <span className={OPTIONAL}>(optional)</span></label>
            <textarea id={`${command}-text`} name="narrative" rows={2} maxLength={1000} className={FIELD} />
          </div>
        </>
      )}
      {command === "publish" && (
        <div>
          <label htmlFor="pub-from" className={LABEL}>Effective from <span className={OPTIONAL}>(optional; now if empty)</span></label>
          <input id="pub-from" type="date" name="effective_from" className={FIELD} />
        </div>
      )}
      {command === "supersede" && (
        <div>
          <label htmlFor="sup-new" className={LABEL}>Replaced by</label>
          <select id="sup-new" name="new_definition_id" required defaultValue="" className={FIELD}>
            <option value="" disabled>Choose the replacement…</option>
            {replacements.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" size="sm" variant={meta.primary ? "accent" : "secondary"} loading={pending} className={needsFields ? "w-full" : undefined}>
        {pending ? meta.pending : meta.label}
      </Button>
      {command === "approve" && authoredByMe ? (
        <p className={HINT}>You authored this route: workflow-svc will refuse your approval.</p>
      ) : (
        meta.hint && <p className={HINT}>{meta.hint}</p>
      )}
      <ResultBanner tone={TONE[state.status] ?? "neutral"} message={"message" in state ? state.message : undefined} />
    </form>
  );
  if (!needsFields) return form;
  return (
    <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-semibold text-navy-900 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
        {meta.label}…
        <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">{form}</div>
    </details>
  );
}

export function DefinitionCommands({
  definitionId,
  status,
  rowVersion,
  replacements,
  authoredByMe,
}: {
  definitionId: string;
  status: string;
  rowVersion?: number;
  replacements: { id: string; label: string }[];
  authoredByMe: boolean;
}) {
  const next = DEFINITION_NEXT[status] ?? [];
  if (next.length === 0) {
    return <p className="text-[12px] text-slate-500 dark:text-slate-400">Nothing further can be done with a {status.toLowerCase().replace(/_/g, " ")} route. Save a new version from the builder.</p>;
  }
  return (
    <div className="space-y-2">
      {next.map((c) => (
        <DefinitionCommandForm key={c} command={c} definitionId={definitionId} rowVersion={rowVersion} replacements={replacements} authoredByMe={authoredByMe} />
      ))}
    </div>
  );
}
