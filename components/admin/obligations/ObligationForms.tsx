"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner, CopyableId } from "@/components/admin/shared";
import { FIELD, LABEL, PANEL } from "@/components/admin/shared/form";
import {
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  SEVERITY_LEVELS,
  SOURCE_TYPES,
  RESPONSIBLE_FUNCTIONS,
  LEGAL_TRANSITIONS,
} from "@/lib/api/obligations";
import {
  submitObligation,
  submitTransition,
  submitFilingRequirement,
} from "@/app/admin/obligations/actions";
import {
  IDLE_RAISE_OBLIGATION,
  IDLE_TRANSITION,
  IDLE_FILING_WRITE,
  FILING_TYPES,
  SUBMISSION_CHANNELS,
  type RaiseObligationState,
  type TransitionState,
  type FilingWriteState,
} from "@/app/admin/obligations/state";

/**
 * Raise-form tones.
 *
 * `existing` is neutral, not green. A 200 from this service means the code was
 * already taken and the stored record came back untouched — the reader recorded
 * nothing, and anything they typed outside the four dedup fields was discarded.
 * Green would tell them the opposite of what happened.
 *
 * `unvalidated` is amber rather than red: the fail-closed jurisdiction refusal is
 * the service working correctly during an outage, and nothing the reader entered
 * was wrong.
 */
const RAISE_TONE = {
  raised: "success",
  existing: "neutral",
  conflict: "warning",
  unvalidated: "warning",
  error: "error",
  idle: "neutral",
} as const;

/** `unchanged` is the idempotent no-op — accepted, but nothing moved. */
const TRANSITION_TONE = {
  transitioned: "success",
  unchanged: "neutral",
  illegal: "warning",
  error: "error",
  idle: "neutral",
} as const;

const FILING_TONE = {
  created: "success",
  "no-obligation": "warning",
  error: "error",
  idle: "neutral",
} as const;

