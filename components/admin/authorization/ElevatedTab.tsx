import { CopyableId } from "@/components/admin/shared";
import type { SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listBreakGlassSessions, listPrivilegedSessions, listSupportSessions } from "@/lib/api/authorization";
import { issueBreakGlassAction, issueJitAction, openSupportSessionAction } from "@/app/admin/authorization/actions";
import { ActionForm } from "./ActionForm";
import { CommandButton, ReviewButton } from "./CommandButton";
import { ActionList, DataTable, Field, FieldGrid, ReadFailure, Section, SelectField, StatusBadge } from "./ui";

const ENVIRONMENTS = [
  ["production", "Production"],
  ["staging", "Staging"],
  ["test", "Test"],
] as const;

const CONSENT = [
  ["", "Choose…"],
  ["yes", "Yes — consent or support agreement covers this"],
  ["no", "No"],
] as const;

export async function ElevatedTab({ identity }: { identity: SessionIdentity }) {
  const [jit, breakGlass, support] = await Promise.all([
    listPrivilegedSessions(identity),
    listBreakGlassSessions(identity),
    listSupportSessions(identity),
  ]);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        Issuing or approving a just-in-time session, and issuing break-glass, need a multi-factor sign-in from the last 15
        minutes. {identity.envelopeJwt ? "" : "This session has no signed sign-in, so those requests will be refused. "}
        Every session names exact actions (no wildcards) and ends on its own: JIT 8 h, break-glass 2 h, support 4 h at most.
      </p>

      <Section title="Just-in-time access" description="Temporary elevation for a ticket. Anything beyond read access waits for an independent approver.">
        {!jit.ok ? (
          <ReadFailure error={jit.error} what="just-in-time sessions" />
        ) : (
          <DataTable
            headers={["Person", "Actions", "Ticket", "Window", "Status", "Review", ""]}
            empty="No just-in-time sessions."
            rows={jit.data.sessions.map((s) => [
              <CopyableId key="p" value={s.principal_id} />,
              <ActionList key="a" actions={s.requested_actions} />,
              <span key="t" title={s.reason}>{s.ticket_ref}</span>,
              `${formatDateTime(s.created_at)} – ${formatDateTime(s.expires_at)}`,
              <StatusBadge key="s" status={s.status} />,
              s.review_status === "NOT_REQUIRED" ? "—" : <StatusBadge key="r" status={s.review_status} />,
              <div key="x" className="flex justify-end gap-2">
                {s.status === "PENDING_APPROVAL" && (
                  <>
                    <CommandButton command="jit.approve" id={s.session_id} label="Approve" reasons="approve" tone="primary" />
                    <CommandButton command="jit.reject" id={s.session_id} label="Reject" reasons="reject" tone="danger" />
                  </>
                )}
                {s.status === "ACTIVE" && <CommandButton command="jit.revoke" id={s.session_id} label="Revoke" reasons="end" tone="danger" />}
                {s.review_status === "PENDING" && <ReviewButton kind="privileged" id={s.session_id} />}
              </div>,
            ])}
          />
        )}
        <details className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">Request just-in-time access</summary>
          <div className="mt-4">
            <ActionForm action={issueJitAction} submitLabel="Request" resetOnSuccess>
              <FieldGrid cols={3}>
                <Field name="requested_actions" label="Actions" placeholder="comma-separated, no wildcards" className="sm:col-span-2" />
                <Field name="principal_id" label="For (principal ID)" optional placeholder="Blank = you" />
                <Field name="ticket_ref" label="Ticket" />
                <Field name="resource_scope" label="Resource" placeholder="e.g. ledger:GB01" />
                <SelectField name="target_environment" label="Environment" options={ENVIRONMENTS} defaultValue="production" />
                <Field name="duration_hours" label="Hours" type="number" min={0.25} max={8} step={0.25} defaultValue={1} />
                <Field name="reason" label="Reason" className="sm:col-span-2" />
              </FieldGrid>
            </ActionForm>
          </div>
        </details>
      </Section>

      <Section title="Break-glass" description="Emergency access tied to a declared incident. Raises a critical alert on issue and opens a review when it ends. Never includes payment, posting or filing powers.">
        {!breakGlass.ok ? (
          <ReadFailure error={breakGlass.error} what="break-glass sessions" />
        ) : (
          <DataTable
            headers={["Person", "Incident", "Actions", "Expires", "Status", "Review", ""]}
            empty="No break-glass sessions."
            rows={breakGlass.data.sessions.map((s) => [
              <CopyableId key="p" value={s.principal_id} />,
              <span key="i" title={s.reason}>{s.incident_id}</span>,
              <ActionList key="a" actions={s.requested_actions} />,
              formatDateTime(s.expires_at),
              <StatusBadge key="s" status={s.status} />,
              s.review_status === "NOT_REQUIRED" ? "—" : <StatusBadge key="r" status={s.review_status} />,
              <div key="x" className="flex justify-end gap-2">
                {s.status === "ACTIVE" && <CommandButton command="break_glass.revoke" id={s.session_id} label="Revoke" reasons="end" tone="danger" />}
                {s.review_status === "PENDING" && <ReviewButton kind="break_glass" id={s.session_id} />}
              </div>,
            ])}
          />
        )}
        <details className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">Break glass</summary>
          <div className="mt-4">
            <ActionForm action={issueBreakGlassAction} submitLabel="Issue break-glass" variant="secondary" resetOnSuccess>
              <FieldGrid cols={3}>
                <Field name="incident_id" label="Incident reference" />
                <Field name="principal_id" label="For (principal ID)" optional placeholder="Blank = you" />
                <Field name="duration_minutes" label="Minutes" type="number" min={5} max={120} step={5} optional hint="Blank = service default." />
                <Field name="requested_actions" label="Actions" placeholder="comma-separated" className="sm:col-span-3" />
                <Field name="reason" label="Reason" className="sm:col-span-3" />
              </FieldGrid>
            </ActionForm>
          </div>
        </details>
      </Section>

      <Section title="Support access" description="Purpose-bound access for a support ticket. Read-only unless writes are named; nothing is granted without stated consent.">
        {!support.ok ? (
          <ReadFailure error={support.error} what="support sessions" />
        ) : (
          <DataTable
            headers={["Operator", "Ticket", "Access", "Consent", "Expires", "Status", ""]}
            empty="No support sessions."
            rows={support.data.sessions.map((s) => [
              <CopyableId key="o" value={s.support_operator_id} />,
              <span key="t" title={s.purpose}>{s.ticket_ref}</span>,
              <span key="a">
                {s.allowed_actions?.length ? <ActionList actions={s.allowed_actions} /> : "Read-only"}
                {s.allow_bulk_export && <span className="block text-xs text-amber-700">Bulk export allowed</span>}
              </span>,
              s.tenant_consent_obtained ? "Yes" : "No — grants nothing",
              formatDateTime(s.expires_at),
              <StatusBadge key="s" status={s.status} />,
              s.status === "ACTIVE" ? <CommandButton key="x" command="support.revoke" id={s.session_id} label="Revoke" reasons="end" tone="danger" /> : "",
            ])}
          />
        )}
        <details className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">Open support access</summary>
          <div className="mt-4">
            <ActionForm action={openSupportSessionAction} submitLabel="Open" resetOnSuccess>
              <FieldGrid cols={3}>
                <Field name="ticket_ref" label="Ticket" />
                <SelectField name="tenant_consent_obtained" label="Organisation consented?" options={CONSENT} defaultValue="" />
                <Field name="duration_hours" label="Hours" type="number" min={0.25} max={4} step={0.25} optional hint="Blank = service default." />
                <Field name="purpose" label="Purpose" className="sm:col-span-2" />
                <Field name="support_operator_id" label="Operator (principal ID)" optional placeholder="Blank = you" />
                <Field name="allowed_actions" label="Writes allowed" optional placeholder="Blank = read-only" className="sm:col-span-2" />
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" name="allow_bulk_export" /> Allow bulk export
                </label>
              </FieldGrid>
            </ActionForm>
          </div>
        </details>
      </Section>
    </div>
  );
}
