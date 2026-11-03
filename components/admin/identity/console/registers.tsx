// The Identity Context registers: people, live sessions, sign-in events,
// support access, password resets and federation connections. Each is a RegisterSpec for the shared RegisterView (search,
// filters, pager, drawer); the drawers carry the governed commands. A maker
// never sees the checker's button: support access is approved only by the
// approver it names, and a reset is approved by someone other than whoever
// requested it (the service enforces both; the console does not offer them).

import type { ReactNode } from "react";
import { ArrowDown, Building2, Fingerprint, KeyRound, LockKeyhole, LogIn, ShieldQuestion, UserRound } from "lucide-react";
import { Badge } from "@/components/ui";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { SelectField } from "@/components/admin/authorization/ui";
import { hrefAt, short, type FilterDef, type Query, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { identityCommand } from "@/app/admin/identity/actions";
import { formatDateTime } from "@/lib/format";
import type { ApiError } from "@/lib/api/client";
import type {
  AssuranceChange,
  AuthenticationEvent,
  FederationConnection,
  PasswordResetRequest,
  PrincipalDetail,
  SessionSummary,
  SubjectIdentity,
  SupportRow,
} from "@/lib/api/identity";
import { ago, elevated, latestEventBy, latestSessionBy, supportState, type IdentityData } from "./data";

export const BASE = "/admin/identity";

export function idHref(q: Query): string {
  return hrefAt(BASE, q);
}

export type Ctx = { me: string; tenantId: string; now: number };

/** What the page read for the principal open in the People drawer. */
export type PersonDetail = {
  history: { rows: AssuranceChange[]; error: ApiError | null };
  subject: { data: SubjectIdentity | null; error: ApiError | null };
};

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Badge tone={tone} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  PENDING_ACTIVATION: { label: "Invited", tone: "info" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  DISABLED: { label: "Disabled", tone: "danger" },
};

const TYPE: Record<string, string> = { HUMAN: "Person", SERVICE_ACCOUNT: "Service account", API_CLIENT: "API client" };

function when(iso: string | null | undefined): string {
  return iso ? formatDateTime(iso) : "—";
}

function risk(score: number): { label: string; tone: Tone } {
  if (score >= 70) return { label: "High", tone: "danger" };
  if (score >= 40) return { label: "Medium", tone: "warning" };
  return { label: "Low", tone: "success" };
}

// ── People ───────────────────────────────────────────────────────────────────

export function peopleRegister(data: IdentityData, ctx: Ctx, detail: PersonDetail | null, query: Query): RegisterSpec {
  const sessions = latestSessionBy(data.sessions.rows);
  const events = latestEventBy(data.events.rows);
  const rows: Row[] = data.principals.rows.map((p) => {
    const s = sessions.get(p.principal_id);
    const e = events.get(p.principal_id);
    const st = STATUS[p.status] ?? { label: p.status, tone: "neutral" as Tone };
    const last = [s?.issued_at, e?.occurred_at].filter(Boolean).sort().pop();
    return {
      id: p.principal_id,
      idLabel: short(p.principal_id),
      search: `${p.display_name} ${p.email} ${p.principal_id} ${p.external_id ?? ""}`,
      facets: { status: p.status, type: p.principal_type },
      cells: [
        <TwoLine key="n" primary={p.display_name || "—"} secondary={p.email || TYPE[p.principal_type]} />,
        <span key="t" className="text-[12px]">{TYPE[p.principal_type] ?? p.principal_type}</span>,
        <span key="src" className="text-[12px] text-slate-600 dark:text-slate-300">{p.source}</span>,
        s && s.state === "ACTIVE" ? (
          <Chip key="a" label={s.mfa_verified ? "MFA verified" : "Password"} tone={s.mfa_verified ? "success" : "warning"} />
        ) : (
          <span key="a" className="text-[12px] text-slate-400">No live session</span>
        ),
        <Chip key="s" label={st.label} tone={st.tone} />,
        <span key="l" className="text-[12px] text-slate-500">{ago(last, ctx.now)}</span>,
      ],
    };
  });
  return {
    base: BASE,
    noun: "identities",
    idColumn: "Principal",
    columns: [{ label: "Subject" }, { label: "Type" }, { label: "Source" }, { label: "Assurance" }, { label: "Context status" }, { label: "Last activity" }],
    rows,
    filters: [
      {
        name: "status",
        allLabel: "All statuses",
        options: [
          ["ACTIVE", "Active"],
          ["PENDING_ACTIVATION", "Invited"],
          ["SUSPENDED", "Suspended"],
          ["DISABLED", "Disabled"],
        ],
      },
      {
        name: "type",
        allLabel: "All principal types",
        options: [
          ["HUMAN", "People"],
          ["SERVICE_ACCOUNT", "Service accounts"],
          ["API_CLIENT", "API clients"],
        ],
      },
    ] satisfies FilterDef[],
    searchPlaceholder: "Search name, email or principal ID",
    empty: "No principals in this tenant yet. Add a person to start.",
    error: data.principals.error,
    what: "identity register",
    problem: identityProblem("identity register"),
    note: data.principals.more ? "First 200 shown — narrow with search" : undefined,
    drawer: (id, links) => {
      const p = data.principals.rows.find((x) => x.principal_id === id);
      if (!p) return null;
      return <PersonDrawer p={p} data={data} ctx={ctx} detail={detail} links={links} query={query} />;
    },
  };
}

function ChainBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{value}</p>
    </div>
  );
}

