import { Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import type { AuthorityLimit } from "@/lib/api/authorization";
import { person } from "@/lib/directory";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { ChangeLimitDialog } from "./forms";
import { Chip, Command, Mono, StatusChip, short, who, type Ctx, type RegisterSpec } from "./register";

function amount(value: string | null | undefined): string {
  const n = Number(value);
  return value && Number.isFinite(n) ? n.toLocaleString("en-GB", { maximumFractionDigits: 4 }) : value || "0";
}

export function limitRange(l: AuthorityLimit): string {
  return `${amount(l.lower_limit)} – ${amount(l.upper_limit)} ${l.currency}`;
}

/** Waiting for a checker: a new or changed limit, or a requested retirement. */
export function limitPending(l: AuthorityLimit): boolean {
  return l.status === "PENDING_APPROVAL" || Boolean(l.pending_action);
}

function limitChip(l: AuthorityLimit): { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" } {
  if (l.pending_action === "RETIRE") return { label: "Retirement pending", tone: "warning" };
  if (l.status === "SUPERSEDED") return { label: "Superseded", tone: "neutral" };
  if (l.status === "REJECTED") return { label: "Rejected", tone: "danger" };
  if (l.status === "PENDING_APPROVAL") return { label: l.supersedes_id ? "Change pending" : "Awaiting approval", tone: "warning" };
  return { label: l.status === "ACTIVE" ? "Active" : l.status === "RETIRED" ? "Retired" : l.status, tone: l.status === "ACTIVE" ? "success" : "neutral" };
}

export function limitsRegister(data: AuthzData, ctx: Ctx): RegisterSpec {
  const limits = data.limits.rows;
  const byId = new Map(limits.map((l) => [l.authority_limit_id, l]));
  const roleName = new Map(data.roles.rows.map((r) => [r.role_id, r.role_code]));
  const holder = (l: AuthorityLimit) =>
    l.principal_id ? { primary: person(l.principal_id).name, secondary: "Person" } : { primary: roleName.get(l.role_id ?? "") ?? short(l.role_id), secondary: "Everyone holding the role" };

  return {
    noun: "limits",
    what: "authority limits",
    idColumn: "Limit ID",
    columns: [{ label: "Holder" }, { label: "Governs" }, { label: "Range" }, { label: "Applies to" }, { label: "State" }, { label: "From" }],
    searchPlaceholder: "Search holder, action or limit ID",
    empty: "No authority limits yet. Request one with “Request limit”.",
    error: data.limits.error,
    filters: [
      {
        name: "state",
        allLabel: "All states",
        options: [
          ["ACTIVE", "Active"],
          ["PENDING", "Awaiting approval"],
          ["SUPERSEDED", "Superseded"],
          ["RETIRED", "Retired"],
          ["REJECTED", "Rejected"],
        ],
      },
      {
        name: "holder",
        allLabel: "Any holder",
        options: [
          ["person", "A person"],
          ["role", "A role"],
        ],
      },
      { name: "currency", allLabel: "All currencies", options: [...new Set(limits.map((l) => l.currency))].sort().map((c) => [c, c] as const) },
    ],
    rows: limits.map((l) => {
      const h = holder(l);
      return {
        id: l.authority_limit_id,
        idLabel: short(l.authority_limit_id),
        search: [l.authority_limit_id, l.authority_type, h.primary, l.principal_id, l.currency, l.legal_entity_id].join(" "),
        facets: { state: limitPending(l) ? "PENDING" : l.status, holder: l.principal_id ? "person" : "role", currency: l.currency },
        cells: [
          <TwoLine key="h" primary={h.primary} secondary={h.secondary} />,
          <Mono key="g">{l.authority_type}</Mono>,
          <span key="r" className="whitespace-nowrap tabular-nums">{limitRange(l)}</span>,
          l.legal_entity_id ? <span key="e" title={l.legal_entity_id}>Legal entity <Mono>{short(l.legal_entity_id)}</Mono></span> : "Every legal entity",
          <Chip key="s" {...limitChip(l)} />,
          <span key="f" className="whitespace-nowrap tabular-nums">{formatDate(l.effective_from)}</span>,
        ],
      };
    }),
    drawer: (id, links) => {
      const l = byId.get(id);
      if (!l) return null;
      const h = holder(l);
      const pane = links.pane === "decision" ? "decision" : "overview";
      const selfInvolved = l.requested_by === ctx.me || l.principal_id === ctx.me;

      let actions: ReactNode = null;
      let note: ReactNode = null;
      if (limitPending(l)) {
        if (selfInvolved) note = <DrawerNote>You requested this, or the limit is yours, so someone independent decides it.</DrawerNote>;
        else
          actions = (
            <>
              <Command command="limit.reject" id={id} label="Reject" title="Reject this request" reasons="reject" tone="danger" />
              <Command command="limit.approve" id={id} label="Approve" title="Approve this limit" description="It is in force from the moment you approve it." reasons="approve" tone="accent" />
            </>
          );
      } else if (l.status === "ACTIVE") {
        actions = (
          <>
            <Command command="limit.retire" id={id} label="Retire" title="Retire this limit" description="Requested now; the limit keeps applying until someone else approves it." reasons="end" version={l.version} tone="danger" />
            <ChangeLimitDialog limit={l} />
          </>
        );
      }

      return (
        <DetailDrawer
          heading="Limit details"
          closeHref={links.close}
          icon={Gauge}
          title={`Up to ${amount(l.upper_limit)} ${l.currency}`}
          subtitle={`${h.primary} · ${l.authority_type}`}
          status={limitChip(l)}
          panes={[
            { key: "overview", label: "Overview", href: links.paneHref("overview") },
            { key: "decision", label: "Request & decision", href: links.paneHref("decision") },
          ]}
          activePane={pane}
          actions={actions}
        >
          {pane === "overview" ? (
            <DrawerFacts
              items={[
                { label: "Holder", value: h.primary },
                { label: "Holder type", value: l.principal_id ? "Person" : "Role" },
                { label: "Governs", value: <Mono>{l.authority_type}</Mono> },
                { label: "Range", value: limitRange(l) },
                { label: "Applies to", value: l.legal_entity_id ? <Mono>{l.legal_entity_id}</Mono> : "Every legal entity" },
                { label: "Starts", value: formatDateTime(l.effective_from) },
                { label: "Ends", value: l.effective_to ? formatDateTime(l.effective_to) : "Open-ended" },
                { label: "Version", value: l.version },
                { label: "Replaces", value: l.supersedes_id ? <Mono>{short(l.supersedes_id)}</Mono> : "—" },
              ]}
            />
          ) : (
            <DrawerFacts
              items={[
                { label: "Status", value: <StatusChip status={l.status} /> },
                { label: "Requested by", value: who(l.requested_by) },
                { label: "Requested", value: l.requested_at ? formatDateTime(l.requested_at) : "—" },
                { label: "Reason", value: l.request_reason || "—" },
                { label: "Last decision", value: l.last_decision ? (l.last_decision === "APPROVED" ? "Approved" : "Rejected") : "—" },
                { label: "Decided by", value: who(l.decided_by) },
                { label: "Decided", value: l.decided_at ? formatDateTime(l.decided_at) : "—" },
              ]}
            />
          )}
          {note}
        </DetailDrawer>
      );
    },
  };
}
