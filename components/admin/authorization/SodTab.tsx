import { CopyableId } from "@/components/admin/shared";
import type { SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listSoDExceptions, listSoDRules } from "@/lib/api/authorization";
import {
  conflictingPermissionsAction,
  createSoDRuleAction,
  requestSoDExceptionAction,
} from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { CommandButton } from "./CommandButton";
import { ActiveBadge, DataTable, Field, FieldGrid, ReadFailure, Section, SelectField, StatusBadge } from "./ui";

const CONFLICT_TYPES = [
  ["HARD", "Two actions nobody may hold together"],
  ["OWN_OBJECT_FORBIDDEN", "One action nobody may take on their own record"],
] as const;

export async function SodTab({ identity }: { identity: SessionIdentity }) {
  const [rulesResult, exceptionsResult] = await Promise.all([listSoDRules(identity), listSoDExceptions(identity)]);
  const rules = rulesResult.ok ? (rulesResult.data ?? []) : [];
  const exceptions = exceptionsResult.ok ? (exceptionsResult.data ?? []) : [];
  const ruleLabel = new Map(
    rules.map((r) => [r.sod_rule_id, r.action_a === r.action_b ? `${r.action_a} (own record)` : `${r.action_a} ↔ ${r.action_b}`]),
  );

  return (
    <div className="space-y-6">
      <Section title="Rules" description="A conflict refuses the action; the grant itself stays. Platform-wide rules apply to every organisation and cannot be changed here.">
        {!rulesResult.ok ? (
          <ReadFailure error={rulesResult.error} what="separation-of-duties rules" />
        ) : (
          <DataTable
            headers={["Area", "Conflict", "Type", "Applies to", "Status", ""]}
            empty="No rules yet."
            rows={rules.map((r) => [
              r.domain_code,
              <span key="c" className="font-mono text-xs">{ruleLabel.get(r.sod_rule_id)}</span>,
              r.conflict_type,
              r.tenant_id ? "This organisation" : "Every organisation",
              <ActiveBadge key="s" active={r.active_flag} />,
              r.tenant_id ? (
                <CommandButton
                  key="x"
                  command={r.active_flag ? "sod_rule.retire" : "sod_rule.reactivate"}
                  id={r.sod_rule_id}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Add a rule" description="In force immediately for everyone in this organisation.">
          <ActionForm action={createSoDRuleAction} submitLabel="Create rule" resetOnSuccess>
            <FieldGrid>
              <Field name="domain_code" label="Area" placeholder="e.g. FINANCE" />
              <SelectField name="conflict_type" label="Kind" options={CONFLICT_TYPES} defaultValue="HARD" />
              <Field name="action_a" label="Action" placeholder="e.g. payment.create" />
              <Field name="action_b" label="Conflicts with" optional placeholder="e.g. payment.approve" hint="Not needed for an own-record rule." />
            </FieldGrid>
          </ActionForm>
        </Section>

        <Section title="What conflicts with an action?" description="Every action that may never be held together with this one.">
          <ActionForm action={conflictingPermissionsAction} submitLabel="Look up">
            <Field name="action_type" label="Action" placeholder="e.g. payment.approve" />
          </ActionForm>
        </Section>
      </div>

      <Section
        title="Exceptions"
        description="A time-boxed permission to hold a conflicting pair under a compensating control. Decided by someone other than the requester and the person covered."
      >
        {!exceptionsResult.ok ? (
          <ReadFailure error={exceptionsResult.error} what="exceptions" />
        ) : (
          <DataTable
            headers={["Rule", "Person", "Control", "Valid", "Status", ""]}
            empty="No exceptions."
            rows={exceptions.map((e) => [
              <span key="r" className="font-mono text-xs">{ruleLabel.get(e.sod_rule_id) ?? e.sod_rule_id}</span>,
              <CopyableId key="p" value={e.principal_id} />,
              <span key="c" title={e.reason}>{e.compensating_control}</span>,
              `${formatDateTime(e.effective_from)} – ${formatDateTime(e.expires_at)}`,
              <StatusBadge key="s" status={e.status} />,
              <div key="x" className="flex justify-end gap-2">
                {e.status === "REQUESTED" && (
                  <>
                    <CommandButton command="sod_exception.approve" id={e.sod_exception_id} label="Approve" reasons="approve" tone="primary" />
                    <CommandButton command="sod_exception.reject" id={e.sod_exception_id} label="Reject" reasons="reject" tone="danger" />
                  </>
                )}
                {e.status === "APPROVED" && (
                  <CommandButton command="sod_exception.revoke" id={e.sod_exception_id} label="Revoke" reasons="end" tone="danger" />
                )}
              </div>,
            ])}
          />
        )}

        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Request an exception</h3>
          {!rulesResult.ok ? (
            <p className="text-sm text-slate-500">The rules could not be read, so an exception cannot be requested right now.</p>
          ) : rules.filter((r) => r.active_flag).length === 0 ? (
            <p className="text-sm text-slate-500">There is no active rule to make an exception to.</p>
          ) : (
            <ActionForm action={requestSoDExceptionAction} submitLabel="Request" resetOnSuccess>
              <FieldGrid cols={3}>
                <SelectField
                  name="sod_rule_id"
                  label="Rule"
                  defaultValue=""
                  options={[["", "Choose…"], ...rules.filter((r) => r.active_flag).map((r) => [r.sod_rule_id, ruleLabel.get(r.sod_rule_id) ?? r.sod_rule_id] as const)]}
                />
                <Field name="principal_id" label="Person (principal ID)" />
                <Field name="compensating_control" label="Compensating control" placeholder="e.g. Monthly review by CFO" />
                <Field name="reason" label="Reason" className="sm:col-span-3" />
                <Field name="effective_from" label="From" type="datetime-local" optional hint="Blank = now." />
                <Field name="expires_at" label="Expires" type="datetime-local" />
              </FieldGrid>
            </ActionForm>
          )}
        </div>
      </Section>
    </div>
  );
}
