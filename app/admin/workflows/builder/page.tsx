import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ClipboardCheck, History, Library, ListChecks, Play, Plus, Wrench, X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { formatDate, formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";
import {
  decodeDefinitionStages,
  describeDefinitionStatus,
  describeStage,
  explainWorkflowError,
  getWorkflowDefinition,
  listWorkflowDefinitions,
  type StageInput,
  type WorkflowDefinition,
} from "@/lib/api/workflow";
import { loadDirectory, type Directory } from "@/components/admin/workflow/console/data";
import { DefinitionBuilder, StartWorkflowForm, type BuilderSeed } from "@/components/admin/workflow/console/builder";
import { DefinitionCommands } from "@/components/admin/workflow/console/commands";

export const metadata: Metadata = { title: "Workflow Builder | Zoiko Suite" };

const BASE = "/admin/workflows/builder";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABS = [
  { key: "build", label: "Build Workflow", icon: Wrench },
  { key: "start", label: "Start Workflow", icon: Play },
  { key: "mine", label: "My Workflows", icon: ListChecks },
  { key: "library", label: "Workflow Library", icon: Library },
  { key: "versions", label: "History & Versions", icon: History },
] as const;
type Tab = (typeof TABS)[number]["key"];

function stagesOf(d: WorkflowDefinition): StageInput[] | null {
  if (d.stages?.length) return d.stages;
  return decodeDefinitionStages(d.stages_json);
}

function labelOf(d: WorkflowDefinition): string {
  return `${d.name?.trim() || humanizeCode(d.workflow_type)} v${d.version}`;
}

function statusKey(d: WorkflowDefinition): string {
  return d.status ?? (d.is_active ? "PUBLISHED" : "RETIRED");
}

/** A route can be started from when it is active and (on WFC-01 builds) published. */
function startable(d: WorkflowDefinition): boolean {
  return d.is_active && (!d.status || d.status === "PUBLISHED");
}

function stageText(s: StageInput, dir: Directory): string {
  if (s.approver_role) return `Anyone holding ${humanizeCode(s.approver_role)}`;
  if (s.quorum_approvers?.length) return `${s.required_approvals ?? "?"} of ${s.quorum_approvers.map((p) => dir.name(p)).join(", ")}`;
  if (s.approver_principal_id) return dir.name(s.approver_principal_id);
  return describeStage(s);
}

function DefinitionTable({ rows, dir, selected, hrefFor }: { rows: WorkflowDefinition[]; dir: Directory; selected?: string; hrefFor: (id: string) => string }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11.5px] font-semibold text-navy-950 dark:border-slate-800 dark:text-slate-300">
            <th className="px-2 py-3 pl-5">Workflow</th>
            <th className="px-2 py-3">Version</th>
            <th className="px-2 py-3">Status</th>
            <th className="px-2 py-3">Stages</th>
            <th className="px-2 py-3">Author</th>
            <th className="px-2 py-3 pr-5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((d) => {
            const st = describeDefinitionStatus(d);
            const on = d.workflow_definition_id === selected;
            return (
              <tr key={d.workflow_definition_id} className={cn("align-middle", on ? "bg-navy-50/70 dark:bg-navy-500/10" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30")}>
                <td className="px-2 py-3 pl-5">
                  <Link href={hrefFor(d.workflow_definition_id)} scroll={false} className="block font-semibold text-navy-700 hover:underline dark:text-navy-300">
                    {d.name?.trim() || humanizeCode(d.workflow_type)}
                  </Link>
                  <span className="block text-[11px] tracking-wide text-slate-500">{d.workflow_type}</span>
                </td>
                <td className="px-2 py-3 tabular-nums">v{d.version}</td>
                <td className="px-2 py-3">
                  <Badge tone={st.tone}>{st.label}</Badge>
                </td>
                <td className="px-2 py-3 tabular-nums">{stagesOf(d)?.length ?? "—"}</td>
                <td className="max-w-36 truncate px-2 py-3">{dir.name(d.created_by)}</td>
                <td className="whitespace-nowrap px-2 py-3 pr-5 tabular-nums">{d.created_at ? formatDate(d.created_at) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-b border-slate-100 py-2 text-[12px] last:border-0 dark:border-slate-800">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 wrap-break-word font-medium text-navy-950 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function DefinitionPanel({
  d,
  all,
  dir,
  me,
  closeHref,
}: {
  d: WorkflowDefinition;
  all: WorkflowDefinition[];
  dir: Directory;
  me: string;
  closeHref: string;
}) {
  const st = describeDefinitionStatus(d);
  const stages = stagesOf(d);
  const replacements = all
    .filter((x) => x.workflow_type === d.workflow_type && x.workflow_definition_id !== d.workflow_definition_id && startable(x))
    .map((x) => ({ id: x.workflow_definition_id, label: labelOf(x) }));
  const supersededBy = d.superseded_by ? all.find((x) => x.workflow_definition_id === d.superseded_by) : undefined;
  return (
    <aside className="self-start rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-navy-950 dark:text-slate-100">{labelOf(d)}</p>
          <div className="mt-1">
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </Link>
      </div>
      <div className="space-y-4 px-4 py-3">
        {d.description && <p className="text-[12.5px] text-slate-600 dark:text-slate-300">{d.description}</p>}
        <dl>
          <Row label="Type"><span className="break-all text-[11.5px]">{d.workflow_type}</span></Row>
          <Row label="Author">{dir.name(d.created_by)}</Row>
          <Row label="Created">{d.created_at ? formatDateTime(d.created_at) : "—"}</Row>
          {d.approved_by && <Row label="Validated by">{dir.name(d.approved_by)}{d.approved_at ? ` · ${formatDate(d.approved_at)}` : ""}</Row>}
          {d.published_at && <Row label="Published">{d.published_by ? `${dir.name(d.published_by)} · ` : ""}{formatDateTime(d.published_at)}</Row>}
          {d.effective_from && <Row label="Effective">{formatDate(d.effective_from)}{d.effective_to ? ` – ${formatDate(d.effective_to)}` : ""}</Row>}
          {d.superseded_by && <Row label="Superseded by">{supersededBy ? labelOf(supersededBy) : `${d.superseded_by.slice(0, 8)}…`}</Row>}
          {d.checksum && <Row label="Checksum"><span className="font-mono text-[10.5px]">{d.checksum.slice(0, 16)}…</span></Row>}
        </dl>
        <div>
          <p className="mb-2 text-[13px] font-bold text-navy-950 dark:text-slate-100">Route</p>
          {stages ? (
            <ol className="space-y-1.5">
              {stages.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-navy-50 text-[11px] font-bold text-navy-700 dark:bg-navy-500/15 dark:text-navy-200">{i + 1}</span>
                  <span className="text-navy-950 dark:text-slate-100">
                    {stageText(s, dir)}
                    {s.due_at_hours ? <span className="text-slate-500"> · {s.due_at_hours}h deadline</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              The stored route cannot be read, so nothing can start from it. Save a corrected version and supersede this one.
            </p>
          )}
        </div>
        <div>
          <p className="mb-2 text-[13px] font-bold text-navy-950 dark:text-slate-100">Lifecycle</p>
          <DefinitionCommands
            definitionId={d.workflow_definition_id}
            status={statusKey(d)}
            rowVersion={d.row_version}
            replacements={replacements}
            authoredByMe={d.created_by === me}
          />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Link href={`${BASE}?def=${d.workflow_definition_id}`} className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-[12.5px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
            Edit as new version
          </Link>
          {startable(d) && (
            <Link href={`${BASE}?tab=start&def=${d.workflow_definition_id}`} className="inline-flex h-8 items-center rounded-lg bg-gold-500 px-3 text-[12.5px] font-semibold text-white hover:bg-gold-600">
              Start from this route
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}

export default async function WorkflowBuilderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tab: Tab = TABS.some((t) => t.key === q("tab")) ? (q("tab") as Tab) : "build";
  const defId = q("def");
  // From "Start the approval" on an escalated policy evaluation.
  const resolves = /^[A-Za-z0-9._:-]{1,128}$/.test(q("resolves") ?? "") ? q("resolves") : undefined;
  const startType = /^[A-Z0-9_]{1,64}$/.test(q("type") ?? "") ? q("type") : undefined;

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SignInAgain returnTo={BASE} />
      </div>
    );
  }
  const identity = current.identity;
  const me = identity.principalId;

  const definitionsRead = listWorkflowDefinitions(identity);
  const [directory, chosen] = await Promise.all([
    loadDirectory(identity, definitionsRead),
    defId && UUID.test(defId) ? getWorkflowDefinition(defId, identity) : Promise.resolve(null),
  ]);
  const { dir, people, entities } = directory;
  const defsError = directory.definitions.error;
  const definitions = [...(directory.definitions.data ?? [])].sort(
    (a, b) => a.workflow_type.localeCompare(b.workflow_type) || b.version - a.version,
  );
  const listedChosen = defId ? definitions.find((d) => d.workflow_definition_id === defId) : undefined;
  const picked: WorkflowDefinition | undefined = chosen?.ok ? { ...listedChosen, ...chosen.data } : listedChosen;

  const nextVersions: Record<string, number> = {};
  for (const d of definitions) nextVersions[d.workflow_type] = Math.max(nextVersions[d.workflow_type] ?? 1, d.version + 1);

  const seed: BuilderSeed = picked
    ? {
        name: picked.name ?? "",
        workflowType: picked.workflow_type,
        description: picked.description ?? "",
        version: nextVersions[picked.workflow_type] ?? picked.version + 1,
        stages: stagesOf(picked) ?? undefined,
        basedOn: { label: labelOf(picked), status: statusKey(picked) },
      }
    : { name: "", workflowType: "", description: "", version: 1 };

  const tabHref = (t: Tab, extra = "") => `${BASE}${t === "build" ? (extra ? `?${extra}` : "") : `?tab=${t}${extra ? `&${extra}` : ""}`}`;
  const listRows = tab === "mine" ? definitions.filter((d) => d.created_by === me) : definitions;
  const routes = definitions
    .filter(startable)
    .map((d) => ({ id: d.workflow_definition_id, label: labelOf(d), workflowType: d.workflow_type, stages: stagesOf(d)?.length ?? 0 }));
  const byType = new Map<string, WorkflowDefinition[]>();
  for (const d of definitions) byType.set(d.workflow_type, [...(byType.get(d.workflow_type) ?? []), d]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflow Builder & Approval Routing"
        description="Design, configure and manage business workflows, approval stages and routing — versioned, validated and published under maker–checker."
        actions={
          <>
            <Link
              href="/admin/workflows"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Workflows
            </Link>
            <Link href={BASE} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gold-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-gold-600">
              <Plus className="h-4 w-4" />
              New Workflow Definition
            </Link>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-1 p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold transition-colors",
                on ? "bg-navy-600 text-white shadow-sm dark:bg-navy-500" : "text-navy-900 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
        <Link
          href="/admin/workflows"
          className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-navy-900 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ClipboardCheck className="h-4 w-4" />
          Approval Tasks
        </Link>
      </Card>

      {defsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">Workflow definitions could not be read.</span> {explainWorkflowError(defsError.message)} Listing them needs WORKFLOW_READ at
          platform scope; saving one needs WORKFLOW_DEFINE.
        </div>
      )}
      {defId && !picked && tab !== "start" && (
        <p className="text-[12.5px] text-amber-700 dark:text-amber-300">No definition with that ID is visible to you.</p>
      )}

      {tab === "build" && (
        <DefinitionBuilder
          key={picked?.workflow_definition_id ?? "new"}
          seed={seed}
          people={people}
          nextVersions={nextVersions}
          libraryHref={`${BASE}?tab=library`}
        />
      )}

      {tab === "start" && (
        <StartWorkflowForm
          routes={routes}
          entities={entities.map((e) => ({ id: e.legal_entity_id, name: e.trading_name || e.legal_name }))}
          defaultEntity={identity.legalEntityId}
          people={people}
          me={me}
          idempotencyKey={crypto.randomUUID()}
          initialRoute={defId}
          resolves={resolves}
          initialType={startType}
        />
      )}

      {(tab === "library" || tab === "mine") && (
        <div className={cn("grid grid-cols-1 items-start gap-4", picked && "xl:grid-cols-[minmax(0,1fr)_24rem]")}>
          <Card className="min-w-0 overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <h2 className="text-[16px] font-bold text-navy-950 dark:text-slate-100">
                {tab === "mine" ? "Routes you authored" : "Workflow Library"} <span className="font-medium text-slate-500">({listRows.length})</span>
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">Every version of every route. Select one to validate, approve, publish or retire it.</p>
            </div>
            {listRows.length ? (
              <DefinitionTable rows={listRows} dir={dir} selected={picked?.workflow_definition_id} hrefFor={(id) => tabHref(tab, `def=${id}`)} />
            ) : (
              <p className="px-5 py-12 text-center text-[13px] text-slate-500 dark:text-slate-400">
                {tab === "mine" ? "You have not authored a route yet." : "No route has been defined yet."}{" "}
                <Link href={BASE} className="font-medium text-navy-600 hover:underline dark:text-navy-300">
                  Build one
                </Link>
              </p>
            )}
          </Card>
          {picked && <DefinitionPanel d={picked} all={definitions} dir={dir} me={me} closeHref={tabHref(tab)} />}
        </div>
      )}

      {tab === "versions" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {byType.size === 0 && <Card className="p-6 text-[13px] text-slate-500">No route has been defined yet.</Card>}
          {[...byType.entries()].map(([type, versions]) => (
            <Card key={type} className="p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-bold text-navy-950 dark:text-slate-100">{humanizeCode(type)}</h3>
                <span className="font-mono text-[11px] text-slate-500">{type}</span>
              </div>
              <ol className="mt-3 space-y-2 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                {versions.map((d) => {
                  const st = describeDefinitionStatus(d);
                  return (
                    <li key={d.workflow_definition_id} className="relative">
                      <span className={cn("absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900", st.tone === "success" ? "bg-emerald-500" : st.tone === "warning" ? "bg-amber-500" : st.tone === "danger" ? "bg-rose-500" : st.tone === "info" ? "bg-navy-500" : "bg-slate-400")} />
                      <Link href={tabHref("library", `def=${d.workflow_definition_id}`)} className="flex flex-wrap items-center gap-2 text-[12.5px] hover:underline">
                        <span className="font-semibold text-navy-950 dark:text-slate-100">v{d.version}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <span className="text-slate-500">
                          {d.name?.trim() ? `${d.name} · ` : ""}
                          {dir.name(d.created_by)} · {d.created_at ? formatDate(d.created_at) : "—"}
                        </span>
                      </Link>
                      {d.superseded_by && (
                        <p className="text-[11.5px] text-slate-500">
                          Superseded by v{definitions.find((x) => x.workflow_definition_id === d.superseded_by)?.version ?? "?"}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
          ))}
        </div>
      )}

      <ControlsFooter right="workflow-svc · live data">
        Required controls: routes are immutable once saved · maker–checker on validation · running workflows keep the version they started with ·
        every approver is checked for WORKFLOW_APPROVE before a workflow starts
      </ControlsFooter>
    </div>
  );
}
