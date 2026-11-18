import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter, RegisterCard } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { BASE, TABS, loadJurisdictions, loadPacks, loadSources, tabHref, tabOf, type Ctx, type Query, type TabKey } from "@/components/admin/jurisdictions/console/data";
import { JurisdictionKpis, JurisdictionPanels, ScopeChips } from "@/components/admin/jurisdictions/console/overview";
import { RegistryActions, RegistryTab } from "@/components/admin/jurisdictions/console/registry";
import { ProposeRule, RulesTab } from "@/components/admin/jurisdictions/console/rules";
import { PacksActions, PacksTab } from "@/components/admin/jurisdictions/console/packs";
import { ApplicabilityActions, ApplicabilityTab } from "@/components/admin/jurisdictions/console/applicability";
import { SourcesActions, SourcesTab } from "@/components/admin/jurisdictions/console/sources";
import { HistoryTab } from "@/components/admin/jurisdictions/console/history";
import { RolloutsActions, RolloutsTab } from "@/components/admin/jurisdictions/console/rollouts";
import { CalendarsActions, CalendarsTab } from "@/components/admin/jurisdictions/console/calendars";
import { TermsActions, TermsTab } from "@/components/admin/jurisdictions/console/terms";
import { ObligationsActions, ObligationsTab } from "@/components/admin/jurisdictions/console/obligations";
import { RemediationActions, RemediationTab } from "@/components/admin/jurisdictions/console/remediation";

export const metadata: Metadata = { title: "Jurisdictions & Rules | Zoiko Suite" };

export default async function JurisdictionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab = tabOf(query);
  query.tab = tab === "registry" ? undefined : tab;

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SignInAgain returnTo={BASE} />
      </div>
    );
  }
  const ctx: Ctx = { identity: current.identity, me: current.identity.principalId };
  const [jurisdictions, packs, sources] = await Promise.all([loadJurisdictions(ctx.identity), loadPacks(ctx.identity), loadSources(ctx.identity)]);
  const jList = jurisdictions.data ?? [];

  const counts: Partial<Record<TabKey, number>> = {
    ...(jurisdictions.data ? { registry: jurisdictions.data.length } : {}),
    ...(packs.data ? { packs: packs.data.length } : {}),
    ...(sources.data ? { sources: sources.data.length } : {}),
  };

  const actions: Partial<Record<TabKey, React.ReactNode>> = {
    registry: <RegistryActions jurisdictions={jList} />,
    packs: <PacksActions />,
    applicability: <ApplicabilityActions jurisdictions={jList} />,
    sources: <SourcesActions ctx={ctx} jurisdictions={jList} />,
    rollouts: <RolloutsActions />,
    calendars: <CalendarsActions jurisdictions={jList} />,
    terms: <TermsActions jurisdictions={jList} code={query.term?.trim().toUpperCase() || undefined} />,
    obligations: <ObligationsActions jurisdictions={jList} />,
    remediation: <RemediationActions />,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jurisdictions & Rules"
        description="Govern jurisdiction coverage, authoritative sources, rule-pack versions, and applicability decisions across the organization."
        actions={
          <>
            <a
              href={`${BASE}/export`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Export registry
            </a>
            <ProposeRule jurisdictions={jList} defaultJurisdiction={query.jur} />
          </>
        }
      />

      <JurisdictionKpis identity={ctx.identity} />
      <JurisdictionPanels identity={ctx.identity} />

      <div className="space-y-2">
        <ScopeChips identity={ctx.identity} />
        <RegisterCard
          active={tab}
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: tabHref(t.key) }))}
          actions={actions[tab]}
        >
          {tab === "registry" && <RegistryTab query={query} ctx={ctx} />}
          {tab === "rules" && <RulesTab query={query} ctx={ctx} />}
          {tab === "packs" && <PacksTab query={query} ctx={ctx} />}
          {tab === "applicability" && <ApplicabilityTab query={query} ctx={ctx} />}
          {tab === "sources" && <SourcesTab query={query} ctx={ctx} />}
          {tab === "history" && <HistoryTab query={query} ctx={ctx} />}
          {tab === "rollouts" && <RolloutsTab query={query} ctx={ctx} />}
          {tab === "calendars" && <CalendarsTab query={query} ctx={ctx} />}
          {tab === "terms" && <TermsTab query={query} ctx={ctx} />}
          {tab === "obligations" && <ObligationsTab query={query} ctx={ctx} />}
          {tab === "remediation" && <RemediationTab query={query} ctx={ctx} />}
        </RegisterCard>
      </div>

      <ControlsFooter right="jurisdiction-rules-svc · live data">
        Production controls: bitemporal effective dates · maker-checker on rules, sources, imports, calendars and packs · only signed packs deploy · source
        provenance · tamper-evident outbox and decision evidence
      </ControlsFooter>
    </div>
  );
}
