"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  createSourceAuthorityMapAction,
  recordNormalizedFactAction,
  supersedeSourceAuthorityMapAction,
} from "@/app/admin/source-authority/actions";
import {
  IDLE_CREATE_MAP,
  IDLE_RECORD_FACT,
  IDLE_SUPERSEDE_MAP,
  type CreateMapState,
  type RecordFactState,
  type SupersedeMapState,
} from "@/app/admin/source-authority/state";
import { AUTHORITY_CLASSES } from "@/lib/api/source-authority";

/**
 * Tones.
 *
 * `replayed` is neutral rather than green: the service answered 200 because
 * this correlation id had already written the row and nothing changed.
 * Colouring it as a fresh success would tell an operator they had just recorded
 * something that was recorded days ago.
 *
 * `refused` is amber, not red. These refusals are the control working — a rule
 * is immutable, a window cannot be back-dated, a class is outside the
 * vocabulary. Painting them red reads as a system fault and invites a retry,
 * which is precisely the wrong response.
 */
const CREATE_TONE = {
  created: "success",
  replayed: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const SUPERSEDE_TONE = {
  superseded: "success",
  terminal: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const RECORD_TONE = {
  recorded: "success",
  replayed: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Field families are free-text VARCHAR in the service on purpose — a new family
 *  arrives by being recorded, not by redeploying this console. Suggestions drawn
 *  from doc7's own examples, not a closed set. */
const COMMON_FIELD_FAMILIES = [
  "PAYROLL_GROSS_PAY",
  "HR_EMPLOYMENT_STATUS",
  "BILLING_CONTACT_EMAIL",
  "TAX_JURISDICTION",
  "COUNTERPARTY_LEGAL_NAME",
  "BANK_ACCOUNT_IBAN",
] as const;

export function CreatePrecedenceRuleForm({ correlationId }: { correlationId: string }) {
  const [state, action, pending] = useActionState<CreateMapState, FormData>(
    createSourceAuthorityMapAction,
    IDLE_CREATE_MAP,
  );
  const familyListId = useId();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="field_family">
            Field family
          </label>
          <input
            className={FIELD}
            id="field_family"
            name="field_family"
            list={familyListId}
            placeholder="PAYROLL_GROSS_PAY"
            required
          />
          <datalist id={familyListId}>
            {COMMON_FIELD_FAMILIES.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <p className={HINT}>
            The family of fields this ranking covers. Free text — a new family arrives by being
            recorded, and nothing validates it against a registry.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="source_system">
            Source system
          </label>
          <input className={FIELD} id="source_system" name="source_system" placeholder="ADP" required />
          <p className={HINT}>The connected system this rule ranks — the one whose value may win.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="precedence_rank">
            Precedence rank
          </label>
          <input
            className={FIELD}
            id="precedence_rank"
            name="precedence_rank"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            required
          />
          <p className={HINT}>
            Lower wins: rank 1 beats rank 2. Giving two sources the SAME rank is meaningful — if they
            then disagree, the resolution is ambiguous and blocks rather than picking one.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="effective_from">
            Effective from
          </label>
          <input
            className={FIELD}
            id="effective_from"
            name="effective_from"
            type="datetime-local"
            required
          />
          <p className={HINT}>
            Not prefilled: the server renders this form and does not know your timezone, so any
            default it suggested would be wrong by the offset between you and it.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="conflict_route">
            Conflict route
          </label>
          <input
            className={FIELD}
            id="conflict_route"
            name="conflict_route"
            placeholder="route to Data Governance"
            required
          />
          <p className={HINT}>
            Where an ambiguity goes. When two equally-ranked sources disagree the service refuses to
            choose, and this is what it hands the caller instead — without it an ambiguous resolution
            is a dead end.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="allowed_correction_path">
            Allowed correction path <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            className={FIELD}
            id="allowed_correction_path"
            name="allowed_correction_path"
            placeholder="correct in ADP, re-sync nightly"
          />
          <p className={HINT}>
            How a wrong value here is legitimately fixed. §D1 is explicit that this service never
            back-writes to a source — a correction happens in the source system and arrives as a new
            observation.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record precedence rule"}
        </Button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Idempotency key {correlationId.slice(0, 8)}…
        </span>
      </div>

      <ResultBanner
        tone={CREATE_TONE[state.status]}
        message={state.status === "idle" ? undefined : state.message}
      >
        {(state.status === "created" || state.status === "replayed") && (
          <div className="mt-2 text-xs">
            <CopyableId value={state.map.source_authority_map_id} />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}

/**
 * End a rule's window.
 *
 * Deliberately not an "edit" control: the rule's terms are immutable, and the
 * only thing that can change is how long it applies. Presenting this as editing
 * a rank would suggest the register can be rewritten, which is the opposite of
 * what it is for.
 */
export function SupersedeRuleButton({ sourceAuthorityMapId }: { sourceAuthorityMapId: string }) {
  const [state, action, pending] = useActionState<SupersedeMapState, FormData>(
    supersedeSourceAuthorityMapAction,
    IDLE_SUPERSEDE_MAP,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="source_authority_map_id" value={sourceAuthorityMapId} />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        title="Close this rule's window from now. The rule itself is not rewritten, so resolutions already made under it stay explainable."
      >
        {pending ? "Ending…" : "End rule"}
      </Button>
      <ResultBanner
        tone={SUPERSEDE_TONE[state.status]}
        message={state.status === "idle" ? undefined : state.message}
        className="mt-2"
      />
    </form>
  );
}

export function RecordFactForm({ correlationId }: { correlationId: string }) {
  const [state, action, pending] = useActionState<RecordFactState, FormData>(
    recordNormalizedFactAction,
    IDLE_RECORD_FACT,
  );
  const familyListId = useId();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="fact_field_family">
            Field family
          </label>
          <input
            className={FIELD}
            id="fact_field_family"
            name="field_family"
            list={familyListId}
            placeholder="PAYROLL_GROSS_PAY"
            required
          />
          <datalist id={familyListId}>
            {COMMON_FIELD_FAMILIES.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={LABEL} htmlFor="entity_ref">
            Entity reference
          </label>
          <input className={FIELD} id="entity_ref" name="entity_ref" placeholder="emp-1041" required />
          <p className={HINT}>
            Which business entity the value is about. Free text that no registry constrains — which is
            why these facts are tenant-scoped and were not always.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="fact_source_system">
            Source system
          </label>
          <input className={FIELD} id="fact_source_system" name="source_system" placeholder="ADP" required />
          <p className={HINT}>
            A source with no precedence rule can still report. It just takes no part in resolution
            until someone ranks it — and the resolver names it rather than dropping it.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="source_record">
            Source record
          </label>
          <input className={FIELD} id="source_record" name="source_record" placeholder="ADP-PAY-99213" required />
          <p className={HINT}>
            The source system&rsquo;s own identifier for the record this came from — what makes the
            observation traceable back to the system that made it.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="fact_value">
            Fact value
          </label>
          <input className={FIELD} id="fact_value" name="fact_value" placeholder='"ACTIVE" or 120000 or {"amount":120000}' required />
          <p className={HINT}>
            Stored as JSON, never interpreted. A plain word is quoted for you, so
            <span className="font-mono"> ACTIVE </span> is recorded as
            <span className="font-mono"> &quot;ACTIVE&quot;</span>.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="observed_at">
            Observed at
          </label>
          <input className={FIELD} id="observed_at" name="observed_at" type="datetime-local" required />
          <p className={HINT}>When the source reported it.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="effective_at">
            Effective at <span className={OPTIONAL}>(defaults to observed)</span>
          </label>
          <input className={FIELD} id="effective_at" name="effective_at" type="datetime-local" />
          <p className={HINT}>
            When the value started being true, which is not always when it was reported. Resolution
            reads the latest fact per source whose effective_at has passed, so a future date schedules
            the value rather than applying it now.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="authority_class">
            Authority class
          </label>
          <select className={FIELD} id="authority_class" name="authority_class" defaultValue="AUTHORITATIVE">
            {AUTHORITY_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className={HINT}>
            A closed set of three. It was unenforced until this pass, so a misspelling stored the fact
            in a class no consumer knows how to weigh.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="source_version">
            Source version <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="source_version" name="source_version" placeholder="v4" />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="transformation_version">
            Transformation version <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="transformation_version" name="transformation_version" placeholder="norm-2026.02" />
          <p className={HINT}>
            Which normalisation produced this value from the raw source record. §K1 keeps it so a
            value can be re-derived and checked rather than merely trusted.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record observation"}
        </Button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Idempotency key {correlationId.slice(0, 8)}…
        </span>
      </div>

      <ResultBanner
        tone={RECORD_TONE[state.status]}
        message={state.status === "idle" ? undefined : state.message}
      >
        {(state.status === "recorded" || state.status === "replayed") && (
          <div className="mt-2 text-xs">
            <CopyableId value={state.fact.normalized_fact_id} />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