function PersonDrawer({
  p,
  data,
  ctx,
  detail,
  links,
}: {
  p: PrincipalDetail;
  data: IdentityData;
  ctx: Ctx;
  detail: PersonDetail | null;
  links: { close: string; pane: string; paneHref: (k: string) => string };
  query: Query;
}) {
  const pane = links.pane || "effective";
  const st = STATUS[p.status] ?? { label: p.status, tone: "neutral" as Tone };
  const live = data.sessions.rows.filter((s) => s.principal_id === p.principal_id && s.state === "ACTIVE");
  const s = live[0];
  const self = p.principal_id === ctx.me;
  const human = p.principal_type === "HUMAN";

  const panes = [
    { key: "effective", label: "Effective", href: links.paneHref("effective") },
    { key: "factors", label: "Auth & factors", href: links.paneHref("factors") },
    { key: "links", label: "Identities", href: links.paneHref("links") },
    { key: "audit", label: "Audit", href: links.paneHref("audit") },
  ];

  let body: ReactNode;
  if (pane === "factors") {
    body = !detail || detail.history.error ? (
      <DrawerNote>The assurance history could not be read.</DrawerNote>
    ) : detail.history.rows.length === 0 ? (
      <DrawerNote>No second factor has been enrolled, reset or removed for this principal.</DrawerNote>
    ) : (
      <DrawerFacts
        items={detail.history.rows.map((h) => ({ label: when(h.changed_at), value: `${h.assurance_level} · ${(h.reason ?? "").replaceAll("_", " ")}` }))}
      />
    );
  } else if (pane === "links") {
    const subj = detail?.subject.data;
    body = !subj ? (
      <DrawerNote>The subject&apos;s external identities could not be read.</DrawerNote>
    ) : subj.links.length === 0 ? (
      <DrawerNote>No external identity provider is linked. This principal signs in with a local credential.</DrawerNote>
    ) : (
      <DrawerFacts items={subj.links.map((l) => ({ label: l.identity_provider, value: `${l.provider_subject} · ${l.status}` }))} />
    );
  } else if (pane === "audit") {
    const ev = data.events.rows.filter((e) => e.principal_id === p.principal_id).slice(0, 8);
    body = data.events.error ? (
      <DrawerNote>Sign-in events could not be read.</DrawerNote>
    ) : ev.length === 0 ? (
      <DrawerNote>No sign-in events recorded for this principal.</DrawerNote>
    ) : (
      <DrawerFacts items={ev.map((e) => ({ label: ago(e.occurred_at, ctx.now), value: `${e.event_type.replaceAll("_", " ")} · ${e.outcome}` }))} />
    );
  } else {
    body = (
      <div className="space-y-1.5">
        <p className="pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Decision context</p>
        <ChainBox label="Subject · verified principal" value={`${p.display_name || p.principal_id} · ${TYPE[p.principal_type] ?? p.principal_type}`} />
        <ArrowDown className="mx-auto h-3.5 w-3.5 text-gold-500" />
        <ChainBox label="Tenant · isolation boundary" value={short(p.tenant_id)} />
        <ArrowDown className="mx-auto h-3.5 w-3.5 text-gold-500" />
        <ChainBox
          label="Entity & channel"
          value={s ? `${s.legal_entity_id ? short(s.legal_entity_id) : "Tenant-wide"} · ${s.source_channel || "unstated channel"}` : "No live session"}
        />
        <ArrowDown className="mx-auto h-3.5 w-3.5 text-gold-500" />
        <ChainBox
          label="Session & assurance"
          value={s ? `${s.mfa_verified ? "MFA verified" : "Password only"} · ${s.trust_posture.replaceAll("_", " ")} · ends ${ago(s.expires_at, ctx.now).replace(" ago", "")}` : "—"}
        />
        <div className="pt-3">
          <DrawerFacts
            items={[
              { label: "Principal ID", value: <span className="font-mono text-[11px]">{p.principal_id}</span> },
              { label: "Source", value: p.source },
              { label: "Live sessions", value: String(live.length) },
              { label: "Created", value: when(p.created_at) },
              { label: "Record version", value: `v${p.record_version}` },
            ]}
          />
        </div>
        {!self && human && p.status === "ACTIVE" && (
          <div className="flex flex-wrap gap-2 pt-3">
            <ActionDialog
              label="Reset second factor"
              tone="danger"
              title={`Reset ${p.display_name}'s second factor`}
              description="Removes every authenticator they hold. They must enrol again before any privileged action. Needs your own fresh second factor."
              action={identityCommand}
              hidden={{ command: "mfa_reset", id: p.principal_id }}
              submitLabel="Reset second factor"
              reasons="end"
            />
            <MergeDialog survivor={p} candidates={data.principals.rows} me={ctx.me} />
          </div>
        )}
      </div>
    );
  }

  let actions: ReactNode = null;
  if (self) {
    actions = <DrawerNote>This is you. Someone else changes your own access.</DrawerNote>;
  } else if (p.status === "ACTIVE" || p.status === "PENDING_ACTIVATION") {
    actions = (
      <>
        {human && p.status === "ACTIVE" ? (
          <ActionDialog
            label="Request password reset"
            title={`Request a password reset for ${p.display_name}`}
            description="A second administrator must approve it before the reset link is sent."
            action={identityCommand}
            hidden={{ command: "reset_request", id: p.principal_id }}
            submitLabel="Request reset"
            reasons="change"
          />
        ) : null}
        <ActionDialog
          label="Suspend access"
          tone="accent"
          title={`Suspend ${p.display_name}`}
          description="Every session they hold ends now, and authorization refuses them everywhere until access is restored."
          action={identityCommand}
          hidden={{ command: "status", id: p.principal_id, to: "SUSPENDED", expected_version: p.record_version }}
          submitLabel="Suspend"
          reasons="end"
        />
      </>
    );
  } else if (p.status === "SUSPENDED") {
    actions = (
      <ActionDialog
        label="Restore access"
        tone="accent"
        title={`Restore ${p.display_name}`}
        description="They can sign in again. Their roles are as they were."
        action={identityCommand}
        hidden={{ command: "status", id: p.principal_id, to: "ACTIVE", expected_version: p.record_version }}
        submitLabel="Restore"
        reasons="restore"
      />
    );
  } else {
    actions = <DrawerNote>Disabled principals are not reactivated here; a disabled or merged ID is never reissued.</DrawerNote>;
  }

  return (
    <DetailDrawer
      heading="Effective identity context"
      closeHref={links.close}
      icon={UserRound}
      title={p.display_name || p.principal_id}
      subtitle={`${short(p.principal_id)} · ${p.email || TYPE[p.principal_type]}`}
      status={st}
      panes={panes}
      activePane={pane}
      actions={actions}
    >
      {body}
    </DetailDrawer>
  );
}

