import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  MonitorCheck,
  Search,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { ButtonLink, ControlsFooter, RegisterCard, KpiCard, KpiGrid, ConsolePanel, PanelGrid, Pipeline, OrderedModel, BarList, PanelCallout, PanelNote } from "@/components/admin/console";
import { RegisterBody, RegisterToolbar, RegisterTable, RegisterPager, RowLink, TwoLine, DetailDrawer, DrawerFacts, DrawerPane } from "@/components/admin/console/Register";
import { GatewayVerifyForm } from "@/components/admin/gateway/GatewayVerifyForm";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  DENIAL_REASONS,
  readGatewayHealth,
  type ProbeResult,
  listDeniedDecisions,
  getClientUsage,
  getRateLimitState,
  getRouteVersionStatus,
  getPolicy,
  type GatewayDecision,
  type GatewayUsage,
  type GatewayPolicy,
} from "@/lib/api/gateway-auth";
import { currentSession } from "@/lib/authz-inbox";

export const metadata: Metadata = { title: "Gateway Authentication | Zoiko Suite" };

const TABS = [
  { key: "denied", label: "Denied requests" },
  { key: "usage", label: "Tenant usage" },
  { key: "ratelimits", label: "Rate limits" },
  { key: "versions", label: "Versions & admission policy" },
  { key: "verify", label: "Verify my session" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function requestTime(): number {
  return Date.now();
}

async function loadGatewayData() {
  const [decisions, usage, policy, versions] = await Promise.all([
    listDeniedDecisions({ limit: 200 }),
    getClientUsage(),
    getPolicy(),
    getRouteVersionStatus(),
  ]);
  return {
    decisions: Array.isArray(decisions) ? decisions : [],
    usage: Array.isArray(usage) ? usage : [],
    policy: "error" in policy ? null : policy,
    versions: Array.isArray(versions) ? versions : [],
  };
}

function countDecisions(data: Awaited<ReturnType<typeof loadGatewayData>>, tab: TabKey): number | null {
  if (tab === "denied") return data.decisions.length;
  if (tab === "usage") return data.usage.length;
  if (tab === "ratelimits") return null;
  if (tab === "versions") return data.versions.length;
  if (tab === "verify") return null;
  return null;
}

async function deniedDrawerContent(id: string, decisions: GatewayDecision[]) {
  const d = decisions.find((x) => x.id === id);
  if (!d) return <PanelNote>Decision not found</PanelNote>;
  return (
    <DrawerFacts
      items={[
        { label: "Decision ID", value: <RowLink href={`?tab=denied&id=${d.id}`}>{d.id}</RowLink> },
        { label: "Tenant", value: d.tenant_id },
        { label: "Principal", value: d.principal_id },
        { label: "Client", value: <code className="text-[11px]">{d.client_key}</code> },
        { label: "Method", value: <code>{d.method}</code> },
        { label: "Path", value: <code>{d.path}</code> },
        { label: "API version", value: d.api_version },
        { label: "Outcome", value: <span className="font-semibold text-rose-600 dark:text-rose-400">{d.outcome}</span> },
        { label: "Code", value: <code>{d.code}</code> },
        { label: "Status", value: String(d.status) },
        { label: "Detail", value: d.detail },
        { label: "Correlation ID", value: d.correlation_id },
        { label: "Decided at", value: formatDateTime(d.decided_at) },
      ]}
    />
  );
}

async function usageDrawerContent(tenantId: string, usage: GatewayUsage[], rateLimitsPromise: Promise<Awaited<ReturnType<typeof getRateLimitState>>>) {
  const u = usage.find((x) => x.tenant_id === tenantId);
  if (!u) return <PanelNote>No usage for this tenant</PanelNote>;
  const rl = await rateLimitsPromise;
  const limits = Array.isArray(rl) ? rl.filter((x) => x.key.startsWith(tenantId)) : [];
  return (
    <DrawerFacts
      items={[
        { label: "Tenant", value: u.tenant_id },
        { label: "Admitted", value: u.admitted },
        { label: "Denied", value: u.denied },
        { label: "Rate-limited", value: u.rate_limited },
        { label: "Step-up required", value: u.step_up_required },
        { label: "Active rate-limit scopes", value: limits.length > 0 ? limits.map((l) => <code key={l.key} className="block text-[11px]">{l.scope}: {l.used}/{l.allowed}</code>) : "none" },
      ]}
    />
  );
}

async function rateLimitDrawerContent(scope: string, key: string, rlPromise: Promise<Awaited<ReturnType<typeof getRateLimitState>>>) {
  const rl = await rlPromise;
  if ("error" in rl) return <PanelNote>{rl.error}</PanelNote>;
  return (
    <DrawerFacts
      items={[
        { label: "Scope", value: scope },
        { label: "Key", value: <code>{key}</code> },
        { label: "Allowed", value: rl.allowed },
        { label: "Used", value: rl.used },
        { label: "Resets at", value: formatDateTime(rl.reset_at) },
      ]}    />  ); } async function versionDrawerContent(version: string, versions: Awaited<ReturnType<typeof loadGatewayData>>["versions"]) {
  const v = versions.find((x) => x.version === version);
  if (!v) return <PanelNote>Version not found</PanelNote>;
  return (
    <DrawerFacts
      items={[
        { label: "Version", value: v.version },
        { label: "Supported", value: v.supported ? "Yes" : "No" },
        { label: "Deprecated at", value: v.deprecated_at ? formatDateTime(v.deprecated_at) : "—" },
        { label: "Removed at", value: v.removed_at ? formatDateTime(v.removed_at) : "—" },
      ]}
    />
  );
}

function Kpis({ data, policy }: { data: Awaited<ReturnType<typeof loadGatewayData>>; policy: GatewayPolicy | null }) {
  return (
    <KpiGrid>
      <KpiCard label="Admitted" value={data.usage.reduce((a, u) => a + u.admitted, 0)} icon={CheckCircle2} tone="green" status="this replica since start" />
      <KpiCard label="Denied" value={data.usage.reduce((a, u) => a + u.denied, 0)} icon={XCircle} tone="red" status="this replica since start" />
      <KpiCard label="Rate-limited" value={data.usage.reduce((a, u) => a + u.rate_limited, 0)} icon={Clock} tone="amber" status="this replica since start" />
      <KpiCard label="Step-up required" value={data.usage.reduce((a, u) => a + u.step_up_required, 0)} icon={ShieldAlert} tone="amber" status="this replica since start" />
      <KpiCard label="Risk engine unavailable" value={data.decisions.filter((d) => d.outcome === "carta_unavailable").length} icon={MonitorCheck} tone="red" status={policy?.carta_mode === "unavailable" ? "live" : "this replica since start"} />
    </KpiGrid>
  );
}

function PipelinePanel({ data }: { data: Awaited<ReturnType<typeof loadGatewayData>> }) {
  const admitted = data.usage.reduce((a, u) => a + u.admitted, 0);
  const denied = data.usage.reduce((a, u) => a + u.denied, 0);
  const limited = data.usage.reduce((a, u) => a + u.rate_limited, 0);
  const total = admitted + denied + limited;
  return (
    <ConsolePanel title="Request pipeline" description="Every gated request follows this path; the totals are for this replica since start.">
      <Pipeline
        stages={[
          { label: "Received", value: total, caption: "all gated requests" },
          { label: "Validating", value: total, caption: "JWT, tenant, risk" },
          { label: "Admitted", value: admitted, caption: "forwarded to backend" },
          { label: "Denied", value: denied, caption: "refused with reason" },
          { label: "Rate-limited", value: limited, caption: "quota exhausted" },
        ]}
        note="A denial means the gateway itself refused; the backend never saw the request."
      />
    </ConsolePanel>
  );
}

function HeaderPolicyPanel({ policy }: { policy: GatewayPolicy | null }) {
  if (!policy) {
    return (
      <ConsolePanel title="Trusted-header policy" description="Headers the edge strips vs. sets. Unavailable from the admin surface.">
        <PanelNote>Policy unavailable — admin surface not reachable or not configured.</PanelNote>
      </ConsolePanel>
    );
  }
  return (
    <ConsolePanel title="Trusted-header policy" description="Ordered list: client headers stripped at the edge (left) and server headers injected (right).">
      <OrderedModel
        steps={[
          ...policy.stripped_headers.map((h) => ({
            title: h,
            caption: "stripped from client at the edge",
            chip: "STRIPPED",
            tone: "red" as const,
          })),
          ...policy.injected_headers.map((h) => ({
            title: h,
            caption: "set by gateway-auth-svc, forwarded by Traefik",
            chip: "INJECTED",
            tone: "green" as const,
          })),
        ]}
      />
      <PanelCallout tone="info">
        CARTA mode: {policy.carta_mode} · Revocation TTL: {policy.revocation_ttl_seconds}s · Fail: {policy.revocation_fail}
      </PanelCallout>
    </ConsolePanel>
  );
}

function DenialReasonsPanel({ data, policy }: { data: Awaited<ReturnType<typeof loadGatewayData>>; policy: GatewayPolicy | null }) {
  const reasonCounts = new Map<string, number>();
  for (const d of data.decisions) {
    reasonCounts.set(d.code, (reasonCounts.get(d.code) ?? 0) + 1);
  }
  const total = data.decisions.length || 1;
  const bars = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      percent: Math.round((count / total) * 100),
      display: `${count}`,
    }));
  return (
    <ConsolePanel title="Denial reasons" description="Why the gateway refused, from the X-Auth-Denial-Reason header.">
      <BarList bars={bars} />
      {policy?.carta_mode === "unavailable" && (
        <PanelCallout tone="warning">
          Risk engine was unavailable — some write refusals are carta_unavailable instead of a risk decision.
        </PanelCallout>
      )}
    </ConsolePanel>
  );
}

