// The Identity Context registers: people, live sessions, sign-in events and
// support access. Each is a RegisterSpec for the shared RegisterView (search,
// filters, pager, drawer); the drawers carry the governed commands. A maker
// never sees the checker's button: support access is approved only by the
// approver it names, and a reset is approved by someone other than whoever
// requested it (the service enforces both; the console does not offer them).

import type { ReactNode } from "react";
import { ArrowDown, Fingerprint, KeyRound, LogIn, ShieldQuestion, UserRound } from "lucide-react";
import { Badge } from "@/components/ui";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { SelectField } from "@/components/admin/authorization/ui";
import { hrefAt, short, type FilterDef, type Query, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { identityCommand } from "@/app/admin/identity/actions";
import { formatDateTime } from "@/lib/format";
import type { ApiError } from "@/lib/api/client";
import type { AssuranceChange, AuthenticationEvent, PrincipalDetail, SessionSummary, SubjectIdentity, SupportRow } from "@/lib/api/identity";
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

function Unreadable({ what }: { what: string }): ReactNode {
  return <span className="text-slate-500">{`The ${what} could not be read.`}</span>;
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

export function unreadableNode(what: string): ReactNode {
  return <Unreadable what={what} />;
}
