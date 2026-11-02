// Elevated access: just-in-time, break-glass and support sessions in one
// register, because a reviewer asks one question of all three — who holds
// more than their roles give them right now, and has each been looked at?

import { LifeBuoy, Siren, Timer, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import {
  describeAdminStatus,
  type BreakGlassSession,
  type PrivilegedSession,
  type StepUpEvidence,
  type SupportSession,
} from "@/lib/api/authorization";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { ReviewSessionDialog } from "./forms";
import { ActionChips, Command, Mono, PersonCell, StatusChip, short, who, type Ctx, type RegisterSpec } from "./register";

type Kind = "jit" | "break_glass" | "support";

const KIND: Record<Kind, { label: string; icon: LucideIcon; command: string }> = {
  jit: { label: "Just-in-time", icon: Timer, command: "jit" },
  break_glass: { label: "Break-glass", icon: Siren, command: "break_glass" },
  support: { label: "Support", icon: LifeBuoy, command: "support" },
};

type Session =
  | { kind: "jit"; s: PrivilegedSession }
  | { kind: "break_glass"; s: BreakGlassSession }
  | { kind: "support"; s: SupportSession };

function subject(x: Session): string {
  return x.kind === "support" ? x.s.support_operator_id : x.s.principal_id;
}

function reference(x: Session): string {
  return x.kind === "break_glass" ? `Incident ${x.s.incident_id}` : x.s.ticket_ref;
}

function actionsOf(x: Session): string[] {
  return x.kind === "support" ? x.s.allowed_actions ?? [] : x.s.requested_actions;
}

function review(x: Session): string | null {
  return x.kind === "support" || x.s.review_status === "NOT_REQUIRED" ? null : x.s.review_status;
}

export function allSessions(data: AuthzData): Session[] {
  return [
    ...data.jit.rows.map((s) => ({ kind: "jit" as const, s })),
    ...data.breakGlass.rows.map((s) => ({ kind: "break_glass" as const, s })),
    ...data.support.rows.map((s) => ({ kind: "support" as const, s })),
  ].sort((a, b) => b.s.created_at.localeCompare(a.s.created_at));
}

function stepUp(e: StepUpEvidence | null | undefined): string {
  return e ? `${e.assurance} at ${formatDateTime(e.authn_at)}` : "—";
}

export function sessionsRegister(data: AuthzData, ctx: Ctx): RegisterSpec {
  const sessions = allSessions(data);
  const byId = new Map(sessions.map((x) => [x.s.session_id, x]));

  return {
    noun: "sessions",
    what: "elevated access sessions",
    idColumn: "Session",
    columns: [{ label: "Person" }, { label: "Type" }, { label: "Reference" }, { label: "Actions" }, { label: "Ends" }, { label: "State" }, { label: "Review" }],
    searchPlaceholder: "Search person, ticket, incident or action",
    empty: "No elevated access has been requested.",
    error: data.jit.error ?? data.breakGlass.error ?? data.support.error,
    filters: [
      { name: "type", allLabel: "All types", options: (Object.keys(KIND) as Kind[]).map((k) => [k, KIND[k].label] as const) },
      {
        name: "state",
        allLabel: "All states",
        options: [
          ["PENDING_APPROVAL", "Awaiting approval"],
          ["ACTIVE", "Active"],
          ["REVOKED", "Revoked"],
          ["EXPIRED", "Expired"],
          ["REJECTED", "Rejected"],
        ],
      },
      {
        name: "review",
        allLabel: "Any review",
        options: [
          ["PENDING", "Review due"],
          ["ATTESTED", "Attested"],
          ["FLAGGED", "Flagged"],
        ],
      },
    ],
    rows: sessions.map((x) => {
      const r = review(x);
      return {
        id: x.s.session_id,
        idLabel: short(x.s.session_id),
        search: [x.s.session_id, subject(x), who(subject(x)), reference(x), ...actionsOf(x)].join(" "),
        facets: { type: x.kind, state: x.s.status, review: r ?? "" },
        cells: [
          <PersonCell key="p" id={subject(x)} />,
          <span key="t" className="whitespace-nowrap">{KIND[x.kind].label}</span>,
          <span key="r" className="whitespace-nowrap">{reference(x)}</span>,
          <ActionChips key="a" list={actionsOf(x)} />,
          <span key="e" className="whitespace-nowrap tabular-nums">{formatDate(x.s.expires_at)}</span>,
          <StatusChip key="s" status={x.s.status} />,
          r ? <StatusChip key="v" status={r} /> : <span key="v" className="text-slate-400">—</span>,
        ],
      };
    }),
    drawer: (id, links) => {
      const x = byId.get(id);
      if (!x) return null;
      const panes = [
        { key: "overview", label: "Overview", href: links.paneHref("overview") },
        ...(x.kind === "support" ? [] : [{ key: "approval", label: "Approval", href: links.paneHref("approval") }, { key: "review", label: "Review", href: links.paneHref("review") }]),
      ];
      const pane = panes.some((p) => p.key === links.pane) ? links.pane : "overview";
      const { actions, note } = sessionCommands(x, ctx.me);
      return (
        <DetailDrawer
          heading="Session details"
          closeHref={links.close}
          icon={KIND[x.kind].icon}
          title={`${KIND[x.kind].label} · ${who(subject(x))}`}
          subtitle={`${reference(x)} · ${short(id)}`}
          status={describeAdminStatus(x.s.status)}
          panes={panes}
          activePane={pane}
          actions={actions}
        >
          {pane === "overview" && <DrawerFacts items={overviewFacts(x)} />}
          {pane === "approval" && x.kind !== "support" && (
            <DrawerFacts
              items={[
                { label: "Requested by", value: who(x.s.requested_by) },
                { label: "Requester's two-step", value: stepUp(x.s.requester_step_up) },
                { label: "Approved by", value: who(x.s.approved_by) },
                { label: "Approved", value: x.s.approved_at ? formatDateTime(x.s.approved_at) : "—" },
                ...(x.kind === "jit"
                  ? [{ label: "Approver's two-step", value: stepUp(x.s.approver_step_up) }]
                  : [
                      { label: "Approvals", value: `${x.s.approvals?.length ?? 0} of ${x.s.approvals_required ?? 1}` },
                      { label: "Request lapses", value: x.s.request_expires_at ? formatDateTime(x.s.request_expires_at) : "—" },
                    ]),
                { label: "Revoked by", value: who(x.s.revoked_by) },
              ]}
            />
          )}
          {pane === "review" && x.kind !== "support" && (
            <DrawerFacts
              items={[
                { label: "Review", value: <StatusChip status={x.s.review_status} /> },
                { label: "Reviewed by", value: who(x.s.reviewed_by) },
                { label: "Reviewed", value: x.s.reviewed_at ? formatDateTime(x.s.reviewed_at) : "—" },
                { label: "Notes", value: x.s.review_notes || "—" },
              ]}
            />
          )}
          {note}
        </DetailDrawer>
      );
    },
  };
}

function overviewFacts(x: Session) {
  const common = [
    { label: "Person", value: who(subject(x)) },
    { label: "Type", value: KIND[x.kind].label },
    { label: "Reference", value: reference(x) },
    { label: "Actions", value: actionsOf(x).length ? <Mono>{actionsOf(x).join(", ")}</Mono> : "Read-only" },
    { label: "Requested", value: formatDateTime(x.s.created_at) },
    { label: "Ends", value: formatDateTime(x.s.expires_at) },
    { label: "Length", value: `${Math.round(x.s.duration_seconds / 60)} min` },
  ];
  if (x.kind === "jit")
    return [
      ...common,
      { label: "Reason", value: x.s.reason },
      { label: "Resource", value: x.s.resource_scope ? <Mono>{x.s.resource_scope}</Mono> : "—" },
      { label: "Environment", value: x.s.target_environment || "—" },
      { label: "High impact", value: x.s.high_impact ? "Yes" : "No" },
    ];
  if (x.kind === "break_glass") return [...common, { label: "Reason", value: x.s.reason }];
  return [
    ...common,
    { label: "Purpose", value: x.s.purpose },
    { label: "Consent", value: x.s.tenant_consent_obtained ? "Obtained" : "Not obtained — grants nothing" },
    { label: "Bulk export", value: x.s.allow_bulk_export ? "Allowed" : "Not allowed" },
  ];
}

/** Approve / reject a request, revoke a live session, review an ended one. */
function sessionCommands(x: Session, me: string): { actions: ReactNode; note: ReactNode } {
  const base = KIND[x.kind].command;
  const id = x.s.session_id;
  const pending = x.s.status === "PENDING_APPROVAL";
  const involved =
    x.kind !== "support" &&
    (x.s.requested_by === me || x.s.principal_id === me || (x.kind === "break_glass" && !!x.s.approvals?.some((a) => a.approver_id === me)));

  if (pending && x.kind !== "support") {
    if (involved)
      return {
        actions: null,
        note: <DrawerNote>You asked for this session, it is for you, or you have already approved it — another approver decides.</DrawerNote>,
      };
    return {
      actions: (
        <>
          <Command command={`${base}.reject`} id={id} label="Reject" title="Reject this request" reasons="reject" tone="danger" />
          <Command
            command={`${base}.approve`}
            id={id}
            label="Approve"
            title="Approve this session"
            reasons="approve"
            tone="accent"
            footnote="Approving needs your own two-step sign-in from the last 15 minutes; you will be asked for a code if it is older."
          />
        </>
      ),
      note: null,
    };
  }

  const reviewDue = x.kind !== "support" && x.s.review_status === "PENDING";
  const live = x.s.status === "ACTIVE";
  if (!live && !reviewDue) return { actions: null, note: null };
  return {
    actions: (
      <>
        {live && (
          <Command
            command={`${base}.revoke`}
            id={id}
            label="Revoke"
            title="Revoke this session"
            description="Access ends on the next permission check."
            reasons="end"
            tone="danger"
          />
        )}
        {reviewDue && <ReviewSessionDialog kind={x.kind === "jit" ? "privileged" : "break_glass"} id={id} />}
      </>
    ),
    note: null,
  };
}
