import type { Metadata } from "next";
import Form from "next/form";
import { CalendarDays, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter, RegisterBody, RegisterCard } from "@/components/admin/console";
import { FilterSelect } from "@/components/admin/console/FilterSelect";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { explainDecisionError } from "@/lib/api/governance";
import {
  BASE,
  PERIODS,
  TABS,
  daysOf,
  href,
  isFiltered,
  loadDetail,
  loadGovernance,
  pageOf,
  tabOf,
  type Query,
} from "@/components/admin/governance/console/data";
import { GovernanceKpis, GovernancePanels } from "@/components/admin/governance/console/overview";
import { DecisionTable, DecisionToolbar, Pager } from "@/components/admin/governance/console/register";
import { DecisionDrawer } from "@/components/admin/governance/console/drawer";
import { EvidenceTab, PackageDrawer, ReplaysTab } from "@/components/admin/governance/console/ledger";
import { NewDecisionDialog } from "@/components/admin/governance/console/forms";

export const metadata: Metadata = { title: "Governance Log | Zoiko Suite" };

function Unavailable({ what, message }: { what: string; message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="font-semibold">{what} could not be read.</span> {message}
    </div>
  );
}

/** The window selector: a GET form that keeps every other parameter. */
function PeriodSelect({ query, compact = false }: { query: Query; compact?: boolean }) {
  return (
    <Form action={BASE} scroll={false} className="inline-flex items-center gap-2">
      {Object.entries(query).map(([k, v]) => (k !== "days" && k !== "page" && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <FilterSelect
        name="days"
        aria-label="Period"
        defaultValue={String(daysOf(query))}
        options={PERIODS}
        icon={compact ? undefined : <CalendarDays className="h-4 w-4" />}
        className={compact ? "min-w-32" : "min-w-44"}
        selectClassName={compact ? undefined : "h-10 border-slate-300 text-sm text-navy-900 dark:border-slate-700"}
      />
    </Form>
  );
}

export default async function GovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab = tabOf(query);
  query.tab = tab === "decisions" ? undefined : tab;

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SignInAgain returnTo="/admin/governance" />
      </div>
    );
  }

  const identity = current.identity;
  const days = daysOf(query);
  const { page, size } = pageOf(query);
  const data = await loadGovernance(identity, query);

  // The v2.0 mock opens with the first row in the drawer. A reader who
  // closed it (?drawer=closed) keeps it closed until they pick a row.
  const firstRow = data.decisions?.data?.records[0];
  if (tab === "decisions" && !query.id && query.drawer !== "closed" && firstRow) {
    data.detail = await loadDetail(firstRow.decision_id, identity);
  }
  const selectedId = query.id ?? (data.detail ? firstRow?.decision_id : undefined);
  const summary = data.summary.data;
  const entityList = [...data.entities.values()];
  const domains = new Map((summary?.facets.domains ?? []).map((d) => [d.code, d.label] as const));
  const drawer =
    tab === "decisions" && data.detail ? <DecisionDrawer detail={data.detail} query={query} entities={data.entities} domains={domains} /> : null;
  const packages = data.packages.data?.records ?? [];
  const selectedPackage = tab === "evidence" && query.pkg ? packages.find((p) => p.package_id === query.pkg) : undefined;

  const exportParams = new URLSearchParams();
  for (const k of ["q", "domain", "status", "priority", "jurisdiction", "actor", "entity", "action", "rule_basis", "from", "to"]) {
    if (query[k]) exportParams.set(k, query[k]!);
  }

  const counts: Record<string, number | null | undefined> = {
    decisions: data.decisions?.data?.total_count ?? summary?.chain.length,
    replays: data.replays?.data?.total_count ?? summary?.replays.total,
    evidence: data.packages.data?.total_count ?? null,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Governance Log"
        description="A complete record of governance decisions, approvals, escalations and related actions across all entities, jurisdictions and domains."
        actions={
          <>
            <PeriodSelect query={query} />
            <a
              href={`${BASE}/export?${exportParams.toString()}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              Export
            </a>
            <NewDecisionDialog entities={entityList} domains={summary?.facets.domains ?? []} defaultEntity={identity.legalEntityId} />
          </>
        }
      />

      {data.summary.error ? (
        <Unavailable what="The governance summary" message={explainDecisionError(data.summary.error)} />
      ) : summary ? (
        <>
          <GovernanceKpis summary={summary} days={days} query={query} />
          <GovernancePanels summary={summary} query={query} periodControl={<PeriodSelect query={query} compact />} />
        </>
      ) : null}

      {/* v2.0 mock: the register card on the left, the selected decision's
          drawer as its own card on the right. Side by side only from 2xl
          (the mock's 1536px): narrower, the nine columns no longer fit
          beside it, so the drawer drops below the table instead. */}
      <div className={cn("grid min-w-0 grid-cols-1 items-start gap-4", drawer && "2xl:grid-cols-[minmax(0,1fr)_19rem]")}>
      <RegisterCard
        active={tab}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: counts[t.key],
          href: href({ days: query.days }, { tab: t.key === "decisions" ? undefined : t.key }),
        }))}
      >
        {tab === "decisions" && <DecisionToolbar query={query} summary={summary} entities={entityList} />}
        {tab === "decisions" &&
          (data.decisions?.error ? (
            <div className="p-5">
              <Unavailable what="The decision register" message={explainDecisionError(data.decisions.error)} />
            </div>
          ) : data.decisions?.data && data.decisions.data.records.length > 0 ? (
            <>
              <DecisionTable rows={data.decisions.data.records} query={query} domains={domains} entities={data.entities} selectedId={selectedId} />
              <Pager query={query} page={page} size={size} total={data.decisions.data.total_count} noun="decisions" />
            </>
          ) : (
            <div className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {isFiltered(query)
                ? "No decision matches these filters."
                : "No governance decision has been recorded yet. Services record their decisions here automatically; record one by hand with New Decision."}
            </div>
          ))}

        {tab === "replays" &&
          (data.replays?.error ? (
            <div className="p-5">
              <Unavailable what="The replay history" message={explainDecisionError(data.replays.error)} />
            </div>
          ) : (
            <ReplaysTab records={data.replays?.data?.records ?? []} total={data.replays?.data?.total_count ?? 0} query={query} page={page} size={size} />
          ))}

        {tab === "evidence" && (
          <RegisterBody drawer={selectedPackage ? <PackageDrawer pkg={selectedPackage} query={query} /> : undefined}>
            {data.packages.error ? (
              <div className="p-5">
                <Unavailable what="The evidence packages" message={explainDecisionError(data.packages.error)} />
              </div>
            ) : (
              <EvidenceTab summary={summary} packages={packages} query={query} />
            )}
          </RegisterBody>
        )}
      </RegisterCard>
      {drawer}
      </div>

      <ControlsFooter right="governance-decision-log-svc · live data">
        Required controls: decisions are immutable · reads are authorized · every decision is hash-chained · every replay records a
        manifest · sealed packages prove the record unchanged
      </ControlsFooter>
    </div>
  );
}
