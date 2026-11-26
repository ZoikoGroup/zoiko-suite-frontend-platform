// Roles and their permission sets: what a grant actually gives. Retiring a
// role or one of its permission sets withdraws those actions from everyone
// holding the role at the next permission check; nothing is deleted, and
// reactivating restores them.

import { ShieldCheck, Users } from "lucide-react";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { explainAuthzError, type PermissionBundle } from "@/lib/api/authorization";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData, Read } from "./data";
import { grantState } from "./grants";
import { ActionChips, Chip, Command, Mono, href, short, who, type Ctx, type RegisterSpec } from "./register";

const ACTIVE = { label: "Active", tone: "success" } as const;
const RETIRED = { label: "Retired", tone: "neutral" } as const;

function reach(scope: string): string {
  return scope === "TENANT" ? "Organisation-wide" : "Per legal entity";
}

/** `bundles` is read only when the drawer's Permissions tab is open. */
export function rolesRegister(data: AuthzData, ctx: Ctx, bundles: Read<PermissionBundle> | null = null): RegisterSpec {
  const roles = data.roles.rows;
  const byId = new Map(roles.map((r) => [r.role_id, r]));
  const holders = new Map<string, number>();
  for (const a of data.assignments.rows) {
    if (grantState(a, ctx.now) === "live") holders.set(a.role_id, (holders.get(a.role_id) ?? 0) + 1);
  }

  return {
    noun: "roles",
    what: "roles",
    idColumn: "Role",
    columns: [{ label: "Name" }, { label: "Reach" }, { label: "Live grants" }, { label: "State" }, { label: "Created" }, { label: "Created by" }],
    searchPlaceholder: "Search role code, name or ID",
    empty: "This organisation has no roles yet.",
    error: data.roles.error,
    filters: [
      {
        name: "state",
        allLabel: "All states",
        options: [
          ["active", "Active"],
          ["retired", "Retired"],
        ],
      },
      {
        name: "reach",
        allLabel: "Any reach",
        options: [
          ["org", "Organisation-wide"],
          ["entity", "Per legal entity"],
        ],
      },
    ],
    rows: roles.map((r) => ({
      id: r.role_id,
      idLabel: r.role_code,
      search: [r.role_id, r.role_code, r.role_name].join(" "),
      facets: { state: r.active_flag ? "active" : "retired", reach: r.role_scope_type === "TENANT" ? "org" : "entity" },
      cells: [
        <TwoLine key="n" primary={r.role_name || r.role_code} secondary={short(r.role_id)} />,
        <span key="r" className="whitespace-nowrap">{reach(r.role_scope_type)}</span>,
        <span key="h" className="tabular-nums">{holders.get(r.role_id) ?? 0}</span>,
        <Chip key="s" {...(r.active_flag ? ACTIVE : RETIRED)} />,
        <span key="c" className="whitespace-nowrap tabular-nums">{formatDate(r.created_at)}</span>,
        who(r.created_by_principal_id),
      ],
    })),
    drawer: (id, links) => {
      const r = byId.get(id);
      if (!r) return null;
      const panes = [
        { key: "overview", label: "Overview", href: links.paneHref("overview") },
        { key: "permissions", label: "Permission sets", href: links.paneHref("permissions") },
      ];
      const pane = panes.some((p) => p.key === links.pane) ? links.pane : "overview";
      const live = holders.get(r.role_id) ?? 0;
      return (
        <DetailDrawer
          heading="Role details"
          closeHref={links.close}
          icon={ShieldCheck}
          title={r.role_name || r.role_code}
          subtitle={`${r.role_code} · ${short(id)}`}
          status={r.active_flag ? ACTIVE : RETIRED}
          panes={panes}
          activePane={pane}
          actions={
            <>
              <ButtonLink href={href({ tab: "grants", role: r.role_id })} icon={Users}>
                Who holds it
              </ButtonLink>
              {r.active_flag ? (
                <Command
                  command="role.retire"
                  id={id}
                  label="Retire role"
                  title="Retire this role"
                  description={`Its actions stop at the next permission check for everyone holding it (${live} live grant${live === 1 ? "" : "s"}). The grants stay on record, and reactivating restores them.`}
                  reasons="end"
                  version={r.version}
                  tone="danger"
                />
              ) : (
                <Command
                  command="role.reactivate"
                  id={id}
                  label="Reactivate role"
                  title="Reactivate this role"
                  description="Everyone still assigned to it has its actions again from the next permission check."
                  reasons="restore"
                  version={r.version}
                  tone="accent"
                />
              )}
            </>
          }
        >
          {pane === "overview" && (
            <DrawerFacts
              items={[
                { label: "Code", value: <Mono>{r.role_code}</Mono> },
                { label: "Name", value: r.role_name || "—" },
                { label: "Reach", value: reach(r.role_scope_type) },
                { label: "Live grants", value: String(live) },
                { label: "Created", value: formatDateTime(r.created_at) },
                { label: "Created by", value: who(r.created_by_principal_id) },
                { label: "Role ID", value: <Mono>{id}</Mono> },
              ]}
            />
          )}
          {pane === "permissions" && <PermissionSets read={bundles} />}
          {!r.active_flag && <DrawerNote>A retired role grants nothing, whoever holds it.</DrawerNote>}
        </DetailDrawer>
      );
    },
  };
}

/** A role's permission sets, each with what it permits and its own retire / reactivate. */
function PermissionSets({ read }: { read: Read<PermissionBundle> | null }) {
  if (!read) return <DrawerNote>The permission sets were not read.</DrawerNote>;
  if (read.error) return <DrawerNote>The permission sets could not be read: {explainAuthzError(read.error)}</DrawerNote>;
  if (read.rows.length === 0) return <DrawerNote>This role has no permission sets, so it grants no action.</DrawerNote>;
  return (
    <ul className="space-y-2.5" aria-label="Permission sets">
      {read.rows.map((b) => (
        <li key={b.permission_bundle_id} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[12px] font-medium text-slate-900 dark:text-slate-100">{b.bundle_code}</span>
            <Chip {...(b.active_flag ? ACTIVE : RETIRED)} />
          </div>
          <div className="mt-1.5">
            <ActionChips list={b.permitted_actions} max={6} />
          </div>
          <div className="mt-2 flex justify-end">
            {b.active_flag ? (
              <Command
                command="bundle.retire"
                id={b.permission_bundle_id}
                label="Retire set"
                title={`Retire ${b.bundle_code}`}
                description="The role stops granting these actions at the next permission check. Reactivating restores them."
                reasons="end"
                version={b.version}
                tone="danger"
              />
            ) : (
              <Command
                command="bundle.reactivate"
                id={b.permission_bundle_id}
                label="Reactivate set"
                title={`Reactivate ${b.bundle_code}`}
                description="The role grants these actions again from the next permission check."
                reasons="restore"
                version={b.version}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
