"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { DECISION_OUTCOMES } from "@/lib/api/governance";
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
        </div>

        <div>
          <label htmlFor="outcome" className={LABEL}>
            Outcome
          </label>
          <select id="outcome" name="outcome" defaultValue="GRANTED" className={FIELD}>
            {DECISION_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcome}
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
            Evaluation context <span className={OPTIONAL}>(optional JSON)</span>
          </label>
          <textarea
            id="evaluation_context"
            name="evaluation_context"
            rows={3}
            placeholder={'{"amount": 48000, "currency": "GBP"}'}
            className={`${FIELD} font-mono text-xs`}
          />
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

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.decision && (
          <JsonBlock
            value={{
              decision_id: state.decision.decision_id,
              outcome: state.decision.outcome,
              rule_basis: state.decision.rule_basis,
              decided_at: state.decision.decided_at,
              correlation_id: state.decision.correlation_id,
            }}
          />
        )}
      </ResultBanner>
    </form>
  );
}
