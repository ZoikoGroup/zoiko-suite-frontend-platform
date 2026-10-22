import Link from "next/link";
import { CopyableId } from "@/components/admin/shared";
import type { SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listDelegatedAuthorities, type DelegatedAuthority } from "@/lib/api/authorization";
import { lendAuthorityAction } from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { CommandButton } from "./CommandButton";
import { ActionList, DataTable, Field, FieldGrid, ReadFailure, Section, SelectField, StatusBadge } from "./ui";

const SCOPES = [
  ["FULL", "All of my authority"],
  ["ACTION_SUBSET", "Only the actions listed"],
] as const;

/** Live, ended by revocation, or ended by its own date. */
function status(d: DelegatedAuthority, now: number): string {
  if (d.revocation_status && d.revocation_status !== "ACTIVE") return d.revocation_status;
  if (d.effective_to && new Date(d.effective_to).getTime() < now) return "EXPIRED";
  return "ACTIVE";
}

export async function DelegationTab({ identity, now }: { identity: SessionIdentity; now: number }) {
  const result = await listDelegatedAuthorities(identity);
  const rows = result.ok ? (result.data ?? []) : [];

  return (
    <div className="space-y-6">
      <Section
        title="Delegations"
        description="Authority lent from one person to another. A delegation never confers more than the lender holds, and stops if the lender's own access stops."
      >
        {!result.ok ? (
          <ReadFailure error={result.error} what="delegations" />
        ) : (
          <DataTable
            headers={["Lender", "Borrower", "What", "Limit", "Valid", "Status", ""]}
            empty="No delegations."
            rows={rows.map((d) => {
              const s = status(d, now);
              const mirrored = Boolean(d.source_service);
              return [
                <CopyableId key="l" value={d.delegator_principal_id} />,
                <CopyableId key="b" value={d.delegate_principal_id} />,
                d.scope_type === "ACTION_SUBSET" ? <ActionList key="a" actions={d.delegated_actions} /> : "All their authority",
                d.authority_limit_value ? `${d.authority_limit_type ?? ""} ${d.authority_limit_value}`.trim() : "—",
                `${formatDateTime(d.effective_from)} – ${d.effective_to ? formatDateTime(d.effective_to) : "open"}`,
                <StatusBadge key="s" status={s} />,
                s !== "ACTIVE" ? (
                  ""
                ) : mirrored ? (
                  <Link key="x" href="/admin/delegations" className="text-xs font-medium text-navy-700 underline dark:text-navy-300">
                    Managed in Delegated Authority
                  </Link>
                ) : d.delegator_principal_id === identity.principalId ? (
                  <CommandButton key="x" command="delegation.revoke" id={d.delegated_authority_id} label="Withdraw" reasons="end" tone="danger" />
                ) : (
                  <span key="x" className="text-xs text-slate-400">Only the lender can withdraw</span>
                ),
              ];
            })}
          />
        )}
      </Section>

      <Section
        title="Lend your authority"
        description="Lends what you hold yourself, for a fixed period. Access-administration and platform powers cannot be lent."
      >
        <ActionForm action={lendAuthorityAction} submitLabel="Lend" pendingLabel="Lending…" resetOnSuccess>
          <FieldGrid cols={3}>
            <Field name="delegate_principal_id" label="Borrower (principal ID)" />
            <SelectField name="scope_type" label="What to lend" options={SCOPES} defaultValue="ACTION_SUBSET" />
            <Field name="delegated_actions" label="Actions" optional placeholder="comma-separated" hint="Needed when lending only some actions." />
            <Field name="effective_from" label="From" type="datetime-local" optional hint="Blank = now." />
            <Field name="effective_to" label="Until" type="datetime-local" />
            <Field name="legal_entity_id" label="Legal entity" optional hint="Blank = every legal entity you hold it in." />
            <Field name="reason" label="Reason" placeholder="e.g. Annual leave cover" className="sm:col-span-2" />
            <Field name="approval_reference" label="Approval reference" optional />
          </FieldGrid>
        </ActionForm>
      </Section>
    </div>
  );
}
