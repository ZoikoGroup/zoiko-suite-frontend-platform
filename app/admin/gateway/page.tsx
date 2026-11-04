import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Fingerprint, HeartPulse, KeyRound, ListChecks, Search, ShieldAlert, Timer } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import {
  ButtonLink,
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
  Pipeline,
  RegisterBody,
  RegisterCard,
  RegisterPager,
  RegisterTable,
  RegisterToolbar,
  RowLink,
  TwoLine,
  type KpiTone,
} from "@/components/admin/console";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { SessionChip } from "@/components/admin/authorization/console/SessionChip";
import { GatewayVerifyForm } from "@/components/admin/gateway/GatewayVerifyForm";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  DENIAL_REASONS,
  INJECTED_HEADERS,
  readGatewayHealth,
  type GatewayHealth,
  type GatewayStage,
  type ProbeResult,
} from "@/lib/api/gateway-auth";
import { currentSession, sessionTrust, type SessionTrust } from "@/lib/authz-inbox";

export const metadata: Metadata = { title: "Gateway Authentication | Zoiko Suite" };

// gateway-auth-svc keeps no records of its own, so everything here is either
// read live — its probes, the signing keys it verifies against, the viewer's
// own session — or is the reference for the refusals it gives. Traffic counts
// are deliberately absent: the gateway holds them in memory per replica, and
// behind a load balancer each page load would land on a different replica.
// Fleet traffic is in Grafana (gateway_* metrics); every denial goes to SIEM.

