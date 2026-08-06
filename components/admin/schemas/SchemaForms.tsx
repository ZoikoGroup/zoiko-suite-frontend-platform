"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import { COMPATIBILITY_MODES } from "@/lib/api/schemas";
import { registerSchemaAction } from "@/app/admin/schemas/actions";
import { IDLE_REGISTER_SCHEMA } from "@/app/admin/schemas/state";

/**
 * Tones.
 *
 * `incompatible` is amber, not red: the checker refusing a breaking change is
 * the governance control working exactly as intended, and the reader has a
 * clear next step. `raced` is neutral — nothing was wrong with the submission
 * and nothing is broken. `unauthenticated` is amber (a wiring fault, not a
 * permissions one) while `unauthorized` is red.
 */
const TONE = {
  registered: "success",
  incompatible: "warning",
  raced: "neutral",
  unauthenticated: "warning",
  unauthorized: "error",
  unavailable: "warning",
  error: "error",
  idle: "neutral",
} as const;

const EXAMPLE = `{
  "type": "object",
  "properties": {
    "tenant_id": { "type": "string" },
    "occurred_at": { "type": "string" }
  },
  "required": ["tenant_id"]
}`;

export function RegisterSchemaForm({ eventNames }: { eventNames: string[] }) {
  const [state, action, pending] = useActionState(registerSchemaAction, IDLE_REGISTER_SCHEMA);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="event_name">
            Event name
          </label>
          <input
            id="event_name"
            name="event_name"
            required
            list="known-events"
            className={`${FIELD} font-mono text-xs`}
            placeholder="entity.status.changed"
            autoComplete="off"
          />
          {/* Existing names are offered as suggestions rather than a closed
              select: registering the FIRST version of a new event is the
              normal case, and a select would make it impossible. */}
          <datalist id="known-events">
            {eventNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            An existing name registers the next version. A new name starts at v1.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="compatibility_mode">
            Compatibility mode
          </label>
          <select id="compatibility_mode" name="compatibility_mode" className={FIELD} defaultValue="BACKWARD">
            {COMPATIBILITY_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            BACKWARD refuses anything that would break existing consumers. NONE skips the check — for a
            controlled rollout, and recorded on the version so the exemption is visible.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="owning_service">
            Owning service <span className={OPTIONAL}>optional</span>
          </label>
          <input
            id="owning_service"
            name="owning_service"
            className={FIELD}
            placeholder="identity-context-svc"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Who produces this event. The first question asked when a contract breaks.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="json_schema">
            JSON Schema
          </label>
          <textarea
            id="json_schema"
            name="json_schema"
            required
            rows={12}
            className={`${FIELD} font-mono text-xs`}
            defaultValue={EXAMPLE}
            spellCheck={false}
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            The payload shape only — the shared envelope fields (event_type, emitted_at, schema_version,
            source_service) are common to every publisher and are not registered here.
          </p>
        </div>
      </div>

      <div className={PANEL}>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Compatibility is checked at the <strong>top level only</strong> — the checker reads{" "}
          <code className="font-mono">properties</code> and <code className="font-mono">required</code> and
          does not descend into nested objects or arrays. A breaking change buried inside a nested object
          will be accepted. That is a documented limit of the service, not something this page can work
          around.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Registering…" : "Register version"}
      </Button>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.violations && state.violations.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {state.violations.map((v) => (
              <li key={v} className="flex gap-2 text-xs">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
                <span className="font-mono">{v}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {state.schema ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Registered</span>
            <CopyableId value={`${state.schema.event_name} v${state.schema.version}`} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}
