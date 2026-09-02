import { KeySquare, ShieldOff, ShieldCheck } from "lucide-react";
import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import {
  listPermissionBundles,
  listRoleDefinitions,
  summariseRoles,
  type PermissionBundleDef,
  type RoleDefinition,
} from "@/lib/api/access-control";
import type { Identity } from "@/lib/api/client";

/**
 * The role catalogue, with each role's permission bundles inline.
 *
 * Bundles are fetched per role rather than in one call because the service has
 * no endpoint that returns them across roles — /permission-bundles is nested
 * under a role id. That is N+1 reads by construction, which is acceptable here
 * because a tenant's role catalogue is a governance artefact numbering in the
 * tens, not a transactional table. If it ever is not, the fix belongs in the
 * service as a flat list endpoint, not in a client-side fan-out that hides the
 * cost.
 *
 * A bundle read that fails degrades that one row to "could not read", not the
 * whole panel to empty. A role whose bundles are unknown is still a real role,
 * and hiding it would understate what the tenant has defined.
 */
export async function RoleCataloguePanel({ identity }: { identity: Identity }) {
  const rolesResult = await listRoleDefinitions(identity);

  if (!rolesResult.ok) {
    return (
      <PanelEmptyState
        icon={KeySquare}
        label="access-control-svc could not be reached"
        hint={rolesResult.error.message}
        tone="warning"
      />
    );
  }

  const roles = rolesResult.data ?? [];
  if (roles.length === 0) {
    return (
      <PanelEmptyState
        icon={KeySquare}
        label="No role definitions in this tenant"
        hint="Define one below. A role grants nothing until a permission bundle is attached to it."
      />
    );
  }

  const bundlesByRole = new Map<string, PermissionBundleDef[] | null>();
  await Promise.all(
    roles.map(async (role) => {
      const res = await listPermissionBundles(role.role_definition_id, identity);
      bundlesByRole.set(role.role_definition_id, res.ok ? (res.data ?? []) : null);
    }),
  );

  const stats = summariseRoles(roles);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          <strong className="text-slate-900 dark:text-slate-100">{stats.total}</strong> defined
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <strong className="text-slate-900 dark:text-slate-100">{stats.active}</strong> enforced
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldOff className="h-3.5 w-3.5 text-slate-400" />
          <strong className="text-slate-900 dark:text-slate-100">{stats.retired}</strong> retired
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-208 border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Scope</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Permission bundles</th>
              <th className="py-2 font-medium">Id</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <RoleRow
                key={role.role_definition_id}
                role={role}
                bundles={bundlesByRole.get(role.role_definition_id) ?? null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleRow({
  role,
  bundles,
}: {
  role: RoleDefinition;
  /** null means the bundle read failed for this role specifically. */
  bundles: PermissionBundleDef[] | null;
}) {
  const retired = role.status === "RETIRED";

  return (
    <tr className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
      <td className="py-3 pr-4">
        <div className="font-medium text-slate-900 dark:text-slate-100">{role.role_code}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{role.role_name}</div>
      </td>
      <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-400">{role.role_scope_type}</td>
      <td className="py-3 pr-4">
        {/* The wording is deliberate. A retired role is not merely flagged: its
            active_flag is cleared in authorization-svc and the authorize path
            joins through that flag, so it grants nothing to anyone. Labelling it
            "inactive" would understate a change that removed real access. */}
        <span
          className={
            retired
              ? "inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              : "inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          }
          title={
            retired
              ? "Retired: authorization-svc has cleared this role's active flag, so it grants nothing. Assignments remain, so reactivating restores the same access."
              : "Active: every action in its bundles is granted to each principal assigned this role."
          }
        >
          {retired ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
          {role.status}
        </span>
      </td>
      <td className="py-3 pr-4">
        {bundles === null ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            bundles could not be read
          </span>
        ) : bundles.length === 0 ? (
          // Said plainly because it is the most consequential thing this table
          // can show: a role with no bundle is assignable and grants nothing,
          // which looks like working access control until someone relies on it.
          <span className="text-xs text-amber-600 dark:text-amber-400">
            none — this role grants nothing
          </span>
        ) : (
          <ul className="space-y-1.5">
            {bundles.map((b) => (
              <li key={b.bundle_id}>
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  {b.bundle_code}
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {b.permitted_actions.map((a) => (
                    <span
                      key={a}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-3">
        <CopyableId value={role.role_definition_id} />
      </td>
    </tr>
  );
}
