import Form from "next/form";
import Link from "next/link";
import { CalendarClock, KeyRound, Users } from "lucide-react";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { explainAuthzError, type AssignmentSuspension, type RoleAssignment } from "@/lib/api/authorization";
import { person } from "@/lib/directory";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData, Read } from "./data";
import { Chip, Command, Mono, PersonCell, StatusChip, href, mine, short, who, type Ctx, type RegisterSpec } from "./register";

/** Where a grant is in its life. Only "live" grants anything. */
export type GrantState = "live" | "scheduled" | "suspended" | "pending" | "ended" | "rejected" | "expired";

const STATE: Record<GrantState, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  suspended: { label: "Suspended", tone: "warning" },
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
  if (a.effective_to && new Date(a.effective_to).getTime() <= now) return "ended";
  if (a.suspended_at) return "suspended";
  if (new Date(a.effective_from).getTime() > now) return "scheduled";
  return "live";
}

/**
 * Reads the grants register needs beyond the page's registers, made only
 * when the URL asks for them: one grant's suspension history (?pane=suspensions)
 * and the grants in force at an earlier instant (?as_of=).
 */
export type GrantsExtra = {
  suspensions?: Read<AssignmentSuspension> | null;
  asOf?: { at: string; read: Read<RoleAssignment> } | null;
};

export function grantsRegister(data: AuthzData, ctx: Ctx, extra: GrantsExtra = {}): RegisterSpec {
  const roles = new Map(data.roles.rows.map((r) => [r.role_id, r]));
  const asOf = extra.asOf ?? null;
  const assignments = asOf ? asOf.read.rows : data.assignments.rows;
  const byId = new Map(assignments.map((a) => [a.principal_role_assignment_id, a]));
  const at = asOf ? formatDateTime(asOf.at) : "";

  const roleFilter = {
    name: "role",
    allLabel: "All roles",
    options: data.roles.rows.map((r) => [r.role_id, r.role_code] as const),
  };
  const scopeFilter = {
    name: "scope",
    allLabel: "All scopes",
    options: [
      ["org", "Whole organisation"],
      ["entity", "One legal entity"],
    ] as const,
  };

  return {
    noun: "grants",
    what: "role grants",
    idColumn: "Grant ID",
    columns: [{ label: "Person" }, { label: "Role" }, { label: "Applies to" }, { label: "From" }, { label: "State" }, { label: "Granted by" }],
    searchPlaceholder: "Search person, role, legal entity or grant ID",
    empty: asOf
      ? `No grant was in force at ${at}.`
      : "Nobody holds a role in this organisation yet. Grant one with “Grant role”.",
    error: asOf ? asOf.read.error : data.assignments.error,
    banner: asOf && !asOf.read.error ? `Grants in force at ${at}: approved by then, inside their dates and not suspended.` : undefined,
    keep: asOf ? { as_of: asOf.at } : undefined,
    // An instant the page itself could not read never reached the service:
    // say so in its own words, with the way back.
    problem:
      asOf?.read.error?.kind === "malformed"
        ? (e) => (
            <p className="px-5 py-6 text-sm text-slate-600 dark:text-slate-300">
              {e.message}{" "}
              <Link href={href({ tab: "grants" })} className="font-medium text-navy-700 underline dark:text-navy-300">
                Back to now
              </Link>
            </p>
          )
        : undefined,
    filters: asOf
      ? [roleFilter, scopeFilter]
      : [{ name: "state", allLabel: "All states", options: Object.entries(STATE).map(([k, v]) => [k, v.label] as const) }, roleFilter, scopeFilter],
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
          asOf ? <Chip key="s" label="In force then" tone="success" /> : <Chip key="s" {...STATE[state]} />,
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
      const decided = state !== "pending" && state !== "rejected" && state !== "expired";
      const panes = [
        { key: "overview", label: "Overview", href: links.paneHref("overview") },
        { key: "approval", label: "Approval", href: links.paneHref("approval") },
        ...(decided ? [{ key: "suspensions", label: "Suspensions", href: links.paneHref("suspensions") }] : []),
        { key: "holder", label: "Holder", href: links.paneHref("holder") },
      ];
      const pane = panes.some((x) => x.key === links.pane) ? links.pane : "overview";
      const firstName = p.known ? p.name.split(" ")[0] : "this person";
      const allFor = (
        <ButtonLink href={href({ tab: "grants", q: a.principal_id })} icon={Users}>
          All for {firstName}
        </ButtonLink>
      );
      const revoke = (
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
      );
      const ownGrant = a.principal_id === ctx.me;

      const actions = asOf ? (
        <ButtonLink href={href({ tab: "grants", id })} icon={CalendarClock}>
          Show it now
        </ButtonLink>
      ) : state === "pending" ? (
        mine(a.assigned_by, a.principal_id, ctx.me) ? null : (
          <>
            <Command command="assignment.reject" id={id} label="Reject" title="Reject this grant" reasons="reject" version={a.version} tone="danger" />
            <Command command="assignment.approve" id={id} label="Approve" title="Approve this grant" description="It is in force from the moment you approve it." reasons="approve" version={a.version} tone="accent" />
          </>
        )
      ) : state === "live" || state === "scheduled" ? (
        <>
          {allFor}
          <Command
            command="assignment.suspend"
            id={id}
            label="Suspend"
            title="Suspend this grant"
            description="It gives nothing from the next permission check, but stays held: someone other than its holder can resume it, and it can still be revoked."
            reasons="suspend"
            version={a.version}
          />
          {revoke}
        </>
      ) : state === "suspended" ? (
        <>
          {allFor}
          {!ownGrant && (
            <Command
              command="assignment.resume"
              id={id}
              label="Resume"
              title="Resume this grant"
              description="Access returns on the next permission check. Resuming is checked as granting is: a privileged role needs approval rights, and a new duty conflict refuses it."
              reasons="restore"
              version={a.version}
              tone="accent"
            />
          )}
          {revoke}
        </>
      ) : (
        <ButtonLink href={href({ tab: "grants", q: a.principal_id })} icon={Users}>
          All grants for {firstName}
        </ButtonLink>
      );

      return (
        <DetailDrawer
          heading={asOf ? `Grant as of ${at}` : "Grant details"}
          closeHref={links.close}
          icon={KeyRound}
          title={role?.role_name || role?.role_code || "Role grant"}
          subtitle={`${short(id)} · ${p.name}`}
          status={asOf ? { label: "In force then", tone: "success" } : STATE[state]}
          panes={panes}
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
                ...(a.suspended_at
                  ? [
                      { label: "Suspended", value: `${formatDateTime(a.suspended_at)} by ${who(a.suspended_by)}` },
                      { label: "Why", value: a.suspension_reason || "—" },
                    ]
                  : []),
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
          {pane === "suspensions" && <SuspensionHistory read={extra.suspensions ?? null} />}
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
          {asOf && (
            <DrawerNote>
              The grant was in force at {at}. Its dates and approval are shown as they are recorded now; the Suspensions tab has every
              pause in its life.
            </DrawerNote>
          )}
          {!asOf && state === "pending" && mine(a.assigned_by, a.principal_id, ctx.me) && (
            <DrawerNote>You requested this grant or it is for you, so someone independent decides it.</DrawerNote>
          )}
          {!asOf && state === "pending" && !mine(a.assigned_by, a.principal_id, ctx.me) && (
            <DrawerNote>A privileged grant recorded by someone without approval rights. It grants nothing until approved, and lapses after 72 hours.</DrawerNote>
          )}
          {!asOf && state === "suspended" && ownGrant && (
            <DrawerNote>This grant is yours, so someone else decides whether to resume it.</DrawerNote>
          )}
        </DetailDrawer>
      );
    },
  };
}

