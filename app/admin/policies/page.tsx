import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { explainPolicyError } from "@/lib/api/policies";
import {
  BASE,
  filterOf,
  isFiltered,
  loadConsole,
  loadControlDetail,
  loadPolicyDetail,
  pageOf,
  queryOf,
  type Query,
} from "@/components/admin/policies/console/data";
import { filterRows } from "@/components/admin/policies/console/model";
import { PolicyKpis, PolicyPanels } from "@/components/admin/policies/console/overview";
import { EXPORT_FORM, Pager, RegisterTable, RegisterToolbar } from "@/components/admin/policies/console/register";
import { MissingDrawer, RecordDrawer } from "@/components/admin/policies/console/drawer";
import { NewMenu, NewPanel } from "@/components/admin/policies/console/create";

export const metadata: Metadata = { title: "Policies & Controls | Zoiko Suite" };

function Unavailable({ what, message }: { what: string; message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="font-semibold">{what} could not be read.</span> {message}
    </div>
  );
}

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query: Query = queryOf(await searchParams);

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SignInAgain returnTo={BASE} />
      </div>
    );
  }
  const identity = current.identity;
  const data = await loadConsole(identity);
  const { model } = data;

  const rows = filterRows(model.rows, filterOf(query));
  const { page, size } = pageOf(query);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const shown = rows.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size);

  // The v2.0 mock opens with the first row in the drawer. A reader who
  // closed it (?drawer=closed) keeps it closed until they pick a row.
  const openId = query.id ?? (query.drawer !== "closed" ? shown[0]?.id : undefined);
  const open = openId ? model.rows.find((r) => r.id === openId) : undefined;
  const [policyDetail, controlDetail] = await Promise.all([
    open?.policy ? loadPolicyDetail(identity, open.policy, open.versions ?? []) : undefined,
    open?.control ? loadControlDetail(identity, open.control) : undefined,
  ]);
  const drawer = open ? (
    <RecordDrawer row={open} model={model} query={query} entities={data.entities} policyDetail={policyDetail} controlDetail={controlDetail} />
  ) : query.id ? (
    <MissingDrawer query={query} />
  ) : null;

  const readError = data.families.error ?? data.versions.error ?? data.controls.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Policies & Controls"
        description="Manage enterprise policies, controls and control effectiveness across all entities and domains."
        actions={
          <>
            {/* Exports the ticked rows, or every row under the current filters when none is ticked. */}
            <form id={EXPORT_FORM} action={`${BASE}/export`} method="get">
              {Object.entries(filterOf(query)).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" />
                Export
              </button>
            </form>
            <NewMenu query={query} />
          </>
        }
      />

      <NewPanel query={query} open={open} />

      {readError && <Unavailable what="Part of the policy register" message={explainPolicyError(readError.message, { status: readError.status })} />}
      {data.truncated && (
        <p className="text-[12px] text-slate-500">
          The registers are larger than one page view reads; figures cover the first 2,000 records of each and the executions of the first 150 controls.
        </p>
      )}

      <PolicyKpis data={data} />
      <PolicyPanels data={data} query={query} />

      {/* v2.0 mock: the register card on the left, the selected record's
          drawer as its own card on the right — side by side from 2xl, below
          the table on narrower screens. */}
      <div className={cn("grid min-w-0 grid-cols-1 items-start gap-4", drawer && "2xl:grid-cols-[minmax(0,1fr)_19rem]")}>
        <section aria-label="Policies and controls" className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-900">
          <RegisterToolbar query={query} entities={[...data.entities.values()]} />
          {rows.length > 0 ? (
            <>
              <RegisterTable rows={shown} query={query} selectedId={open?.id} />
              <Pager query={query} page={Math.min(page, pages)} size={size} total={rows.length} />
            </>
          ) : (
            <div className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {isFiltered(query)
                ? "No policy or control matches these filters."
                : readError
                  ? "Nothing to show: the registers could not be read."
                  : "No policy or control is defined yet. Start with New Policy / Control."}
            </div>
          )}
        </section>
        {drawer}
      </div>

      <ControlsFooter right="policy-svc · live data">
        Required controls: maker–checker on every policy version · the suspender never reviews a suspension · policies and control tests are
        immutable (a change is a new version or test code) · every evaluation is filed as evidence · test results are attributed to their tester
      </ControlsFooter>
    </div>
  );
}