const TABS = [
  { key: "reasons", label: "Denial reasons" },
  { key: "verify", label: "Verify my session" },
  { key: "keys", label: "Signing keys" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type Query = Record<string, string>;

/** /verify's stages in handler order; each refusal in DENIAL_REASONS names one. */
const STAGES: { key: GatewayStage; label: string; caption: string }[] = [
  { key: "admission", label: "Admission", caption: "size, version, rate" },
  { key: "identity", label: "Identity", caption: "envelope, session" },
  { key: "risk", label: "Risk", caption: "carta-svc" },
  { key: "tenant", label: "Tenant", caption: "registry, residency" },
];

const STATUSES = [...new Set(DENIAL_REASONS.map((r) => r.status))].sort((a, b) => a - b);

const PAGE_SIZE = 20;

/** Outside the component: "now" is a fact about this request, read once. */
function requestTime(): number {
  return Date.now();
}

function href(q: Query): string {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  return qs ? `/admin/gateway?${qs}` : "/admin/gateway";
}

function stageLabel(stage: GatewayStage): string {
  return STAGES.find((s) => s.key === stage)?.label ?? stage;
}

/** 503 means nothing was decided; 4xx means the gateway decided against the request. */
function statusTone(status: number): "danger" | "warning" | "info" {
  if (status === 403) return "danger";
  if (status === 401) return "info";
  return "warning";
}

function minutes(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const m = Math.round(seconds / 60);
  return m < 120 ? `${m} min` : `${Math.round(m / 60)} h`;
}

function probeOk(p: ProbeResult): boolean {
  return p.reachable && p.status >= 200 && p.status < 300;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function Kpis({ health, trust, now }: { health: GatewayHealth; trust: SessionTrust; now: number }) {
  const { liveness, readiness, jwks } = health;
  const seconds = now / 1000;

  const live: { value: string; tone: KpiTone; status: string; helper?: string } = !liveness.reachable
    ? { value: "Down", tone: "red", status: "Not reachable", helper: liveness.detail }
    : probeOk(liveness)
      ? { value: "Running", tone: "green", status: "Answering", helper: `/healthz in ${liveness.latencyMs} ms` }
      : { value: String(liveness.status), tone: "amber", status: "Unexpected answer", helper: "/healthz" };

  // /readyz pings the signing keys from inside the gateway. Not ready means it
  // cannot verify anything, so every gated request is being refused.
  const ready: { value: string; tone: KpiTone; status: string; helper?: string } = !readiness.reachable
    ? { value: "—", tone: "neutral", status: "Could not be read", helper: readiness.detail }
    : probeOk(readiness)
      ? { value: "Ready", tone: "green", status: "Can verify", helper: "fetches identity-context-svc's keys" }
      : { value: "Not ready", tone: "red", status: "Refusing every request", helper: readiness.detail };

  const keys: { value: string; tone: KpiTone; status: string; helper?: string } = !jwks.reachable
    ? { value: "—", tone: "neutral", status: "Could not be read", helper: jwks.detail }
    : jwks.keys.length === 0
      ? { value: "0", tone: "red", status: "None published", helper: "every envelope fails as invalid_token" }
      : { value: String(jwks.keys.length), tone: "green", status: "Published", helper: "by identity-context-svc" };

  const expired = trust.signed && !!trust.expiresAt && trust.expiresAt < seconds;
  const envelope: { value: string; tone: KpiTone; status: string; helper?: string } = !trust.signed
    ? { value: "None", tone: "amber", status: "No envelope", helper: "the gateway refuses this session as no_token" }
    : expired
      ? { value: "Expired", tone: "red", status: "Sign in again", helper: "the gateway answers invalid_token" }
      : trust.expiresAt
        ? { value: minutes(trust.expiresAt - seconds), tone: "green", status: "Valid", helper: `until ${formatDateTime(new Date(trust.expiresAt * 1000).toISOString())}` }
        : { value: "Present", tone: "green", status: "Valid", helper: "no expiry claim" };

  const assurance: { value: string; tone: KpiTone; status: string; helper?: string } = !trust.signed
    ? { value: "—", tone: "neutral", status: "Unknown", helper: "no envelope to read" }
    : {
        value: trust.mfa ? "MFA" : "Single factor",
        tone: trust.mfa ? "green" : "navy",
        status: trust.authTime ? `Signed in ${minutes(Math.max(0, seconds - trust.authTime))} ago` : "Sign-in age unknown",
        helper: trust.authTime ? "sent as X-Authn-Age-Seconds" : "step-up treats an unknown age as not recent",
      };

  return (
    <KpiGrid>
      <KpiCard label="Gateway process" icon={HeartPulse} {...live} />
      <KpiCard label="Verifying sign-ins" icon={BadgeCheck} {...ready} />
      <KpiCard label="Signing keys" icon={KeyRound} href={href({ tab: "keys" })} {...keys} />
      <KpiCard label="Your envelope" icon={Timer} {...envelope} />
      <KpiCard label="Your assurance level" icon={Fingerprint} href={href({ tab: "verify" })} {...assurance} />
    </KpiGrid>
  );
}

// ── panels ───────────────────────────────────────────────────────────────────

function Panels({ health }: { health: GatewayHealth }) {
  const viaGateway = process.env.ZOIKO_USE_GATEWAY === "true";
  const ready = probeOk(health.readiness);

  return (
    <PanelGrid>
      <ConsolePanel
        title="What /verify checks"
        description="In order. Each figure is how many refusals that stage can give."
        link={{ label: "All reasons", href: href({ tab: "reasons" }) }}
      >
        <Pipeline
          stages={[
            ...STAGES.map((s) => ({
              label: s.label,
              value: DENIAL_REASONS.filter((r) => r.stage === s.key).length,
              caption: s.caption,
              href: href({ tab: "reasons", stage: s.key }),
            })),
            { label: "Admitted", value: INJECTED_HEADERS.length, caption: "headers set" },
          ]}
          note="Every refusal names itself in X-Auth-Denial-Reason, so a gateway refusal is never mistaken for the service's own 403."
        />
      </ConsolePanel>

      <ConsolePanel
        title="Who may set an identity header"
        description="Services read identity from headers, so this order is the control."
      >
        <OrderedModel
          steps={[
            { title: "Client copies removed", caption: "gtrm-edge-strip blanks X-Zoiko-Resolved-*, assurance and audience", chip: "EDGE", tone: "red" },
            { title: "Routing context stamped", caption: "GTRM resolves tenant and region from the hostname", chip: "GTRM" },
            { title: "Envelope verified", caption: "signed by identity-context-svc; nothing taken from the caller", chip: "GATEWAY" },
            { title: "Identity headers set", caption: `${INJECTED_HEADERS.length} headers from the verified claims and the registry`, chip: "GATEWAY", tone: "green" },
            { title: "Only listed headers forwarded", caption: "Traefik copies authResponseHeaders over any client copy", chip: "TRAEFIK", tone: "green" },
          ]}
        />
      </ConsolePanel>

      <ConsolePanel
        title="This console and the gateway"
        description="Read live on each page load."
        link={{ label: "Verify", href: href({ tab: "verify" }) }}
      >
        <DrawerFacts
          items={[
            { label: "This console's reads", value: viaGateway ? "Through the gateway" : "Straight to each service" },
            {
              label: "Gateway readiness",
              value: health.readiness.reachable ? `${health.readiness.status} in ${health.readiness.latencyMs} ms` : "Not reachable",
            },
            { label: "Keys the console sees", value: health.jwks.reachable ? health.jwks.keys.length : "Not reachable" },
          ]}
        />
        {!ready ? (
          <PanelCallout tone="warning">
            The gateway cannot confirm it can fetch identity-context-svc&apos;s keys. While that lasts, every gated request is
            refused as invalid_token.
          </PanelCallout>
        ) : viaGateway ? (
          <PanelCallout tone="info">ZOIKO_USE_GATEWAY is on: every page of this console passes these checks.</PanelCallout>
        ) : (
          <PanelCallout tone="info">
            ZOIKO_USE_GATEWAY is off, so this console&apos;s own reads skip the gateway. Verify my session shows what it would
            decide.
          </PanelCallout>
        )}
      </ConsolePanel>
    </PanelGrid>
  );
}

// ── registers ────────────────────────────────────────────────────────────────

function matchingReasons(q: Query) {
  const needle = (q.q ?? "").trim().toLowerCase();
  return DENIAL_REASONS.filter(
    (r) =>
      (!q.stage || r.stage === q.stage) &&
      (!q.status || String(r.status) === q.status) &&
      (!needle || [r.code, r.meaning, r.fix].some((t) => t.toLowerCase().includes(needle))),
  );
}

function ReasonsRegister({ q }: { q: Query }) {
  const rows = matchingReasons(q);
  const page = Math.max(1, Number(q.page) || 1);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const keep = { tab: "reasons", q: q.q ?? "", stage: q.stage ?? "", status: q.status ?? "" };
  const selected = q.id ? DENIAL_REASONS.find((r) => r.code === q.id) : undefined;

  const drawer = selected && (
    <DetailDrawer
      heading="Denial reason"
      closeHref={href({ ...keep, page: q.page ?? "" })}
      icon={ShieldAlert}
      title={selected.code}
      subtitle={`HTTP ${selected.status} · ${stageLabel(selected.stage)} stage`}
      status={{ label: String(selected.status), tone: statusTone(selected.status) }}
    >
      <DrawerFacts
        items={[
          { label: "Response header", value: <code className="text-[11px]">X-Auth-Denial-Reason: {selected.code}</code> },
          { label: "Stage", value: stageLabel(selected.stage) },
          { label: "Decided", value: selected.status === 503 ? "No — nothing could be determined" : "Yes — the gateway refused" },
          { label: "Retry helps", value: selected.status === 503 || selected.status === 429 ? "Yes, after Retry-After" : "No" },
        ]}
      />
      <DrawerNote>
        <strong className="text-navy-950 dark:text-slate-100">What it means.</strong> {selected.meaning}
      </DrawerNote>
      <DrawerNote>
        <strong className="text-navy-950 dark:text-slate-100">What to do.</strong> {selected.fix}
      </DrawerNote>
    </DetailDrawer>
  );

  return (
    <RegisterBody drawer={drawer}>
      <RegisterToolbar
        action="/admin/gateway"
        keep={{ tab: "reasons" }}
        search={{ name: "q", value: q.q ?? "", placeholder: "Paste an X-Auth-Denial-Reason, or search what it means…" }}
        filters={[
          { name: "stage", allLabel: "All stages", options: STAGES.map((s) => [s.key, s.label] as const), value: q.stage ?? "" },
          { name: "status", allLabel: "All statuses", options: STATUSES.map((s) => [String(s), String(s)] as const), value: q.status ?? "" },
        ]}
        clearHref={q.q || q.stage || q.status ? href({ tab: "reasons" }) : undefined}
      />
      <RegisterTable
        columns={[{ label: "Code" }, { label: "Status" }, { label: "Stage" }, { label: "Meaning" }]}
        rows={shown.map((r) => {
          const open = href({ ...keep, page: q.page ?? "", id: r.code });
          return {
            key: r.code,
            href: open,
            selected: r.code === q.id,
            cells: [
              <RowLink key="code" href={open}>
                {r.code}
              </RowLink>,
              <Badge key="status" tone={statusTone(r.status)}>
                {r.status}
              </Badge>,
              stageLabel(r.stage),
              <TwoLine key="meaning" primary={r.meaning} secondary={r.fix} />,
            ],
          };
        })}
        empty="No refusal matches. A code the gateway sends that is not listed here is a gap in this page — report it."
      />
      <RegisterPager page={page} pageSize={PAGE_SIZE} total={rows.length} noun="reasons" hrefFor={(p) => href({ ...keep, page: String(p) })} />
    </RegisterBody>
  );
}

function KeysRegister({ health, q }: { health: GatewayHealth; q: Query }) {
  const { jwks } = health;
  const selected = q.id ? jwks.keys.find((k) => k.kid === q.id) : undefined;

  const drawer = selected && (
    <DetailDrawer heading="Signing key" closeHref={href({ tab: "keys" })} icon={KeyRound} title={selected.kid} subtitle="identity-context-svc JWKS">
      <DrawerFacts
        items={[
          { label: "Key ID", value: <code className="text-[11px]">{selected.kid}</code> },
          { label: "Algorithm", value: selected.alg ?? "not stated" },
          { label: "Use", value: selected.use ?? "not stated" },
        ]}
      />
      <DrawerNote>
        The gateway verifies an envelope only against a key published here. It caches the set, so a key retired at
        identity-context-svc stops verifying once that cache refreshes.
      </DrawerNote>
    </DetailDrawer>
  );

  return (
    <RegisterBody drawer={drawer}>
      <RegisterTable
        columns={[{ label: "Key ID" }, { label: "Algorithm" }, { label: "Use" }]}
        rows={jwks.keys.map((k) => {
          const open = href({ tab: "keys", id: k.kid });
          return {
            key: k.kid,
            href: open,
            selected: k.kid === q.id,
            cells: [
              <RowLink key="kid" href={open}>
                {k.kid}
              </RowLink>,
              k.alg ?? "—",
              k.use ?? "—",
            ],
          };
        })}
        empty={jwks.reachable ? "identity-context-svc publishes no signing keys, so no envelope can verify." : jwks.detail}
      />
    </RegisterBody>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function GatewayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q: Query = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? (v[0] ?? "") : (v ?? "")]));
  const tab: TabKey = TABS.some((t) => t.key === q.tab) ? (q.tab as TabKey) : "reasons";

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain returnTo="/admin/gateway" />
        </div>
      </div>
    );
  }

  const now = requestTime();
  const health = await readGatewayHealth();
  const trust = sessionTrust(current.session);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gateway Authentication"
        description="The check every gated request passes before it reaches a service: is the caller who they say they are, is the session still live, does the risk engine object, and may the tenant transact."
        meta={<SessionChip session={current.session} now={now} />}
        actions={
          <>
            <ButtonLink href={href({ tab: "reasons" })} icon={ListChecks} size="md">
              Look up a refusal
            </ButtonLink>
            <Link
              href={href({ tab: "verify" })}
              scroll={false}
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gold-500 px-4 text-sm font-semibold text-white shadow-sm shadow-gold-600/20 transition-colors hover:bg-gold-600 active:bg-gold-700"
            >
              <Search className="h-4 w-4" />
              Verify my session
            </Link>
          </>
        }
      />

      <Kpis health={health} trust={trust} now={now} />
      <Panels health={health} />

      <RegisterCard
        active={tab}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: t.key === "reasons" ? DENIAL_REASONS.length : t.key === "keys" && health.jwks.reachable ? health.jwks.keys.length : null,
          href: href({ tab: t.key }),
        }))}
      >
        {tab === "reasons" && <ReasonsRegister q={q} />}
        {tab === "verify" && (
          <div className="p-5">
            <GatewayVerifyForm />
          </div>
        )}
        {tab === "keys" && <KeysRegister health={health} q={q} />}
      </RegisterCard>

      <ControlsFooter right="gateway-auth-svc · live probes">
        No write commands: routes and policy are governed GTRM configuration. Fleet traffic is in Grafana (gateway_*
        metrics) and every denial is in SIEM. Required controls: verified envelope · edge header sanitation · session
        revocation within TTL · continuous risk scoring · tenant and residency context
      </ControlsFooter>
    </div>
  );
}
