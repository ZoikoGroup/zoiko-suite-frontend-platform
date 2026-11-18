"use client";

// The drawer's governed commands (GOV-05 lifecycle, V-001 PDC-05 certification,
// doc7 §E6 attestations, evidence re-drive, family retirement). Each is a small
// form posting to a Server Action in app/admin/policies/actions.ts; the
// version's row_version rides along so a command never lands on a version
// someone else has moved since the page was read. policy-svc decides every
// refusal (maker–checker, permissions, certification); the forms only explain.

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { ResultBanner, type BannerTone } from "@/components/admin/shared/ResultBanner";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  submitAttestation,
  submitAttestationRevocation,
  submitEvidenceRedelivery,
  submitFamilyRetirement,
  submitTestCase,
  submitTestRun,
  submitVersionCommand,
  submitWaiverApproval,
  submitWaiverRequest,
} from "@/app/admin/policies/actions";
import { IDLE_COMMAND, type CommandState } from "@/app/admin/policies/state";

type Action = (previous: CommandState, formData: FormData) => Promise<CommandState>;

const TONE: Record<CommandState["status"], BannerTone> = {
  idle: "neutral",
  done: "success",
  unchanged: "neutral",
  refused: "warning",
  stale: "warning",
  conflict: "warning",
  error: "error",
};

const SUMMARY =
  "inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [&::-webkit-details-marker]:hidden";

