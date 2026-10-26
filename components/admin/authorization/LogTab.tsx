import { lookupDecisionAction, searchDecisionsAction } from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { Field, FieldGrid, Section, SelectField } from "./ui";

const OUTCOMES = [
  ["", "Any"],
  ["GRANTED", "Allowed"],
  ["DENIED", "Not allowed"],
] as const;

export function LogTab() {
  return (
    <div className="space-y-6">
      <Section
        title="Search decisions"
        description="Every permission check is recorded. Without iam.policy.read you see only your own, with the reason hidden."
      >
        <ActionForm action={searchDecisionsAction} submitLabel="Search" pendingLabel="Searching…">
          <FieldGrid cols={3}>
            <Field name="principal_id" label="Person (principal ID)" optional />
            <Field name="action_type" label="Action" optional />
            <SelectField name="outcome" label="Answer" options={OUTCOMES} defaultValue="" optional />
            <Field name="legal_entity_id" label="Legal entity" optional />
            <Field name="decided_from" label="From" type="datetime-local" optional />
            <Field name="decided_to" label="To" type="datetime-local" optional />
          </FieldGrid>
        </ActionForm>
      </Section>

      <Section title="Explain one decision" description="Read back a decision by the ID a check or a refusal reported.">
        <ActionForm action={lookupDecisionAction} submitLabel="Explain">
          <Field name="access_decision_id" label="Decision ID" className="max-w-xl" />
        </ActionForm>
      </Section>
    </div>
  );
}
