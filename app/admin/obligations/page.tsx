import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter, RegisterCard } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { RegisterView, type Query, type RegisterSpec } from "@/components/admin/authorization/console/register";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { loadObligations, type ObligationsData } from "@/components/admin/obligations/console/data";
import { obligationsRegister } from "@/components/admin/obligations/console/obligations";
import { clocksRegister } from "@/components/admin/obligations/console/clocks";
import { definitionsRegister, mappingsRegister } from "@/components/admin/obligations/console/definitions";
import { filingsRegister } from "@/components/admin/obligations/console/filings";
import { applicabilityRegister } from "@/components/admin/obligations/console/applicability";
import { ObligationsKpis, ObligationsPanels } from "@/components/admin/obligations/console/overview";
import { NewObligationDialog, CheckApplicabilityDialog } from "@/components/admin/obligations/console/forms";
import { href, type ObligationsCtx } from "@/components/admin/obligations/console/shared";
import { needsAttention } from "@/lib/api/authorization";
import { currentSession } from "@/lib/authz-inbox";

export const metadata: Metadata = { title: "Obligations | Zoiko Suite" };

const TABS = [
  { key: "obligations", label: "Obligations" },
  { key: "clocks", label: "Deadline Clocks" },
  { key: "definitions", label: "Definitions & Mappings" },
  { key: "filings", label: "Filing Requirements" },
  { key: "applicability", label: "Applicability" },
] as const;

type TabKey = typeof TABS[number]["key"];

async function Page() {
  const session = await currentSession();
  if (!session) return <SignInAgain />;

  const { identity } = session;
  const data = await loadObligations(identity);
  const ctx: ObligationsCtx = { me: identity.principalId, canManage: true, legalEntityId: identity.legalEntityId };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compliance › Obligations"
        description="Statutory, regulatory, contractual and internal obligations — what is owed, to which jurisdiction, by when, and whether it has been discharged. Every obligation is bound to a legal entity and a jurisdiction, and carries a reference back to its source. Deadline clocks add computed deadlines with calendar provenance, satisfaction/waiver/N-A with authority, and escalation ladders."
        actions={
          <>
            <NewObligationDialog legalEntityId={identity.legalEntityId} />
            <CheckApplicabilityDialog legalEntityId={identity.legalEntityId} />
          </>
        }
      />

      <SessionChip identity={identity} attention={needsAttention(identity)} />

      {data.summary.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/30 dark:bg-rose-500/5">
          <p className="text-sm text-rose-800 dark:text-rose-300">
            Summary unavailable: {data.summary.error.message}
          </p>
        </div>
      )}

      {data.summary.value && (
        <>
          <ObligationsKpis summary={data.summary.value} />
          <ObligationsPanels summary={data.summary.value} />
        </>
      )}

      <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
        <RegisterView<TabKey, ObligationsData, ObligationsCtx>
          data={data}
          ctx={ctx}
          tabs={TABS}
          count={(data, tab) => {
            switch (tab) {
              case "obligations": return data.obligations.error ? null : data.obligations.rows.length;
              case "clocks": return data.clocks.error ? null : data.clocks.rows.length;
              case "definitions": return 0; // placeholder
              case "filings": return 0; // placeholder
              case "applicability": return 0; // placeholder
              default: return undefined;
            }
          }}
          registerFor={(tab, data, ctx) => {
            switch (tab) {
              case "obligations": return obligationsRegister(data, ctx);
              case "clocks": return clocksRegister(data, ctx);
              case "definitions": return definitionsRegister(data, ctx);
              case "filings": return filingsRegister(data, ctx);
              case "applicability": return applicabilityRegister(data, ctx);
              default: return null;
            }
          }}
          tabActions={(tab, legalEntityId) => {
            switch (tab) {
              case "obligations":
                return <NewObligationDialog legalEntityId={legalEntityId} />;
              case "applicability":
                return <CheckApplicabilityDialog legalEntityId={legalEntityId} />;
              default:
                return null;
            }
          }}
          baseHref={BASE}
          firstProblem={(data) => data.obligations.error || data.clocks.error}
        />
      </div>

      <ControlsFooter
        items={[
          { label: "All deadlines from versioned rules/calendars", tone: "info" },
          { label: "Satisfy requires evidence; Waive/N-A require authority + reason", tone: "warning" },
          { label: "OVERDUE is never suppressed — only FULFILLED/WAIVED/NOT_APPLICABLE/SUPERSEDED clear it", tone: "danger" },
        ]}
      />
    </div>
  );
}

export default Page;