/** A datetime-local value for an instant, in the server's zone (as every console date is shown). */
function localInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * "Who held what at…": the grants register at an earlier instant
 * (`GET /v1/admin/role-assignments/as-of`), and the way back to now.
 */
export function GrantsAsOf({ value }: { value: string | undefined }) {
  return (
    <Form action="/admin/authorization" scroll={false} className="flex items-center gap-2" aria-label="Grants as of">
      <input type="hidden" name="tab" value="grants" />
      <label className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-300">
        <span className="whitespace-nowrap">As of</span>
        <input
          type="datetime-local"
          name="as_of"
          required
          defaultValue={localInput(value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] text-slate-900 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <button
        type="submit"
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-navy-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <CalendarClock className="h-4 w-4" />
        Show
      </button>
      {value && <ButtonLink href={href({ tab: "grants" })}>Back to now</ButtonLink>}
    </Form>
  );
}

/** Every pause in one grant's life, oldest first, each with who and why. */
function SuspensionHistory({ read }: { read: Read<AssignmentSuspension> | null }) {
  if (!read) return <DrawerNote>The suspension history was not read.</DrawerNote>;
  if (read.error) return <DrawerNote>The suspension history could not be read: {explainAuthzError(read.error)}</DrawerNote>;
  if (read.rows.length === 0) return <DrawerNote>This grant has never been suspended.</DrawerNote>;
  return (
    <ol className="space-y-2.5" aria-label="Suspension history">
      {read.rows.map((s) => (
        <li key={s.suspension_id} className="rounded-lg border border-slate-200 px-3 py-2.5 text-[12.5px] dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">Suspended {formatDateTime(s.suspended_at)}</span>
            {s.resumed_at ? <Chip label="Resumed" tone="success" /> : <Chip label="Still suspended" tone="warning" />}
          </div>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            By {who(s.suspended_by)}: {s.suspension_reason}
          </p>
          {s.resumed_at && (
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Resumed {formatDateTime(s.resumed_at)} by {who(s.resumed_by)}
              {s.resume_reason ? `: ${s.resume_reason}` : ""}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
