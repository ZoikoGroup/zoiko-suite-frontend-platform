import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { ButtonLink, ControlsFooter, RegisterCard } from "@/components/admin/console";
import { CheckTab } from "@/components/admin/authorization/CheckTab";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { approvalsRegister } from "@/components/admin/authorization/console/approvals";
import { loadAuthorization, type AuthzData } from "@/components/admin/authorization/console/data";
import { decisionsRegister } from "@/components/admin/authorization/console/decisions";
import { delegationsRegister } from "@/components/admin/authorization/console/delegations";
import {
  BreakGlassDialog,
  ConflictLookupDialog,
  ExplainDecisionDialog,
  GrantRoleDialog,
  JitDialog,
  LendDialog,
  NewConditionDialog,
  NewSoDRuleDialog,
  RefreshCacheDialog,
  RequestLimitDialog,
  SaveWorkloadDialog,
  SupportDialog,
} from "@/components/admin/authorization/console/forms";
import { GrantsAsOf, grantsRegister, type GrantsExtra } from "@/components/admin/authorization/console/grants";
import { limitsRegister } from "@/components/admin/authorization/console/limits";
import { AuthorizationKpis, AuthorizationPanels } from "@/components/admin/authorization/console/overview";
import { RegisterView, href, type Ctx, type Query, type RegisterSpec } from "@/components/admin/authorization/console/register";
import { rolesRegister } from "@/components/admin/authorization/console/roles";
import { conditionsRegister, sodRegister } from "@/components/admin/authorization/console/rules";
import { allSessions, sessionKindOf, sessionsRegister } from "@/components/admin/authorization/console/sessions";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { workloadsRegister } from "@/components/admin/authorization/console/workloads";
import {
  getAssignmentsAsOf,
  getSessionActivity,
  listAssignmentSuspensions,
  listPermissionBundles,
  needsAttention,
} from "@/lib/api/authorization";
import { currentSession } from "@/lib/authz-inbox";

export const metadata: Metadata = { title: "Authorization | Zoiko Suite" };

