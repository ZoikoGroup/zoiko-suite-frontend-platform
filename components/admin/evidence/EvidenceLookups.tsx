"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupEvaluation, lookupRequirement } from "@/app/admin/evidence/actions";
import type { EvidenceEvaluation, EvidenceRequirement } from "@/lib/api/evidence";
import { RequirementSummary, StoredEvaluationSummary } from "./EvidenceSummary";

/**
 * "Paste a reference, read the record."
 *
 * Client components purely to hold the render functions: `renderRecord` is an
 * ordinary function prop, which cannot cross the server/client boundary, so the
 * page cannot pass it to LookupById directly. The Server Actions are imported
 * rather than passed for the same reason the forms import their own — an action
 * reference travels fine, but there is no reason to route it through props when
 * the lookup is specific to this service anyway.
 */
export function EvaluationLookup() {
  return (
    <LookupById<EvidenceEvaluation>
      action={lookupEvaluation}
      inputName="evaluation_id"
      label="Reference for a past check"
      placeholder="Returned by a check above"
      hint="Shows what was required and what was supplied at the moment it was checked."
      renderRecord={(evaluation) => <StoredEvaluationSummary evaluation={evaluation} />}
    />
  );
}

export function RequirementLookup() {
  return (
    <LookupById<EvidenceRequirement>
      action={lookupRequirement}
      inputName="requirement_id"
      label="Reference for a requirement"
      placeholder="From the catalog above"
      hint="The full record, including anything recorded about what it asks for."
      renderRecord={(requirement) => <RequirementSummary requirement={requirement} />}
    />
  );
}
