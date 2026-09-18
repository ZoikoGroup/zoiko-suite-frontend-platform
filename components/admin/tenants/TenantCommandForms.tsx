"use client";

// ORG-02 §4.2 named lifecycle commands, tenant defaults and host bindings.
//
// The lifecycle panel replaces the generic "pick a target state" control for
// everything a named command covers. The difference is not cosmetic: the
// tenant's lifecycle history records the COMMAND, so a suspension applied
// through the generic route is indistinguishable afterwards from the reversal
// of a mistaken activation. An operator choosing "Suspend" is making a
// different statement from one choosing "move to SUSPENDED", and only the first
// survives into the record.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { LabelledId } from "./LabelledId";
import { FIELD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import {
  COMMANDS_BY_STATE,
  TENANT_COMMAND_CONSEQUENCES,
  TENANT_COMMAND_LABELS,
  commandRequiresApproval,
  type TenantHostBinding,
  type TenantLifecycleEvent,
} from "@/lib/api/tenants-org";
import { LOCALES, TIMEZONES } from "@/app/admin/tenants/state";
import {
  bindTenantHostAction,
  changeDefaultLocaleAction,
  executeTenantCommandAction,
} from "@/app/admin/tenants/org-actions";
import {
  IDLE_HOST_BINDING,
  IDLE_TENANT_COMMAND,
  IDLE_TENANT_DEFAULTS,
} from "@/app/admin/tenants/org-state";

/**
 * Tone maps.
 *
 * `version-conflict` is amber rather than red throughout: nothing the operator
 * typed was wrong and nothing is broken — somebody else moved the record. The
 * remedy is to reload and look, which is a mild instruction, not an alarm.
 *
 * `approval-required` is amber for the same reason: the request is well-formed
 * and the operator is permitted; it simply needs a second person.
 */
const COMMAND_TONE = {
  applied: "success",
  illegal: "warning",
  "version-conflict": "warning",
  "approval-required": "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const DEFAULTS_TONE = {
  changed: "success",
  "version-conflict": "warning",
  "not-transactable": "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const HOST_TONE = {
  bound: "success",
  conflict: "warning",
  "not-transactable": "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

/**
 * Plain-English lifecycle-state descriptions.
 *
 * An operator reading "OFFBOARDING" cannot tell whether writes still work. The
 * whole point of surfacing lifecycle state is to answer that, so the answer is
 * spelled out rather than left to be inferred from the enum name.
 */
const STATE_MEANING: Record<string, string> = {
  ONBOARDING: "Being set up. Writes work — that is what this state is for.",
  ACTIVE: "In service. Everything works normally.",
  SUSPENDED: "Writes refuse across the platform. Reads still work, so you can investigate. Reversible.",
  OFFBOARDING: "Termination has begun. Writes have stopped and will not resume.",
  TERMINATED: "Finished. Cannot be reactivated. Governed records are retained, not deleted.",
};

// ── Named lifecycle commands ────────────────────────────────────────────────

export function TenantCommandPanel({
  tenantId,
  lifecycleState,
  recordVersion,
}: {
  tenantId: string;
  lifecycleState: string;
  /** Posted back as expected_version, so a change made while this page was open is refused rather than overwritten. */
  recordVersion: number;
}) {
  const [state, action, pending] = useActionState(executeTenantCommandAction, IDLE_TENANT_COMMAND);
  const available = COMMANDS_BY_STATE[lifecycleState] ?? [];
  const [command, setCommand] = useState<string>(available[0] ?? "");

  const needsApproval = commandRequiresApproval(command);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="expected_version" value={recordVersion} />

      <div className={PANEL}>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-medium">{lifecycleState}</span> — {STATE_MEANING[lifecycleState] ?? "Unrecognised lifecycle state."}
        </p>
        <p className={HINT}>Record version {recordVersion}</p>
      </div>

      {available.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          There is nothing further to do from {lifecycleState} — it is the end of the lifecycle.
        </p>
      ) : (
        <>
          <div>
            <label className={LABEL} htmlFor="command">
              Command
            </label>
            <select
              id="command"
              name="command"
              className={FIELD}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            >
              {available.map((c) => (
                <option key={c} value={c}>
                  {TENANT_COMMAND_LABELS[c] ?? c} ({c})
                </option>
              ))}
            </select>
            {command ? <p className={HINT}>{TENANT_COMMAND_CONSEQUENCES[command]}</p> : null}
          </div>

          <div>
            <label className={LABEL} htmlFor="reason">
              Reason
            </label>
            <input
              id="reason"
              name="reason"
              required
              className={FIELD}
              placeholder="Sanctions screening hit — case 4412"
            />
            <p className={HINT}>
              Written to the lifecycle history. This is what somebody reads months from now asking why
              this happened.
            </p>
          </div>

          {needsApproval ? (
            <div>
              <label className={LABEL} htmlFor="approved_by_principal_id">
                Approving principal
              </label>
              <input
                id="approved_by_principal_id"
                name="approved_by_principal_id"
                required
                className={FIELD}
                placeholder="principal id of the second approver"
              />
              <p className={HINT}>
                Termination needs a second person. It cannot be you — the database refuses a
                self-approval independently of this console.
              </p>
            </div>
          ) : null}

          <Button type="submit" disabled={pending || !command}>
            {pending ? "Applying…" : `${TENANT_COMMAND_LABELS[command] ?? command}`}
          </Button>
        </>
      )}

      <ResultBanner tone={COMMAND_TONE[state.status]} message={state.message}>
        {state.result ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Moved from" value={state.result.from_state} />
            <LabelledId label="Now" value={state.result.to_state} />
            <LabelledId label="Record version" value={String(state.result.record_version)} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Lifecycle history ───────────────────────────────────────────────────────

/**
 * The tenant's recorded lifecycle evidence.
 *
 * Shows the command, not just the state pair, because that is the fact the
 * history exists to preserve — and shows the approver where there is one, since
 * a maker-checker control nobody can see the result of is not much of a control.
 */
export function TenantLifecycleHistory({ events }: { events: TenantLifecycleEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No lifecycle changes recorded. A tenant provisioned before lifecycle history existed will show
        nothing here until its next command.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li
          key={e.lifecycle_event_id}
          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {TENANT_COMMAND_LABELS[e.command_name] ?? e.command_name}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(e.occurred_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {e.from_state && e.from_state !== e.to_state
              ? `${e.from_state} → ${e.to_state}`
              : `Stayed ${e.to_state}`}
            {" — "}
            {e.reason}
          </p>
          <div className="mt-2 space-y-1">
            <LabelledId label="Actor" value={e.actor_principal_id} />
            {e.approved_by_principal_id ? (
              <LabelledId label="Approved by" value={e.approved_by_principal_id} />
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Tenant defaults ─────────────────────────────────────────────────────────

export function ChangeDefaultsForm({
  tenantId,
  currentLocale,
  currentTimezone,
  recordVersion,
}: {
  tenantId: string;
  currentLocale: string;
  currentTimezone: string;
  recordVersion: number;
}) {
  const [state, action, pending] = useActionState(changeDefaultLocaleAction, IDLE_TENANT_DEFAULTS);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="expected_version" value={recordVersion} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="primary_locale">
            Locale
          </label>
          <select id="primary_locale" name="primary_locale" className={FIELD} defaultValue={currentLocale}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="primary_timezone">
            Timezone
          </label>
          <select id="primary_timezone" name="primary_timezone" className={FIELD} defaultValue={currentTimezone}>
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="defaults_reason">
          Reason
        </label>
        <input
          id="defaults_reason"
          name="reason"
          required
          className={FIELD}
          placeholder="Customer head office relocated"
        />
        <p className={HINT}>
          Recorded in the lifecycle history as ChangeDefaultLocale. The tenant&rsquo;s lifecycle state is
          not affected.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change defaults"}
      </Button>

      <ResultBanner tone={DEFAULTS_TONE[state.status]} message={state.message} />
    </form>
  );
}

// ── Host bindings ───────────────────────────────────────────────────────────

/**
 * Bind a hostname to this tenant.
 *
 * Worth stating in the UI why this matters: a bound hostname is what makes the
 * host/tenant mismatch check able to fire. A request arriving on a bound host
 * that claims a different tenant is refused before any data is read — but only
 * for hosts that are bound, because an unbound hostname makes no claim to
 * contradict.
 */
export function BindHostForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(bindTenantHostAction, IDLE_HOST_BINDING);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div>
        <label className={LABEL} htmlFor="hostname">
          Hostname
        </label>
        <input
          id="hostname"
          name="hostname"
          required
          className={FIELD}
          placeholder="acme.zoiko.example"
        />
        <p className={HINT}>
          Stored lowercase. One hostname can only ever point at one tenant — that is what lets the
          registry refuse a request whose host and claimed tenant disagree.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" name="is_primary" className="rounded border-slate-300" />
        Primary hostname <span className={OPTIONAL}>— at most one per tenant</span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Binding…" : "Bind hostname"}
      </Button>

      <ResultBanner tone={HOST_TONE[state.status]} message={state.message} />
    </form>
  );
}

export function HostBindingTable({ bindings }: { bindings: TenantHostBinding[] }) {
  if (bindings.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No hostnames bound. Without a binding, a request&rsquo;s host and its claimed tenant cannot be
        checked against each other — there is nothing to compare.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {bindings.map((b) => (
        <li
          key={b.host_binding_id}
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
        >
          <span className="font-mono text-sm text-slate-900 dark:text-slate-100">{b.hostname}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {b.is_primary ? "primary" : "additional"}
            {b.active_flag ? "" : " · inactive"}
          </span>
        </li>
      ))}
    </ul>
  );
}
