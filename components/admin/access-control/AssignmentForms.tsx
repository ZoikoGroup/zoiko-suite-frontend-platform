"use client";

import { useActionState } from "react";
import { Badge, Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  assignRoleAction,
  createSoDRuleAction,
  revokeAssignmentAction,
} from "@/app/admin/access-control/actions";
import {
  IDLE_ASSIGN_ROLE,
  IDLE_CREATE_SOD_RULE,
  IDLE_REVOKE_ASSIGNMENT,
  type AssignRoleState,
  type CreateSoDRuleState,
  type RevokeAssignmentState,
} from "@/app/admin/access-control/state";
import type { RoleDefinition } from "@/lib/api/access-control";
import { isAssignmentActive, type RoleAssignment, type SoDRule } from "@/lib/api/authorization";

/**
 * Tones.
 *
 * `granted` is the only success in this console that changes what someone can
 * do rather than what is recorded, so it is the one place green means "access
 * now exists".
 *
 * `scopeMismatch` is amber, not red. The backend answered 404 role_not_found,
 * which it also returns for a role in another tenant — so the operator has a
 * lookup problem, not a failure. Red would invite a retry of the same id.
 *
 * `alreadyRevoked` is NEUTRAL, deliberately. A second revoke answers 404
 * because the store only matches assignments still in force — the operator's
 * intent is already satisfied. Painting that as an error tells someone to fix
 * something that is already the way they wanted it.
 */