function DeniedRegister({ data, query }: { data: Awaited<ReturnType<typeof loadGatewayData>>; query: Record<string, string> }) {
  const rows = data.decisions.map((d) => ({
    key: d.id,
    href: `?tab=denied&q=${query.q ?? ""}&id=${d.id}&page=${query.page ?? 1}`,
    selected: query.id === d.id,
    cells: [
      <TwoLine primary={<code>{d.id.slice(0, 12)}…</code>} secondary={d.decided_at ? formatDateTime(d.decided_at) : "—"} mono />,
      <span className="font-semibold text-rose-600 dark:text-rose-400">{d.outcome}</span>,
      <code>{d.code}</code>,
      <span className="text-slate-500 dark:text-slate-400">{d.tenant_id.slice(0, 12)}…</span>,
      <span className="text-slate-500 dark:text-slate-400">{d.principal_id.slice(0, 12)}…</span>,
      <code>{d.method} {d.path}</code>,
    ],
  }));
  const columns = [
    { label: "Decision" },
    { label: "Outcome" },
    { label: "Code" },
    { label: "Tenant" },
    { label: "Principal" },
    { label: "Request" },
  ];
  return (
    <>
      <RegisterToolbar
        action="/admin/gateway"
        keep={{ tab: "denied" }}
        search={{ name: "q", value: query.q ?? "", placeholder: "Search detail, tenant, principal…" }}
        filters={[
          { name: "outcome", allLabel: "All outcomes", options: DENIAL_REASONS.map((r) => [r.code, r.code]), value: query.outcome ?? "" },
        ]}
        clearHref="?tab=denied"
      />
      <RegisterTable columns={columns} rows={rows} empty="No denied requests recorded." />
      <RegisterPager
        page={Number(query.page ?? 1)}
        pageSize={20}
        total={data.decisions.length}
        noun="decisions"
        hrefFor={(p) => `?tab=denied&q=${query.q ?? ""}&outcome=${query.outcome ?? ""}&page=${p}`}
      />
    </>
  );
}

