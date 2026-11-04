import { Badge } from "@/components/ui";
import type { SessionIdentity } from "@/lib/auth";
import { getMyCapabilities } from "@/lib/api/authorization";
import {
  availableActionsAction,
  checkAccessAction,
  delegatedAccessAction,
  effectiveAccessAction,
  entityScopeAction,
  sodEvaluateAction,
  sodPrecheckAction,
} from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { Field, FieldGrid, ReadFailure, Section, SelectField, TextArea } from "./ui";

const SCOPES = [
  ["entity", "A legal entity"],
  ["platform", "The whole platform"],
] as const;

const CURRENCIES = [
  ["GBP", "GBP"],
  ["EUR", "EUR"],
  ["USD", "USD"],
  ["CAD", "CAD"],
  ["AUD", "AUD"],
  ["CHF", "CHF"],
  ["JPY", "JPY"],
] as const;

async function MyCapabilities({ identity }: { identity: SessionIdentity }) {
  const result = await getMyCapabilities(identity, identity.legalEntityId);
  if (!result.ok) return <ReadFailure error={result.error} what="your capabilities" />;
  const c = result.data;
  const features = Object.entries(c.features ?? {}).filter(([, on]) => on).map(([f]) => f);
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs font-medium text-slate-500">Permissions ({c.permissions?.length ?? 0})</dt>
        <dd className="mt-1 flex flex-wrap gap-1">
          {(c.permissions ?? []).length === 0 ? (
            <span className="text-slate-400">None in this legal entity</span>
          ) : (
            c.permissions.map((p) => (
              <Badge key={p} tone="neutral" className="font-mono">
                {p}
              </Badge>
            ))
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-slate-500">Modules</dt>
        <dd className="mt-1">{(c.modules ?? []).join(", ") || "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-slate-500">Features on</dt>
        <dd className="mt-1">{features.join(", ") || "—"}</dd>
      </div>
    </dl>
  );
}

export function CheckTab({ identity }: { identity: SessionIdentity }) {
  return (
    <div className="space-y-6">
      <Section title="What you can do" description="Your own permissions in your current legal entity, as the service resolves them.">
        <MyCapabilities identity={identity} />
      </Section>

      <Section
        title="Check a permission"
        description="Asks exactly what a service asks before it acts. The answer is recorded in the decision log."
      >
        <ActionForm action={checkAccessAction} submitLabel="Check" pendingLabel="Checking…">
          <FieldGrid cols={3}>
            <Field name="action_type" label="Action" placeholder="e.g. invoice.approve" />
            <Field name="principal_id" label="Person (principal ID)" optional placeholder="Blank = you" />
            <SelectField name="scope" label="Where" options={SCOPES} defaultValue="entity" />
            <Field name="legal_entity_id" label="Legal entity" optional defaultValue={identity.legalEntityId} />
            <Field name="amount" label="Amount" optional inputMode="decimal" hint="Applies authority limits." />
            <SelectField name="currency" label="Currency" options={CURRENCIES} defaultValue="GBP" />
            <Field name="resource_owner_principal_id" label="Owner of the record" optional hint="Catches someone approving their own work." />
            <TextArea name="attributes" label="Other attributes" optional placeholder={"one per line, e.g.\nchannel=web"} className="sm:col-span-2" />
          </FieldGrid>
        </ActionForm>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Actions on a record" description="Which actions a person may take on one record, and why not the others.">
          <ActionForm action={availableActionsAction} submitLabel="Show actions">
            <FieldGrid>
              <Field name="resource_type" label="Record type" placeholder="e.g. invoice" />
              <Field name="resource_id" label="Record ID" />
              <Field name="principal_id" label="Person" optional placeholder="Blank = you" />
              <Field name="legal_entity_id" label="Legal entity" optional defaultValue={identity.legalEntityId} />
            </FieldGrid>
          </ActionForm>
        </Section>

        <Section title="Maker and checker" description="Can these people do and approve one act? Records nothing.">
          <ActionForm action={sodEvaluateAction} submitLabel="Check">
            <FieldGrid>
              <Field name="action_type" label="Action" />
              <Field name="maker_principal_id" label="Maker (principal ID)" />
              <Field name="checker_principal_id" label="Checker" optional />
              <Field name="subject_principal_id" label="Who it is about" optional />
            </FieldGrid>
          </ActionForm>
        </Section>

        <Section title="Before granting" description="Would adding these actions break separation of duties? Records nothing.">
          <ActionForm action={sodPrecheckAction} submitLabel="Check">
            <FieldGrid>
              <Field name="candidate_actions" label="Actions the grant adds" placeholder="comma-separated" className="sm:col-span-2" />
              <Field name="principal_id" label="Person" optional hint="Includes what they already hold." />
              <Field name="legal_entity_id" label="Legal entity" optional />
            </FieldGrid>
          </ActionForm>
        </Section>

        <Section title="Where can someone act?" description="Which legal entities a person can act in. Records nothing.">
          <ActionForm action={entityScopeAction} submitLabel="Check">
            <FieldGrid>
              <Field name="legal_entity_ids" label="Legal entities" placeholder="comma-separated" className="sm:col-span-2" />
              <Field name="principal_id" label="Person" optional placeholder="Blank = you" />
              <Field name="action_type" label="Action" optional />
            </FieldGrid>
          </ActionForm>
        </Section>

        <Section title="Borrowed authority?" description="Is a person acting on their own authority or on someone else's?">
          <ActionForm action={delegatedAccessAction} submitLabel="Check">
            <FieldGrid>
              <Field name="principal_id" label="Person (principal ID)" />
              <Field name="legal_entity_id" label="Legal entity" optional defaultValue={identity.legalEntityId} />
              <Field name="action_type" label="Action" optional />
              <Field name="delegator_principal_id" label="Lent by" optional hint="Narrow to one lender (needs an action)." />
            </FieldGrid>
          </ActionForm>
        </Section>

        <Section title="Effective access" description="Everything a person can do right now, recomputed from their grants.">
          <ActionForm action={effectiveAccessAction} submitLabel="Recompute">
            <Field name="principal_id" label="Person (principal ID)" optional placeholder="Blank = you" />
          </ActionForm>
        </Section>
      </div>
    </div>
  );
}
