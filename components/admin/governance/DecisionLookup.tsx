"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupDecision } from "@/app/admin/governance/actions";
import { DecisionSummary } from "./DecisionSummary";

/**
 * "Paste a decision ID, read the decision."
 *
 * A client component purely to hold the render function: `renderRecord` is an
 * ordinary function prop, which cannot cross the server/client boundary, so the
 * page cannot pass it to LookupById directly. The Server Action is imported
 * rather than passed for the same reason RecordDecisionForm imports its own —
 * an action reference travels fine, but there is no reason to route it through
 * props when the form is specific to this service anyway.
 */
export function DecisionLookup() {
  return (
    <LookupById
      action={lookupDecision}
      inputName="decision_id"
      label="Decision ID"
      placeholder="4f8c2a91-…"
      hint="Copy a decision reference from the log above and paste it here."
      renderRecord={(decision) => <DecisionSummary decision={decision} />}
    />
  );
}
