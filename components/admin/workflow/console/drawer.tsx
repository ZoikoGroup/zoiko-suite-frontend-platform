// Approval Details: the selected workflow beside the register (v2.0 mock) —
// its facts, the progress of its route, who the current stage waits on, the
// segregation-of-duties check, what it is linked to, its recent trail, and the
// decision bar.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  CircleDot,
  ExternalLink,
  FileText,
  Info,
  Link2,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDate } from "@/lib/format";
import { humanizeCode, humanizeKey } from "@/lib/humanize";
import type { WorkflowStage, WorkflowTransition, WorkflowWithStages } from "@/lib/api/workflow";
import {
  buildRow,
  href,
  sodFindings,
  stageLabel,
  stagePeople,
  type Directory,
  type Query,
  type WorkflowDetail,
} from "./data";
import { DeadlineMark, statusChip } from "./register";
import { DecisionBar } from "./commands";

export function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 border-b border-slate-100 py-[6px] last:border-0 dark:border-slate-800">
      <dt className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400">
        <span className="shrink-0 text-slate-500">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 wrap-break-word text-[12px] font-medium text-navy-950 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-4 py-3.5 dark:border-slate-800">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-navy-950 dark:text-slate-100">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function initialsOf(name: string): string {
  if (name.endsWith("…") || name === "—") return "?";
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      title={name}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-bold text-navy-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

type StepState = "done" | "current" | "rejected" | "todo";

function stepState(stage: WorkflowStage, wf: WorkflowWithStages): StepState {
  if (stage.stage_status === "APPROVED") return "done";
  if (stage.stage_status === "REJECTED") return "rejected";
  if ((wf.workflow_status === "PENDING" || wf.workflow_status === "ESCALATED") && stage.stage_order === wf.current_stage) return "current";
  return "todo";
}

/** Initiation, then one step per stage: green when decided, a blue ring on
 *  the one waiting, grey ahead (the v2.0 mock's progress line). */
export function ProgressLine({ wf, stages, dir, size = "sm" }: { wf: WorkflowWithStages; stages: WorkflowStage[]; dir: Directory; size?: "sm" | "lg" }) {
  const steps: { key: string; label: string; state: StepState; sub?: string }[] = [
    { key: "init", label: "Initiation", state: "done", sub: wf.started_at ? formatDateTime(wf.started_at) : undefined },
    ...stages.map((s) => ({
      key: s.workflow_stage_id,
      label: stageLabel(s, dir),
      state: stepState(s, wf),
      sub: s.acted_at ? formatDateTime(s.acted_at) : undefined,
    })),
  ];
  const lg = size === "lg";
  return (
    <ol className="flex w-full items-start">
      {steps.map((s, i) => {
        const nextDone = i < steps.length - 1 && (steps[i + 1].state === "done" || steps[i + 1].state === "current" || steps[i + 1].state === "rejected");
        return (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-1/2 h-0.5 w-full",
                  lg ? "top-[17px]" : "top-[11px]",
                  nextDone ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex items-center justify-center rounded-full font-bold",
                lg ? "h-9 w-9 text-[13px]" : "h-6 w-6 text-[10px]",
                s.state === "done" && "bg-emerald-500 text-white",
                s.state === "rejected" && "bg-rose-500 text-white",
                s.state === "current" && (lg ? "bg-navy-600 text-white ring-4 ring-navy-100 dark:ring-navy-500/30" : "border-[3px] border-navy-600 bg-white dark:bg-slate-900"),
                s.state === "todo" && "border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900",
              )}
            >
              {s.state === "done" && <Check className={lg ? "h-5 w-5" : "h-3.5 w-3.5"} strokeWidth={3} />}
              {s.state === "rejected" && <X className={lg ? "h-5 w-5" : "h-3.5 w-3.5"} strokeWidth={3} />}
              {s.state === "current" && lg && i}
            </span>
            <span
              className={cn(
                "mt-1.5 line-clamp-2 px-1 leading-tight",
                lg ? "text-[13px] font-bold text-navy-950 dark:text-slate-100" : "text-[11px] text-navy-950 dark:text-slate-200",
                s.state === "current" && !lg && "font-bold",
              )}
              title={s.label}
            >
              {lg && i > 0 ? `${i}. ` : ""}
              {s.label}
            </span>
            {lg && (
              <span className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                {s.state === "current" ? (
                  <Badge tone="info" className="mt-1">In Progress</Badge>
                ) : s.state === "done" ? (
                  <>
                    Completed
                    {s.sub && <span className="block">{s.sub}</span>}
                  </>
                ) : s.state === "rejected" ? (
                  <Badge tone="danger" className="mt-1">Rejected</Badge>
                ) : (
                  <Badge tone="neutral" className="mt-1">Pending</Badge>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One line of the trail, in words. */
export function transitionText(t: WorkflowTransition, dir: Directory): string {
  // workflow-svc records a stage decision as status-before → status-after with
  // the stage order: PENDING → PENDING when the route continues, → APPROVED on
  // the last stage, → REJECTED on a rejection. A request for changes is
  // PENDING → PENDING with no stage and a new review cycle.
  const who = dir.name(t.acted_by);
  const stage = t.stage_order ? ` stage ${t.stage_order}` : "";
  const from = t.from_state ?? "";
  const to = t.to_state;
  const rejectedVote = /reject/i.test(t.rationale ?? "");
  if (!from || from === "NONE" || from === "CREATED") return `Workflow initiated by ${who}`;
  if (to === "REJECTED") return `${who} rejected${stage}`;
  if (to === "APPROVED") return t.stage_order ? `${who} approved${stage} — workflow approved` : `Approved by ${who}`;
  if (t.stage_order && to === from) return `${who} ${rejectedVote ? "voted to reject" : "approved"}${stage}`;
  if (to === "ESCALATED") return `Escalated${who !== "System" ? ` by ${who}` : ""}`;
  if (to === "PENDING" && from === "PENDING") return `${who} requested changes${t.review_cycle ? ` (review cycle ${t.review_cycle})` : ""}`;
  if (to === "PENDING" && from === "ESCALATED") return `Returned to its approvers by ${who}`;
  if (to === "CANCELLED") return `Cancelled by ${who}`;
  if (to === "INVALIDATED") return `Invalidated by ${who}`;
  if (to === "EXPIRED") return "Expired past its deadline";
  return `${humanizeCode(from) || from} → ${humanizeCode(to) || to} by ${who}`;
}

export function ApprovalDrawer({
  detail,
  query,
  dir,
  me,
  idempotencyKey,
}: {
  detail: WorkflowDetail;
  query: Query;
  dir: Directory;
  me: string;
  idempotencyKey: string;
}) {
  const closeHref = href({ ...query, id: undefined }, { drawer: "closed" });
  const frame = (body: ReactNode, footer?: ReactNode) => (
    <aside
      aria-label="Approval Details"
      className="flex min-w-0 flex-col self-start overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[19px] font-bold tracking-tight text-navy-950 dark:text-slate-100">Approval Details</h2>
        <Link href={closeHref} scroll={false} aria-label="Close details" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-navy-900 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </Link>
      </div>
      {body}
      {footer && <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">{footer}</div>}
    </aside>
  );

  const wf = detail.workflow.data;
  if (!wf) {
    return frame(
      <p className="px-4 pb-5 text-[12.5px] text-slate-600 dark:text-slate-300">
        {detail.workflow.error?.status === 404
          ? "No workflow with that ID is visible to you."
          : `The workflow could not be read. ${detail.workflow.error?.message ?? ""}`}
      </p>,
    );
  }

  const stages = [...(wf.stages ?? [])].sort((a, b) => a.stage_order - b.stage_order);
  const row = buildRow(wf, stages, dir, me, detail.readAt);
  const chip = statusChip(row);
  const current = row.current;
  const sod = sodFindings(wf, stages, dir);
  const trail = [...(detail.trail.data ?? [])].sort((a, b) => Date.parse(b.acted_at) - Date.parse(a.acted_at));
  const iStarted = wf.initiated_by === me;
  const full = `/admin/workflows/${wf.workflow_instance_id}`;

  const approvers = current ? stagePeople(current) : [];
  const decidedBy = new Set(stages.filter((s) => s.acted_by).map((s) => s.acted_by!));

  const body = (
    <>
      <div className="px-4 pb-3">
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-500/15 dark:text-navy-200">
            <UsersRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={full} className="min-w-0 text-[16px] font-bold leading-snug text-navy-950 hover:underline dark:text-slate-100">
                {row.title}
              </Link>
              <Badge tone={chip.tone}>{chip.label}</Badge>
            </div>
            <p className="font-mono text-[12px] font-medium text-slate-700 dark:text-slate-300" title={wf.workflow_instance_id}>
              {row.ref}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-slate-600 dark:text-slate-300">{row.description}</p>
          </div>
        </div>
        <dl className="mt-2.5">
          <Fact icon={<FileText className="h-3.5 w-3.5" />} label="Workflow Type">{row.typeLabel}</Fact>
          <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Entity">{dir.entity(wf.legal_entity_id)}</Fact>
          <Fact icon={<UserRound className="h-3.5 w-3.5" />} label="Requester">{row.requester}</Fact>
          <Fact icon={<CalendarDays className="h-3.5 w-3.5" />} label="Initiated On">{wf.started_at ? formatDateTime(wf.started_at) : "—"}</Fact>
          <Fact icon={<CalendarClock className="h-3.5 w-3.5" />} label="Due Date">
            <span className="flex flex-wrap items-center gap-2">
              {row.due ? formatDate(row.due) : "No deadline"}
              {row.open && row.due && <DeadlineMark deadline={row.deadline} due={row.due} />}
            </span>
          </Fact>
          <Fact icon={<CircleDot className="h-3.5 w-3.5" />} label="Status">
            <Badge tone={chip.tone}>{chip.label}</Badge>
            {wf.review_cycle && wf.review_cycle > 1 ? <span className="ml-2 text-[11px] text-slate-500">Review cycle {wf.review_cycle}</span> : null}
          </Fact>
        </dl>
      </div>

      <Section title="Workflow Progress">
        {stages.length ? (
          <ProgressLine wf={wf} stages={stages} dir={dir} />
        ) : (
          <p className="text-[12px] text-slate-500">The route&rsquo;s stages could not be read.</p>
        )}
        {current ? (
          <div className="mt-3 text-[12.5px]">
            <p className="font-semibold text-navy-950 dark:text-slate-100">
              Current Stage:{" "}
              <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-navy-700 dark:bg-navy-500/15 dark:text-navy-200">
                Stage {current.stage_order} · {stageLabel(current, dir)}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-400">
              {current.approver_role
                ? `Anyone holding ${humanizeCode(current.approver_role)} may decide it.`
                : current.quorum_approvers?.length
                  ? `${current.required_approvals} of ${current.quorum_approvers.length} named approvers must approve.`
                  : "One named approver decides it."}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-slate-600 dark:text-slate-400">
            {row.open ? "Waiting on the current stage." : `Finished${wf.completed_at ? ` ${formatDateTime(wf.completed_at)}` : ""}: ${chip.label.toLowerCase()}.`}
          </p>
        )}
      </Section>

      {current && (
        <Section
          title={
            <>
              Approvers <span className="font-medium text-slate-600 dark:text-slate-300">(Current Stage)</span>
            </>
          }
        >
          {wf.workflow_status === "ESCALATED" && wf.escalation_target ? (
            <ul>
              <li className="flex items-center gap-2.5 py-1">
                <Avatar name={dir.name(wf.escalation_target)} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-navy-950 dark:text-slate-100">
                  {dir.name(wf.escalation_target)} <span className="text-slate-500">(escalation owner)</span>
                </span>
                <Badge tone={wf.escalation_target === me ? "warning" : "info"}>{wf.escalation_target === me ? "You" : "In Review"}</Badge>
              </li>
            </ul>
          ) : approvers.length ? (
            <ul className="space-y-1">
              {approvers.map((p) => (
                <li key={p} className="flex items-center gap-2.5 py-1">
                  <Avatar name={dir.name(p)} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-navy-950 dark:text-slate-100">{dir.name(p)}</span>
                  <Badge tone={p === me ? "warning" : decidedBy.has(p) ? "neutral" : "info"}>
                    {p === me ? "You" : decidedBy.has(p) ? "Decided a stage" : current.quorum_approvers?.length ? "Eligible" : "In Review"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-navy-950 dark:text-slate-100">
              Anyone holding <span className="font-semibold">{humanizeCode(current.approver_role ?? "") || "the stage's role"}</span>.
              <span className="block text-[11.5px] text-slate-500">authorization-svc decides who holds it when they act.</span>
            </p>
          )}
        </Section>
      )}

      <div className="px-4 pb-3.5">
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3",
            sod.length
              ? "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10"
              : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
          )}
        >
          {sod.length ? <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" /> : <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-navy-950 dark:text-slate-100">Separation of Duties (SoD)</p>
            {sod.length ? (
              <ul className="mt-0.5 space-y-0.5 text-[12px] text-amber-900 dark:text-amber-200">
                {sod.map((f) => (
                  <li key={f.text}>{f.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">No SoD conflicts identified for this workflow.</p>
            )}
          </div>
          {!sod.length && <Check className="h-5 w-5 rounded-full bg-emerald-600 p-0.5 text-white" strokeWidth={3} />}
        </div>
      </div>

      <Section title="Linked Records">
        <ul className="space-y-1.5 text-[12px]">
          <li className="flex items-center gap-2">
            {wf.subject_id ? <Check className="h-4 w-4 rounded-full bg-emerald-600 p-0.5 text-white" strokeWidth={3} /> : <Info className="h-4 w-4 text-slate-400" />}
            {wf.subject_id ? (
              <span className="min-w-0 truncate text-navy-950 dark:text-slate-200" title={wf.subject_id}>
                {humanizeKey(wf.subject_type ?? "") || "Subject"} {wf.subject_id.slice(0, 8)}…
                {wf.subject_version ? ` · v${wf.subject_version}` : ""}
                {wf.subject_fingerprint ? " · fingerprint bound" : ""}
              </span>
            ) : (
              <span className="text-slate-500">No subject bound to this approval.</span>
            )}
          </li>
          {wf.workflow_definition_id && (
            <li className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-navy-600 dark:text-navy-300" />
              <Link href={`/admin/workflows/builder?tab=library&def=${wf.workflow_definition_id}`} className="min-w-0 truncate text-navy-700 hover:underline dark:text-navy-300">
                Route: {dir.definition(wf.workflow_definition_id)?.name || row.typeLabel} v{wf.workflow_definition_version ?? "?"}
              </Link>
            </li>
          )}
          {wf.causation_decision_id && (
            <li className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-navy-600 dark:text-navy-300" />
              <Link href={`/admin/governance/decisions/${wf.causation_decision_id}`} className="min-w-0 truncate text-navy-700 hover:underline dark:text-navy-300">
                Resolves governance decision {wf.causation_decision_id.slice(0, 8)}…
              </Link>
            </li>
          )}
        </ul>
      </Section>

      <Section
        title={
          <span className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Audit Trail <span className="font-medium text-slate-600 dark:text-slate-300">(Recent Activity)</span>
          </span>
        }
        action={
          <Link href={`${full}?tab=audit`} className="text-[12px] font-semibold text-navy-600 hover:underline dark:text-navy-300">
            View All
          </Link>
        }
      >
        {detail.trail.error ? (
          <p className="flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-300">
            <CircleAlert className="h-3.5 w-3.5" /> The trail could not be read.
          </p>
        ) : trail.length === 0 ? (
          <p className="text-[12px] text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ol className="relative space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
            {trail.slice(0, 3).map((t, i) => (
              <li key={`${t.acted_at}-${i}`} className="relative text-[11.5px] leading-snug text-slate-700 dark:text-slate-300">
                <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2", i === 0 ? "border-navy-600 bg-white dark:bg-slate-900" : "border-navy-600 bg-navy-600")} />
                <span className="font-semibold text-navy-950 dark:text-slate-100">{formatDateTime(t.acted_at)}</span> – {transitionText(t, dir)}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );

  const footer = (
    <div className="space-y-3">
    <DecisionBar
      closed={!row.open}
      workflowId={wf.workflow_instance_id}
      rowVersion={wf.row_version}
      quorum={!!current?.quorum_approvers?.length}
      idempotencyKey={idempotencyKey}
      note={
        iStarted ? (
          <p className="text-[11.5px] text-amber-700 dark:text-amber-300">You started this workflow, so workflow-svc will refuse your approval or rejection.</p>
        ) : !row.mine && !row.roleRouted ? (
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400">The current stage is not waiting on you; workflow-svc decides whether you may act.</p>
        ) : null
      }
    />
    {!row.open && (
      <Link
        href={full}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <ExternalLink className="h-4 w-4" />
        Open full record
      </Link>
    )}
    </div>
  );

  return frame(body, footer);
}