function UsageRegister({ data, query }: { data: Awaited<ReturnType<typeof loadGatewayData>>; query: Record<string, string> }) {
  const rows = data.usage.map((u) => ({
    key: u.tenant_id,
    href: `?tab=usage&q=${query.q ?? ""}&id=${u.tenant_id}&page=${query.page ?? 1}`,
    selected: query.id === u.tenant_id,
    cells: [
      <RowLink href={`?tab=usage&id=${u.tenant_id}`}>{u.tenant_id.slice(0, 12)}…</RowLink>,
      <span className="text-emerald-600 dark:text-emerald-400">{u.admitted}</span>,
      <span className="text-rose-600 dark:text-rose-400">{u.denied}</span>,
      <span className="text-amber-600 dark:text-amber-400">{u.rate_limited}</span>,
      <span className="text-amber-600 dark:text-amber-400">{u.step_up_required}</span>,
    ],
  }));
  const columns = [
    { label: "Tenant" },
    { label: "Admitted", align: "right" as const },
    { label: "Denied", align: "right" as const },
    { label: "Rate-limited", align: "right" as const },
    { label: "Step-up", align: "right" as const },
  ];
  return (
    <>
      <RegisterToolbar
        action="/admin/gateway"
        keep={{ tab: "usage" }}
        search={{ name: "q", value: query.q ?? "", placeholder: "Search tenant…" }}
      />
      <RegisterTable columns={columns} rows={rows} empty="No tenant usage recorded." />
      <RegisterPager
        page={Number(query.page ?? 1)}
        pageSize={20}
        total={data.usage.length}
        noun="tenants"
        hrefFor={(p) => `?tab=usage&q=${query.q ?? ""}&page=${p}`}
      />
    </>
  );
}

