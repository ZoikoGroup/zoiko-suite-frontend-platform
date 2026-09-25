"use client";

import { useActionState } from "react";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { setBundleEnforcementAction } from "@/app/admin/access-control/actions";
import {
  IDLE_BUNDLE_ENFORCEMENT,
  type BundleEnforcementState,
} from "@/app/admin/access-control/state";
import type { PermissionBundle } from "@/lib/api/authorization";

/**
 * Withdraw one of a role's permission sets, or put it back.
 *
 * The control the service had no route for. `active_flag` has been on this
 * table since the initial schema and BOTH evaluation reads join through it, so
 * a switched-off set genuinely stops granting — to direct holders and to
 * anyone lent the role — from the next decision. Nothing could set it.
 *
 * Offered next to the set's own actions rather than beside the role, because
 * the distinction from "Stop enforcing it" on the role is the whole point and
 * is easy to miss: retiring the ROLE takes everything away, this takes one set
 * away. The hint below states which, since the two buttons otherwise read the
 * same.
 *
 * Reversible, and said so, for the reason RoleEnforcementButton says it: the
 * set keeps its contents, so restoring grants back exactly what was withdrawn.
 * That is what makes this a button rather than a confirmation dialog.
 */
export function BundleEnforcementButton({ bundle }: { bundle: PermissionBundle }) {
  const [state, action, pending] = useActionState<BundleEnforcementState, FormData>(
    setBundleEnforcementAction,
    IDLE_BUNDLE_ENFORCEMENT,
  );

  const count = bundle.permitted_actions.length;

  return (
    <div className="min-w-0 space-y-2 sm:max-w-xs">
      <form action={action}>
        <input type="hidden" name="permission_bundle_id" value={bundle.permission_bundle_id} />
        <input type="hidden" name="active" value={bundle.active_flag ? "false" : "true"} />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {!pending &&
            (bundle.active_flag ? (
              <PowerOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ))}
          {pending
            ? "Saving…"
            : bundle.active_flag
              ? "Stop granting these"
              : "Grant these again"}
        </Button>
      </form>

      {bundle.active_flag && state.status === "idle" && (
        <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          Takes {count === 1 ? "this action" : `these ${count} actions`} away from everybody
          holding the role, and from anybody lent it. The role&apos;s other sets keep working.
          Reversible.
        </p>
      )}

      {state.status !== "idle" && (
        <p
          className={cn(
            "text-xs leading-relaxed",
            state.status === "withdrawn" || state.status === "restored"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-rose-700 dark:text-rose-400",
          )}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
