import { CloudOff, KeySquare, ScrollText, Users } from "lucide-react";
import { Badge } from "@/components/ui";
import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  describeDelegationScope,
  describeDelegationStatus,
  describePermissionBundle,
  describeRoleStatus,
  listABACRules,
  listDelegatedAuthorities,
  listPermissionBundles,
  listRoles,
  type ABACRule,
  type PermissionBundle,
} from "@/lib/api/authorization";
import type { Identity } from "@/lib/api/client";
import { AbacRulesList } from "./AbacRuleForms";
import { WithdrawDelegationButton } from "./DelegationForms";
import { RoleEnforcementButton } from "./RoleEnforcementButton";
import { BundleEnforcementButton } from "./BundleEnforcementButton";

/**
 * The three registers of the evaluation plane, read from the endpoints this
 * pass added to the service.
 *
 * `GET /v1/admin/roles` and `GET /v1/admin/delegated-authorities` did not
 * exist. Both surfaces were write-only: a role could be created, retired,
 * reactivated and given permitted actions, and a delegation could be created
 * and revoked, and neither could be listed back — so the only way to learn an
 * id was to have been the caller that wrote it, and neither register could be
 * audited from outside that caller.
 *
 * Each panel degrades on its own. An unreachable service is reported as an
 * outage rather than as an empty register, because "there are no roles" and
 * "we could not read the roles" are opposite statements and the second one
 * must never be shown as the first on a page about who can do what.
 */

// ── the role catalogue the engine actually joins through ─────────────────────

/**
 * NOT the same list as `RoleCataloguePanel`, and the difference is the point.
 *
 * That panel reads access-control-svc, which owns the governed authoring record
 * — a role exists, and here is what it may permit. THIS reads the row the
 * evaluation engine joins through, whose `active_flag` is what actually stops a
 * role granting anything. A role marked retired upstream while this flag stays
 * true is a retirement that is a label and not a control, which is the exact
 * defect the service's own SetRoleActive comment describes at length. Showing
 * both is how that stays visible.
 */
/**
 * What one role permits, rendered under the role itself.
 *
 * THE READ THAT WAS MISSING. `permitted_actions` lives on the permission
 * bundles, not on the role, and nothing could read it: `GET /v1/admin/roles`
 * returns role_code, role_name, role_scope_type and active_flag and no actions
 * at all, and the table's only other reader is the evaluation path, which
 * answers the different question "what may THIS principal do here". So this
 * panel listed role LABELS — and a role_code is a name somebody chose, while
 * the bundle is the control. An operator could see that FINANCE_APPROVER
 * existed and was being enforced, and had no way to learn whether it permitted
 * one action or forty, or which.
 *
 * A role with NO sets is called out rather than left blank, because it is the
 * quiet failure this whole surface exists to expose: the role is listed, shows
 * as enforced, can be granted to anybody, and confers nothing.
 *
 * Failure is reported as a failure, not as an empty set — "this role permits
 * nothing" and "we could not read what it permits" are opposite statements,
 * and on a page about who can do what the second must never render as the
 * first.
 */
