import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  Flag,
  History,
  Layers,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  UserRound,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/admin/shared/Breadcrumbs";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { formatDate, formatDateTime } from "@/lib/format";
import { humanizeCode, humanizeKey } from "@/lib/humanize";
import { explainWorkflowError, type WorkflowStage, type WorkflowTransition } from "@/lib/api/workflow";
import { buildRow, loadDetail, loadDirectory, refOf, sodFindings, stageLabel, stagePeople, type Directory } from "@/components/admin/workflow/console/data";
import { DeadlineMark, statusChip } from "@/components/admin/workflow/console/register";
import { Avatar, ProgressLine, transitionText } from "@/components/admin/workflow/console/drawer";
import { AdminCommands, DecisionBar, ReleaseCheck } from "@/components/admin/workflow/console/commands";

export const metadata: Metadata = { title: "Workflow | Zoiko Suite" };

const BASE = "/admin/workflows";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** workflow-svc writes "stage 2 APPROVED by <id> (approver)" when a decider
 *  gives no reason; those are bookkeeping, not comments. */
const SYNTHETIC = /^stage \d+ \w+ by \S+/i;

function remaining(due: string | undefined, now: number): { text: string; late: boolean } | null {
  if (!due) return null;
  const ms = Date.parse(due) - now;
  if (Number.isNaN(ms)) return null;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const span = days > 0 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.max(1, hours)} hour${hours === 1 ? "" : "s"}`;
  return ms >= 0 ? { text: `${span} remaining`, late: false } : { text: `overdue by ${span}`, late: true };
}

function Strip({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-1 first:pl-0 2xl:border-l 2xl:border-slate-200 2xl:first:border-0 dark:2xl:border-slate-700">
      <span className="shrink-0 text-navy-600 dark:text-navy-300">{icon}</span>
      <div className="min-w-0">
        <p className="wrap-break-word text-[14px] font-bold leading-tight text-navy-950 dark:text-slate-100">{value}</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function SideFact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <dt className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-400">
        <span className="text-slate-500">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 wrap-break-word text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{children}</dd>
    </div>
  );
}

const TABS = [
  { key: "decision", label: "Approval & Decision", icon: FileCheck2 },
  { key: "subject", label: "Subject & Evidence", icon: FileText },
  { key: "controls", label: "Policy & Controls", icon: Layers },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "audit", label: "Audit Trail", icon: History },
] as const;
type Tab = (typeof TABS)[number]["key"];

function StageSummary({ stages, dir, status }: { stages: WorkflowStage[]; dir: Directory; status: string }) {
  const rejected = stages.some((s) => s.stage_status === "REJECTED");
  const allDone = stages.length > 0 && stages.every((s) => s.stage_status === "APPROVED");
  const overall =
    status === "APPROVED" || allDone
      ? { text: "Pass", cls: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" }
      : rejected || status === "REJECTED"
        ? { text: "Rejected", cls: "text-rose-700 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-500/10" }
        : status === "PENDING" || status === "ESCALATED"
          ? { text: "In progress", cls: "text-navy-700 dark:text-navy-300", bg: "bg-navy-50 dark:bg-navy-500/10" }
          : { text: humanizeCode(status) || status, cls: "text-slate-600 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-800/50" };
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 dark:border-slate-700">
      <p className="border-b border-slate-100 px-4 py-3 text-[15px] font-bold text-navy-950 dark:border-slate-800 dark:text-slate-100">Stage Summary</p>
      <ul className="flex-1 divide-y divide-slate-100 px-4 dark:divide-slate-800">
        {stages.map((s) => {
          const done = s.stage_status === "APPROVED";
          const bad = s.stage_status === "REJECTED";
          return (
            <li key={s.workflow_stage_id} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
              <span className="flex min-w-0 items-center gap-2 text-navy-950 dark:text-slate-100">
                {done ? (
                  <Check className="h-4 w-4 shrink-0 rounded-full bg-emerald-600 p-0.5 text-white" strokeWidth={3} />
                ) : bad ? (
                  <CircleAlert className="h-4 w-4 shrink-0 text-rose-600" />
                ) : (
                  <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="truncate">
                  {s.stage_order}. {stageLabel(s, dir)}
                </span>
              </span>
              <span className={cn("shrink-0 font-medium", done ? "text-emerald-700 dark:text-emerald-400" : bad ? "text-rose-700 dark:text-rose-400" : "text-slate-500")}>
                {done ? "✓ Completed" : bad ? "Rejected" : humanizeCode(s.stage_status) || s.stage_status}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={cn("flex items-center justify-between rounded-b-xl px-4 py-3 text-[13.5px] font-bold", overall.bg)}>
        <span className="text-navy-950 dark:text-slate-100">Overall Result</span>
        <span className={overall.cls}>{overall.text}</span>
      </div>
    </div>
  );
}

/**
 * The authority snapshot in a line: authorization-svc records it as
 * "rbac:role=A,B,C" (every role that granted the action) or a basis code.
 * The full value stays on hover.
 */
function authorityText(basis: string | null | undefined): string {
  if (!basis) return "—";
  const roles = /^rbac:role=(.+)$/i.exec(basis.trim());
  if (roles) {
    const list = roles[1].split(",").map((r) => r.trim()).filter(Boolean);
    const first = humanizeCode(list[0]) || list[0];
    return list.length > 1 ? `Role: ${first} +${list.length - 1} more` : `Role: ${first}`;
  }
  return humanizeCode(basis) || basis;
}

function TrailTable({ trail, dir }: { trail: WorkflowTransition[]; dir: Directory }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full text-[12px]">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11.5px] text-slate-500 dark:border-slate-800">
            <th className="py-2 pr-3 font-semibold">When</th>
            <th className="py-2 pr-3 font-semibold">What happened</th>
            <th className="py-2 pr-3 font-semibold">Authority</th>
            <th className="py-2 font-semibold">Governance record</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {trail.map((t, i) => (
            <tr key={`${t.acted_at}-${i}`} className="align-top">
              <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-slate-600 dark:text-slate-300">{formatDateTime(t.acted_at)}</td>
              <td className="min-w-56 py-2.5 pr-3 text-navy-950 dark:text-slate-100">
                {transitionText(t, dir)}
                {t.rationale && !SYNTHETIC.test(t.rationale) && <span className="block text-[11.5px] text-slate-500">“{t.rationale}”</span>}
              </td>
              <td className="max-w-56 py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                <span className="block truncate" title={t.authority_basis ?? undefined}>
                  {authorityText(t.authority_basis)}
                </span>
                {t.delegation_id && <span className="block text-[11px] text-slate-500">via delegation {t.delegation_id.slice(0, 8)}…</span>}
              </td>
              <td className="py-2.5">
                {t.decision_id ? (
                  <Link href={`/admin/governance/decisions/${t.decision_id}`} className="font-mono text-[11.5px] text-navy-600 hover:underline dark:text-navy-300">
                    {t.decision_id.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "decision";

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SignInAgain returnTo={`${BASE}/${id}`} />
      </div>
    );
  }
  const identity = current.identity;
  const me = identity.principalId;

  const back = (
    <Link
      href={BASE}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <ChevronLeft className="h-4 w-4" />
      Back to Workflows
    </Link>
  );

  if (!UUID.test(id)) {
    return (
      <div className="space-y-5">
        <Breadcrumbs />
        <Card className="p-6 text-[13px] text-slate-600 dark:text-slate-300">
          That is not a workflow ID (a UUID). <div className="mt-4">{back}</div>
        </Card>
      </div>
    );
  }

  const [detail, directory] = await Promise.all([loadDetail(id, identity), loadDirectory(identity)]);
  const { dir, people } = directory;
  const wf = detail.workflow.data;
  if (!wf) {
    const err = detail.workflow.error;
    return (
      <div className="space-y-5">
        <Breadcrumbs />
        <Card className="p-6 text-[13px] text-slate-600 dark:text-slate-300">
          {err?.status === 404
            ? "No workflow with that ID is visible to you. Lookups are scoped to your tenant, so either it does not exist or it belongs to another tenant."
            : `The workflow could not be read. ${explainWorkflowError(err?.message ?? "")}`}
          <div className="mt-4">{back}</div>
        </Card>
      </div>
    );
  }

  const now = detail.readAt;
  const stages = [...(wf.stages ?? [])].sort((a, b) => a.stage_order - b.stage_order);
  const row = buildRow(wf, stages, dir, me, now);
  const chip = statusChip(row);
  const cur = row.current;
  const trail = [...(detail.trail.data ?? [])].sort((a, b) => Date.parse(a.acted_at) - Date.parse(b.acted_at));
  const comments = trail.filter((t) => t.rationale && !SYNTHETIC.test(t.rationale));
  const sod = sodFindings(wf, stages, dir);
  const decisions = trail.filter((t) => t.decision_id);
  const left = remaining(row.due, now);
  const decidedCount = stages.filter((s) => s.stage_status === "APPROVED").length;
  const def = dir.definition(wf.workflow_definition_id);
  const tabHref = (t: Tab) => (t === "decision" ? `${BASE}/${id}` : `${BASE}/${id}?tab=${t}`);
  const counts: Partial<Record<Tab, number>> = { controls: 3, comments: comments.length };

  const approverPeople = cur ? stagePeople(cur) : [];
  const owner = wf.workflow_status === "ESCALATED" && wf.escalation_target ? wf.escalation_target : approverPeople.length === 1 ? approverPeople[0] : null;
  const waitingOnMe = row.mine;

  return (
    <div className="space-y-5">
      <div className="animate-fade-up">
        <Breadcrumbs />
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-navy-950 sm:text-[30px] dark:text-white">Workflow: {row.title}</h1>
              <Badge tone={chip.tone} className="px-3 py-1 text-[13px]">
                {chip.label}
              </Badge>
            </div>
            <p className="mt-1.5 text-[15px] text-slate-500 dark:text-slate-400">{row.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">{back}</div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Card className="grid grid-cols-2 gap-y-3 p-4 md:grid-cols-3 2xl:grid-cols-5">
            <Strip icon={<UsersRound className="h-5 w-5" />} value={<span title={wf.workflow_instance_id}>{refOf(wf.workflow_instance_id)}</span>} label="Workflow ID" />
            <Strip icon={<ShieldCheck className="h-5 w-5" />} value={row.typeLabel} label="Workflow Type" />
            <Strip icon={<Building2 className="h-5 w-5" />} value={dir.entity(wf.legal_entity_id)} label="Entity" />
            <Strip icon={<Flag className="h-5 w-5 text-rose-500" />} value={stages.length ? `${decidedCount} of ${stages.length}` : "—"} label="Stages approved" />
            <Strip icon={<CalendarDays className="h-5 w-5" />} value={row.due ? formatDate(row.due) : "None"} label="Due Date" />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-navy-950 dark:text-slate-100">Approval Workflow</h2>
              {stages.length > 0 && (
                <p className="text-[14px] font-semibold text-navy-950 dark:text-slate-200">
                  {row.open ? `Step ${wf.current_stage} of ${stages.length}` : chip.label}
                </p>
              )}
            </div>
            <div className="mt-5">
              {stages.length ? <ProgressLine wf={wf} stages={stages} dir={dir} size="lg" /> : <p className="text-[12.5px] text-slate-500">No stages were returned.</p>}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <nav aria-label="Workflow sections" className="flex gap-6 overflow-x-auto border-b border-slate-200 px-5 scrollbar-thin dark:border-slate-800">
              {TABS.map((t) => {
                const Icon = t.icon;
                const on = t.key === tab;
                const n = counts[t.key];
                return (
                  <Link
                    key={t.key}
                    href={tabHref(t.key)}
                    scroll={false}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 py-3.5 text-[13.5px] transition-colors",
                      on ? "border-navy-700 font-semibold text-navy-700 dark:border-navy-300 dark:text-navy-200" : "border-transparent font-medium text-slate-600 hover:text-navy-800 dark:text-slate-400",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {n !== undefined && ` (${n})`}
                  </Link>
                );
              })}
            </nav>

            <div className="p-5">
              {tab === "decision" && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="border-b border-slate-100 px-4 py-3 text-[15px] font-bold text-navy-950 dark:border-slate-800 dark:text-slate-100">
                        Current Approval
                      </p>
                      {cur ? (
                        <div className="flex flex-wrap items-center gap-4 px-4 py-4">
                          <Avatar name={owner ? dir.name(owner) : "?"} className="h-10 w-10 bg-navy-600 text-[13px] text-white ring-0 dark:bg-navy-600" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-bold text-navy-950 dark:text-slate-100">
                              {owner ? dir.name(owner) : cur.approver_role ? humanizeCode(cur.approver_role) : stageLabel(cur, dir)}
                            </p>
                            <p className="text-[12px] text-slate-500 dark:text-slate-400">
                              {wf.workflow_status === "ESCALATED" && wf.escalation_target
                                ? "Escalation owner"
                                : cur.approver_role
                                  ? "Anyone holding the role"
                                  : cur.quorum_approvers?.length
                                    ? `${cur.required_approvals} of ${cur.quorum_approvers.length} named approvers`
                                    : `Stage ${cur.stage_order} approver`}
                            </p>
                          </div>
                          {waitingOnMe && (
                            <span className="rounded-md bg-amber-100 px-2.5 py-1 text-[12px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                              Your Approval Required
                            </span>
                          )}
                          <div className="text-right text-[12.5px]">
                            <p className="text-navy-950 dark:text-slate-100">Due by: {row.due ? formatDate(row.due) : "no deadline"}</p>
                            {left && (
                              <p className={left.late ? "font-semibold text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}>
                                SLA: <span className={left.late ? "" : "font-semibold text-emerald-700 dark:text-emerald-400"}>{left.text}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="px-4 py-4 text-[12.5px] text-slate-600 dark:text-slate-300">
                          {row.open ? "The stage waiting for a decision could not be read." : `This workflow is finished: ${chip.label.toLowerCase()}${wf.completed_at ? ` on ${formatDateTime(wf.completed_at)}` : ""}.`}
                        </p>
                      )}
                    </div>
                    <DecisionBar
                        closed={!row.open}
                        workflowId={wf.workflow_instance_id}
                        rowVersion={wf.row_version}
                        quorum={!!cur?.quorum_approvers?.length}
                        idempotencyKey={crypto.randomUUID()}
                        layout="page"
                        note={
                          wf.initiated_by === me ? (
                            <p className="text-[12px] text-amber-700 dark:text-amber-300">You started this workflow, so workflow-svc will refuse your approval or rejection.</p>
                          ) : null
                        }
                      />
                  </div>
                  <StageSummary stages={stages} dir={dir} status={String(wf.workflow_status)} />
                </div>
              )}

              {tab === "subject" && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-[14px] font-bold text-navy-950 dark:text-slate-100">What was approved</h3>
                    {wf.subject_id ? (
                      <dl>
                        <SideFact icon={<FileText className="h-4 w-4" />} label="Subject type">{humanizeKey(wf.subject_type ?? "") || "—"}</SideFact>
                        <SideFact icon={<ScrollText className="h-4 w-4" />} label="Subject ID"><span className="font-mono text-[11.5px]">{wf.subject_id}</span></SideFact>
                        <SideFact icon={<Layers className="h-4 w-4" />} label="Version">{wf.subject_version ?? "—"}</SideFact>
                        <SideFact icon={<ShieldCheck className="h-4 w-4" />} label="Fingerprint">
                          <span className="font-mono text-[11px] font-medium">{wf.subject_fingerprint ?? "Not bound"}</span>
                        </SideFact>
                      </dl>
                    ) : (
                      <p className="text-[12.5px] text-slate-600 dark:text-slate-300">No subject is bound to this approval, so there is nothing to verify a release against.</p>
                    )}
                    {wf.workflow_status === "INVALIDATED" && (
                      <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                        Invalidated{wf.invalidated_at ? ` ${formatDateTime(wf.invalidated_at)}` : ""}: {humanizeCode(wf.invalidation_reason_code ?? "") || "no reason recorded"}
                        {wf.invalidation_narrative ? ` — ${wf.invalidation_narrative}` : ""}
                      </p>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-[14px] font-bold text-navy-950 dark:text-slate-100">Can it still be released against?</h3>
                    <p className="mb-3 text-[12px] text-slate-600 dark:text-slate-300">
                      An approval covers its subject as it was when approved. Give the subject&rsquo;s fingerprint as it is now; if it changed, the approval does not cover it.
                    </p>
                    <ReleaseCheck workflowId={wf.workflow_instance_id} rowVersion={wf.row_version} subjectVersion={wf.subject_version} />
                  </div>
                </div>
              )}

              {tab === "controls" && (
                <div className="space-y-5">
                  <ul className="space-y-2 text-[12.5px]">
                    {[
                      { ok: !stages.some((s) => stagePeople(s).includes(wf.initiated_by)), text: "The initiator is not an approver of any stage" },
                      { ok: !sod.some((f) => /named in stages/.test(f.text)), text: "Nobody is named in two stages" },
                      { ok: !sod.some((f) => /decided stages|decided stage/.test(f.text)), text: "Nobody decided two stages, and the initiator decided none" },
                    ].map((c) => (
                      <li key={c.text} className="flex items-center gap-2">
                        {c.ok ? <Check className="h-4 w-4 rounded-full bg-emerald-600 p-0.5 text-white" strokeWidth={3} /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
                        <span className="text-navy-950 dark:text-slate-100">{c.text}</span>
                      </li>
                    ))}
                    {sod.map((f) => (
                      <li key={f.text} className="ml-6 text-[12px] text-amber-800 dark:text-amber-300">{f.text}</li>
                    ))}
                  </ul>
                  <div>
                    <h3 className="mb-2 text-[14px] font-bold text-navy-950 dark:text-slate-100">Authority behind each decision</h3>
                    {decisions.length ? (
                      <TrailTable trail={decisions} dir={dir} />
                    ) : (
                      <p className="text-[12.5px] text-slate-500">No decision has been recorded in the governance log yet.</p>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    Every decision is checked against authorization-svc (WORKFLOW_APPROVE for this workflow type, role and stage) and fails closed; the
                    rules above hold whatever grants a person has.
                  </p>
                </div>
              )}

              {tab === "comments" &&
                (comments.length ? (
                  <ul className="space-y-3">
                    {comments.map((t, i) => (
                      <li key={`${t.acted_at}-${i}`} className="flex gap-3">
                        <Avatar name={dir.name(t.acted_by)} className="h-8 w-8" />
                        <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-navy-950 dark:text-slate-100">{dir.name(t.acted_by)}</span> · {transitionText(t, dir)} ·{" "}
                            {formatDateTime(t.acted_at)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] text-navy-950 dark:text-slate-100">{t.rationale}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] text-slate-500">
                    No comments yet. A comment is the rationale a person gives with a decision or a request for changes.
                  </p>
                ))}

              {tab === "audit" &&
                (detail.trail.error ? (
                  <p className="text-[12.5px] text-amber-700 dark:text-amber-300">The trail could not be read. {explainWorkflowError(detail.trail.error.message)}</p>
                ) : trail.length ? (
                  <TrailTable trail={[...trail].reverse()} dir={dir} />
                ) : (
                  <p className="text-[12.5px] text-slate-500">Nothing recorded yet.</p>
                ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <h2 className="mb-2 text-[17px] font-bold text-navy-950 dark:text-slate-100">Workflow Details</h2>
            <dl>
              <SideFact icon={<FileText className="h-4 w-4" />} label="Title">{row.title}</SideFact>
              <SideFact icon={<ScrollText className="h-4 w-4" />} label="Description"><span className="font-medium">{row.description}</span></SideFact>
              <SideFact icon={<UserRound className="h-4 w-4" />} label="Requester">{row.requester}</SideFact>
              <SideFact icon={<UserRound className="h-4 w-4" />} label="Owner">{wf.escalation_target ? dir.name(wf.escalation_target) : "—"}</SideFact>
              <SideFact icon={<CalendarDays className="h-4 w-4" />} label="Start Date">{wf.started_at ? formatDateTime(wf.started_at) : "—"}</SideFact>
              <SideFact icon={<CalendarDays className="h-4 w-4" />} label="Due Date">
                <span className="flex flex-wrap items-center gap-2">
                  {row.due ? formatDate(row.due) : "None"}
                  {row.open && row.due && <DeadlineMark deadline={row.deadline} due={row.due} />}
                </span>
              </SideFact>
              <SideFact icon={<Activity className="h-4 w-4" />} label="Status"><Badge tone={chip.tone}>{chip.label}</Badge></SideFact>
              <SideFact icon={<History className="h-4 w-4" />} label="Review cycle">{wf.review_cycle ?? 1}</SideFact>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-[17px] font-bold text-navy-950 dark:text-slate-100">Related Items</h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                {
                  icon: <Workflow className="h-4 w-4" />,
                  label: def ? `Route: ${def.name || humanizeCode(def.workflow_type)} v${def.version}` : "Route definition",
                  n: wf.workflow_definition_id ? 1 : 0,
                  href: wf.workflow_definition_id ? `${BASE}/builder?tab=library&def=${wf.workflow_definition_id}` : undefined,
                },
                { icon: <ScrollText className="h-4 w-4" />, label: "Governance decisions", n: decisions.length + (wf.causation_decision_id ? 1 : 0), href: tabHref("controls") },
                { icon: <ShieldCheck className="h-4 w-4" />, label: "Subject", n: wf.subject_id ? 1 : 0, href: tabHref("subject") },
                { icon: <History className="h-4 w-4" />, label: "Audit entries", n: trail.length, href: tabHref("audit") },
              ].map((it) => {
                const inner = (
                  <>
                    <span className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-navy-950 dark:text-slate-100">
                      <span className="text-slate-500">{it.icon}</span>
                      <span className="truncate">{it.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-md bg-navy-50 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-navy-700 dark:bg-navy-500/15 dark:text-navy-200">{it.n}</span>
                      {it.href && <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </span>
                  </>
                );
                return (
                  <li key={it.label}>
                    {it.href ? (
                      <Link href={it.href} scroll={false} className="flex items-center justify-between gap-3 py-2.5 hover:text-navy-700">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 py-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
              {wf.causation_decision_id && (
                <li>
                  <Link href={`/admin/governance/decisions/${wf.causation_decision_id}`} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px] text-navy-700 hover:underline dark:text-navy-300">
                    Resolves governance decision {wf.causation_decision_id.slice(0, 8)}…
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              )}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-[17px] font-bold text-navy-950 dark:text-slate-100">Administration</h2>
            <p className="mb-3 text-[12px] text-slate-500 dark:text-slate-400">Each needs its own WORKFLOW_* grant; workflow-svc refuses otherwise.</p>
            <AdminCommands
              workflowId={wf.workflow_instance_id}
              rowVersion={wf.row_version}
              idempotencyKey={crypto.randomUUID()}
              people={people}
              me={me}
              open={row.open}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