/** Today in YYYY-MM-DD, for the date input's floor. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RaiseObligationForm({
  jurisdictionField,
}: {
  /** Rendered on the server so the picker can read jurisdiction-rules-svc. */
  jurisdictionField: ReactNode;
}) {
  const [state, action, pending] = useActionState<RaiseObligationState, FormData>(
    submitObligation,
    IDLE_RAISE_OBLIGATION,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="obligation_code" className={LABEL}>
            Obligation code
          </label>
          <input
            id="obligation_code"
            name="obligation_code"
            required
            placeholder="VAT-RETURN-2026-Q3"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            The dedup key, and it is <strong className="font-medium">global</strong> — not scoped to
            your entity or tenant. Reusing a code returns the existing record instead of writing.
          </p>
        </div>

        <div>
          <label htmlFor="obligation_type" className={LABEL}>
            Obligation type
          </label>
          <select
            id="obligation_type"
            name="obligation_type"
            defaultValue="FILING"
            className={FIELD}
          >
            {OBLIGATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        {jurisdictionField}

        <div>
          <label htmlFor="obligation_due" className={LABEL}>
            Due date
          </label>
          <input
            id="obligation_due"
            name="due_date"
            type="date"
            required
            defaultValue={today()}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="obligation_severity" className={LABEL}>
            Severity
          </label>
          <select
            id="obligation_severity"
            name="severity_level"
            defaultValue="MEDIUM"
            className={FIELD}
          >
            {SEVERITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="obligation_function" className={LABEL}>
            Responsible function
          </label>
          <select
            id="obligation_function"
            name="responsible_function"
            defaultValue="Finance"
            className={FIELD}
          >
            {RESPONSIBLE_FUNCTIONS.map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="obligation_source_type" className={LABEL}>
            Source type
          </label>
          <select
            id="obligation_source_type"
            name="obligation_source_type"
            defaultValue="FILING_RULE"
            className={FIELD}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="obligation_source_id" className={LABEL}>
            Source ID
          </label>
          <input
            id="obligation_source_id"
            name="obligation_source_id"
            required
            placeholder="rule-gb-vat-07"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Not a foreign key — the record it names may live in another service entirely.
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="obligation_source_reference" className={LABEL}>
            Source reference
          </label>
          <input
            id="obligation_source_reference"
            name="source_reference"
            required
            placeholder="GB VAT filing rule 7 / Contract #4821 clause 12.3"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            The human-readable trace back to whatever created this duty. Mandatory in the service,
            not just in this form — an obligation nobody can trace to a source cannot be defended.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Raising…" : "Raise obligation"}
        </Button>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Recorded against your session legal entity and principal.
        </p>
      </div>

      <ResultBanner tone={RAISE_TONE[state.status]} message={state.message}>
        {state.obligation && (
          <div className="space-y-2">
            <CopyableId value={state.obligation.obligation_id} className="text-xs" />
            <JsonBlock value={state.obligation} />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}

/**
 * Move an obligation's status.
 *
 * `current_status` is submitted alongside the target so the action can tell a real
 * transition from the no-op — the service answers 200 for both and its body has no
 * flag distinguishing them. Left blank here because this form takes a pasted ID and
 * so has no rendered row to read a status from; the action falls back to the
 * returned status and words the result accordingly.
 */
export function TransitionObligationForm() {
  const [state, action, pending] = useActionState<TransitionState, FormData>(
    submitTransition,
    IDLE_TRANSITION,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="transition_obligation_id" className={LABEL}>
            Obligation ID
          </label>
          <input
            id="transition_obligation_id"
            name="obligation_id"
            required
            placeholder="From the register above"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="transition_status" className={LABEL}>
            New status
          </label>
          <select
            id="transition_status"
            name="obligation_status"
            defaultValue="IN_PROGRESS"
            className={FIELD}
          >
            {OBLIGATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={PANEL}>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Legal transitions, as the service enforces them
        </p>
        <ul className="space-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
          {Object.entries(LEGAL_TRANSITIONS).map(([from, to]) => (
            <li key={from}>
              <span className="font-mono">{from}</span>
              {" → "}
              {to.length ? (
                <span className="font-mono">{to.join(" | ")}</span>
              ) : (
                <span className="text-slate-500 dark:text-slate-500">
                  terminal — nothing reopens a discharged obligation
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Asking for the status a row is already in is accepted and changes nothing. Anything
          outside this map — including a status value the service does not recognise — is refused
          as an illegal transition rather than as a validation error.
        </p>
      </div>

      <Button type="submit" loading={pending}>
        {pending ? "Updating…" : "Update status"}
      </Button>

      <ResultBanner tone={TRANSITION_TONE[state.status]} message={state.message}>
        {state.obligation && <JsonBlock value={state.obligation} />}
      </ResultBanner>
    </form>
  );
}

export function AddFilingRequirementForm() {
  const [state, action, pending] = useActionState<FilingWriteState, FormData>(
    submitFilingRequirement,
    IDLE_FILING_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="filing_obligation_id" className={LABEL}>
          Obligation ID
        </label>
        <input
          id="filing_obligation_id"
          name="obligation_id"
          required
          placeholder="From the register above"
          className={`${FIELD} font-mono text-xs`}
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="filing_type" className={LABEL}>
            Filing type
          </label>
          <select id="filing_type" name="filing_type" defaultValue="VAT_RETURN" className={FIELD}>
            {FILING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filing_authority" className={LABEL}>
            Filing authority
          </label>
          <input
            id="filing_authority"
            name="filing_authority"
            required
            placeholder="HMRC"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="filing_channel" className={LABEL}>
            Submission channel
          </label>
          <select
            id="filing_channel"
            name="submission_channel"
            defaultValue="API"
            className={FIELD}
          >
            {SUBMISSION_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" loading={pending}>
        {pending ? "Recording…" : "Record filing requirement"}
      </Button>

      <ResultBanner tone={FILING_TONE[state.status]} message={state.message}>
        {state.filing && <JsonBlock value={state.filing} />}
      </ResultBanner>
    </form>
  );
}
