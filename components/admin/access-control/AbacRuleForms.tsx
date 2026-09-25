"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Info, ShieldPlus, Power, PowerOff } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import {
  createAbacRuleAction,
  setAbacRuleEnforcementAction,
} from "@/app/admin/access-control/actions";
import {
  IDLE_ABAC_ENFORCEMENT,
  IDLE_CREATE_ABAC_RULE,
  type AbacRuleEnforcementState,
  type CreateAbacRuleState,
} from "@/app/admin/access-control/state";
import {
  ABAC_OPERATORS,
  describeABACRule,
  type ABACRule,
} from "@/lib/api/authorization";

/**
 * Declare an attribute condition.
 *
 * The service shipped an entire ABAC engine — eleven comparisons, two effects,
 * a table that deliberately ships empty — with no console at all. Which means
 * the layer that can silently refuse an action for every principal on the
 * platform was authorable only by hand-crafted HTTP.
 *
 * Two properties are stated on the form rather than left to be discovered:
 *
 *  - It can only ever take access away. A condition cannot grant anything, so
 *    adding one is never how you fix "this person cannot do X".
 *  - A REQUIRE condition on an attribute nothing sends refuses its action for
 *    everybody, immediately. That is deliberate on the service's part — it
 *    stops a caller evading a condition by omitting a field — and it is the
 *    single easiest way to take a production action offline from this page.
 */
export function DeclareAbacRuleForm() {
  const [state, action, pending] = useActionState<CreateAbacRuleState, FormData>(
    createAbacRuleAction,
    IDLE_CREATE_ABAC_RULE,
  );
  const [operator, setOperator] = useState<string>("eq");

  const chosen = ABAC_OPERATORS.find((o) => o.raw === operator);
  const takesValue = chosen?.takesValue ?? true;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rule_code" className={LABEL}>
              Give the condition a code
            </label>
            <input
              id="rule_code"
              name="rule_code"
              required
              placeholder="LARGE_PAYMENT_NEEDS_DUAL"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              This is what a refusal names when this condition causes one. Without it, a denial
              could not be traced back to the rule that produced it.
            </p>
          </div>

          <div>
            <label htmlFor="abac_action_type" className={LABEL}>
              Which action does it guard?
            </label>
            <input
              id="abac_action_type"
              name="abac_action_type"
              required
              placeholder="PAYMENT_APPROVE"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              Only this action is affected. The condition is checked after the person has already
              been granted it — it is the last layer, and it can only refuse.
            </p>
          </div>

          <div>
            <label htmlFor="effect" className={LABEL}>
              Require or forbid?
            </label>
            <select id="effect" name="effect" required defaultValue="FORBID" className={FIELD}>
              <option value="FORBID">Forbid the action when this is true</option>
              <option value="REQUIRE">Require this to be true, or refuse</option>
            </select>
            <p className={HINT}>
              The difference bites on a missing attribute: a request that does not mention it at
              all is <strong>refused</strong> by a require, and <strong>allowed</strong> by a
              forbid.
            </p>
          </div>

          <div>
            <label htmlFor="attribute_key" className={LABEL}>
              Which attribute does it look at?
            </label>
            <input
              id="attribute_key"
              name="attribute_key"
              required
              placeholder="amount"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              Has to be a name the calling service actually sends with its check. If it does not
              send it, a require condition refuses the action for everyone.
            </p>
          </div>

          <div>
            <label htmlFor="operator" className={LABEL}>
              The comparison
            </label>
            <select
              id="operator"
              name="operator"
              required
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className={FIELD}
            >
              {ABAC_OPERATORS.map((o) => (
                <option key={o.raw} value={o.raw}>
                  {o.label} ({o.raw})
                </option>
              ))}
            </select>
            <p className={HINT}>
              Only these eleven. The service refuses any other at this point rather than at
              decision time — a comparison it cannot carry out would refuse the action for
              everybody.
            </p>
          </div>

          <div>
            <label htmlFor="attribute_value" className={LABEL}>
              Compared against{" "}
              {!takesValue && <span className={OPTIONAL}>(not used by this comparison)</span>}
            </label>
            <input
              id="attribute_value"
              name="attribute_value"
              key={operator}
              disabled={!takesValue}
              required={takesValue}
              placeholder={takesValue ? "10000" : ""}
              className={`${FIELD} font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50`}
              autoComplete="off"
            />
            <p className={HINT}>
              {takesValue
                ? "The value the attribute is compared to. For “is one of” and “is none of”, separate the options with commas."
                : "This comparison only asks whether the attribute is there at all, so there is nothing to compare against."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} size="sm">
            {!pending && <ShieldPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {pending ? "Declaring…" : "Declare condition"}
          </Button>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            In force the moment it saves. It can only remove access, never grant it.
          </p>
        </div>
      </form>

      <AbacFeedback state={state} />
    </div>
  );
}

