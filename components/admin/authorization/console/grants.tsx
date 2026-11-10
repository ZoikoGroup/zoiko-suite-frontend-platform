import { KeyRound, Users } from "lucide-react";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import type { RoleAssignment } from "@/lib/api/authorization";
import { person } from "@/lib/directory";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { Chip, Command, Mono, PersonCell, StatusChip, href, mine, short, who, type Ctx, type RegisterSpec } from "./register";

/** Where a grant is in its life. Only "live" grants anything. */
export type GrantState = "live" | "scheduled" | "pending" | "ended" | "rejected" | "expired";

const STATE: Record<GrantState, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  pending: { label: "Awaiting approval", tone: "warning" },
  ended: { label: "Ended", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Request expired", tone: "neutral" },
};

export function grantState(a: RoleAssignment, now: number): GrantState {
  const approval = a.approval_status ?? "APPROVED";
  if (approval === "PENDING_APPROVAL") return "pending";
  if (approval === "REJECTED") return "rejected";
  if (approval === "EXPIRED") return "expired";
  if (new Date(a.effective_from).getTime() > now) return "scheduled";
  if (a.effective_to && new Date(a.effective_to).getTime() <= now) return "ended";
  return "live";
}

export function grantsRegister(data: AuthzData, ctx: Ctx): RegisterSpec {
  const roles = new Map(data.roles.rows.map((r) => [r.role_id, r]));
  const assignments = data.assignments.rows;
  const byId = new Map(assignments.map((a) => [a.principal_role_assignment_id, a]));

  return {
    noun: "grants",
    what: "role grants",
    idColumn: "Grant ID",
    columns: [{ label: "Person" }, { label: "Role" }, { label: "Applies to" }, { label: "From" }, { label: "State" }, { label: "Granted by" }],
    searchPlaceholder: "Search person, role, legal entity or grant ID",
    empty: "Nobody holds a role in this organisation yet. Grant one with “Grant role”.",
    error: data.assignments.error,
    filters: [
      { name: "state", allLabel: "All states", options: Object.entries(STATE).map(([k, v]) => [k, v.label] as const) },
      {
        name: "role",
        allLabel: "All roles",
        options: data.roles.rows.map((r) => [r.role_id, r.role_code] as const),
      },
      {
        name: "scope",
        allLabel: "All scopes",
        options: [
          ["org", "Whole organisation"],
          ["entity", "One legal entity"],
        ],
      },
    ],
    rows: assignments.map((a) => {
      const role = roles.get(a.role_id);
      const p = person(a.principal_id);
      const state = grantState(a, ctx.now);
      return {
        id: a.principal_role_assignment_id,
        idLabel: short(a.principal_role_assignment_id),
        search: [a.principal_role_assignment_id, a.principal_id, p.name, p.title, role?.role_code, role?.role_name, a.legal_entity_id].join(" "),
        facets: { state, role: a.role_id, scope: a.legal_entity_id ? "entity" : "org" },
        cells: [
          <PersonCell key="p" id={a.principal_id} />,
          <TwoLine key="r" primary={role?.role_name || role?.role_code || short(a.role_id)} secondary={role?.role_code} />,
          a.legal_entity_id ? <span key="w" title={a.legal_entity_id}>Legal entity <Mono>{short(a.legal_entity_id)}</Mono></span> : "Whole organisation",
          <span key="f" className="whitespace-nowrap tabular-nums">{formatDate(a.effective_from)}</span>,
          <Chip key="s" {...STATE[state]} />,
          who(a.assigned_by),
        ],
      };
    }),
    drawer: (id, links) => {
      const a = byId.get(id);
      if (!a) return null;
      const role = roles.get(a.role_id);
      const p = person(a.principal_id);
      const state = grantState(a, ctx.now);
      const pane = ["overview", "approval", "holder"].includes(links.pane) ? links.pane : "overview";
      const firstName = p.known ? p.name.split(" ")[0] : "this person";

      const actions =
        state === "pending" ? (
          mine(a.assigned_by, a.principal_id, ctx.me) ? null : (
            <>
              <Command command="assignment.reject" id={id} label="Reject" title="Reject this grant" reasons="reject" version={a.version} tone="danger" />
              <Command command="assignment.approve" id={id} label="Approve" title="Approve this grant" description="It is in force from the moment you approve it." reasons="approve" version={a.version} tone="accent" />
            </>
          )
        ) : state === "live" || state === "scheduled" ? (
          <>
            <ButtonLink href={href({ tab: "grants", q: a.principal_id })} icon={Users}>
              All for {firstName}
            </ButtonLink>
            <Command
              command="assignment.revoke"
              id={id}
              label="Revoke"
              title="Revoke this grant"
              description="The grant ends on the next permission check, or at the time you choose. The record is kept."
              reasons="end"
              version={a.version}
              tone="danger"
              withEndDate
            />
          </>
        ) : (
          <ButtonLink href={href({ tab: "grants", q: a.principal_id })} icon={Users}>
            All grants for {firstName}
          </ButtonLink>
        );

      return (
        <DetailDrawer
          heading="Grant details"
          closeHref={links.close}
          icon={KeyRound}
          title={role?.role_name || role?.role_code || "Role grant"}
          subtitle={`${short(id)} · ${p.name}`}
          status={STATE[state]}
          panes={[
            { key: "overview", label: "Overview", href: links.paneHref("overview") },
            { key: "approval", label: "Approval", href: links.paneHref("approval") },
            { key: "holder", label: "Holder", href: links.paneHref("holder") },
          ]}
          activePane={pane}
          actions={actions}
        >
          {pane === "overview" && (
            <DrawerFacts
              items={[
                { label: "Person", value: p.name },
                { label: "Role", value: <Mono>{role?.role_code ?? a.role_id}</Mono> },
                { label: "Role reach", value: role ? (role.role_scope_type === "TENANT" ? "Organisation-wide" : "Per legal entity") : "—" },
                { label: "Applies to", value: a.legal_entity_id ? <Mono>{a.legal_entity_id}</Mono> : "Whole organisation" },
                { label: "Starts", value: formatDateTime(a.effective_from) },
                { label: "Ends", value: a.effective_to ? formatDateTime(a.effective_to) : "Open-ended" },
                { label: "Granted by", value: who(a.assigned_by) },
                { label: "Recorded", value: formatDateTime(a.created_at) },
                { label: "Grant ID", value: <Mono>{id}</Mono> },
              ]}
            />
          )}
          {pane === "approval" && (
            <DrawerFacts
              items={[
                { label: "Approval", value: <StatusChip status={a.approval_status ?? "APPROVED"} /> },
                { label: "Approved by", value: who(a.approved_by) },
                { label: "Decided", value: a.approval_decided_at ? formatDateTime(a.approval_decided_at) : "—" },
                { label: "Reference", value: a.approval_reference || "—" },
                { label: "Request expires", value: a.approval_expires_at ? formatDateTime(a.approval_expires_at) : "—" },
              ]}
            />
          )}
          {pane === "holder" && (
            <DrawerFacts
              items={[
                { label: "Name", value: p.name },
                { label: "Title", value: p.title || "—" },
                { label: "Email", value: p.email || "—" },
                { label: "Standing", value: a.principal_status ? <StatusChip status={a.principal_status} /> : "—" },
                { label: "Principal ID", value: <Mono>{a.principal_id}</Mono> },
              ]}
            />
          )}
          {state === "pending" && mine(a.assigned_by, a.principal_id, ctx.me) && (
            <DrawerNote>You requested this grant or it is for you, so someone independent decides it.</DrawerNote>
          )}
          {state === "pending" && !mine(a.assigned_by, a.principal_id, ctx.me) && (
            <DrawerNote>A privileged grant recorded by someone without approval rights. It grants nothing until approved, and lapses after 72 hours.</DrawerNote>
          )}
        </DetailDrawer>
      );
    },
  };
}
