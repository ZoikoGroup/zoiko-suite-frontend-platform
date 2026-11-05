import type { Metadata } from "next";
import { Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import {
  BarList,
  ConsolePanel,
  ControlsFooter,
  DetailDrawer,
  DrawerFacts,
  DrawerNote,
  KpiCard,
  KpiGrid,
  OrderedModel,
  PanelCallout,
  PanelGrid,
  PanelNote,
  Pipeline,
  RegisterCard,
  TwoLine,
} from "@/components/admin/console";
import { Badge } from "@/components/ui";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { RegisterView, hrefAt, short, type Query, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { AddPasskeyButton, SetUpAuthenticatorButton } from "@/components/admin/account/SecurityControls";
import { identityProblem } from "@/components/admin/identity/console/registers";
import { ago } from "@/components/admin/identity/console/data";
import { securityCommand } from "../actions";
import { listAuthenticationEvents, listMfaFactors, listPasskeys, type AuthenticationEvent, type MfaFactor, type Passkey } from "@/lib/api/identity";
import type { ApiError } from "@/lib/api/client";
import { currentSession } from "@/lib/authz-inbox";
import type { SessionPayload } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Sign-in security | Zoiko Suite" };

const BASE = "/admin/account/security";
const STEP_UP_WINDOW_SECONDS = 15 * 60;

const TABS = [
  { key: "factors", label: "Second factors" },
  { key: "signins", label: "Recent sign-ins" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Read once per request, outside render. */
function requestTime(): number {
  return Date.now();
}

/** What the session's envelope says about its assurance (display only; services verify). */
function envelopeAssurance(session: SessionPayload): { level: string | null; mfa: boolean; authTime?: number } {
  if (!session.envelopeJwt) return { level: null, mfa: false };
  try {
    const c = JSON.parse(Buffer.from(session.envelopeJwt.split(".")[1] ?? "", "base64url").toString("utf-8")) as {
      auth_time?: number;
      session_trust_posture?: { mfa_verified?: boolean; assurance_level?: string };
    };
    return { level: c.session_trust_posture?.assurance_level ?? null, mfa: !!c.session_trust_posture?.mfa_verified, authTime: c.auth_time };
  } catch {
    return { level: null, mfa: false };
  }
}

const LEVEL: Record<string, string> = { PHISHING_RESISTANT: "Phishing-resistant", MFA: "Two-step", SINGLE_FACTOR: "Password only" };
/** The same, short enough for a pipeline box. */
const LEVEL_SHORT: Record<string, string> = { PHISHING_RESISTANT: "Strong", MFA: "2-step", SINGLE_FACTOR: "1-step" };
const KIND: Record<string, string> = { WEBAUTHN: "Passkey", TOTP: "Authenticator app" };

function factorStatus(f: MfaFactor): { label: string; tone: "success" | "warning" | "neutral" } {
  if (f.status === "ACTIVE") return { label: "Active", tone: "success" };
  if (f.status === "PENDING") return { label: "Not confirmed", tone: "warning" };
  return { label: "Removed", tone: "neutral" };
}

function factorsRegister(factors: MfaFactor[], passkeys: Map<string, Passkey>, error: ApiError | null, now: number): RegisterSpec {
  const rows: Row[] = factors.map((f) => {
    const st = factorStatus(f);
    const pk = passkeys.get(f.factor_id);
    return {
      id: f.factor_id,
      idLabel: short(f.factor_id),
      search: `${KIND[f.type] ?? f.type} ${pk?.nickname ?? ""} ${f.factor_id}`,
      facets: { kind: f.type, status: f.status },
      cells: [
        <TwoLine key="k" primary={KIND[f.type] ?? f.type} secondary={pk?.nickname || (f.type === "WEBAUTHN" ? "Unnamed passkey" : "TOTP, 6 digits")} />,
        <span key="a" className="text-[12px]">{f.type === "WEBAUTHN" ? "Phishing-resistant" : "Two-step"}</span>,
        <Badge key="s" tone={st.tone}>
          {st.label}
        </Badge>,
        <span key="c" className="text-[12px] text-slate-500">{ago(f.activated_at ?? f.created_at, now)}</span>,
        <span key="u" className="text-[12px] text-slate-500">{ago(f.last_used_at, now)}</span>,
      ],
    };
  });
  return {
    base: BASE,
    noun: "factors",
    idColumn: "ID",
    columns: [{ label: "Factor" }, { label: "Assurance" }, { label: "Status" }, { label: "Added" }, { label: "Last used" }],
    rows,
    filters: [
      { name: "kind", allLabel: "All kinds", options: [["WEBAUTHN", "Passkeys"], ["TOTP", "Authenticator apps"]] },
      { name: "status", allLabel: "All statuses", options: [["ACTIVE", "Active"], ["PENDING", "Not confirmed"], ["RETIRED", "Removed"]] },
    ],
    searchPlaceholder: "Search name or factor ID",
    empty: "You have no second factor yet. Add a passkey, or set up an authenticator app.",
    error,
    what: "second factors",
    problem: identityProblem("second factors"),
    drawer: (id, links) => {
      const f = factors.find((x) => x.factor_id === id);
      if (!f) return null;
      const pk = passkeys.get(f.factor_id);
      const st = factorStatus(f);
      return (
        <DetailDrawer
          heading="Second factor"
          closeHref={links.close}
          icon={f.type === "WEBAUTHN" ? KeyRound : Smartphone}
          title={pk?.nickname || KIND[f.type] || f.type}
          subtitle={f.factor_id}
          status={st}
          actions={
            f.status === "ACTIVE" ? (
              <ActionDialog
                label="Remove"
                tone="danger"
                title={`Remove this ${f.type === "WEBAUTHN" ? "passkey" : "authenticator app"}`}
                description="It stops working at once. Removing a factor needs a fresh verification, so a stolen password alone cannot do it."
                action={securityCommand}
                hidden={{ id: f.factor_id, kind: f.type }}
                submitLabel="Remove"
              />
            ) : (
              <DrawerNote>This factor no longer signs you in.</DrawerNote>
            )
          }
        >
          <DrawerFacts
            items={[
              { label: "Kind", value: KIND[f.type] ?? f.type },
              { label: "Assurance", value: f.type === "WEBAUTHN" ? "Phishing-resistant" : "Two-step" },
              ...(pk
                ? [
                    { label: "Synced across devices", value: pk.backup_eligible ? (pk.backup_state ? "Yes" : "Can be, not yet") : "No (device-bound)" },
                    { label: "Transports", value: pk.transports.length ? pk.transports.join(", ") : "—" },
                    { label: "User verification", value: pk.user_verified ? "Required and done" : "Not done" },
                  ]
                : []),
              { label: "Added", value: f.activated_at || f.created_at ? formatDateTime((f.activated_at ?? f.created_at)!) : "—" },
              { label: "Last used", value: f.last_used_at ? formatDateTime(f.last_used_at) : "Never" },
              ...(f.retired_reason ? [{ label: "Removed because", value: f.retired_reason.replaceAll("_", " ") }] : []),
            ]}
          />
        </DetailDrawer>
      );
    },
  };
}

const EVENT: Record<string, string> = {
  LOGIN: "Sign-in",
  FAILED_LOGIN: "Failed sign-in",
  STEP_UP: "Step-up",
  MFA_CHALLENGE: "Second-factor check",
  LOGOUT: "Sign-out",
  SESSION_INVALIDATED: "Session ended",
  PASSWORD_RESET: "Password reset",
};

function signinsRegister(events: AuthenticationEvent[], error: ApiError | null, now: number): RegisterSpec {
  return {
    base: BASE,
    noun: "events",
    idColumn: "ID",
    columns: [{ label: "Event" }, { label: "Outcome" }, { label: "Assurance" }, { label: "When" }],
    rows: events.map((e) => ({
      id: e.event_id,
      idLabel: short(e.event_id),
      search: `${EVENT[e.event_type] ?? e.event_type} ${e.details?.basis ?? ""}`,
      facets: { outcome: e.outcome },
      cells: [
        <span key="t" className="text-[12px]">{EVENT[e.event_type] ?? e.event_type}</span>,
        <Badge key="o" tone={e.outcome === "SUCCESS" ? "success" : "danger"}>
          {e.outcome === "SUCCESS" ? "Success" : "Refused"}
        </Badge>,
        <span key="a" className="text-[12px]">{e.assurance_level ?? "—"}</span>,
        <span key="w" className="text-[12px] text-slate-500">{ago(e.occurred_at, now)}</span>,
      ],
    })),
    filters: [{ name: "outcome", allLabel: "All outcomes", options: [["SUCCESS", "Success"], ["FAILURE", "Refused"]] }],
    searchPlaceholder: "Search event or basis",
    empty: "No sign-in has been recorded for you yet.",
    error,
    what: "your sign-in history",
    problem: identityProblem("your sign-in history"),
    drawer: (id, links) => {
      const e = events.find((x) => x.event_id === id);
      if (!e) return null;
      return (
        <DetailDrawer
          heading="Sign-in event"
          closeHref={links.close}
          icon={e.event_type === "STEP_UP" ? Fingerprint : LockKeyhole}
          title={EVENT[e.event_type] ?? e.event_type}
          subtitle={e.event_id}
          status={{ label: e.outcome === "SUCCESS" ? "Success" : "Refused", tone: e.outcome === "SUCCESS" ? "success" : "danger" }}
        >
          <DrawerFacts
            items={[
              { label: "Assurance", value: e.assurance_level ?? "—" },
              { label: "Basis", value: e.details?.basis?.replaceAll("_", " ") ?? "—" },
              { label: "When", value: formatDateTime(e.occurred_at) },
              { label: "Correlation", value: e.correlation_id ?? "—" },
            ]}
          />
          {e.outcome !== "SUCCESS" && <DrawerNote>Not you? Change your password and remove any factor you do not recognise.</DrawerNote>}
        </DetailDrawer>
      );
    },
  };
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "factors";
  query.tab = tab;

  const current = await currentSession();
  if (!current || !current.session.envelopeJwt) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain />
        </div>
      </div>
    );
  }

  const now = requestTime();
  const caller = current.identity as typeof current.identity & { principalId: string; tenantId: string };
  const [factorsRead, passkeysRead, eventsRead] = await Promise.all([
    listMfaFactors(caller),
    listPasskeys(caller),
    listAuthenticationEvents(caller, { principalId: caller.principalId, pageSize: 50 }),
  ]);
  const factors = factorsRead.ok ? factorsRead.data.factors : [];
  const passkeys = new Map((passkeysRead.ok ? passkeysRead.data.passkeys : []).map((p) => [p.credential_id, p]));
  const events = eventsRead.ok ? eventsRead.data.items : [];
  const factorsErr = factorsRead.ok ? null : factorsRead.error;

  const activeKeys = factors.filter((f) => f.type === "WEBAUTHN" && f.status === "ACTIVE").length;
  const app = factors.some((f) => f.type === "TOTP" && f.status === "ACTIVE");
  const active = activeKeys + (app ? 1 : 0);
  const env = envelopeAssurance(current.session);
  const fresh = env.mfa && !!env.authTime && now / 1000 - env.authTime < STEP_UP_WINDOW_SECONDS;
  const freshMinutes = env.authTime ? Math.max(0, Math.round((STEP_UP_WINDOW_SECONDS - (now / 1000 - env.authTime)) / 60)) : 0;

  const byLevel = new Map<string, number>();
  for (const e of events.filter((x) => x.outcome === "SUCCESS")) byLevel.set(e.assurance_level || "—", (byLevel.get(e.assurance_level || "—") ?? 0) + 1);
  const succeeded = [...byLevel.values()].reduce((a, b) => a + b, 0);

  const spec = tab === "signins" ? signinsRegister(events, eventsRead.ok ? null : eventsRead.error, now) : factorsRegister(factors, passkeys, factorsErr, now);
  const unread = (v: number | string) => (factorsErr ? "—" : v);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sign-in security"
        description="Your own second factors: what protects your sign-in, and what proves it is you before a high-risk change."
        meta={<SessionChip session={current.session} now={now} />}
        actions={
          <>
            <SetUpAuthenticatorButton hasAuthenticator={app} />
            <AddPasskeyButton />
          </>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Second factors"
          value={unread(active)}
          icon={ShieldCheck}
          tone={factorsErr ? "neutral" : active > 0 ? "green" : "amber"}
          status={factorsErr ? "Unavailable" : active > 0 ? "Protected" : "Not set up"}
          helper="Active passkeys and apps"
        />
        <KpiCard
          label="Passkeys"
          value={unread(activeKeys)}
          icon={KeyRound}
          tone={factorsErr ? "neutral" : activeKeys > 0 ? "green" : "navy"}
          status={factorsErr ? "Unavailable" : activeKeys > 0 ? "Phishing-resistant" : "None yet"}
          helper="Bound to this site"
        />
        <KpiCard
          label="Authenticator app"
          value={unread(app ? "On" : "Off")}
          icon={Smartphone}
          tone={factorsErr ? "neutral" : app ? "green" : "navy"}
          status={factorsErr ? "Unavailable" : app ? "6-digit codes" : "Not set up"}
          helper="TOTP"
        />
        <KpiCard
          label="This session"
          value={env.level ? LEVEL[env.level] ?? env.level : "—"}
          icon={Fingerprint}
          tone={env.level === "PHISHING_RESISTANT" ? "green" : env.level === "MFA" ? "navy" : "amber"}
          status={env.mfa ? "Second factor verified" : "Password only"}
          helper="From your signed session"
        />
        <KpiCard
          label="Verified for changes"
          value={fresh ? `${freshMinutes} min` : "No"}
          icon={LockKeyhole}
          tone={fresh ? "green" : "neutral"}
          status={fresh ? "Fresh step-up" : "Verify when asked"}
          helper="High-risk changes need it"
        />
      </KpiGrid>

      <PanelGrid>
        <ConsolePanel title="How your sign-in is checked" description="Each stage must pass before the next">
          <Pipeline
            stages={[
              { label: "Password", value: "On", caption: "Something you know" },
              { label: "Second factor", value: activeKeys > 0 ? "Passkey" : app ? "App" : "None", caption: "Something you have" },
              { label: "Step-up", value: fresh ? "Fresh" : "Later", caption: "Asked before high-risk changes" },
              { label: "Session", value: env.level ? LEVEL_SHORT[env.level] ?? env.level : "—", caption: "What services see" },
            ]}
          />
        </ConsolePanel>
        <ConsolePanel title="Assurance ladder" description="Stronger factors resist more attacks">
          <OrderedModel
            steps={[
              { title: "Password", caption: "Can be guessed, reused or phished", chip: "Always", tone: "navy" },
              { title: "Authenticator app", caption: "Codes change every 30 seconds, but can be phished", chip: app ? "On" : "Not set up", tone: app ? "green" : "amber" },
              {
                title: "Passkey",
                caption: "Works only on this site, so a look-alike page gets nothing",
                chip: activeKeys > 0 ? `${activeKeys} active` : "Not set up",
                tone: activeKeys > 0 ? "green" : "amber",
              },
            ]}
          />
        </ConsolePanel>
        <ConsolePanel title="Your recent sign-ins by assurance" description="Successful sign-ins and checks, newest 50">
          {!eventsRead.ok ? (
            <PanelNote>Your sign-in history could not be read{eventsRead.error.status === 403 ? " with your role" : ""}.</PanelNote>
          ) : succeeded === 0 ? (
            <PanelNote>No successful sign-in recorded yet.</PanelNote>
          ) : (
            <BarList
              bars={[...byLevel.entries()].map(([level, n]) => ({
                label: level,
                percent: (n / succeeded) * 100,
                display: String(n),
              }))}
            />
          )}
          {!factorsErr && activeKeys === 0 && (
            <div className="mt-4">
              <PanelCallout>Add a passkey: authenticator codes and passwords can be typed into a fake page; a passkey cannot.</PanelCallout>
            </div>
          )}
        </ConsolePanel>
      </PanelGrid>

      <RegisterCard
        active={tab}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: t.key === "factors" ? (factorsErr ? null : active) : eventsRead.ok ? events.length : null,
          href: hrefAt(BASE, { tab: t.key }),
        }))}
      >
        <RegisterView spec={spec} query={query} />
      </RegisterCard>

      <ControlsFooter right="identity-context-svc · live data">
        Required controls: a fresh second factor to add or remove one · passkeys bound to this site with user verification · a code is
        accepted once · an administrator&apos;s reset removes every factor
      </ControlsFooter>
    </div>
  );
}
