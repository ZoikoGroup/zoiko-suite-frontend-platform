import Link from "next/link";
import { CopyableId } from "@/components/admin/shared";
import type { SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  isAssignmentActive,
  listPermissionBundles,
  listRoleAssignments,
  listRoles,
  type RoleAssignment,
} from "@/lib/api/authorization";
import { grantRoleAction } from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { CommandButton } from "./CommandButton";
import { ActionList, ActiveBadge, DataTable, Field, FieldGrid, ReadFailure, Section, SelectField, StatusBadge } from "./ui";

function where(a: RoleAssignment) {
  return a.legal_entity_id ? <CopyableId value={a.legal_entity_id} /> : "Whole organisation";
}

const SCOPES = [
  ["entity", "One legal entity"],
  ["tenant", "Whole organisation (organisation-wide roles only)"],
] as const;

export async function GrantsTab({ identity }: { identity: SessionIdentity }) {
  const [rolesResult, assignmentsResult] = await Promise.all([
    listRoles(identity),
    listRoleAssignments(identity, { includeExpired: true }),
  ]);
  const roles = rolesResult.ok ? (rolesResult.data ?? []) : [];
  // null = that role's sets could not be read (shown as such, not as "none").
  const bundleLists = (await Promise.all(roles.map((r) => listPermissionBundles(identity, r.role_id)))).map((res) =>
    res.ok ? (res.data ?? []) : null,
  );
  const roleCode = new Map(roles.map((r) => [r.role_id, r.role_code]));
  const roleLabel = (id: string) => roleCode.get(id) ?? <CopyableId value={id} />;

  const all = assignmentsResult.ok ? (assignmentsResult.data ?? []) : [];
  const pending = all.filter((a) => a.approval_status === "PENDING_APPROVAL");
  const live = all.filter((a) => (a.approval_status ?? "APPROVED") === "APPROVED" && isAssignmentActive(a));
  const ended = all.filter((a) => !pending.includes(a) && !live.includes(a));

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Section
          title={`Awaiting approval (${pending.length})`}
          description="Privileged grants recorded by someone without approval rights. They grant nothing until an independent checker approves them, and expire after 72 hours."
        >
          <DataTable
            headers={["Person", "Role", "Where", "Requested by", "Expires", ""]}
            empty=""
            rows={pending.map((a) => [
              <CopyableId key="p" value={a.principal_id} />,
              roleLabel(a.role_id),
              where(a),
              <CopyableId key="b" value={a.assigned_by} />,
              a.approval_expires_at ? formatDateTime(a.approval_expires_at) : "—",
              <div key="x" className="flex justify-end gap-2">
                <CommandButton command="assignment.approve" id={a.principal_role_assignment_id} label="Approve" reasons="approve" tone="primary" />
                <CommandButton command="assignment.reject" id={a.principal_role_assignment_id} label="Reject" reasons="reject" tone="danger" />
              </div>,
            ])}
          />
        </Section>
      )}

      <Section
        title={assignmentsResult.ok ? `Live grants (${live.length})` : "Live grants"}
        description="Who holds which role right now. Revoking keeps the record."
      >
        {!assignmentsResult.ok ? (
          <ReadFailure error={assignmentsResult.error} what="grants" />
        ) : (
          <DataTable
            headers={["Person", "Role", "Where", "From", "Until", ""]}
            empty="Nobody holds a role in this organisation yet."
            rows={live.map((a) => [
              <CopyableId key="p" value={a.principal_id} />,
              roleLabel(a.role_id),
              where(a),
              formatDateTime(a.effective_from),
              a.effective_to ? formatDateTime(a.effective_to) : "Open-ended",
              <CommandButton key="r" command="assignment.revoke" id={a.principal_role_assignment_id} label="Revoke" reasons="end" tone="danger" withEndDate />,
            ])}
          />
        )}
      </Section>

      <Section title="Grant a role" description="A privileged role is held for approval unless you have approval rights.">
        {!rolesResult.ok ? (
          <ReadFailure error={rolesResult.error} what="roles" />
        ) : roles.length === 0 ? (
          <p className="text-sm text-slate-500">
            No roles exist yet. Define one on{" "}
            <Link href="/admin/access-control" className="font-medium underline">
              Roles &amp; Access
            </Link>
            .
          </p>
        ) : (
          <ActionForm action={grantRoleAction} submitLabel="Grant" pendingLabel="Granting…" resetOnSuccess>
            <FieldGrid cols={3}>
              <Field name="principal_id" label="Person (principal ID)" />
              <SelectField
                name="role_id"
                label="Role"
                defaultValue=""
                options={[["", "Choose…"], ...roles.filter((r) => r.active_flag).map((r) => [r.role_id, `${r.role_code} — ${r.role_name}`] as const)]}
              />
              <SelectField name="scope" label="Applies to" options={SCOPES} defaultValue="entity" />
              <Field name="legal_entity_id" label="Legal entity" optional defaultValue={identity.legalEntityId} />
              <Field name="effective_from" label="Starts" type="datetime-local" optional hint="Blank = now." />
              <Field name="effective_to" label="Ends" type="datetime-local" optional hint="Blank = open-ended." />
              <Field name="approval_reference" label="Approval reference" optional hint="The request this grant was approved under." className="sm:col-span-3" />
            </FieldGrid>
          </ActionForm>
        )}
      </Section>

      {ended.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ended, rejected and expired grants ({ended.length})
          </summary>
          <div className="mt-4">
            <DataTable
              headers={["Person", "Role", "Where", "Ended", "Status"]}
              empty=""
              rows={ended.map((a) => [
                <CopyableId key="p" value={a.principal_id} />,
                roleLabel(a.role_id),
                where(a),
                a.effective_to ? formatDateTime(a.effective_to) : a.approval_decided_at ? formatDateTime(a.approval_decided_at) : "—",
                <StatusBadge key="s" status={a.approval_status === "APPROVED" || !a.approval_status ? "ENDED" : a.approval_status} />,
              ])}
            />
          </div>
        </details>
      )}

      <Section
        title="Roles as enforced"
        description="The roles every permission check reads. Retiring a role or permission set stops it granting for everyone who holds it, without touching their grants."
      >
        {!rolesResult.ok ? (
          <ReadFailure error={rolesResult.error} what="roles" />
        ) : (
          <DataTable
            headers={["Role", "Permission sets", "Status", ""]}
            empty="No roles exist yet."
            rows={roles.map((r, i) => {
              const bundles = bundleLists[i];
              return [
                <div key="r">
                  <div className="font-medium">{r.role_code}</div>
                  <div className="text-xs text-slate-500">{r.role_name} · {r.role_scope_type === "TENANT" ? "organisation-wide" : "per legal entity"}</div>
                </div>,
                bundles === null ? (
                  <span key="b" className="text-xs text-amber-700">Could not be read</span>
                ) : bundles.length === 0 ? (
                  <span key="b" className="text-xs text-slate-400">None — grants nothing</span>
                ) : (
                  <ul key="b" className="space-y-2">
                    {bundles.map((b) => (
                      <li key={b.permission_bundle_id} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{b.bundle_code}</span>
                        <ActiveBadge active={b.active_flag} />
                        <ActionList actions={b.permitted_actions} />
                        <CommandButton
                          command={b.active_flag ? "bundle.retire" : "bundle.reactivate"}
                          id={b.permission_bundle_id}
                          label={b.active_flag ? "Retire" : "Reactivate"}
                          reasons={b.active_flag ? "end" : "restore"}
                          version={b.version}
                        />
                      </li>
                    ))}
                  </ul>
                ),
                <ActiveBadge key="s" active={r.active_flag} />,
                <CommandButton
                  key="c"
                  command={r.active_flag ? "role.retire" : "role.reactivate"}
                  id={r.role_id}
                  label={r.active_flag ? "Retire" : "Reactivate"}
                  reasons={r.active_flag ? "end" : "restore"}
                  version={r.version}
                  tone={r.active_flag ? "danger" : "secondary"}
                />,
              ];
            })}
          />
        )}
      </Section>
    </div>
  );
}
