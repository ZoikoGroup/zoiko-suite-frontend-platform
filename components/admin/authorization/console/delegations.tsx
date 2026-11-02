import { ArrowUpRight, Handshake } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import type { DelegatedAuthority } from "@/lib/api/authorization";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { ActionChips, Chip, Command, Mono, PersonCell, short, who, type Ctx, type RegisterSpec } from "./register";

/** Live, ended by withdrawal, or ended by its own date. */
export function delegationState(d: DelegatedAuthority, now: number): "ACTIVE" | "REVOKED" | "EXPIRED" | string {
  if (d.revocation_status && d.revocation_status !== "ACTIVE") return d.revocation_status;
  if (d.effective_to && new Date(d.effective_to).getTime() < now) return "EXPIRED";
  return "ACTIVE";
}

export function delegationsRegister(data: AuthzData, ctx: Ctx): RegisterSpec {
  const rows = data.delegations.rows;
  const byId = new Map(rows.map((d) => [d.delegated_authority_id, d]));

  return {
    noun: "delegations",
    what: "delegations",
    idColumn: "Delegation",
    columns: [{ label: "Lent by" }, { label: "Borrowed by" }, { label: "What" }, { label: "Limit" }, { label: "Until" }, { label: "State" }],
    searchPlaceholder: "Search lender, borrower or action",
    empty: "No authority has been lent. Lend yours with “Lend authority”.",
    error: data.delegations.error,
    filters: [
      {
        name: "state",
        allLabel: "All states",
        options: [
          ["ACTIVE", "Active"],
          ["REVOKED", "Withdrawn"],
          ["EXPIRED", "Expired"],
        ],
      },
      {
        name: "source",
        allLabel: "Any source",
        options: [
          ["local", "Recorded here"],
          ["mirrored", "From Delegated Authority"],
        ],
      },
    ],
    rows: rows.map((d) => ({
      id: d.delegated_authority_id,
      idLabel: short(d.delegated_authority_id),
      search: [d.delegated_authority_id, d.delegator_principal_id, d.delegate_principal_id, who(d.delegator_principal_id), who(d.delegate_principal_id), ...(d.delegated_actions ?? [])].join(" "),
      facets: { state: delegationState(d, ctx.now), source: d.source_service ? "mirrored" : "local" },
      cells: [
        <PersonCell key="l" id={d.delegator_principal_id} />,
        <PersonCell key="b" id={d.delegate_principal_id} />,
        d.scope_type === "ACTION_SUBSET" ? <ActionChips key="a" list={d.delegated_actions} /> : "All their authority",
        d.authority_limit_value ? `${d.authority_limit_type ?? ""} ${d.authority_limit_value}`.trim() : <span key="m" className="text-slate-400">—</span>,
        <span key="u" className="whitespace-nowrap tabular-nums">{d.effective_to ? formatDate(d.effective_to) : "Open"}</span>,
        <Chip key="s" {...statusOf(delegationState(d, ctx.now))} />,
      ],
    })),
    drawer: (id, links) => {
      const d = byId.get(id);
      if (!d) return null;
      const state = delegationState(d, ctx.now);
      const mirrored = Boolean(d.source_service);

      let actions: ReactNode = null;
      let note: ReactNode = null;
      if (state === "ACTIVE" && mirrored) {
        actions = (
          <ButtonLink href="/admin/delegations" icon={ArrowUpRight}>
            Manage in Delegated Authority
          </ButtonLink>
        );
        note = <DrawerNote>Projected from Delegated Authority; it is withdrawn there, not here.</DrawerNote>;
      } else if (state === "ACTIVE" && d.delegator_principal_id === ctx.me) {
        actions = (
          <Command
            command="delegation.revoke"
            id={id}
            label="Withdraw"
            title="Withdraw this delegation"
            description="The borrowed authority ends now. A withdrawn delegation is never reactivated."
            reasons="end"
            tone="danger"
          />
        );
      } else if (state === "ACTIVE") {
        note = <DrawerNote>Only the person who lent this authority can withdraw it.</DrawerNote>;
      }

      return (
        <DetailDrawer
          heading="Delegation details"
          closeHref={links.close}
          icon={Handshake}
          title={`${who(d.delegator_principal_id)} → ${who(d.delegate_principal_id)}`}
          subtitle={`${d.scope_type === "FULL" ? "All authority" : "Selected actions"} · ${short(id)}`}
          status={statusOf(state)}
          actions={actions}
        >
          <DrawerFacts
            items={[
              { label: "Lent by", value: who(d.delegator_principal_id) },
              { label: "Borrowed by", value: who(d.delegate_principal_id) },
              { label: "What", value: d.scope_type === "ACTION_SUBSET" ? <Mono>{(d.delegated_actions ?? []).join(", ") || "—"}</Mono> : "All of the lender's authority" },
              { label: "Limit", value: d.authority_limit_value ? `${d.authority_limit_type ?? ""} ${d.authority_limit_value}`.trim() : "—" },
              { label: "Legal entity", value: d.legal_entity_id ? <Mono>{d.legal_entity_id}</Mono> : "Wherever the lender holds it" },
              { label: "From", value: formatDateTime(d.effective_from) },
              { label: "Until", value: d.effective_to ? formatDateTime(d.effective_to) : "Open-ended" },
              { label: "Source", value: mirrored ? `${d.source_service}` : "Recorded here" },
              { label: "Recorded", value: formatDateTime(d.created_at) },
            ]}
          />
          <DrawerNote>A delegation never confers more than the lender holds now: it is checked against their live grants on every request.</DrawerNote>
          {note}
        </DetailDrawer>
      );
    },
  };
}

function statusOf(state: string): { label: string; tone: "success" | "neutral" } {
  if (state === "ACTIVE") return { label: "Active", tone: "success" };
  if (state === "REVOKED") return { label: "Withdrawn", tone: "neutral" };
  if (state === "EXPIRED") return { label: "Expired", tone: "neutral" };
  return { label: state, tone: "neutral" };
}