function RateLimitsRegister({ query }: { query: Record<string, string> }) {
  const search = query.q ?? "";
  const [scope, key] = search.split(":");
  const rl = getRateLimitState(scope, key);
  return (
    <>
      <RegisterToolbar
        action="/admin/gateway"
        keep={{ tab: "ratelimits" }}
        search={{ name: "q", value: search, placeholder: "Scope:key (e.g. ip:1.2.3.4 or tenant:tenant-abc)" }}
      />
      <Suspense fallback={<PanelNote>Loading…</PanelNote>}>
        <RateLimitsTable promise={rl} />
      </Suspense>
    </>
  );
}

async function RateLimitsTable({ promise }: { promise: Promise<Awaited<ReturnType<typeof getRateLimitState>>> }) {
  const result = await promise;
  if ("error" in result) return <PanelNote>{result.error}</PanelNote>;
  return (
    <RegisterTable
      columns={[{ label: "Scope" }, { label: "Key" }, { label: "Allowed", align: "right" as const }, { label: "Used", align: "right" as const }, { label: "Resets at" }]}
      rows={[
        {
          key: `${result.scope}:${result.key}`,
          href: `?tab=ratelimits&q=${encodeURIComponent(`${result.scope}:${result.key}`)}`,
          selected: true,
          cells: [
            result.scope,
            <code>{result.key}</code>,
            <span className="tabular-nums">{result.allowed}</span>,
            <span className="tabular-nums">{result.used}</span>,
            formatDateTime(result.reset_at),
          ],
        },
      ]}
      empty="Enter a scope:key above to look up its rate-limit state."
    />
  );
}

