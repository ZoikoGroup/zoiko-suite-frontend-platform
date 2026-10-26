import type { SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listWorkloadBindings } from "@/lib/api/authorization";
import { invalidateCacheAction, saveWorkloadBindingAction } from "@/app/admin/authorization/actions";
import { REASONS } from "@/app/admin/authorization/state";
import { ActionForm } from "./ActionForm";
import { CommandButton } from "./CommandButton";
import { ActionList, ActiveBadge, DataTable, Field, FieldGrid, ReadFailure, Section, SelectField } from "./ui";

const CHANGE_REASONS = [["", "Choose…"], ...REASONS.change] as const;

export async function WorkloadsTab({ identity }: { identity: SessionIdentity }) {
  const result = await listWorkloadBindings(identity);
  const bindings = result.ok ? (result.data.workload_bindings ?? []) : [];

  return (
    <div className="space-y-6">
      <Section
        title="Workload bindings"
        description="What each service identity may do. A binding only narrows: a bound workload can take only the actions listed, whatever its roles say."
      >
        {!result.ok ? (
          <ReadFailure error={result.error} what="workload bindings" />
        ) : (
          <DataTable
            headers={["Workload", "Audience", "Allowed actions", "Since", "Status", ""]}
            empty="No workload bindings."
            rows={bindings.map((b) => [
              <span key="w" className="font-mono text-xs">{b.workload_id}</span>,
              <span key="a" className="font-mono text-xs">{b.allowed_audience}</span>,
              <ActionList key="l" actions={b.allowed_actions} max={6} />,
              formatDateTime(b.created_at),
              <ActiveBadge key="s" active={b.active_flag} off="Inactive" />,
              <CommandButton
                key="x"
                command={b.active_flag ? "workload.deactivate" : "workload.reactivate"}
                id={b.workload_id}
                label={b.active_flag ? "Deactivate" : "Reactivate"}
                reasons={b.active_flag ? "change" : "restore"}
                tone={b.active_flag ? "danger" : "secondary"}
              />,
            ])}
          />
        )}

        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Save a binding</h3>
          <ActionForm action={saveWorkloadBindingAction} submitLabel="Save" resetOnSuccess note="Saving an existing workload replaces its list.">
            <FieldGrid cols={3}>
              <Field name="workload_id" label="Workload" placeholder="certificate name, e.g. payment-run-svc" />
              <Field name="allowed_audience" label="Audience" placeholder="e.g. authorization-svc" />
              <Field name="allowed_actions" label="Actions" placeholder="comma-separated, no wildcards" />
              <SelectField name="reason_code" label="Reason" options={CHANGE_REASONS} defaultValue="" />
              <Field name="reason_note" label="Note" optional className="sm:col-span-2" />
            </FieldGrid>
          </ActionForm>
        </div>
      </Section>

      <Section
        title="Refresh cached decisions"
        description="Decisions are cached for about five seconds. Use this when a revocation must take effect on every replica immediately."
      >
        <ActionForm action={invalidateCacheAction} submitLabel="Refresh cache" variant="secondary" resetOnSuccess>
          <FieldGrid cols={3}>
            <Field name="principal_id" label="About (principal ID)" optional hint="Recorded as the reason's subject; the whole organisation's cache is dropped." />
            <SelectField name="reason_code" label="Reason" options={CHANGE_REASONS} defaultValue="" />
            <Field name="reason_note" label="Note" optional />
          </FieldGrid>
        </ActionForm>
      </Section>
    </div>
  );
}