function Hidden({ values }: { values: Record<string, string | number | undefined> }) {
  return (
    <>
      {Object.entries(values).map(([k, v]) => (v === undefined ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
    </>
  );
}

/**
 * One command: hidden values, optional fields, one button, its own result.
 * With `fields`, the command opens as a disclosure so the drawer stays short.
 */
function Command({
  action,
  hidden,
  label,
  pendingLabel,
  primary,
  fields,
  hint,
  testId,
}: {
  action: Action;
  hidden: Record<string, string | number | undefined>;
  label: string;
  pendingLabel: string;
  primary?: boolean;
  fields?: ReactNode;
  hint?: string;
  testId: string;
}) {
  const [state, run, pending] = useActionState<CommandState, FormData>(action, IDLE_COMMAND);
  const form = (
    <form action={run} className="space-y-2" data-testid={testId}>
      <Hidden values={hidden} />
      {fields}
      <Button type="submit" size="sm" variant={primary ? "accent" : "secondary"} loading={pending} className={fields ? "w-full" : undefined}>
        {pending ? pendingLabel : label}
      </Button>
      {hint && <p className={HINT}>{hint}</p>}
      <ResultBanner tone={TONE[state.status]} message={state.message} testId={`${testId}-result`} />
    </form>
  );
  if (!fields) return form;
  return (
    <details className="group w-full">
      <summary className={SUMMARY}>{label}…</summary>
      <div className="mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">{form}</div>
    </details>
  );
}

function ReasonFields({ id, codes, outcome }: { id: string; codes: [string, string][]; outcome?: boolean }) {
  return (
    <>
      {outcome && (
        <div>
          <label htmlFor={`${id}-outcome`} className={LABEL}>Outcome</label>
          <select id={`${id}-outcome`} name="outcome" defaultValue="UPHELD" className={FIELD}>
            <option value="UPHELD">Upheld — the suspension stands</option>
            <option value="OVERTURNED">Overturned — the suspension was not justified</option>
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`${id}-code`} className={LABEL}>Reason</label>
        <select id={`${id}-code`} name="reason_code" required defaultValue={codes[0][0]} className={FIELD}>
          {codes.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-text`} className={LABEL}>Details <span className={OPTIONAL}>(optional)</span></label>
        <textarea id={`${id}-text`} name="reason" rows={2} maxLength={1500} className={FIELD} />
      </div>
    </>
  );
}

const SUSPEND_REASONS: [string, string][] = [
  ["CONTROL_FAILURE", "A control around it failed"],
  ["RULE_ERROR", "The rule is wrong"],
  ["LEGAL_CHANGE", "The law or regulation changed"],
  ["SECURITY_INCIDENT", "Security incident"],
  ["OTHER", "Other (explain below)"],
];
const RETIRE_REASONS: [string, string][] = [
  ["NO_LONGER_REQUIRED", "No longer required"],
  ["REPLACED", "Replaced by another rule"],
  ["LEGAL_CHANGE", "The law or regulation changed"],
  ["OTHER", "Other (explain below)"],
];
const REVIEW_REASONS: [string, string][] = [
  ["INDEPENDENT_REVIEW", "Independent review completed"],
  ["OTHER", "Other (explain below)"],
];

export type VersionFacts = {
  policyId: string;
  versionId: string;
  versionNumber?: number;
  status: string;
  rowVersion: number;
  effectiveFrom: string;
  author: string;
  suspender?: string;
  /** effective_from is after the page's read time: activation schedules. */
  future: boolean;
};

/**
 * The lifecycle commands a version's status allows (GOV-05). The author and
 * the suspender still see the checker's command: policy-svc refuses them and
 * the refusal is shown, which is the control working in plain sight.
 */
export function VersionCommands({ v, viewer, certifiable }: { v: VersionFacts; viewer: string; certifiable: boolean }) {
  const base = { policy_id: v.policyId, version_id: v.versionId, expected_version: v.rowVersion };
  const id = `v${v.versionNumber ?? v.versionId.slice(0, 8)}`;
  const future = v.future;
  const mine = viewer === v.author;
  const items: ReactNode[] = [];

  if (v.status === "DRAFT") {
    items.push(
      <Command key="submit" testId={`${id}-submit-review`} action={submitVersionCommand} hidden={{ ...base, command: "submit-review" }} label="Submit for review" pendingLabel="Submitting…" primary
        hint={certifiable ? "Run the test suite first: the version must be certified before it can go into force." : undefined} />,
    );
  }
  if (v.status === "REVIEW") {
    items.push(
      <Command key="approve" testId={`${id}-approve`} action={submitVersionCommand} hidden={{ ...base, command: "approve" }} label="Approve" pendingLabel="Approving…" primary
        hint={mine ? "You drafted this version: a different person must approve it." : undefined}
        fields={
          <div>
            <label htmlFor={`${id}-apref`} className={LABEL}>Approval reference <span className={OPTIONAL}>(optional: ticket, minute, workflow)</span></label>
            <input id={`${id}-apref`} name="approval_reference" maxLength={256} className={FIELD} autoComplete="off" />
          </div>
        } />,
    );
  }
  if (v.status === "APPROVED") {
    items.push(
      <Command key="activate" testId={`${id}-activate`} action={submitVersionCommand} hidden={{ ...base, command: "activate" }}
        label={future ? "Activate (schedules)" : "Activate"} pendingLabel="Activating…" primary
        hint={mine ? "You drafted this version: a different person must bring it into force." : future ? `Takes over on ${v.effectiveFrom.slice(0, 10)}.` : undefined} />,
    );
    if (future) {
      items.push(<Command key="schedule" testId={`${id}-schedule`} action={submitVersionCommand} hidden={{ ...base, command: "schedule" }} label="Schedule" pendingLabel="Scheduling…" />);
    }
  }
  if (v.status === "ACTIVE" || v.status === "SCHEDULED") {
    items.push(
      <Command key="suspend" testId={`${id}-suspend`} action={submitVersionCommand} hidden={{ ...base, command: "suspend" }} label="Suspend" pendingLabel="Suspending…"
        hint="Emergency stop: the version decides nothing until reviewed, and its predecessor does not come back."
        fields={<ReasonFields id={`${id}-sus`} codes={SUSPEND_REASONS} />} />,
    );
  }
  if (v.status === "SUSPENDED") {
    items.push(
      <Command key="review" testId={`${id}-review-suspension`} action={submitVersionCommand} hidden={{ ...base, command: "review-suspension" }} label="Review suspension" pendingLabel="Recording…" primary
        hint={viewer === v.suspender ? "You suspended this version: a different approver must review it." : undefined}
        fields={<ReasonFields id={`${id}-rev`} codes={REVIEW_REASONS} outcome />} />,
    );
  }
  if (["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "ACTIVE", "SUSPENDED"].includes(v.status)) {
    items.push(
      <Command key="retire" testId={`${id}-retire`} action={submitVersionCommand} hidden={{ ...base, command: "retire" }} label="Retire" pendingLabel="Retiring…"
        fields={<ReasonFields id={`${id}-ret`} codes={RETIRE_REASONS} />} />,
    );
  }
  if (!items.length) return null;
  return <div className="mt-2 flex flex-wrap items-start gap-2">{items}</div>;
}

export function RunSuiteForm({ versionId, versionNumber }: { versionId: string; versionNumber?: number }) {
  return (
    <Command testId={`v${versionNumber ?? versionId.slice(0, 8)}-run-suite`} action={submitTestRun} hidden={{ version_id: versionId }} label="Run test suite" pendingLabel="Running…" />
  );
}

export function WaiverRequestForm({
  versionId,
  testCaseId,
  testCode,
  defaultExpiry,
}: {
  versionId: string;
  testCaseId: string;
  testCode: string;
  /** YYYY-MM-DD, worked out by the server from its read time. */
  defaultExpiry: string;
}) {
  const id = `wv-${testCaseId.slice(0, 8)}-${versionId.slice(0, 8)}`;
  return (
    <Command testId={id} action={submitWaiverRequest} hidden={{ version_id: versionId, test_case_id: testCaseId }} label={`Request waiver for ${testCode}`} pendingLabel="Requesting…"
      fields={
        <>
          <div>
            <label htmlFor={`${id}-code`} className={LABEL}>Reason</label>
            <select id={`${id}-code`} name="reason_code" defaultValue="ACCEPTED_RISK" className={FIELD}>
              <option value="ACCEPTED_RISK">Risk accepted for a bounded period</option>
              <option value="TEST_DEFECT">The test case itself is wrong</option>
              <option value="KNOWN_LIMITATION">Known limitation, fix scheduled</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-just`} className={LABEL}>Justification</label>
            <textarea id={`${id}-just`} name="justification" required rows={2} maxLength={4000} className={FIELD} />
          </div>
          <div>
            <label htmlFor={`${id}-exp`} className={LABEL}>Expires on</label>
            <input id={`${id}-exp`} type="date" name="expires_at" required defaultValue={defaultExpiry} className={FIELD} />
          </div>
        </>
      } />
  );
}

export function WaiverApproveForm({ waiverId }: { waiverId: string }) {
  return <Command testId={`waiver-${waiverId.slice(0, 8)}-approve`} action={submitWaiverApproval} hidden={{ waiver_id: waiverId }} label="Approve waiver" pendingLabel="Approving…" />;
}

/** Add a case to the family's suite: an amount and the outcome the rule must give it. */
export function TestCaseForm({ policyId }: { policyId: string }) {
  return (
    <Command testId="add-test-case" action={submitTestCase} hidden={{ policy_id: policyId }} label="Add test case" pendingLabel="Adding…"
      fields={
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="tc_code" className={LABEL}>Test code</label>
            <input id="tc_code" name="test_code" required maxLength={128} className={FIELD} autoComplete="off" placeholder="TC-ABOVE-LIMIT" />
          </div>
          <div>
            <label htmlFor="tc_layer" className={LABEL}>Layer</label>
            <select id="tc_layer" name="layer" defaultValue="BOUNDARY" className={FIELD}>
              <option value="UNIT">Unit</option>
              <option value="BOUNDARY">Boundary</option>
              <option value="REGRESSION">Regression</option>
            </select>
          </div>
          <div>
            <label htmlFor="tc_amount" className={LABEL}>Amount</label>
            <input id="tc_amount" name="amount" type="number" step="any" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="tc_currency" className={LABEL}>Currency <span className={OPTIONAL}>(if the rule names one)</span></label>
            <input id="tc_currency" name="currency" maxLength={3} className={FIELD} autoComplete="off" placeholder="GBP" />
          </div>
          <div className="col-span-2">
            <label htmlFor="tc_expected" className={LABEL}>Expected result</label>
            <select id="tc_expected" name="expected_result" defaultValue="APPROVAL_REQUIRED" className={FIELD}>
              <option value="APPROVAL_REQUIRED">Approval required</option>
              <option value="WITHIN_THRESHOLD">Within threshold</option>
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="tc_desc" className={LABEL}>Description</label>
            <input id="tc_desc" name="description" required maxLength={500} className={FIELD} autoComplete="off" />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
            <input type="checkbox" name="mandatory" defaultChecked className="h-3.5 w-3.5" /> Mandatory (a failure blocks activation unless waived)
          </label>
        </div>
      } />
  );
}

export function AttestationForm({ subjectRef, today }: { subjectRef: string; today: string }) {
  return (
    <Command testId="sign-attestation" action={submitAttestation} hidden={{ subject_ref: subjectRef }} label="Sign attestation" pendingLabel="Signing…"
      fields={
        <>
          <div>
            <label htmlFor="at_statement" className={LABEL}>Statement</label>
            <textarea id="at_statement" name="statement" required rows={2} maxLength={4000} className={FIELD}
              placeholder={`${subjectRef} operated as designed for the period.`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="at_version" className={LABEL}>Statement version</label>
              <input id="at_version" name="statement_version" required maxLength={64} className={FIELD} autoComplete="off" placeholder="2026-Q4" />
            </div>
            <div>
              <label htmlFor="at_role" className={LABEL}>Your role</label>
              <input id="at_role" name="signer_role" required maxLength={128} className={FIELD} autoComplete="off" placeholder="Control owner" />
            </div>
            <div>
              <label htmlFor="at_from" className={LABEL}>Period from</label>
              <input id="at_from" type="date" name="period_start" required className={FIELD} />
            </div>
            <div>
              <label htmlFor="at_to" className={LABEL}>Period to</label>
              <input id="at_to" type="date" name="period_end" required defaultValue={today} className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="at_evidence" className={LABEL}>Evidence references <span className={OPTIONAL}>(one per line)</span></label>
            <textarea id="at_evidence" name="evidence_refs" rows={2} className={FIELD} />
          </div>
        </>
      }
      hint="Signed in your name; it can be revoked, never edited." />
  );
}

export function RevokeAttestationForm({ attestationId }: { attestationId: string }) {
  const id = `revoke-${attestationId.slice(0, 8)}`;
  return (
    <Command testId={id} action={submitAttestationRevocation} hidden={{ attestation_id: attestationId }} label="Revoke" pendingLabel="Revoking…"
      fields={
        <div>
          <label htmlFor={`${id}-reason`} className={LABEL}>Why it is revoked</label>
          <textarea id={`${id}-reason`} name="reason" required rows={2} maxLength={2000} className={FIELD} />
        </div>
      } />
  );
}

export function RedeliverForm({ evidenceId }: { evidenceId: string }) {
  return <Command testId={`redeliver-${evidenceId.slice(0, 8)}`} action={submitEvidenceRedelivery} hidden={{ evidence_id: evidenceId }} label="Re-deliver" pendingLabel="Queuing…" />;
}

export function RetireFamilyForm({ policyId }: { policyId: string }) {
  return (
    <Command testId="retire-policy" action={submitFamilyRetirement} hidden={{ policy_id: policyId }} label="Retire policy" pendingLabel="Retiring…"
      hint="Final: no version can be drafted under it afterwards. Refused while a version is in force or scheduled."
      fields={<ReasonFields id="fam-ret" codes={RETIRE_REASONS} />} />
  );
}
