"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { DECISION_OUTCOMES, explainDecision } from "@/lib/api/governance";
import { DecisionSummary } from "./DecisionSummary";
import { submitDecision } from "@/app/admin/governance/actions";
import { IDLE_RECORD_STATE, type RecordDecisionState } from "@/app/admin/governance/state";

const TONE = {
  recorded: "success",
  replayed: "neutral",
  error: "error",
  idle: "neutral",
} as const;

export function RecordDecisionForm() {
  const [state, action, pending] = useActionState<RecordDecisionState, FormData>(
    submitDecision,
    IDLE_RECORD_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="action_type" className={LABEL}>
            Action type
          </label>
          <input
            id="action_type"
            name="action_type"
            required
            placeholder="PAYROLL_RELEASE"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>What was being decided on, as a code — e.g. PAYROLL_RELEASE.</p>
        </div>

        <div>
          <label htmlFor="outcome" className={LABEL}>
            Outcome
          </label>
          {/* Labelled in plain words, submitted as the stored code. The code is
              kept in the label too: this writes an evidence row, and whoever
              picks a value should see exactly what will be stored. */}
          <select id="outcome" name="outcome" defaultValue="GRANTED" className={FIELD}>
            {DECISION_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {explainDecision(outcome, "").shortLabel} ({outcome})
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="rule_basis" className={LABEL}>
            Rule basis{" "}
            <span className={OPTIONAL}>(required — the justification, not the outcome)</span>
          </label>
          <input
            id="rule_basis"
            name="rule_basis"
            required
            placeholder="SPEND-LIMIT-V3:pv-8f2c1a"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="actor_id" className={LABEL}>
            Actor <span className={OPTIONAL}>(blank = you)</span>
          </label>
          <input id="actor_id" name="actor_id" className={FIELD} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="legal_entity_id" className={LABEL}>
            Legal entity <span className={OPTIONAL}>(blank = session entity)</span>
          </label>
          <input
            id="legal_entity_id"
            name="legal_entity_id"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="evaluation_context" className={LABEL}>
            Anything else worth recording <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            id="evaluation_context"
            name="evaluation_context"
            rows={3}
            placeholder={'{"amount": 48000, "currency": "GBP"}'}
            className={`${FIELD} font-mono text-xs`}
          />
          <p className={HINT}>
            The facts the decision was based on — an amount, a threshold, a reference. Written as
            JSON, in the shape shown above, because the log stores it as structured data. It is
            read back on this page as a plain list, so it does not have to be read as JSON.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Recording…" : "Append to the log"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          The decision ID and timestamp are generated server-side — see the note above
        </p>
      </div>

      {/* The written record, read back in plain English rather than as the
          five-field JSON object this used to show. What the reader needs to
          confirm is that the row says what they meant it to say — and they
          cannot confirm that against a wire format. */}
      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.decision && (
          <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
            <DecisionSummary decision={state.decision} variant="compact" />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
