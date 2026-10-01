"use client";

import { useActionState } from "react";
import { PlusCircle, Send, CheckCircle2, XCircle, Pause, Play, Archive, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner, CopyableId, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import {
  createPurposeAction,
  publishPurposeVersionAction,
  createActivityAction,
  validateActivityAction,
  submitActivityAction,
  approveActivityAction,
  rejectActivityAction,
  activateActivityAction,
  suspendActivityAction,
  resumeActivityAction,
  retireActivityAction,
} from "@/app/admin/privacy/purpose-registry-actions";
import { IDLE_PURPOSE_REGISTRY_STATE } from "@/app/admin/privacy/purpose-registry-state";

const TONE: Record<"idle" | "success" | "error", BannerTone> = { idle: "neutral", success: "success", error: "error" };

function IdBanner(state: { status: string; message: string; purposeId?: string; versionId?: string; activityId?: string; activityVersionId?: string; findings?: { code: string; field: string; message: string }[] }) {
  return (
    <ResultBanner tone={TONE[state.status as "idle" | "success" | "error"]} message={state.message}>
      <div className="space-y-1.5">
        {state.purposeId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Purpose ID</span>
            <CopyableId value={state.purposeId} className="text-[11px]" />
          </div>
        )}
        {state.versionId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Purpose version ID</span>
            <CopyableId value={state.versionId} className="text-[11px]" />
          </div>
        )}
        {state.activityId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Activity ID</span>
            <CopyableId value={state.activityId} className="text-[11px]" />
          </div>
        )}
        {state.activityVersionId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 opacity-70">Activity version ID</span>
            <CopyableId value={state.activityVersionId} className="text-[11px]" />
          </div>
        )}
        {state.findings && state.findings.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {state.findings.map((f, i) => (
              <li key={i}>
                <span className="font-mono">{f.code}</span> ({f.field}): {f.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResultBanner>
  );
}

function CreatePurposeForm() {
  const [state, action, pending] = useActionState(createPurposeAction, IDLE_PURPOSE_REGISTRY_STATE);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="statement" className={LABEL}>Statement</label>
          <textarea
            id="statement"
            name="statement"
            required
            rows={2}
            placeholder="Process customer contact details to deliver purchased goods and provide post-sale support."
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="compatibility_class" className={LABEL}>Compatibility class</label>
          <input
            id="compatibility_class"
            name="compatibility_class"
            required
            placeholder="PRIMARY"
            className={FIELD}
            autoComplete="off"
          />
          <p className={HINT}>Data only — e.g. PRIMARY or SECONDARY_COMPATIBLE.</p>
        </div>
        <div>
          <label htmlFor="lawful_basis_refs" className={LABEL}>Lawful basis refs <span className="font-normal text-slate-400">(comma-separated, optional)</span></label>
          <input
            id="lawful_basis_refs"
            name="lawful_basis_refs"
            placeholder="GDPR-6-1-B, GDPR-6-1-F"
            className={FIELD}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="effective_from" className={LABEL}>Effective from <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="effective_from" name="effective_from" type="date" className={FIELD} />
        </div>
      </div>
      <Button type="submit" loading={pending} size="sm">
        {!pending && <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />}
        {pending ? "Creating…" : "Create purpose (DRAFT)"}
      </Button>
      <IdBanner {...state} />
    </form>
  );
}

function PublishPurposeForm() {
  const [state, action, pending] = useActionState(publishPurposeVersionAction, IDLE_PURPOSE_REGISTRY_STATE);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pub_purpose_id" className={LABEL}>Purpose ID</label>
          <input id="pub_purpose_id" name="purpose_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="pub_purpose_version_id" className={LABEL}>Purpose version ID</label>
          <input id="pub_purpose_version_id" name="purpose_version_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
      </div>
      <Button type="submit" loading={pending} size="sm">
        {!pending && <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        {pending ? "Publishing…" : "Publish version"}
      </Button>
      <p className={HINT}>Once PUBLISHED, this version is immutable — amending means creating a new version, never editing this one.</p>
      <IdBanner {...state} />
    </form>
  );
}

function CreateActivityForm() {
  const [state, action, pending] = useActionState(createActivityAction, IDLE_PURPOSE_REGISTRY_STATE);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="privacy_role" className={LABEL}>Privacy role</label>
          <select id="privacy_role" name="privacy_role" defaultValue="CONTROLLER" className={FIELD}>
            <option value="CONTROLLER">Controller</option>
            <option value="PROCESSOR">Processor</option>
            <option value="JOINT_CONTROLLER">Joint controller</option>
          </select>
        </div>
        <div>
          <label htmlFor="owner" className={LABEL}>Owner</label>
          <input id="owner" name="owner" required placeholder="commercial-ops-team" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="purpose_ids" className={LABEL}>Purpose IDs <span className="font-normal text-slate-400">(comma-separated)</span></label>
          <input id="purpose_ids" name="purpose_ids" placeholder="purpose-id-from-above" className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="subject_classes" className={LABEL}>Subject classes</label>
          <input id="subject_classes" name="subject_classes" placeholder="CUSTOMERS, PROSPECTS" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="data_categories" className={LABEL}>Data categories</label>
          <input id="data_categories" name="data_categories" placeholder="CONTACT_DETAILS, ORDER_HISTORY" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="jurisdictions" className={LABEL}>Jurisdictions</label>
          <input id="jurisdictions" name="jurisdictions" placeholder="UK, EU" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="sources" className={LABEL}>Sources <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="sources" name="sources" placeholder="checkout-form" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="recipients" className={LABEL}>Recipients <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="recipients" name="recipients" placeholder="fulfilment-partner" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="retention_rule_refs" className={LABEL}>Retention rule refs <span className="font-normal text-slate-400">(Gate 6)</span></label>
          <input id="retention_rule_refs" name="retention_rule_refs" required placeholder="retention-drc-standard-7y" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="transfer_refs" className={LABEL}>Transfer refs <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="transfer_refs" name="transfer_refs" placeholder="transfer-mech-eu-us-dpf" className={FIELD} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="notice_consent_dependency" className={LABEL}>Notice / consent dependency <span className="font-normal text-slate-400">(Gate 7)</span></label>
          <select id="notice_consent_dependency" name="notice_consent_dependency" defaultValue="REQUIRED" className={FIELD}>
            <option value="REQUIRED">Required</option>
            <option value="NOT_REQUIRED">Not required</option>
            <option value="CONDITIONAL">Conditional</option>
          </select>
        </div>
        <div>
          <label htmlFor="dpia_tia_status" className={LABEL}>DPIA / TIA status <span className="font-normal text-slate-400">(Gate 8)</span></label>
          <select id="dpia_tia_status" name="dpia_tia_status" defaultValue="RESOLVED" className={FIELD}>
            <option value="RESOLVED">Resolved (No block)</option>
            <option value="REVIEW_REQUIRED">Review required</option>
            <option value="NOT_REQUIRED">Not required</option>
          </select>
        </div>
      </div>
      <Button type="submit" loading={pending} size="sm">
        {!pending && <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />}
        {pending ? "Creating…" : "Create processing activity (DRAFT)"}
      </Button>
      <IdBanner {...state} />
    </form>
  );
}

function LifecycleButton({
  action,
  icon: Icon,
  label,
}: {
  action: (state: import("@/app/admin/privacy/purpose-registry-state").PurposeRegistryActionState, formData: FormData) => Promise<import("@/app/admin/privacy/purpose-registry-state").PurposeRegistryActionState>;
  icon: typeof PlusCircle;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_PURPOSE_REGISTRY_STATE);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className={LABEL}>Activity ID</label>
          <input name="activity_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL}>Activity version ID</label>
          <input name="activity_version_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <Button type="submit" loading={pending} size="sm" variant="secondary">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Button>
      </form>
      <IdBanner {...state} />
    </div>
  );
}

