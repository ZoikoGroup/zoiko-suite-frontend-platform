import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/shared";
import { ControlsFooter, RegisterCard } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { RegisterView, type Query, type RegisterSpec } from "@/components/admin/authorization/console/register";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { CheckTab } from "@/components/admin/evidence/console/check";
import { loadEvidence, type EvidenceData } from "@/components/admin/evidence/console/data";
import { evaluationsRegister } from "@/components/admin/evidence/console/evaluations";
import { AddRequirementDialog, CheckEvidenceDialog, NewEvidenceRequestDialog } from "@/components/admin/evidence/console/forms";
import { EvidenceKpis, EvidencePanels } from "@/components/admin/evidence/console/overview";
import { requestsRegister } from "@/components/admin/evidence/console/pbc";
import { requirementsRegister } from "@/components/admin/evidence/console/requirements";
import { href, type EvidenceCtx } from "@/components/admin/evidence/console/shared";
import { needsAttention } from "@/lib/api/authorization";
import { currentSession } from "@/lib/authz-inbox";

export const metadata: Metadata = { title: "Evidence Requirements | Zoiko Suite" };

const TABS = [
  { key: "requirements", label: "Requirements" },
  { key: "evaluations", label: "Evaluations" },
  { key: "missing", label: "Missing" },
  { key: "requests", label: "Evidence requests" },
  { key: "check", label: "Check evidence" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Read once per request, outside render, so a re-render cannot change it. */
function requestTime(): number {
  return Date.now();
}

function count(data: EvidenceData, tab: TabKey): number | null | undefined {
  switch (tab) {
    case "requirements":
      return data.requirements.error ? null : data.requirements.rows.length;
    case "evaluations":
      return data.evaluations.error ? null : data.evaluations.rows.length;
    case "missing":
      return data.evaluations.error ? null : data.evaluations.rows.filter((e) => e.outcome === "MISSING").length;
    case "requests":
      return data.requests.error ? null : data.requests.rows.length;
    default:
      return undefined;
  }
}

function registerFor(tab: TabKey, data: EvidenceData, ctx: EvidenceCtx): RegisterSpec | null {
  switch (tab) {
    case "requirements":
      return requirementsRegister(data, ctx);
    case "evaluations":
      return evaluationsRegister(data);
    case "missing":
      return evaluationsRegister(data, { missingOnly: true });
    case "requests":
      return requestsRegister(data, ctx);
    case "check":
      return null;
  }
}

function tabActions(tab: TabKey, legalEntityId: string): ReactNode {
  switch (tab) {
    case "requests":
      return <NewEvidenceRequestDialog legalEntityId={legalEntityId} />;
    default:
      return null;
  }
}

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "requirements";
  query.tab = tab;

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain returnTo="/admin/evidence" />
        </div>
      </div>
    );
  }

  const now = requestTime();
  const data = await loadEvidence(current.identity);
  const ctx: EvidenceCtx = { me: current.identity.principalId, now, canManageRequests: data.canManageRequests };
  const signedOut = [data.summary.error, data.requirements.error].some((e) => e && needsAttention(e) === "signin");
  const spec = signedOut ? null : registerFor(tab, data, ctx);
  const entity = current.identity.legalEntityId;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Evidence Requirements"
        description="What evidence must exist before an action may complete, every check the gate has answered, and the evidence requested from people."
        meta={<SessionChip session={current.session} now={now} />}
        actions={
          <>
            <CheckEvidenceDialog legalEntityId={entity} />
            <AddRequirementDialog legalEntityId={entity} />
          </>
        }
      />

      {signedOut ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain returnTo="/admin/evidence" />
        </div>
      ) : (
        <>
          <EvidenceKpis data={data} />
          <EvidencePanels data={data} now={now} />

          <RegisterCard
            active={tab}
            tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: count(data, t.key), href: href({ tab: t.key }) }))}
            actions={tabActions(tab, entity)}
          >
            {spec ? <RegisterView spec={spec} query={query} /> : <CheckTab legalEntityId={entity} />}
          </RegisterCard>
        </>
      )}

      <ControlsFooter right="evidence-requirements-svc · live data">
        Required controls: evidence verified with its owner · a decision is never written when an owner is down · replays never
        change an answer · a reason on every catalogue change · every change made against the version you read
      </ControlsFooter>
    </div>
  );
}
