"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import { COMPATIBILITY_MODES } from "@/lib/api/schemas";
import { registerSchemaAction } from "@/app/admin/schemas/actions";
import { IDLE_REGISTER_SCHEMA } from "@/app/admin/schemas/state";
import { ContractSummary, ViolationList } from "./SchemaSummary";

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

/**
 * The two modes as a choice rather than a code.
 *
 * The stored code stays in the option text. This control decides which
 * discipline is recorded on the version forever, and the reader who picks it is
 * the one most likely to be asked later which one they chose.
 */
const MODE_CHOICE: Record<string, string> = {
  BACKWARD: "Check it against the current version",
  NONE: "Register it without a check",
};

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
            A name already in the register adds the next version to it. A new name starts at version 1.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="compatibility_mode">
            How this version should be checked
          </label>
          <select id="compatibility_mode" name="compatibility_mode" className={FIELD} defaultValue="BACKWARD">
            {COMPATIBILITY_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_CHOICE[m] ?? m} ({m})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Checking refuses anything that would break whoever already reads this event. Skipping the
            check is for a change planned with those readers in advance — it is recorded on the version,
            so the exemption stays visible afterwards.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="owning_service">
            Who publishes this event <span className={OPTIONAL}>optional</span>
          </label>
          <input
            id="owning_service"
            name="owning_service"
            className={FIELD}
            placeholder="identity-context-svc"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            The service that emits it. The first thing anyone asks when a contract breaks.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="json_schema">
            What the payload must contain, as JSON Schema
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
          The check looks at the <strong>outermost fields only</strong> — their names, the kind of value
          each carries, and which of them have to be present. It does not look inside a field that holds a
          group or a list, so a breaking change made in there is accepted. That is a documented limit of
          the registry, not something this page can work around.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Registering…" : "Register version"}
      </Button>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {/* The checker's violations, each as the thing to fix rather than the
            string it was reported as. */}
        {state.violations && state.violations.length > 0 ? (
          <ViolationList violations={state.violations} />
        ) : null}
        {/* What was registered, read back as a contract. This used to be a
            copyable "name vN" and nothing else, which confirmed the write and
            said nothing about what had just been committed to. */}
        {state.schema ? (
          <div className="mt-3 rounded-lg bg-white/60 p-3 dark:bg-slate-900/40">
            <ContractSummary schema={state.schema} variant="compact" />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}
