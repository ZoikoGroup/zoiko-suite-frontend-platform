"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupAccessDecisionAction } from "@/app/admin/access-control/actions";
import { AccessDecisionSummary } from "./AccessDecisionSummary";

/**
 * "Paste a decision reference, read why."
 *
 * `GET /v1/access-decisions/{id}` is the service's rationale capability. Every
 * evaluation is recorded before its response returns precisely so a decision
 * can be explained afterwards — and nothing in the console could read one back,
 * which made the recording pointless from here.
 *
 * A client component purely to hold the render function: `renderRecord` is an
 * ordinary function prop and cannot cross the server/client boundary, so the
 * page cannot pass it to LookupById directly. Without one, LookupById falls
 * back to rendering the record as JSON — which on this particular record would
 * hand somebody `decision_basis: "sod:conflict_with=PAYMENT_INITIATE"` and
 * call it an explanation.
 */
export function AccessDecisionLookup() {
  return (
    <LookupById
      action={lookupAccessDecisionAction}
      inputName="access_decision_id"
      label="Decision reference"
      placeholder="00000000-0000-0000-0000-000000000000"
      hint="Every permission check ever made was recorded with one of these. Take it from the answer a check gave you, or from the service that was refused — the reference is in its logs."
      buttonLabel="Explain it"
      renderRecord={(decision) => <AccessDecisionSummary decision={decision} />}
    />
  );
}