function MergeDialog({ survivor, candidates, me }: { survivor: PrincipalDetail; candidates: PrincipalDetail[]; me: string }) {
  const others = candidates.filter(
    (c) => c.principal_id !== survivor.principal_id && c.principal_id !== me && c.status !== "DISABLED" && c.principal_type === survivor.principal_type,
  );
  if (others.length === 0) return null;
  return (
    <ActionDialog
      label="Merge a duplicate"
      tone="danger"
      title={`Merge a duplicate into ${survivor.display_name}`}
      description="The duplicate is retired: its sessions end, its external identities move here, and its ID resolves to this record for good. This cannot be undone. Needs your own fresh second factor."
      action={identityCommand}
      hidden={{ command: "merge", id: survivor.principal_id }}
      submitLabel="Merge"
      reasons="end"
    >
      {/* The duplicate's record version travels with the choice: the service refuses a stale one. */}
      <SelectField
        name="duplicate"
        label="Duplicate to retire"
        options={others.map((o) => [`${o.principal_id}|${o.record_version}`, `${o.display_name || o.principal_id} (${o.email || short(o.principal_id)})`] as const)}
      />
    </ActionDialog>
  );
}

// ── Live sessions ────────────────────────────────────────────────────────────

export function sessionsRegister(data: IdentityData, ctx: Ctx): RegisterSpec {
  const rows: Row[] = data.sessions.rows.map((s) => {
    const r = risk(s.adaptive_risk_score);
    return {
      id: s.session_context_id,
      idLabel: short(s.session_context_id),
      search: `${s.display_name} ${s.principal_id} ${s.session_context_id} ${s.legal_entity_id ?? ""}`,
      facets: { state: s.state, assurance: s.mfa_verified ? "MFA" : "PASSWORD", risk: elevated(s) ? "elevated" : "normal" },
      cells: [
        <TwoLine key="p" primary={s.display_name || short(s.principal_id)} secondary={short(s.principal_id)} />,
        <span key="e" className="font-mono text-[11.5px]">{s.legal_entity_id ? short(s.legal_entity_id) : "Tenant-wide"}</span>,
        <Chip key="a" label={s.mfa_verified ? "MFA" : "Password"} tone={s.mfa_verified ? "success" : "neutral"} />,
        <Chip
          key="st"
          label={s.state === "ACTIVE" ? "Active" : s.state === "EXPIRED" ? "Expired" : "Ended"}
          tone={s.state === "ACTIVE" ? "success" : "neutral"}
        />,
        <Chip key="r" label={r.label} tone={r.tone} />,
        <span key="i" className="text-[12px] text-slate-500">{ago(s.issued_at, ctx.now)}</span>,
      ],
    };
  });
  return {
    base: BASE,
    noun: "sessions",
    idColumn: "Session",
    columns: [{ label: "Subject" }, { label: "Acting entity" }, { label: "Authentication" }, { label: "Status" }, { label: "Risk" }, { label: "Issued" }],
    rows,
    filters: [
      { name: "state", allLabel: "All states", options: [["ACTIVE", "Active"], ["EXPIRED", "Expired"], ["INVALIDATED", "Ended"]] },
      { name: "assurance", allLabel: "All assurance levels", options: [["MFA", "MFA verified"], ["PASSWORD", "Password only"]] },
      { name: "risk", allLabel: "All risk states", options: [["elevated", "Elevated"], ["normal", "Normal"]] },
    ],
    searchPlaceholder: "Search subject, entity or session ID",
    empty: "No sessions have been resolved in this tenant.",
    error: data.sessions.error,
    what: "sessions",
    problem: identityProblem("sessions"),
    note: data.sessions.more ? "Newest 200 shown" : undefined,
    drawer: (id, links) => {
      const s = data.sessions.rows.find((x) => x.session_context_id === id);
      if (!s) return null;
      return <SessionDrawer s={s} ctx={ctx} close={links.close} />;
    },
  };
}