const ASSIGN_TONE = {
  granted: "success",
  scopeMismatch: "warning",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const REVOKE_TONE = {
  revoked: "success",
  alreadyRevoked: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const SOD_TONE = {
  created: "success",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Domains seen in the SoD rules the platform ships with. Suggestions, not a
 *  closed set — domain_code is free text in authorization-svc. */
const COMMON_DOMAINS = ["PAYMENTS", "PROCUREMENT", "PAYROLL", "LEDGER", "LEGAL", "TAX"] as const;

// ─── Assign a role ───────────────────────────────────────────────────────────

/**
 * The form that actually grants access.
 *
 * Everything else on this page authors records: a role definition, a bundle of
 * permitted actions. None of it reaches a principal until this form runs. The
 * copy says so, because the previous state of this console was that an
 * operator could define a complete role and reasonably believe someone now
 * held it.
 */
export function AssignRoleForm({
  roles,
  legalEntityId,
  correlationId,
}: {
  roles: RoleDefinition[];
  legalEntityId: string;
  /** Minted per render by the server component, for the same reason
   *  DefineRoleForm takes it as a prop: crypto.randomUUID() during render
   *  differs between the server and client passes and tears the tree down on
   *  hydration. */
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<AssignRoleState, FormData>(
    assignRoleAction,
    IDLE_ASSIGN_ROLE,
  );

  const active = roles.filter((r) => r.status === "ACTIVE");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="principal_id">
            Principal id
          </label>
          <input
            className={FIELD}
            id="principal_id"
            name="principal_id"
            placeholder="33333333-3333-3333-3333-333333333333"
            required
          />
          <p className={HINT}>Who receives the access. This is the id authorization-svc will match on every check.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="role_id">
            Role
          </label>
          <select className={FIELD} id="role_id" name="role_id" defaultValue="" required>
            <option value="" disabled>
              Choose a role…
            </option>
            {active.map((r) => (
              <option key={r.role_definition_id} value={r.role_definition_id}>
                {r.role_code} — {r.role_scope_type}
              </option>
            ))}
          </select>
          <p className={HINT}>
            Retired roles are not listed: they grant nothing, so assigning one would record access
            that does not exist.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="legal_entity_id_assign">
            Legal entity <span className={OPTIONAL}>(leave blank for tenant-wide)</span>
          </label>
          <input
            className={FIELD}
            id="legal_entity_id_assign"
            name="legal_entity_id"
            defaultValue={legalEntityId}
          />
          <p className={HINT}>
            Blank means every entity in the tenant, which authorization-svc accepts only for a
            TENANT-scoped role. Naming an entity on a TENANT role is fine; the reverse is refused.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="effective_from">
            Effective from <span className={OPTIONAL}>(blank = now)</span>
          </label>
          <input className={FIELD} id="effective_from" name="effective_from" type="datetime-local" />
          <p className={HINT}>
            A future date records the grant now and starts it later — the evaluator compares against
            this on every check, so it is not live until then.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Granting…" : "Assign role"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          This is the step that grants access. Defining a role and attaching a bundle do not.
        </p>
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={ASSIGN_TONE[state.status]} message={state.message}>
          {state.status === "granted" && (
            <CopyableId value={state.assignment.principal_role_assignment_id} />
          )}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Current assignments, with revoke ────────────────────────────────────────

/**
 * The register of live grants.
 *
 * This panel exists because the revoke endpoint needs an
 * assignment_id that nothing previously surfaced — the console could create a
 * grant and then had no way to name it again. The ids are shown, not hidden
 * behind a row click, for the same reason.
 */
export function AssignmentsPanel({
  assignments,
  roles,
  correlationId,
}: {
  assignments: RoleAssignment[];
  roles: RoleDefinition[];
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<RevokeAssignmentState, FormData>(
    revokeAssignmentAction,
    IDLE_REVOKE_ASSIGNMENT,
  );

  // role_id -> role_code, so a row reads as a role rather than a UUID. A grant
  // whose role is not in the catalogue still renders — it is a real grant, and
  // hiding it would understate what a principal holds.
  const codeFor = new Map(roles.map((r) => [r.role_definition_id, r.role_code]));

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No live assignments in this tenant. Roles defined above grant nothing until one exists —
        assign one to make a role take effect.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Principal</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Scope</th>
              <th className="py-2 pr-4 font-medium">Effective from</th>
              <th className="py-2 pr-4 font-medium">State</th>
              <th className="py-2 font-medium">Revoke</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const live = isAssignmentActive(a);
              return (
                <tr
                  key={a.principal_role_assignment_id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {a.principal_id}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {codeFor.get(a.role_id) ?? (
                      <span className="text-slate-400" title={a.role_id}>
                        {a.role_id.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-400">
                    {a.legal_entity_id ? (
                      <span className="font-mono">{a.legal_entity_id.slice(0, 8)}…</span>
                    ) : (
                      <Badge>tenant-wide</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    {new Date(a.effective_from).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4">
                    {live ? (
                      <Badge tone="success">live</Badge>
                    ) : new Date(a.effective_from) > new Date() ? (
                      <Badge>pending</Badge>
                    ) : (
                      <Badge tone="neutral">ended</Badge>
                    )}
                  </td>
                  <td className="py-2">
                    {live ? (
                      <form action={action} className="inline">
                        <input type="hidden" name="correlation_id" value={correlationId} />
                        <input
                          type="hidden"
                          name="assignment_id"
                          value={a.principal_role_assignment_id}
                        />
                        <Button type="submit" variant="secondary" disabled={pending}>
                          {pending ? "…" : "Revoke"}
                        </Button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={REVOKE_TONE[state.status]} message={state.message} />
      )}
    </div>
  );
}

// ─── Separation of Duties ────────────────────────────────────────────────────

/**
 * Create and review SoD conflict pairs.
 *
 * The register is shown above the form on purpose: a new rule takes effect
 * immediately against principals who already hold both actions, so seeing what
 * exists is the safer first step.
 *
 * Global rules (tenant_id null) are listed alongside the tenant's own and
 * marked, because they deny identically and cannot be edited from here.
 * Omitting them would leave a denial unexplainable from this page.
 */
export function SoDRulesPanel({
  rules,
  correlationId,
}: {
  rules: SoDRule[];
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<CreateSoDRuleState, FormData>(
    createSoDRuleAction,
    IDLE_CREATE_SOD_RULE,
  );

  return (
    <div className="space-y-6">
      {rules.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No conflict rules apply in this tenant. Nothing is currently being denied on
          segregation-of-duties grounds.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Domain</th>
                <th className="py-2 pr-4 font-medium">Conflicting actions</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 font-medium">Applies to</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr
                  key={r.sod_rule_id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="py-2 pr-4 font-mono text-xs">{r.domain_code}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.action_a} <span className="text-slate-400">↔</span> {r.action_b}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {r.active_flag ? (
                      <Badge tone="warning">{r.conflict_type}</Badge>
                    ) : (
                      <Badge tone="neutral">inactive</Badge>
                    )}
                  </td>
                  <td className="py-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.tenant_id ? (
                      "this tenant"
                    ) : (
                      <span title="Platform-wide rule. It binds every tenant and cannot be changed from this console.">
                        <Badge tone="warning">every tenant</Badge>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={action} className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
        <input type="hidden" name="correlation_id" value={correlationId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="domain_code">
              Domain
            </label>
            <input
              className={FIELD}
              id="domain_code"
              name="domain_code"
              placeholder="PAYMENTS"
              list="sod-domains"
              required
            />
            <datalist id="sod-domains">
              {COMMON_DOMAINS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <p className={HINT}>Grouping only — it does not affect evaluation.</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="conflict_type">
              Conflict type
            </label>
            <select className={FIELD} id="conflict_type" name="conflict_type" defaultValue="HARD">
              <option value="HARD">HARD</option>
              <option value="SOFT">SOFT</option>
            </select>
            <p className={HINT}>
              Recorded on the rule. The evaluator denies on any active match today, so this
              documents intent rather than changing the outcome.
            </p>
          </div>
          <div>
            <label className={LABEL} htmlFor="action_a">
              Action A
            </label>
            <input className={FIELD} id="action_a" name="action_a" placeholder="PAYMENT_APPROVE" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="action_b">
              Action B
            </label>
            <input className={FIELD} id="action_b" name="action_b" placeholder="PAYMENT_INITIATE" required />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create conflict rule"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Takes effect immediately. A principal already holding both actions is denied both from
            the next check.
          </p>
        </div>

        {state.status !== "idle" && (
          <ResultBanner tone={SOD_TONE[state.status]} message={state.message}>
            {state.status === "created" && <CopyableId value={state.rule.sod_rule_id} />}
          </ResultBanner>
        )}
      </form>
    </div>
  );
}