function RolePermissionSets({
  bundles,
  unreadable,
}: {
  bundles: PermissionBundle[];
  unreadable: boolean;
}) {
  if (unreadable) {
    return (
      <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        What this role permits could not be read. This is not the same as it permitting nothing —
        it may be granting anything at all, and nothing here says which.
      </p>
    );
  }

  if (bundles.length === 0) {
    return (
      <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        This role has no permission sets, so it grants nothing — to anybody, however it is
        assigned. Attach one above before granting it to somebody.
      </p>
    );
  }

  const live = bundles.filter((b) => b.active_flag);
  const grantedCount = new Set(live.flatMap((b) => b.permitted_actions)).size;

  return (
    <div className="mt-2.5 space-y-2">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Permits {grantedCount} distinct {grantedCount === 1 ? "action" : "actions"} across{" "}
        {live.length} of {bundles.length} {bundles.length === 1 ? "set" : "sets"}.
      </p>

      <ul className="space-y-2">
        {bundles.map((bundle) => (
          <li
            key={bundle.permission_bundle_id}
            className={cn(
              "rounded-md border px-3 py-2",
              bundle.active_flag
                ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
                : "border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/60",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                    {bundle.bundle_code}
                  </span>
                  <Badge tone={bundle.active_flag ? "success" : "neutral"} dot={bundle.active_flag}>
                    {bundle.active_flag ? "Granting" : "Not granting"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {describePermissionBundle(bundle)}
                </p>
              </div>

              <BundleEnforcementButton bundle={bundle} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function EvaluationRolesPanel({ identity }: { identity: Identity }) {
  const result = await listRoles(identity);

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="The enforced role list could not be read"
        hint="The authorization service is not answering. This is not the same as there being no roles — nothing here can be relied on until it is back."
      />
    );
  }

  const roles = result.data;

  if (roles.length === 0) {
    return (
      <PanelEmptyState
        icon={KeySquare}
        label="No roles exist in the enforcing plane"
        hint="Nobody can be granted anything until one does. Note that a role defined in the catalogue above is a different record — if one exists there and not here, it was never provisioned, and it grants nothing."
      />
    );
  }

  const enforcing = roles.filter((r) => r.active_flag).length;

  // One read per role, in parallel. The endpoint is per-role because that is
  // how the table is keyed, and a tenant's role catalogue is small enough
  // (capped at 500 server-side, in practice tens) that fanning out beats
  // adding a second shape of the same query. Each is settled independently so
  // one failing role does not blank the whole catalogue — the panel can then
  // say which role it could not read, rather than reporting an outage for all
  // of them or, worse, showing a failed read as "permits nothing".
  const bundleReads = await Promise.all(
    roles.map((role) => listPermissionBundles(identity, role.role_id)),
  );
  const bundlesByRole = new Map(
    roles.map((role, i) => {
      const r = bundleReads[i];
      return [role.role_id, r.ok ? (r.data ?? []) : null] as const;
    }),
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {enforcing} of {roles.length} {roles.length === 1 ? "role is" : "roles are"} being
        enforced. A retired role grants nothing even to people who still hold it — their grants
        stay listed, which is why retiring is reversible.
      </p>

      <ul className="space-y-2.5">
        {roles.map((role) => {
          const status = describeRoleStatus(role);
          return (
            <li
              key={role.role_id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-800 dark:text-slate-200">
                      {role.role_code}
                    </span>
                    <Badge tone={status.tone} dot={status.enforcing}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                    {role.role_name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                    {status.meaning}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {role.role_scope_type === "TENANT"
                      ? "Can be granted across the whole organisation at once"
                      : "Granted one company at a time"}
                    {" · created "}
                    {formatDate(role.created_at)}
                  </p>
                  <CopyableId value={role.role_id} className="mt-1 text-xs" />
                </div>

                <RoleEnforcementButton role={role} />
              </div>

              <RolePermissionSets
                bundles={bundlesByRole.get(role.role_id) ?? []}
                unreadable={bundlesByRole.get(role.role_id) === null}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── who is acting on whose behalf ───────────────────────────────────────────

/**
 * The delegation register as the evaluation plane holds it.
 *
 * Rows with a `source_service` were projected from delegated-authority-svc's
 * events rather than authored here. That service stays authoritative for the
 * lifecycle and this table is the read-model `/v1/authorize` resolves against,
 * so a projected row is exactly as load-bearing as a local one — and the
 * provenance is shown rather than hidden, because a row nobody here authored
 * cannot be withdrawn here either.
 */
export async function EvaluationDelegationsPanel({
  identity,
}: {
  identity: Identity & { principalId: string };
}) {
  const result = await listDelegatedAuthorities(identity);

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="The delegation register could not be read"
        hint="The authorization service is not answering. This is not the same as there being no delegations in force."
      />
    );
  }

  const delegations = result.data;

  if (delegations.length === 0) {
    return (
      <PanelEmptyState
        icon={Users}
        label="Nobody is acting on anybody else's behalf"
        hint="Everybody who can do something here holds that access directly. Lending authority is how somebody covers for a colleague without being granted the role themselves."
      />
    );
  }

  const live = delegations.filter((d) => describeDelegationStatus(d).live).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {live} of {delegations.length} {delegations.length === 1 ? "delegation is" : "delegations are"}{" "}
        conferring authority right now. Withdrawn and expired ones are kept: the withdrawal of
        borrowed authority is itself worth being able to prove.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[54rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
            <tr>
              {[
                "Who lent it",
                "Who borrowed it",
                "What it confers",
                "Standing",
                "Window",
                "End it",
              ].map(
                (h) => (
                  <th key={h} scope="col" className={HEAD}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {delegations.map((d) => {
              const status = describeDelegationStatus(d);
              return (
                <tr
                  key={d.delegated_authority_id}
                  className="align-top transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                >
                  <td className={CELL}>
                    <CopyableId value={d.delegator_principal_id} className="text-xs" />
                    {d.source_service && (
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        recorded by {d.source_service} — cannot be withdrawn from here
                      </p>
                    )}
                  </td>
                  <td className={CELL}>
                    <CopyableId value={d.delegate_principal_id} className="text-xs" />
                  </td>
                  <td className={cn(CELL, "max-w-[22rem]")}>
                    <span className="break-words">{describeDelegationScope(d)}</span>
                  </td>
                  <td className={CELL}>
                    <Badge tone={status.tone} dot={status.live}>
                      {status.label}
                    </Badge>
                    <p className="mt-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {status.raw}
                    </p>
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                    <span className="text-xs">from {formatDateTime(d.effective_from)}</span>
                    <p className="mt-0.5 text-xs">
                      {d.effective_to ? `until ${formatDateTime(d.effective_to)}` : "no end date"}
                    </p>
                  </td>
                  <td className={cn(CELL, "max-w-[14rem]")}>
                    <WithdrawDelegationButton
                      delegation={d}
                      currentPrincipalId={identity.principalId}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── the attribute conditions ────────────────────────────────────────────────

/**
 * The conditions that can take an action away.
 *
 * The table ships empty by design and a test fails if a migration seeds a row,
 * so an empty register here is the expected state rather than a gap — and the
 * empty state says so, because "no rules" on a security page otherwise reads
 * as something missing.
 */
export async function AbacRulesPanel({ identity }: { identity: Identity }) {
  const result = await listABACRules(identity);

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="The conditions could not be read"
        hint="The authorization service is not answering, so this cannot say which conditions are in force. Do not assume there are none."
      />
    );
  }

  const rules: ABACRule[] = result.data;

  if (rules.length === 0) {
    return (
      <PanelEmptyState
        icon={ScrollText}
        label="No attribute conditions are declared"
        hint="This is the expected state, not a gap — the platform ships with none and nothing seeds them. Access here is decided by roles, delegations and separation-of-duties rules alone until somebody declares a condition."
      />
    );
  }

  const applying = rules.filter((r) => r.active_flag).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {applying} of {rules.length} {rules.length === 1 ? "condition is" : "conditions are"} being
        applied. Every one of these can only remove access — none of them grants anything, so none
        is the answer to somebody being unable to do their job.
      </p>

      <AbacRulesList rules={rules} />
    </div>
  );
}