function SessionDrawer({ s, ctx, close }: { s: SessionSummary; ctx: Ctx; close: string }) {
  const r = risk(s.adaptive_risk_score);
  return (
    <DetailDrawer
      heading="Session context"
      closeHref={close}
      icon={KeyRound}
      title={s.display_name || s.principal_id}
      subtitle={s.session_context_id}
      status={{ label: s.state === "ACTIVE" ? "Active" : s.state === "EXPIRED" ? "Expired" : "Ended", tone: s.state === "ACTIVE" ? "success" : "neutral" }}
      actions={
        s.state === "ACTIVE" ? (
          <ActionDialog
            label="End session"
            tone="accent"
            title="End this session"
            description="The envelope stops verifying at every relying service within the revocation window."
            action={identityCommand}
            hidden={{ command: "end_session", id: s.session_context_id }}
            submitLabel="End session"
            reasons="end"
          />
        ) : (
          <DrawerNote>{s.invalidation_reason ? `Ended: ${s.invalidation_reason.replaceAll("_", " ").toLowerCase()}.` : "This session has expired."}</DrawerNote>
        )
      }
    >
      <DrawerFacts
        items={[
          { label: "Principal", value: <span className="font-mono text-[11px]">{s.principal_id}</span> },
          { label: "Acting entity", value: s.legal_entity_id ?? "Tenant-wide" },
          { label: "Trust posture", value: s.trust_posture.replaceAll("_", " ") },
          { label: "Second factor", value: s.mfa_verified ? "Verified" : "Not verified" },
          { label: "Risk score", value: `${s.adaptive_risk_score} (${r.label})` },
          { label: "Channel", value: s.source_channel || "—" },
          { label: "Support context", value: s.support_context_id || "—" },
          { label: "Issued", value: `${when(s.issued_at)} (${ago(s.issued_at, ctx.now)})` },
          { label: "Expires", value: when(s.expires_at) },
          ...(s.invalidated_at ? [{ label: "Ended", value: `${when(s.invalidated_at)} · ${s.invalidation_reason ?? ""}` }] : []),
        ]}
      />
    </DetailDrawer>
  );
}

// ── Sign-in events ───────────────────────────────────────────────────────────

const EVENT: Record<string, string> = {
  LOGIN: "Sign-in",
  FAILED_LOGIN: "Failed sign-in",
  STEP_UP: "Step-up",
  MFA_CHALLENGE: "Second-factor challenge",
  LOGOUT: "Sign-out",
  SESSION_INVALIDATED: "Session ended",
  PASSWORD_RESET: "Password reset",
};