function VersionsRegister({ data, query }: { data: Awaited<ReturnType<typeof loadGatewayData>>; query: Record<string, string> }) {
  const rows = data.versions.map((v) => ({
    key: v.version,
    href: `?tab=versions&q=${query.q ?? ""}&id=${v.version}&page=${query.page ?? 1}`,
    selected: query.id === v.version,
    cells: [
      <RowLink href={`?tab=versions&id=${v.version}`}>{v.version}</RowLink>,
      <span className={v.supported ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
        {v.supported ? "Supported" : "Unsupported"}
      </span>,
      v.deprecated_at ? formatDateTime(v.deprecated_at) : "—",
      v.removed_at ? formatDateTime(v.removed_at) : "—",
    ],
  }));
  const columns = [
    { label: "Version" },
    { label: "Status" },
    { label: "Deprecated" },
    { label: "Removed" },
  ];
  return (
    <>
      <RegisterToolbar
        action="/admin/gateway"
        keep={{ tab: "versions" }}
        search={{ name: "q", value: query.q ?? "", placeholder: "Search version…" }}
      />
      <RegisterTable columns={columns} rows={rows} empty="No route versions recorded." />
      <RegisterPager
        page={Number(query.page ?? 1)}
        pageSize={20}
        total={data.versions.length}
        noun="versions"
        hrefFor={(p) => `?tab=versions&q=${query.q ?? ""}&page=${p}`}
      />
    </>
  );
}

function VerifyTab() {
  return <GatewayVerifyForm />;
}

function RegisterContent({ data, tab, query, policy }: { data: Awaited<ReturnType<typeof loadGatewayData>>; tab: TabKey; query: Record<string, string>; policy: GatewayPolicy | null }) {
  const drawer = async () => {
    if (!query.id) return null;
    switch (tab) {
      case "denied":
        return (
          <DetailDrawer
            heading="Denied request"
            closeHref={`?tab=denied&q=${query.q ?? ""}&page=${query.page ?? 1}`}
            icon={XCircle}
            title={query.id}
            subtitle="Gateway decision"
            status={{ label: "DENIED", tone: "danger" }}
            panes={[{ key: "detail", label: "Detail", href: `?tab=denied&q=${query.q ?? ""}&id=${query.id}&page=${query.page ?? 1}&pane=detail` }]}
            activePane="detail"
          >
            {await deniedDrawerContent(query.id, data.decisions)}
          </DetailDrawer>
        );
      case "usage":
        return (
          <DetailDrawer
            heading="Tenant usage"
            closeHref={`?tab=usage&q=${query.q ?? ""}&page=${query.page ?? 1}`}
            icon={Users}
            title={query.id}
            subtitle="Usage totals"
            panes={[{ key: "detail", label: "Detail", href: `?tab=usage&q=${query.q ?? ""}&id=${query.id}&page=${query.page ?? 1}&pane=detail` }]}
            activePane="detail"
          >
            {await usageDrawerContent(query.id, data.usage, getRateLimitState("tenant", query.id))}
          </DetailDrawer>
        );
      case "ratelimits":
        return (
          <DetailDrawer
            heading="Rate limit"
            closeHref={`?tab=ratelimits&q=${query.q ?? ""}`}
            icon={Clock}
            title={query.id}
            subtitle="Rate-limit state"
            panes={[{ key: "detail", label: "Detail", href: `?tab=ratelimits&q=${encodeURIComponent(query.id)}&pane=detail` }]}
            activePane="detail"
          >
            {await rateLimitDrawerContent(query.id.split(":")[0], query.id.split(":")[1], getRateLimitState(query.id.split(":")[0], query.id.split(":")[1]))}
          </DetailDrawer>
        );
      case "versions":
        return (
          <DetailDrawer
            heading="Version"
            closeHref={`?tab=versions&q=${query.q ?? ""}&page=${query.page ?? 1}`}
            icon={History}
            title={query.id}
            subtitle="Route version status"
            panes={[{ key: "detail", label: "Detail", href: `?tab=versions&q=${query.q ?? ""}&id=${query.id}&page=${query.page ?? 1}&pane=detail` }]}
            activePane="detail"
          >
            {await versionDrawerContent(query.id, data.versions)}
          </DetailDrawer>
        );
      default:
        return null;
    }
  };

  const body = (
    <>
      {tab === "denied" && <DeniedRegister data={data} query={query} />}
      {tab === "usage" && <UsageRegister data={data} query={query} />}
      {tab === "ratelimits" && <RateLimitsRegister query={query} />}
      {tab === "versions" && <VersionsRegister data={data} query={query} />}
      {tab === "verify" && <VerifyTab />}
    </>
  );

  return <RegisterBody drawer={drawer()}>{body}</RegisterBody>;
}

export default async function GatewayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Record<string, string> = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? "")])
  );
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "denied";

  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Sign in to continue</h1>
          <p className="text-slate-500 dark:text-slate-400">This page requires a signed session.</p>
        </div>
      </div>
    );
  }

  const now = requestTime();
  const data = await loadGatewayData();
  const signedOut = data.decisions.length === 0 && data.usage.length === 0 && data.policy === null && data.versions.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gateway Authentication"
        description="The check every gated request passes before it reaches a service: is the caller who they say they are, may their tenant transact, and does the risk engine object."
        meta={
          <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            <ExternalLink className="h-3.5 w-3.5" />
            <span>This replica since start</span>
          </span>
        }
        actions={
          <>
            <ButtonLink href="?tab=verify" icon={Search} size="md">
              Verify my session
            </ButtonLink>
            <ButtonLink href="?tab=denied&q=tenant_hostname_mismatch" icon={History} size="md">
              Recent spoofing
            </ButtonLink>
          </>
        }
      />

      {signedOut ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Unable to read gateway data</h2>
          <p className="mt-2 text-slate-500 dark:text-slate-400">The admin surface is not reachable. Check that GATEWAY_ADMIN_ADDR is configured and the token is valid.</p>
        </div>
      ) : (
        <>
          <Kpis data={data} policy={data.policy} />
          <PanelGrid>
            <PipelinePanel data={data} />
            <HeaderPolicyPanel policy={data.policy} />
            <DenialReasonsPanel data={data} policy={data.policy} />
          </PanelGrid>
          <RegisterCard
            active={tab}
            tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: countDecisions(data, t.key), href: `?tab=${t.key}` }))}
          >
            <RegisterContent data={data} tab={tab} query={query} policy={data.policy} />
          </RegisterCard>
        </>
      )}

      <ControlsFooter right="gateway-auth-svc · live data">
        Route and policy changes are governed configuration — this page has no write commands.
        Required controls: tenant isolation · verified subject context · edge header sanitation · continuous risk scoring · session revocation within TTL
      </ControlsFooter>
    </div>
  );
}