/** The registers, in the order a reviewer works through them. */
const TABS = [
  { key: "grants", label: "Role grants" },
  { key: "roles", label: "Roles" },
  { key: "approvals", label: "Approvals" },
  { key: "sod", label: "Duty conflicts" },
  { key: "conditions", label: "Conditions" },
  { key: "limits", label: "Authority limits" },
  { key: "elevated", label: "Elevated access" },
  { key: "delegations", label: "Delegations" },
  { key: "decisions", label: "Decision log" },
  { key: "workloads", label: "Service access" },
  { key: "check", label: "Check access" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Tab names from before the registers were renamed, so old links still land. */
const LEGACY: Record<string, TabKey> = { delegation: "delegations", log: "decisions" };

/** Read once per request, outside render, so a re-render cannot change it. */
function requestTime(): number {
  return Date.now();
}

function count(data: AuthzData, tab: TabKey): number | null | undefined {
  switch (tab) {
    case "grants":
      return data.assignments.error ? null : data.assignments.rows.length;
    case "roles":
      return data.roles.error ? null : data.roles.rows.length;
    case "approvals":
      return data.approvals.length;
    case "sod":
      return data.sodRules.error ? null : data.sodRules.rows.length;
    case "conditions":
      return data.abac.error ? null : data.abac.rows.length;
    case "limits":
      return data.limits.error ? null : data.limits.rows.length;
    case "elevated":
      return allSessions(data).length;
    case "delegations":
      return data.delegations.error ? null : data.delegations.rows.length;
    case "workloads":
      return data.workloads.error ? null : data.workloads.rows.length;
    default:
      return undefined;
  }
}

/**
 * The instant an "as of" link asks for, as RFC 3339. A datetime-local value
 * has no zone and is read in the server's zone, as every console date is.
 */
function asOfInstant(raw: string | undefined): string | null | "invalid" {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
}

/** One grant's suspensions and the as-of view, read only when the URL asks. */
async function grantsExtra(ctx: Ctx, query: Query): Promise<GrantsExtra> {
  const extra: GrantsExtra = {};
  const at = asOfInstant(query.as_of);
  if (at === "invalid") {
    extra.asOf = {
      at: query.as_of ?? "",
      read: { rows: [], error: { kind: "malformed", status: 400, message: "That date and time could not be read. Choose it again." } },
    };
  } else if (at) {
    const r = await getAssignmentsAsOf(ctx.identity, { asOf: at });
    extra.asOf = { at, read: r.ok ? { rows: r.data.assignments ?? [], error: null } : { rows: [], error: r.error } };
  }
  if (query.id && query.pane === "suspensions") {
    const r = await listAssignmentSuspensions(ctx.identity, query.id);
    extra.suspensions = r.ok ? { rows: r.data ?? [], error: null } : { rows: [], error: r.error };
  }
  return extra;
}

async function registerFor(tab: TabKey, data: AuthzData, ctx: Ctx, query: Query): Promise<RegisterSpec | null> {
  switch (tab) {
    case "grants":
      return grantsRegister(data, ctx, await grantsExtra(ctx, query));
    case "roles": {
      if (!query.id || query.pane !== "permissions") return rolesRegister(data, ctx);
      const r = await listPermissionBundles(ctx.identity, query.id);
      return rolesRegister(data, ctx, r.ok ? { rows: r.data ?? [], error: null } : { rows: [], error: r.error });
    }
    case "approvals":
      return approvalsRegister(data);
    case "sod":
      return sodRegister(data, ctx);
    case "conditions":
      return conditionsRegister(data, ctx);
    case "limits":
      return limitsRegister(data, ctx);
    case "elevated": {
      const kind = query.id && query.pane === "activity" ? sessionKindOf(data, query.id) : null;
      return sessionsRegister(data, ctx, kind && query.id ? await getSessionActivity(ctx.identity, kind, query.id) : null);
    }
    case "delegations":
      return delegationsRegister(data, ctx);
    case "decisions":
      return decisionsRegister(data, ctx, query);
    case "workloads":
      return workloadsRegister(data);
    case "check":
      return null;
  }
}

/** The commands that create records in the open register, right of the tabs. */
function tabActions(tab: TabKey, data: AuthzData, query: Query): ReactNode {
  switch (tab) {
    case "grants":
      return <GrantsAsOf value={query.as_of} />;
    case "sod":
      return (
        <>
          <ConflictLookupDialog />
          <NewSoDRuleDialog />
        </>
      );
    case "conditions":
      return <NewConditionDialog />;
    case "limits":
      return <RequestLimitDialog roles={data.roles.rows} />;
    case "elevated":
      return (
        <>
          <SupportDialog />
          <BreakGlassDialog />
          <JitDialog />
        </>
      );
    case "delegations":
      return <LendDialog />;
    case "workloads":
      return (
        <>
          <RefreshCacheDialog />
          <SaveWorkloadDialog />
        </>
      );
    default:
      return null;
  }
}

export default async function AuthorizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const asked = LEGACY[query.tab ?? ""] ?? query.tab;
  const tab: TabKey = TABS.some((t) => t.key === asked) ? (asked as TabKey) : "grants";
  query.tab = tab;

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain />
        </div>
      </div>
    );
  }

  const now = requestTime();
  const ctx: Ctx = { identity: current.identity, me: current.identity.principalId, now };
  const data = await loadAuthorization(current.identity);
  const signedOut = needsAttention(data.assignments.error ?? { message: "" }) === "signin";
  const spec = signedOut ? null : await registerFor(tab, data, ctx, query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Authorization"
        description="Govern who may do what: role grants, separation of duties, conditions, authority limits, elevated access and the record of every decision."
        meta={<SessionChip session={current.session} now={now} />}
        actions={
          <>
            <ButtonLink href={href({ tab: "check" })} icon={Search} size="md">
              Check access
            </ButtonLink>
            <ExplainDecisionDialog size="md" />
            <GrantRoleDialog roles={data.roles.rows} identity={current.identity} size="md" />
          </>
        }
      />

      {signedOut ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain />
        </div>
      ) : (
        <>
          <AuthorizationKpis data={data} ctx={ctx} />
          <AuthorizationPanels data={data} ctx={ctx} />

          <RegisterCard
            active={tab}
            tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: count(data, t.key), href: href({ tab: t.key }) }))}
            actions={tabActions(tab, data, query)}
          >
            {spec ? (
              <RegisterView spec={spec} query={query} />
            ) : (
              <div className="p-5">
                <CheckTab identity={current.identity} />
              </div>
            )}
          </RegisterCard>
        </>
      )}

      <ControlsFooter right="authorization-svc · live data">
        Required controls: maker-checker on privileged change · separation of duties · a reason on every change · two-step for
        elevated access · every decision logged
      </ControlsFooter>
    </div>
  );
}