export function eventsRegister(data: IdentityData, ctx: Ctx): RegisterSpec {
  const names = new Map(data.principals.rows.map((p) => [p.principal_id, p.display_name]));
  const rows: Row[] = data.events.rows.map((e) => ({
    id: e.event_id,
    idLabel: short(e.event_id),
    search: `${names.get(e.principal_id) ?? ""} ${e.principal_id} ${e.details?.basis ?? ""} ${e.correlation_id ?? ""}`,
    facets: { outcome: e.outcome, type: e.event_type },
    cells: [
      <TwoLine key="p" primary={names.get(e.principal_id) || short(e.principal_id)} secondary={short(e.principal_id)} />,
      <span key="t" className="text-[12px]">{EVENT[e.event_type] ?? e.event_type}</span>,
      <Chip key="o" label={e.outcome === "SUCCESS" ? "Success" : "Refused"} tone={e.outcome === "SUCCESS" ? "success" : "danger"} />,
      <span key="a" className="text-[12px]">{e.assurance_level ?? "—"}</span>,
      <span key="b" className="text-[12px] text-slate-600 dark:text-slate-300">{e.details?.basis?.replaceAll("_", " ") ?? "—"}</span>,
      <span key="w" className="text-[12px] text-slate-500">{ago(e.occurred_at, ctx.now)}</span>,
    ],
  }));
  return {
    base: BASE,
    noun: "events",
    idColumn: "Event",
    columns: [{ label: "Subject" }, { label: "Event" }, { label: "Outcome" }, { label: "Assurance" }, { label: "Basis" }, { label: "When" }],
    rows,
    filters: [
      { name: "outcome", allLabel: "All outcomes", options: [["SUCCESS", "Success"], ["FAILURE", "Refused"]] },
      { name: "type", allLabel: "All event types", options: Object.entries(EVENT) },
    ],
    searchPlaceholder: "Search subject, basis or correlation ID",
    empty: "No sign-in has been recorded in this tenant yet.",
    error: data.events.error,
    what: "sign-in events",
    problem: identityProblem("sign-in events"),
    note: data.events.more ? "Newest 200 shown" : undefined,
    drawer: (id, links) => {
      const e = data.events.rows.find((x) => x.event_id === id);
      if (!e) return null;
      return <EventDrawer e={e} name={names.get(e.principal_id)} close={links.close} />;
    },
  };
}

function EventDrawer({ e, name, close }: { e: AuthenticationEvent; name?: string; close: string }) {
  return (
    <DetailDrawer
      heading="Sign-in event"
      closeHref={close}
      icon={e.event_type === "STEP_UP" ? Fingerprint : LogIn}
      title={EVENT[e.event_type] ?? e.event_type}
      subtitle={e.event_id}
      status={{ label: e.outcome === "SUCCESS" ? "Success" : "Refused", tone: e.outcome === "SUCCESS" ? "success" : "danger" }}
    >
      <DrawerFacts
        items={[
          { label: "Subject", value: name || e.principal_id },
          { label: "Principal ID", value: <span className="font-mono text-[11px]">{e.principal_id}</span> },
          { label: "Assurance", value: e.assurance_level ?? "—" },
          { label: "Decision basis", value: e.details?.basis?.replaceAll("_", " ") ?? "—" },
          { label: "Occurred", value: when(e.occurred_at) },
          { label: "Correlation", value: e.correlation_id ?? "—" },
        ]}
      />
      <DrawerNote>Written in the same transaction as the access decision it records, and append-only.</DrawerNote>
    </DetailDrawer>
  );
}

// ── Support access ───────────────────────────────────────────────────────────

