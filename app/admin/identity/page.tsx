import type { Metadata } from "next";
import { History, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { ButtonLink, ControlsFooter, RegisterCard } from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { Field, SelectField } from "@/components/admin/authorization/ui";
import { RegisterView, type Query, type RegisterSpec } from "@/components/admin/authorization/console/register";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { loadIdentity, type IdentityData } from "@/components/admin/identity/console/data";
import { IdentityKpis, IdentityPanels } from "@/components/admin/identity/console/overview";
import { DiagnosticsView, type Diagnostics } from "@/components/admin/identity/console/diagnostics";
import {
  eventsRegister,
  federationRegister,
  idHref,
  peopleRegister,
  resetsRegister,
  sessionsRegister,
  supportRegister,
  type Ctx,
  type PersonDetail,
} from "@/components/admin/identity/console/registers";
import { identityCommand } from "./actions";
import {
  explainContextResolution,
  getAssuranceHistory,
  getIdentityHealth,
  getJWKS,
  getOidcDiscovery,
  getSubjectIdentity,
} from "@/lib/api/identity";
import { currentSession } from "@/lib/authz-inbox";
import type { SessionIdentity } from "@/lib/auth";

export const metadata: Metadata = { title: "Identity Context | Zoiko Suite" };

const TABS = [
  { key: "people", label: "Identity context register" },
  { key: "sessions", label: "Live sessions" },
  { key: "events", label: "Sign-in events" },
  { key: "support", label: "Support access" },
  { key: "resets", label: "Password resets" },
  { key: "federation", label: "Federation" },
  { key: "diagnostics", label: "Diagnostics" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Read once per request, outside render, so a re-render cannot change it. */
function requestTime(): number {
  return Date.now();
}

function count(data: IdentityData, tab: TabKey): number | null {
  if (tab === "diagnostics") return null;
  if (tab === "federation" && !data.federation.enabled) return null;
  const read = {
    people: data.principals,
    sessions: data.sessions,
    events: data.events,
    support: data.support,
    resets: data.resets,
    federation: data.federation,
  }[tab];
  if (read.error) return null;
  if (tab === "sessions") return read.rows.filter((s) => (s as { state?: string }).state === "ACTIVE").length;
  if (tab === "resets") return read.rows.filter((r) => (r as { status?: string }).status === "PENDING_APPROVAL").length;
  return read.rows.length;
}

/** The Diagnostics tab's reads: only when that tab is open. */
async function diagnostics(identity: SessionIdentity, sid: string | undefined): Promise<Diagnostics> {
  const caller = identity as SessionIdentity & { principalId: string; tenantId: string };
  const [health, jwks, discovery, explain] = await Promise.all([
    getIdentityHealth(),
    getJWKS(),
    getOidcDiscovery(),
    sid
      ? explainContextResolution({
          sessionContextId: sid,
          callerTenantId: caller.tenantId,
          callerPrincipalId: caller.principalId,
          callerLegalEntityId: caller.legalEntityId,
        })
      : Promise.resolve(undefined),
  ]);
  return { health, jwks, discovery, sid, explain };
}

/** The People drawer's extra reads, for the one principal that is open. */
async function personDetail(identity: SessionIdentity, id: string | undefined): Promise<PersonDetail | null> {
  if (!id) return null;
  const caller = identity as SessionIdentity & { principalId: string; tenantId: string };
  const [history, subject] = await Promise.all([getAssuranceHistory(caller, id), getSubjectIdentity(caller, id)]);
  return {
    history: history.ok ? { rows: history.data.items, error: null } : { rows: [], error: history.error },
    subject: subject.ok ? { data: subject.data, error: null } : { data: null, error: subject.error },
  };
}

function AddPersonDialog() {
  return (
    <ActionDialog
      label="Add person"
      icon={<UserPlus className="h-4 w-4" />}
      tone="accent"
      size="md"
      variant="drawer"
      title="Add a person or workload"
      description="A person starts invited and activates from their link; a workload starts active with no password."
      action={identityCommand}
      hidden={{ command: "create", idempotency_key: crypto.randomUUID() }}
      submitLabel="Add"
    >
      <SelectField
        name="principal_type"
        label="Type"
        options={[
          ["HUMAN", "Person"],
          ["SERVICE_ACCOUNT", "Service account"],
          ["API_CLIENT", "API client"],
        ]}
      />
      <Field name="display_name" label="Name" required />
      <Field name="email" label="Email" type="email" optional hint="Required for a person: the activation link goes here." />
      <label className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-300">
        <input type="checkbox" name="invite" defaultChecked className="h-4 w-4 rounded border-slate-300" />
        Send the activation link now
      </label>
    </ActionDialog>
  );
}

export default async function IdentityContextPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "people";
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
  const ctx: Ctx = { me: current.identity.principalId, tenantId: current.identity.tenantId, now };
  const data = await loadIdentity(current.identity);
  const signedOut = [data.summary.error, data.principals.error].some((e) => e?.status === 401);

  let spec: RegisterSpec | null = null;
  let diag: Diagnostics | null = null;
  switch (tab) {
    case "diagnostics":
      diag = await diagnostics(current.identity, query.sid?.trim() || undefined);
      break;
    case "resets":
      spec = resetsRegister(data, ctx);
      break;
    case "federation":
      spec = federationRegister(data, ctx);
      break;
    case "sessions":
      spec = sessionsRegister(data, ctx);
      break;
    case "events":
      spec = eventsRegister(data, ctx);
      break;
    case "support":
      spec = supportRegister(data, ctx);
      break;
    default: {
      const open = query.id === undefined ? data.principals.rows[0]?.principal_id : query.id || undefined;
      spec = peopleRegister(data, ctx, await personDetail(current.identity, open), query);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Identity Context"
        description="Trace who is acting, under which tenant and entity, with what assurance, and with which session."
        meta={<SessionChip session={current.session} now={now} />}
        actions={
          <>
            <ButtonLink href={idHref({ tab: "events" })} icon={History} size="md">
              Recent events
            </ButtonLink>
            <ButtonLink href={idHref({ tab: "sessions", state: "ACTIVE" })} size="md">
              Live sessions
            </ButtonLink>
            <AddPersonDialog />
          </>
        }
      />

      {signedOut ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain />
        </div>
      ) : (
        <>
          <IdentityKpis data={data} now={now} />
          <IdentityPanels data={data} now={now} />
          <RegisterCard
            active={tab}
            tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: count(data, t.key), href: idHref({ tab: t.key }) }))}
          >
            {diag ? <DiagnosticsView d={diag} /> : spec ? <RegisterView spec={spec} query={query} /> : null}
          </RegisterCard>
        </>
      )}

      <ControlsFooter right="identity-context-svc · live data">
        Required controls: tenant isolation · verified subject context · a second person for resets and support access · step-up for
        privileged changes · a reason on every change · sessions end on disable or merge
      </ControlsFooter>
    </div>
  );
}