function AbacFeedback({ state }: { state: CreateAbacRuleState }) {
  if (state.status === "idle") return null;

  if (state.status === "created") {
    return (
      <div
        className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm animate-fade-up dark:border-emerald-500/30 dark:bg-emerald-500/10"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p className="leading-relaxed text-emerald-800 dark:text-emerald-300">{state.message}</p>
      </div>
    );
  }

  const isUnauthorized = state.status === "unauthorized";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        isUnauthorized
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
      )}
      role="status"
      aria-live="polite"
    >
      {isUnauthorized ? (
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <p className="leading-relaxed">{state.message}</p>
    </div>
  );
}

/**
 * Retire or reactivate one condition.
 *
 * A platform-wide condition (one belonging to no organisation) cannot be
 * changed from a tenant's console — the service gates that behind a separate
 * grant. The button is not offered for those rather than offered and refused:
 * a control that reliably fails teaches an operator to ignore refusals.
 */
export function AbacRuleEnforcementButton({ rule }: { rule: ABACRule }) {
  const [state, action, pending] = useActionState<AbacRuleEnforcementState, FormData>(
    setAbacRuleEnforcementAction,
    IDLE_ABAC_ENFORCEMENT,
  );

  if (!rule.tenant_id) {
    return (
      <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        Applies to every organisation — only whoever administers the platform can change it.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="abac_rule_id" value={rule.abac_rule_id} />
        <input type="hidden" name="active" value={rule.active_flag ? "false" : "true"} />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {!pending &&
            (rule.active_flag ? (
              <PowerOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ))}
          {pending
            ? "Saving…"
            : rule.active_flag
              ? "Stop applying it"
              : "Start applying it again"}
        </Button>
      </form>

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

/**
 * The conditions in force, each as a sentence.
 *
 * Rendered as records rather than table rows because the five columns a
 * condition has — action, effect, attribute, operator, value — mean nothing
 * apart and one thing together, and that one thing is a sentence. A table
 * showed `PAYMENT_APPROVE / REQUIRE / amount / lte / 10000` and left the
 * reader to assemble the meaning, which is exactly the assembly the person
 * reading this cannot be expected to do.
 */
export function AbacRulesList({ rules }: { rules: ABACRule[] }) {
  return (
    <ul className="space-y-3">
      {rules.map((rule) => (
        <li
          key={rule.abac_rule_id}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium text-slate-800 dark:text-slate-200">
                {rule.rule_code}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Guards {rule.action_type}
                {rule.tenant_id ? "" : " · every organisation on the platform"}
              </p>
            </div>
            <Badge tone={rule.active_flag ? "danger" : "neutral"} dot={rule.active_flag}>
              {rule.active_flag ? "Being applied" : "Not applied"}
            </Badge>
          </div>

          <div className="space-y-3 px-4 py-3.5">
            {/* The whole condition, as one sentence. */}
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {describeABACRule(rule)}
            </p>

            {!rule.active_flag && (
              <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                It is not being applied, so it refuses nothing at the moment. It is kept because
                it is the reason an action was refused in the past.
              </p>
            )}

            {/* The stored values, for anyone quoting the rule. */}
            <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
              {rule.effect} · {rule.attribute_key} · {rule.operator}
              {rule.attribute_value ? ` · ${rule.attribute_value}` : ""}
            </p>

            <AbacRuleEnforcementButton rule={rule} />
          </div>
        </li>
      ))}
    </ul>
  );
}
