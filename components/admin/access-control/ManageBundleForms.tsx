"use client";

import { useActionState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL } from "@/components/admin/shared/form";
import {
  detachBundleAction,
  updateBundleAction,
} from "@/app/admin/access-control/actions";
import {
  IDLE_DETACH_BUNDLE,
  IDLE_UPDATE_BUNDLE,
  type DetachBundleState,
  type UpdateBundleState,
} from "@/app/admin/access-control/state";
import type { PermissionBundleDef, RoleDefinition } from "@/lib/api/access-control";

/**
 * Tones.
 *
 * `notEnforced` is RED for the same reason UpdateRoleState's is: a failed edit
 * or detach leaves the bundle STILL active and STILL granting its current
 * actions, which is a live governance state rather than a transient error.
 *
 * `refused` is amber — a 403 here is the control working.
 */
const UPDATE_BUNDLE_TONE = {
  updated: "success",
  notEnforced: "error",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const DETACH_TONE = {
  detached: "success",
  notEnforced: "error",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Suggestions, not a closed set — same ground as the attach form. */
const COMMON_ACTIONS = [
  "PO_ISSUE",
  "PO_AMEND",
  "PO_CLOSE",
  "PAYMENT_APPROVE",
  "INVOICE_APPROVE",
  "CONTRACT_SIGN",
  "RESOLUTION_PASS",
  "ROLE_MANAGE",
  "DELEGATION_CREATE",
] as const;

/**
 * Edit and detach the bundles that already exist.
 *
 * Bundle manage forms are grouped under their role so an operator edits in the
 * context of the catalogue row they are thinking about. Both writes live in
 * access-control-svc and both fail closed: an edit that cannot reach
 * authorization-svc is refused, and a detach that cannot retire the bundle
 * there is refused — so a row shown as saved here always means the platform
 * is enforcing that state.
 *
 * A role with no bundles renders nothing, and so does this whole component
 * when the tenant has not attached a single bundle yet.
 */
export function ManageBundleForms({
  roles,
  bundles,
  legalEntityId,
}: {
  roles: RoleDefinition[];
  bundles: PermissionBundleDef[];
  legalEntityId: string;
}) {
  const rolesWithBundles = roles.filter((role) =>
    bundles.some((b) => b.role_definition_id === role.role_definition_id),
  );

  if (rolesWithBundles.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nothing to manage yet — attach a permission bundle above, then edit or
        detach it here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rolesWithBundles.map((role) => (
        <div key={role.role_definition_id} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {role.role_code}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{role.role_name}</span>
          </div>
          {bundles
            .filter((b) => b.role_definition_id === role.role_definition_id)
            .map((bundle) => (
              <div
                key={bundle.bundle_id}
                className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                    {bundle.bundle_code}
                  </span>
                  {bundle.active_flag ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" />
                      enforced
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      <ShieldOff className="h-3 w-3" />
                      withdrawn
                    </span>
                  )}
                  <CopyableId value={bundle.bundle_id} />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <UpdateBundleForm bundle={bundle} legalEntityId={legalEntityId} />
                  {bundle.active_flag ? (
                    <DetachBundleForm bundle={bundle} legalEntityId={legalEntityId} />
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      Already detached — this bundle grants nothing to this role&rsquo;s
                      principals. It keeps its contents, so the actions can be made live
                      again by choosing the same bundle code in the attach form above.
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Edit one bundle's permitted actions.
 *
 * The bundle code is not editable here, by design — authorization-svc has no
 * rename for a bundle, so renaming in this console would be a local label on
 * an unchanged grant. Detaching and re-attaching under a new code is the
 * supported rename.
 */
function UpdateBundleForm({
  bundle,
  legalEntityId,
}: {
  bundle: PermissionBundleDef;
  legalEntityId: string;
}) {
  const [state, action, pending] = useActionState<UpdateBundleState, FormData>(
    updateBundleAction,
    IDLE_UPDATE_BUNDLE,
  );

  const inputId = `bundle-actions-${bundle.bundle_id}`;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="role_definition_id" value={bundle.role_definition_id} />
      <input type="hidden" name="bundle_id" value={bundle.bundle_id} />
      <input type="hidden" name="legal_entity_id" value={legalEntityId} />

      <div>
        <label className={LABEL} htmlFor={inputId}>
          Permitted actions
        </label>
        <textarea
          className={FIELD}
          id={inputId}
          name="permitted_actions"
          rows={3}
          defaultValue={bundle.permitted_actions.join(", ")}
          required
        />
        <p className={HINT}>
          Comma- or newline-separated; upper-cased for you and blanks dropped. These must match
          the action codes the enforcing services check — the platform authorizes actions
          including <span className="font-mono">{COMMON_ACTIONS.join(", ")}</span>. Saving
          re-provisions the whole set into authorization-svc, so the change is enforced
          immediately.
        </p>
      </div>

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Saving…" : "Save actions"}
      </Button>

      {state.status !== "idle" && (
        <ResultBanner tone={UPDATE_BUNDLE_TONE[state.status]} message={state.message}>
          {state.status === "updated" && <CopyableId value={state.bundle.bundle_id} />}
        </ResultBanner>
      )}
    </form>
  );
}

/**
 * Detach one bundle from its role.
 *
 * A withdrawal, not a deletion: the bundle keeps its contents and the same
 * code can be re-attached later to restore exactly these actions. The
 * confirmation is a required checkbox rather than a two-step prompt, so a
 * dismissed dialog can never be mistaken for consent.
 */
function DetachBundleForm({
  bundle,
  legalEntityId,
}: {
  bundle: PermissionBundleDef;
  legalEntityId: string;
}) {
  const [state, action, pending] = useActionState<DetachBundleState, FormData>(
    detachBundleAction,
    IDLE_DETACH_BUNDLE,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="role_definition_id" value={bundle.role_definition_id} />
      <input type="hidden" name="bundle_id" value={bundle.bundle_id} />
      <input type="hidden" name="legal_entity_id" value={legalEntityId} />

      <div className="space-y-3 rounded-md border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
        <p className="text-xs leading-relaxed text-rose-800 dark:text-rose-300">
          <strong>Detach this bundle.</strong> This withdraws {bundle.permitted_actions.length}
          action{bundle.permitted_actions.length === 1 ? "" : "s"} from everyone who holds this
          role and everyone lent it, and retires the set in authorization-svc in the same
          request — it fails closed rather than detaching a row it could not enforce. The
          bundle&rsquo;s contents are kept.
        </p>
        <label className="flex items-start gap-2 text-xs text-rose-800 dark:text-rose-300">
          <input
            type="checkbox"
            name="confirm_detach"
            required
            className="mt-0.5 h-3.5 w-3.5 accent-rose-600"
          />
          I understand this removes the bundle&rsquo;s actions from this role&apos;s principals.
        </label>
      </div>

      <Button
        type="submit"
        disabled={pending}
        variant="secondary"
        className="border-rose-300 text-rose-700 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-500/40 dark:text-rose-300 dark:hover:border-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-200"
      >
        {pending ? "Detaching…" : "Detach bundle"}
      </Button>

      {state.status !== "idle" && (
        <ResultBanner tone={DETACH_TONE[state.status]} message={state.message}>
          {state.status === "detached" && <CopyableId value={state.bundle.bundle_id} />}
        </ResultBanner>
      )}
    </form>
  );
}