const SUPPORT_STATE: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  REVOKED: { label: "Revoked", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export function supportRegister(data: IdentityData, ctx: Ctx): RegisterSpec {
  const names = new Map(data.principals.rows.map((p) => [p.principal_id, p.display_name]));
  const rows: Row[] = data.support.rows.map((s) => {
    const st = supportState(s, ctx.now);
    return {
      id: s.support_context_id,
      idLabel: short(s.support_context_id),
      search: `${s.ticket_ref} ${s.justification} ${s.support_principal_id} ${s.subject_principal_id ?? ""}`,
      facets: { state: st },
      cells: [
        <TwoLine key="o" primary={names.get(s.support_principal_id) || short(s.support_principal_id)} secondary="support operator" />,
        <span key="s" className="text-[12px]">{s.subject_principal_id ? names.get(s.subject_principal_id) || short(s.subject_principal_id) : "Tenant-wide"}</span>,
        <span key="r" className="text-[12px]">{s.reason_code.replaceAll("_", " ").toLowerCase()}</span>,
        <Chip key="st" label={SUPPORT_STATE[st].label} tone={SUPPORT_STATE[st].tone} />,
        <span key="a" className="text-[12px]">{names.get(s.approver_principal_id) || short(s.approver_principal_id)}</span>,
        <span key="e" className="text-[12px] text-slate-500">{when(s.expires_at)}</span>,
      ],
    };
  });
  return {
    base: BASE,
    noun: "requests",
    idColumn: "Request",
    columns: [{ label: "Operator" }, { label: "Subject" }, { label: "Reason" }, { label: "Status" }, { label: "Approver" }, { label: "Expires" }],
    rows,
    filters: [{ name: "state", allLabel: "All states", options: Object.entries(SUPPORT_STATE).map(([k, v]) => [k, v.label] as const) }],
    searchPlaceholder: "Search ticket, justification or principal",
    empty: "No support access has been requested in this tenant.",
    error: data.support.error,
    what: "support access requests",
    problem: identityProblem("support access requests"),
    drawer: (id, links) => {
      const s = data.support.rows.find((x) => x.support_context_id === id);
      if (!s) return null;
      return <SupportDrawer s={s} ctx={ctx} close={links.close} names={names} />;
    },
  };
}

function SupportDrawer({ s, ctx, close, names }: { s: SupportRow; ctx: Ctx; close: string; names: Map<string, string> }) {
  const st = supportState(s, ctx.now);
  const iAmApprover = s.approver_principal_id === ctx.me;
  const iRequested = s.requested_by_principal_id === ctx.me || s.support_principal_id === ctx.me;
  let actions: ReactNode;
  if (st === "PENDING_APPROVAL" && iAmApprover && !iRequested) {
    actions = (
      <ActionDialog
        label="Approve support access"
        tone="accent"
        title="Approve this support access"
        description="The operator may act in this tenant for the requested window, starting now."
        action={identityCommand}
        hidden={{ command: "support_approve", id: s.support_context_id, expected_version: s.record_version }}
        submitLabel="Approve"
        reasons="approve"
      />
    );
  } else if (st === "ACTIVE" || st === "PENDING_APPROVAL") {
    actions = (
      <>
        <DrawerNote>
          {st === "PENDING_APPROVAL" ? `Only ${names.get(s.approver_principal_id) || "the named approver"} can approve this.` : "Live until it expires or is revoked."}
        </DrawerNote>
        <ActionDialog
          label="Revoke"
          tone="danger"
          title="Revoke this support access"
          action={identityCommand}
          hidden={{ command: "support_revoke", id: s.support_context_id }}
          submitLabel="Revoke"
          reasons="end"
        />
      </>
    );
  }
  return (
    <DetailDrawer
      heading="Support access"
      closeHref={close}
      icon={ShieldQuestion}
      title={`Ticket ${s.ticket_ref}`}
      subtitle={s.support_context_id}
      status={SUPPORT_STATE[st]}
      actions={actions}
    >
      <DrawerFacts
        items={[
          { label: "Operator", value: names.get(s.support_principal_id) || s.support_principal_id },
          { label: "Subject", value: s.subject_principal_id ? names.get(s.subject_principal_id) || s.subject_principal_id : "Tenant-wide" },
          { label: "Reason", value: s.reason_code.replaceAll("_", " ").toLowerCase() },
          { label: "Justification", value: s.justification },
          { label: "Approver", value: names.get(s.approver_principal_id) || s.approver_principal_id },
          { label: "Requested", value: when(s.granted_at) },
          { label: "Expires", value: when(s.expires_at) },
          ...(s.revoked_at ? [{ label: "Revoked", value: `${when(s.revoked_at)} · ${s.revocation_reason ?? ""}` }] : []),
          ...(s.reviewed_at ? [{ label: "Reviewed", value: when(s.reviewed_at) }] : []),
        ]}
      />
    </DetailDrawer>
  );
}

// ── Password resets ──────────────────────────────────────────────────────────

const RESET_STATE: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  ISSUED: { label: "Link sent", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

function approvalsOf(r: PasswordResetRequest): number {
  return (r.approvals ?? []).filter((a) => a.decision === "APPROVE").length;
}

export function resetsRegister(data: IdentityData, ctx: Ctx): RegisterSpec {
  const names = new Map(data.principals.rows.map((p) => [p.principal_id, p.display_name]));
  const who = (id: string) => (id === ctx.me ? "You" : names.get(id) || short(id));
  const rows: Row[] = data.resets.rows.map((r) => {
    const st = RESET_STATE[r.status] ?? { label: r.status, tone: "neutral" as Tone };
    return {
      id: r.request_id,
      idLabel: short(r.request_id),
      search: `${names.get(r.principal_id) ?? ""} ${r.principal_id} ${names.get(r.requested_by) ?? ""} ${r.requested_by} ${r.reason ?? ""}`,
      facets: { status: r.status, mine: r.requested_by === ctx.me ? "mine" : "others" },
      cells: [
        <TwoLine key="p" primary={names.get(r.principal_id) || short(r.principal_id)} secondary={short(r.principal_id)} />,
        <span key="b" className="text-[12px]">{who(r.requested_by)}</span>,
        <span key="r" className="text-[12px] text-slate-600 dark:text-slate-300">{(r.reason ?? "—").replaceAll("_", " ")}</span>,
        <Chip key="s" label={st.label} tone={st.tone} />,
        <span key="a" className="text-[12px] tabular-nums">{`${approvalsOf(r)} of ${r.approvals_required}`}</span>,
        <span key="w" className="text-[12px] text-slate-500">{ago(r.created_at, ctx.now)}</span>,
      ],
    };
  });
  return {
    base: BASE,
    noun: "resets",
    idColumn: "Request",
    columns: [{ label: "Subject" }, { label: "Requested by" }, { label: "Reason" }, { label: "Status" }, { label: "Approvals" }, { label: "Requested" }],
    rows,
    filters: [
      { name: "status", allLabel: "All statuses", options: Object.entries(RESET_STATE).map(([k, v]) => [k, v.label] as const) },
      { name: "mine", allLabel: "Anyone's requests", options: [["mine", "Requested by me"], ["others", "Requested by others"]] },
    ],
    searchPlaceholder: "Search subject, requester or reason",
    empty: "No password reset has been requested in this tenant. Request one from a person's drawer.",
    error: data.resets.error,
    what: "password resets",
    problem: identityProblem("password resets"),
    note: data.resets.more ? "Newest 200 shown" : undefined,
    drawer: (id, links) => {
      const r = data.resets.rows.find((x) => x.request_id === id);
      if (!r) return null;
      return <ResetDrawer r={r} ctx={ctx} close={links.close} who={who} />;
    },
  };
}

function ResetDrawer({ r, ctx, close, who }: { r: PasswordResetRequest; ctx: Ctx; close: string; who: (id: string) => string }) {
  const st = RESET_STATE[r.status] ?? { label: r.status, tone: "neutral" as Tone };
  const mine = r.requested_by === ctx.me;
  const subject = r.principal_id === ctx.me;
  const decided = (r.approvals ?? []).some((a) => a.approver_id === ctx.me);
  let actions: ReactNode = null;
  if (r.status === "PENDING_APPROVAL") {
    // The maker never sees the checker's buttons; nor does the person whose
    // password it is, nor someone who has already decided.
    actions = mine ? (
      <DrawerNote>You requested this reset. A second administrator approves or rejects it.</DrawerNote>
    ) : subject ? (
      <DrawerNote>This reset is for your own account. Someone else decides it.</DrawerNote>
    ) : decided ? (
      <DrawerNote>You have already decided this request. It needs another approver.</DrawerNote>
    ) : (
      <>
        <ActionDialog
          label="Approve reset"
          tone="accent"
          title={`Approve the password reset for ${who(r.principal_id)}`}
          description="Once approved, the reset link is sent to them. Needs your own fresh second factor."
          action={identityCommand}
          hidden={{ command: "reset_decide", id: r.request_id, decision: "APPROVE" }}
          submitLabel="Approve"
          reasons="approve"
        />
        <ActionDialog
          label="Reject"
          tone="danger"
          title={`Reject the password reset for ${who(r.principal_id)}`}
          description="No link is sent. The requester can raise a new request."
          action={identityCommand}
          hidden={{ command: "reset_decide", id: r.request_id, decision: "REJECT" }}
          submitLabel="Reject"
          reasons="reject"
        />
      </>
    );
  }
  return (
    <DetailDrawer
      heading="Password reset"
      closeHref={close}
      icon={LockKeyhole}
      title={who(r.principal_id)}
      subtitle={r.request_id}
      status={st}
      actions={actions}
    >
      <DrawerFacts
        items={[
          { label: "Subject", value: <span className="font-mono text-[11px]">{r.principal_id}</span> },
          { label: "Requested by", value: who(r.requested_by) },
          { label: "Reason", value: (r.reason ?? "—").replaceAll("_", " ") },
          { label: "Approvals", value: `${approvalsOf(r)} of ${r.approvals_required}` },
          ...(r.approvals ?? []).map((a) => ({ label: a.decision === "APPROVE" ? "Approved by" : "Rejected by", value: `${who(a.approver_id)} · ${when(a.at)}` })),
          { label: "Requested", value: when(r.created_at) },
          { label: "Expires", value: when(r.expires_at) },
          ...(r.decided_at ? [{ label: "Decided", value: when(r.decided_at) }] : []),
        ]}
      />
      <DrawerNote>The service refuses a decision by the requester or the subject whatever the console shows.</DrawerNote>
    </DetailDrawer>
  );
}

// ── Federation ───────────────────────────────────────────────────────────────

const CONNECTION_STATE: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
  DEGRADED: { label: "Keys stale", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  REVOKED: { label: "Revoked", tone: "neutral" },
};

export function federationRegister(data: IdentityData, ctx: Ctx): RegisterSpec {
  const f = data.federation;
  const rows: Row[] = f.rows.map((c) => {
    const st = CONNECTION_STATE[c.status] ?? { label: c.status.replaceAll("_", " ").toLowerCase(), tone: "neutral" as Tone };
    return {
      id: c.connection_id,
      idLabel: short(c.connection_id),
      search: `${c.name} ${c.connection_id} ${c.protocol}`,
      facets: { status: c.status },
      cells: [
        <TwoLine key="n" primary={c.name} secondary={c.protocol.toUpperCase()} />,
        <Chip key="s" label={st.label} tone={st.tone} />,
        <span key="v" className="text-[12px] tabular-nums">{c.active_version ? `v${c.active_version}` : "None approved"}</span>,
        <span key="l" className="text-[12px] tabular-nums">{`v${c.latest_version}`}</span>,
        <span key="u" className="text-[12px] text-slate-500">{ago(c.updated_at, ctx.now)}</span>,
      ],
    };
  });
  return {
    base: BASE,
    noun: "connections",
    idColumn: "Connection",
    columns: [{ label: "Identity provider" }, { label: "Status" }, { label: "Approved version" }, { label: "Latest version" }, { label: "Updated" }],
    rows,
    filters: [{ name: "status", allLabel: "All statuses", options: Object.entries(CONNECTION_STATE).map(([k, v]) => [k, v.label] as const) }],
    searchPlaceholder: "Search connection name or ID",
    empty: f.enabled ? (
      "No enterprise identity provider is connected to this tenant."
    ) : (
      <span>
        Federation is not enabled on this deployment (FEDERATION_ENABLED is off), so no enterprise identity provider can sign anyone in. People sign in
        with a local password and second factor. The operator turns it on; see the service runbook, section 12.
      </span>
    ),
    error: f.error,
    what: "federation connections",
    problem: identityProblem("federation connections"),
    drawer: (id, links) => {
      const c = f.rows.find((x) => x.connection_id === id);
      if (!c) return null;
      return <ConnectionDrawer c={c} close={links.close} />;
    },
  };
}

function ConnectionDrawer({ c, close }: { c: FederationConnection; close: string }) {
  const st = CONNECTION_STATE[c.status] ?? { label: c.status, tone: "neutral" as Tone };
  return (
    <DetailDrawer
      heading="Federation connection"
      closeHref={close}
      icon={Building2}
      title={c.name}
      subtitle={c.connection_id}
      status={st}
      actions={
        <DrawerNote>
          Configuration and approval are governed at the federation API: a second person approves each version against the fingerprint they saw.
        </DrawerNote>
      }
    >
      <DrawerFacts
        items={[
          { label: "Protocol", value: c.protocol.toUpperCase() },
          { label: "Approved version", value: c.active_version ? `v${c.active_version}` : "None approved — no logins admitted" },
          { label: "Latest version", value: `v${c.latest_version}` },
          ...(c.status_reason ? [{ label: "Status reason", value: c.status_reason }] : []),
          { label: "Created by", value: <span className="font-mono text-[11px]">{c.created_by}</span> },
          { label: "Created", value: when(c.created_at) },
          { label: "Updated", value: when(c.updated_at) },
        ]}
      />
    </DetailDrawer>
  );
}

/** Why a register is empty when identity-context-svc could not be read. */
export function identityProblem(what: string) {
  return function IdentityProblem(error: ApiError): ReactNode {
    const why =
      error.kind === "unreachable" || error.kind === "timeout"
        ? "The identity service is not reachable, so nothing was read."
        : error.status === 403
          ? `You don't have access to the ${what}.`
          : `The ${what} could not be read (${error.status ?? error.kind}).`;
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-amber-700 dark:text-amber-300">
        <ShieldQuestion className="h-4 w-4 shrink-0" />
        {why} Nothing is shown rather than an empty list.
      </div>
    );
  };
}
