"use client";

import { useActionState } from "react";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { setRoleEnforcementAction } from "@/app/admin/access-control/actions";
import {
  IDLE_ROLE_ENFORCEMENT,
  type RoleEnforcementState,
} from "@/app/admin/access-control/state";
import type { Role } from "@/lib/api/authorization";

/**
 * Stop a role granting anything, or start it again.
 *
 * The only control that suspends a role's access without revoking every grant
 * of it one at a time — and the service could do it long before anything could
 * ask it to. Retiring leaves the grants in place, so reactivating restores
 * exactly the access that was suspended; that is what makes this reversible and
 * why it is offered as a button rather than buried behind a confirmation.
 *
 * The consequence is stated on the button's own feedback rather than in a
 * tooltip, because it is large: retiring a role takes its actions away from
 * everybody holding it, at once.
 */
export function RoleEnforcementButton({ role }: { role: Role }) {
  const [state, action, pending] = useActionState<RoleEnforcementState, FormData>(
    setRoleEnforcementAction,
    IDLE_ROLE_ENFORCEMENT,
  );

  return (
    <div className="min-w-0 space-y-2 sm:max-w-xs">
      <form action={action}>
        <input type="hidden" name="role_id" value={role.role_id} />
        <input type="hidden" name="active" value={role.active_flag ? "false" : "true"} />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {!pending &&
            (role.active_flag ? (
              <PowerOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ))}
          {pending ? "Saving…" : role.active_flag ? "Stop enforcing it" : "Enforce it again"}
        </Button>
      </form>

      {role.active_flag && state.status === "idle" && (
        <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          Takes its actions away from everybody holding it, at once. Reversible — the grants stay.
        </p>
      )}

      {state.status !== "idle" && (
        <p
          className={cn(
            "text-xs leading-relaxed",
            state.status === "retired" || state.status === "reactivated"
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