function RejectForm() {
  const [state, action, pending] = useActionState(rejectActivityAction, IDLE_PURPOSE_REGISTRY_STATE);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div>
          <label className={LABEL}>Activity ID</label>
          <input name="activity_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL}>Activity version ID</label>
          <input name="activity_version_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div className="flex-1">
          <label className={LABEL}>Reason</label>
          <input name="reason" required placeholder="Missing retention_rule_refs for this category" className={FIELD} autoComplete="off" />
        </div>
        <Button type="submit" loading={pending} size="sm" variant="secondary">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Reject
        </Button>
      </form>
      <IdBanner {...state} />
    </div>
  );
}

function ActivateForm() {
  const [state, action, pending] = useActionState(activateActivityAction, IDLE_PURPOSE_REGISTRY_STATE);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div>
          <label className={LABEL}>Activity ID</label>
          <input name="activity_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL}>Activity version ID</label>
          <input name="activity_version_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL}>Effective from <span className="font-normal text-slate-400">(optional)</span></label>
          <input name="effective_from" type="date" className={FIELD} />
        </div>
        <Button type="submit" loading={pending} size="sm" variant="secondary">
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          Activate
        </Button>
      </form>
      <IdBanner {...state} />
    </div>
  );
}

export function PurposeRegistryWorkbench() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Register a lawful processing purpose</h3>
        <CreatePurposeForm />
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-6 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Publish a purpose version</h3>
        <PublishPurposeForm />
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-6 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Register a processing activity</h3>
        <CreateActivityForm />
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-6 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Processing activity lifecycle
        </h3>
        <p className={HINT}>
          DRAFT → Validate → VALIDATED → Submit → SUBMITTED → Approve/Reject → APPROVED → Activate → ACTIVE →
          Suspend/Retire. Each action needs the activity ID and the activity version ID from the create step above.
        </p>
        <LifecycleButton action={validateActivityAction} icon={CheckCircle2} label="Validate" />
        <LifecycleButton action={submitActivityAction} icon={Send} label="Submit" />
        <LifecycleButton action={approveActivityAction} icon={CheckCircle2} label="Approve" />
        <RejectForm />
        <ActivateForm />
        <LifecycleButton action={suspendActivityAction} icon={Pause} label="Suspend" />
        <LifecycleButton action={resumeActivityAction} icon={Play} label="Resume" />
        <LifecycleButton action={retireActivityAction} icon={Archive} label="Retire" />
      </section>
    </div>
  );
}
