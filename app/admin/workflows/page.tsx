import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Upload, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter, RegisterCard, RegisterPager } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { explainWorkflowError } from "@/lib/api/workflow";
import {
  BASE,
  DETAIL_CAP,
  TABS,
  href,
  isFiltered,
  loadConsole,
  loadDetail,
  pageOf,
  rowsFor,
  tabOf,
  type Query,
} from "@/components/admin/workflow/console/data";
import { ApprovalTrendPanel, WorkflowKpis } from "@/components/admin/workflow/console/overview";
import { WorkflowTable, WorkflowToolbar, registerFilters } from "@/components/admin/workflow/console/register";
import { ApprovalDrawer } from "@/components/admin/workflow/console/drawer";

export const metadata: Metadata = { title: "Workflows & Approvals | Zoiko Suite" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Unavailable({ what, message }: { what: string; message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="font-semibold">{what} could not be read.</span> {message}
    </div>
  );
}

const EMPTY: Record<string, string> = {
  mine: "Nothing is waiting on your decision.",
  requests: "You have not started a workflow yet. Start one with Create Workflow.",
  all: "No workflow has been started in this tenant yet.",
  history: "No workflow has finished yet.",
};

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab = tabOf(query);
  query.tab = tab === "mine" ? undefined : tab;

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
  const data = await loadConsole(identity);
  const readable = !data.all.error || !data.pending.error;
  const listError = data.all.error ?? data.pending.error;

  const { page, size } = pageOf(query);
  const filtered = rowsFor(tab, data.rows, query, me);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const at = Math.min(page, pages);
  const visible = filtered.slice((at - 1) * size, at * size);

  // The v2.0 mock opens with the first row in the drawer; a reader who closed
  // it (?drawer=closed) keeps it closed until they pick a row.
  const selectedId = query.id ?? (query.drawer !== "closed" ? visible[0]?.wf.workflow_instance_id : undefined);
  const detail = selectedId && UUID.test(selectedId) ? await loadDetail(selectedId, identity) : null;

  const counts: Record<string, number | null> = {
    mine: readable ? data.rows.filter((r) => r.mine).length : null,
    requests: readable ? data.rows.filter((r) => r.wf.initiated_by === me).length : null,
    all: readable ? data.rows.length : null,
    history: readable ? data.rows.filter((r) => !r.open).length : null,
  };

  const exportParams = new URLSearchParams();
  for (const k of ["tab", "q", "type", "entity", "status", "deadline"]) if (query[k]) exportParams.set(k, query[k]!);

  const needle = (query.q ?? "").trim();
  const drawer = detail ? (
    <ApprovalDrawer detail={detail} query={query} dir={data.dir} me={me} idempotencyKey={crypto.randomUUID()} />
  ) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows & Approvals Console"
        description="Review decisions, monitor process execution and manage approval workflows across entities and jurisdictions."
        meta={
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11.5px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            workflow-svc · live data
          </span>
        }
        actions={
          <>
            <a
              href={`${BASE}/export?${exportParams.toString()}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              Export
            </a>
            <Link
              href={`${BASE}/builder`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Workflow className="h-4 w-4" />
              Workflow Builder
            </Link>
            <Link
              href={`${BASE}/builder?tab=start`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gold-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-gold-600"
            >
              <Plus className="h-4 w-4" />
              Create Workflow
            </Link>
          </>
        }
      />

      {/* v2.0 mock: KPIs, the trend and the register on the left; the
          selected workflow's Approval Details as its own card on the right,
          from the top of the page. Narrower than 2xl the drawer drops below. */}
      <div className={cn("grid min-w-0 grid-cols-1 items-start gap-4", drawer && "2xl:grid-cols-[minmax(0,1fr)_23rem]")}>
        <div className="min-w-0 space-y-4">
          {listError && !readable && <Unavailable what="Workflows" message={explainWorkflowError(listError.message)} />}
          <WorkflowKpis rows={data.rows} readable={readable} query={query} />
          <ApprovalTrendPanel rows={data.rows} truncated={data.truncated} readable={!data.all.error} />

          <RegisterCard
            active={tab}
            tabs={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              count: counts[t.key],
              href: href({ size: query.size }, { tab: t.key === "mine" ? undefined : t.key }),
            }))}
          >
            <WorkflowToolbar filters={registerFilters(data.rows, data.dir, query)} query={query} />
            {listError && readable && (
              <div className="px-5 pt-3">
                <Unavailable
                  what={data.all.error ? "The full workflow list" : "The pending list"}
                  message={explainWorkflowError(listError.message)}
                />
              </div>
            )}
            {data.unread > 0 && (
              <p className="px-5 pt-3 text-[12px] text-slate-500 dark:text-slate-400">
                {data.unread} open workflow{data.unread === 1 ? "" : "s"} beyond the first {DETAIL_CAP} were listed without their stages, so whether
                they wait on you is not shown here. Open one to see it.
              </p>
            )}
            {!readable ? (
              <div className="px-5 py-12 text-center text-[13px] text-slate-500 dark:text-slate-400">
                Listing workflows needs WORKFLOW_READ at platform scope. You can still open a workflow you started or are due to decide by its ID:
                <form action={BASE} className="mx-auto mt-3 flex max-w-md gap-2">
                  <input
                    name="id"
                    placeholder="Workflow ID (UUID)"
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 font-mono text-[12px] dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button className="h-9 rounded-lg bg-navy-900 px-3 text-[12.5px] font-medium text-white">Open</button>
                </form>
              </div>
            ) : visible.length === 0 ? (
              <div className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">
                {isFiltered(query) ? "No workflow matches these filters." : EMPTY[tab]}
                {UUID.test(needle) && (
                  <p className="mt-2">
                    <Link href={`${BASE}/${needle}`} className="font-medium text-navy-600 hover:underline dark:text-navy-300">
                      Open workflow {needle.slice(0, 8)}… directly
                    </Link>
                  </p>
                )}
              </div>
            ) : (
              <>
                <WorkflowTable rows={visible} query={query} dir={data.dir} selectedId={selectedId} />
                <RegisterPager
                  page={at}
                  pageSize={size}
                  total={filtered.length}
                  noun={filtered.length === 1 ? "workflow" : "workflows"}
                  hrefFor={(p) => href(query, { page: String(p), id: undefined })}
                  note={data.truncated && tab !== "mine" ? "latest 200" : undefined}
                />
              </>
            )}
          </RegisterCard>
        </div>
        {drawer}
      </div>

      <ControlsFooter right="workflow-svc · authorization-svc · governance-decision-log-svc">
        Required controls: the initiator never decides their own workflow · nobody decides two stages · a service account never decides ·
        every decision is authorized and recorded in the governance log · an approval covers its subject only as it was approved
      </ControlsFooter>
    </div>
  );
}
