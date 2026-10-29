import type { SessionIdentity } from "@/lib/auth";
import { ABAC_OPERATORS, listABACRules, type ABACRule } from "@/lib/api/authorization";
import { createAbacRuleAction } from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { CommandButton } from "./CommandButton";
import { ActiveBadge, DataTable, Field, FieldGrid, ReadFailure, Section, SelectField } from "./ui";

const EFFECTS = [
  ["REQUIRE", "Require — refuse unless the condition holds"],
  ["FORBID", "Forbid — refuse when the condition holds"],
] as const;

const OPERATORS = ABAC_OPERATORS.map((o) => [o.raw, o.label] as const);

function sentence(r: ABACRule): string {
  const op = ABAC_OPERATORS.find((o) => o.raw === r.operator)?.label ?? r.operator;
  const value = r.attribute_value ? ` ${r.attribute_value}` : "";
  return `${r.effect === "FORBID" ? "Refuse when" : "Only when"} ${r.attribute_key} ${op}${value}`;
}

export async function ConditionsTab({ identity }: { identity: SessionIdentity }) {
  const result = await listABACRules(identity);
  const rules = result.ok ? (result.data ?? []) : [];

  return (
    <div className="space-y-6">
      <Section
        title="Conditions"
        description="Checked last, against the request itself. A condition can only take an action away — never grant one."
      >
        {!result.ok ? (
          <ReadFailure error={result.error} what="conditions" />
        ) : (
          <DataTable
            headers={["Code", "Action", "Condition", "Applies to", "Status", ""]}
            empty="No conditions."
            rows={rules.map((r) => [
              <span key="c" className="font-mono text-xs">{r.rule_code}</span>,
              <span key="a" className="font-mono text-xs">{r.action_type}</span>,
              sentence(r),
              r.tenant_id ? "This organisation" : "Every organisation",
              <ActiveBadge key="s" active={r.active_flag} />,
              r.tenant_id ? (
                <CommandButton
                  key="x"
                  command={r.active_flag ? "abac.retire" : "abac.reactivate"}
                  id={r.abac_rule_id}
                  label={r.active_flag ? "Retire" : "Reactivate"}
                  reasons={r.active_flag ? "change" : "restore"}
                  version={r.version}
                  tone={r.active_flag ? "danger" : "secondary"}
                />
              ) : (
                <span key="x" className="text-xs text-slate-400">Platform rule</span>
              ),
            ])}
          />
        )}
      </Section>

      <Section
        title="Add a condition"
        description="In force immediately. Requiring an attribute the calling service never sends refuses the action for everyone."
      >
        <ActionForm action={createAbacRuleAction} submitLabel="Create condition" resetOnSuccess>
          <FieldGrid cols={3}>
            <Field name="rule_code" label="Code" placeholder="e.g. PAYMENTS_WORKING_HOURS" />
            <Field name="action_type" label="Action" placeholder="e.g. payment.release" />
            <SelectField name="effect" label="Effect" options={EFFECTS} defaultValue="REQUIRE" />
            <Field name="attribute_key" label="Attribute" placeholder="e.g. channel" />
            <SelectField name="operator" label="Comparison" options={OPERATORS} defaultValue="eq" />
            <Field name="attribute_value" label="Value" optional hint="Comma-separate for one of / none of. Not used for present / absent." />
          </FieldGrid>
        </ActionForm>
      </Section>
    </div>
  );
}
