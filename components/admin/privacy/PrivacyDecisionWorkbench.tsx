"use client";

import { useState, useActionState, useEffect } from "react";
import {
  Scale,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ShieldCheck,
  Lock,
  History,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import { ResultBanner, CopyableId, JsonBlock } from "@/components/admin/shared";
import {
  evaluateDecisionAction,
  lookupDecisionAction,
} from "@/app/admin/privacy/decision-actions";
import { IDLE_DECISION_STATE } from "@/app/admin/privacy/decision-state";
import { getPurposesList, getRopaList } from "@/app/admin/privacy/purpose-registry-actions";
import type { PurposeVersion, ProcessingActivityVersion } from "@/lib/api/privacy-purpose-registry";

const PROPOSED_OPERATIONS = [
  { value: "USE", label: "USE (Internal processing)" },
  { value: "ACCESS", label: "ACCESS (Operator/system read)" },
  { value: "COLLECT", label: "COLLECT (Direct intake)" },
  { value: "COMBINE", label: "COMBINE (Data linkage/enrichment)" },
  { value: "INFER", label: "INFER (Analytics & predictive derived data)" },
  { value: "DISCLOSE", label: "DISCLOSE (Third-party sharing)" },
  { value: "EXPORT", label: "EXPORT (Cross-boundary transfer)" },
  { value: "TRAIN_MODEL", label: "TRAIN_MODEL (AI/ML feature extraction)" },
  { value: "PROFILE", label: "PROFILE (Automated profiling)" },
  { value: "RETAIN", label: "RETAIN (Extended storage retention)" },
  { value: "DELETE", label: "DELETE (Purge/erasure execution)" },
  { value: "ANONYMIZE", label: "ANONYMIZE (Irreversible de-identification)" },
];

export function PrivacyDecisionWorkbench() {
  const [evalState, evalAction, evalPending] = useActionState(
    evaluateDecisionAction,
    IDLE_DECISION_STATE
  );

  const [lookupState, lookupAction, lookupPending] = useActionState(
    lookupDecisionAction,
    IDLE_DECISION_STATE
  );

  // Controlled inputs. Nothing is pre-filled with a record: a subject, activity and
  // purpose must be entered, and the suggestions below come from privacy-purpose-registry-svc.
  const [subjectRef, setSubjectRef] = useState("");
  const [activityId, setActivityId] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [operation, setOperation] = useState("USE");
  const [secondaryPurposeId, setSecondaryPurposeId] = useState("");

  // Registry suggestions (published purposes, ACTIVE activities). Free entry stays
  // possible so any id, including an unknown one, can still be submitted.
  const [purposeOptions, setPurposeOptions] = useState<PurposeVersion[]>([]);
  const [activityOptions, setActivityOptions] = useState<ProcessingActivityVersion[]>([]);
  useEffect(() => {
    let live = true;
    getPurposesList()
      .then((list) => { if (live) setPurposeOptions(list); })
      .catch(() => {});
    getRopaList()
      .then((list) => { if (live) setActivityOptions(list); })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Subject context
  const [subjectClass, setSubjectClass] = useState("");
  const [ageBand, setAgeBand] = useState("ADULT");
  const [residency, setResidency] = useState("");

  // Data context
  const [dataCategory, setDataCategory] = useState("");
  const [sensitivityFlags, setSensitivityFlags] = useState("");
  const [classification, setClassification] = useState("CONFIDENTIAL");
  const [deidentRef, setDeidentRef] = useState("");

  // Dynamic verification controls
  const [checkConsent, setCheckConsent] = useState(false);
  const [checkLegalHold, setCheckLegalHold] = useState(false);
  const [recordClass, setRecordClass] = useState("");
  const [entityRef, setEntityRef] = useState("");

  // Transfer check
  const [checkTransfer, setCheckTransfer] = useState(false);
  const [transferRelId, setTransferRelId] = useState("");
  const [transferMechId, setTransferMechId] = useState("");
  const [destJurisdiction, setDestJurisdiction] = useState("");

  const getResultBadge = (result?: string) => {
    switch (result) {
      case "PERMIT":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            PERMIT
          </span>
        );
      case "RESTRICT":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <Lock className="h-3.5 w-3.5" />
            RESTRICT (Minimization Required)
          </span>
        );
      case "BLOCK":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <XCircle className="h-3.5 w-3.5" />
            BLOCK
          </span>
        );
      case "REVIEW_REQUIRED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            REVIEW_REQUIRED
          </span>
        );
      case "INDETERMINATE":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            INDETERMINATE (Fail-Closed)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Section 1: Evaluate Runtime Decision ── */}
      <Card className="border-indigo-100 shadow-sm dark:border-indigo-950/40">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                <Scale className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  PRV-03: Purpose Binding & Runtime Data-Use Decision Gate (:8153)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Evaluates proposed data operations against Article 6 purpose limitation (PRV-C01),
                  active ROPA activities (PRV-01), opt-in consent verification (PRV-02), transfer authorization (PRV-05), and retention legal holds.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <form action={evalAction} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Subject Ref */}
              <div className="sm:col-span-2">
                <label htmlFor="subject_ref" className={LABEL}>
                  Data Subject Reference <span className="text-rose-500">*</span>
                </label>
                <input
                  id="subject_ref"
                  name="subject_ref"
                  value={subjectRef}
                  onChange={(e) => setSubjectRef(e.target.value)}
                  placeholder="Subject identifier (e.g. customer ID or email)"
                  className={FIELD}
                  required
                />
                <p className={HINT}>The human data subject or principal identifier.</p>
              </div>

              {/* Proposed Operation */}
              <div className="sm:col-span-2">
                <label htmlFor="proposed_operation" className={LABEL}>
                  Proposed Operation <span className="text-rose-500">*</span>
                </label>
                <select
                  id="proposed_operation"
                  name="proposed_operation"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                  className={FIELD}
                  required
                >
                  {PROPOSED_OPERATIONS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <p className={HINT}>Canonical data operation from ZS-SVC-W-001 §12.</p>
              </div>

              {/* Processing Activity ID */}
              <div className="sm:col-span-2">
                <label htmlFor="processing_activity_id" className={LABEL}>
                  Processing Activity ID (PRV-01 ROPA) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="processing_activity_id"
                  name="processing_activity_id"
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                  placeholder="Processing activity UUID"
                  className={`${FIELD} font-mono text-xs`}
                  list="registry-activities"
                  required
                />
                <datalist id="registry-activities">
                  {activityOptions.map((a) => (
                    <option key={a.activity_version_id} value={a.activity_id}>
                      {a.owner} ({a.purpose_ids.map((id) => id.slice(0, 8)).join(", ")})
                    </option>
                  ))}
                </datalist>
                <p className={HINT}>Must resolve to an ACTIVE version in PRV-01.</p>
              </div>

              {/* Proposed Purpose ID */}
              <div className="sm:col-span-2">
                <label htmlFor="purpose_id" className={LABEL}>
                  Proposed Purpose ID (PRV-01 Purpose Registry) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="purpose_id"
                  name="purpose_id"
                  value={purposeId}
                  onChange={(e) => setPurposeId(e.target.value)}
                  placeholder="Purpose UUID"
                  className={`${FIELD} font-mono text-xs`}
                  list="registry-purposes"
                  required
                />
                <datalist id="registry-purposes">
                  {purposeOptions.map((p) => (
                    <option key={p.purpose_version_id} value={p.purpose_id}>
                      {p.statement.length > 70 ? `${p.statement.slice(0, 70)}…` : p.statement}
                    </option>
                  ))}
                </datalist>
                <p className={HINT}>Must resolve to PUBLISHED and be bound to the activity (PRV-C01).</p>
              </div>

              {/* Secondary Purpose ID */}
              <div className="sm:col-span-2">
                <label htmlFor="secondary_purpose_id" className={LABEL}>
                  Secondary Purpose ID <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="secondary_purpose_id"
                  name="secondary_purpose_id"
                  value={secondaryPurposeId}
                  onChange={(e) => setSecondaryPurposeId(e.target.value)}
                  placeholder="Secondary purpose UUID"
                  className={`${FIELD} font-mono text-xs`}
                />
                <p className={HINT}>A proposed re-use of this data under a different purpose (§12.1).</p>
              </div>
            </div>

            {/* §12.1 Extended Input Dimensions Accordion / Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Subject Context */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block border-b pb-2 dark:border-slate-800">
                  Subject Context (§12.1)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="subject_class" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Class
                    </label>
                    <input
                      id="subject_class"
                      name="subject_class"
                      value={subjectClass}
                      onChange={(e) => setSubjectClass(e.target.value)}
                      placeholder="As registered on the activity"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="age_band" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Age Band
                    </label>
                    <select
                      id="age_band"
                      name="age_band"
                      value={ageBand}
                      onChange={(e) => setAgeBand(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="ADULT">ADULT</option>
                      <option value="MINOR">MINOR (Restricted)</option>
                      <option value="SENIOR">SENIOR</option>
                      <option value="UNKNOWN">UNKNOWN</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="residency" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Jurisdiction
                    </label>
                    <input
                      id="residency"
                      name="residency"
                      value={residency}
                      onChange={(e) => setResidency(e.target.value)}
                      placeholder="ISO country code"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Data Context */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block border-b pb-2 dark:border-slate-800">
                  Data Context (§12.1)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label htmlFor="data_category" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Category
                    </label>
                    <input
                      id="data_category"
                      name="data_category"
                      value={dataCategory}
                      onChange={(e) => setDataCategory(e.target.value)}
                      placeholder="As registered on the activity"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="sensitivity_flags" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Sensitivity Flags
                    </label>
                    <input
                      id="sensitivity_flags"
                      name="sensitivity_flags"
                      value={sensitivityFlags}
                      onChange={(e) => setSensitivityFlags(e.target.value)}
                      placeholder="e.g. SENSITIVE,HEALTH"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="classification" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Classification
                    </label>
                    <select
                      id="classification"
                      name="classification"
                      value={classification}
                      onChange={(e) => setClassification(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                      <option value="RESTRICTED">RESTRICTED</option>
                      <option value="PUBLIC">PUBLIC</option>
                      <option value="ANONYMOUS">ANONYMOUS</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="deidentification_control_ref" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      De-identification Control Ref
                    </label>
                    <input
                      id="deidentification_control_ref"
                      name="deidentification_control_ref"
                      value={deidentRef}
                      onChange={(e) => setDeidentRef(e.target.value)}
                      placeholder="Required if Classification = ANONYMOUS"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Opt-in Checks Container */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-indigo-500" />
                  Dynamic Verification Controls & Integrations
                </span>
                <span className="text-[11px] text-slate-500 italic">
                  PRV-03 coordinates PRV-02 consent, PRV-05 transfer, and retention holds
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Consent Opt-in */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="check_consent"
                    name="check_consent"
                    value="true"
                    checked={checkConsent}
                    onChange={(e) => setCheckConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <label htmlFor="check_consent" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      Subject Consent (PRV-02 :8152)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Resolves status in privacy-consent-svc.
                    </p>
                  </div>
                </div>

                {/* Legal Hold Opt-in */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="check_legal_hold"
                    name="check_legal_hold"
                    value="true"
                    checked={checkLegalHold}
                    onChange={(e) => setCheckLegalHold(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 space-y-1">
                    <label htmlFor="check_legal_hold" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      Legal Hold (DRC :8148)
                    </label>
                    {checkLegalHold && (
                      <div className="space-y-1">
                        <input
                          id="legal_hold_record_class"
                          name="legal_hold_record_class"
                          value={recordClass}
                          onChange={(e) => setRecordClass(e.target.value)}
                          placeholder="Record Class"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                        />
                        <input
                          id="legal_hold_entity_ref"
                          name="legal_hold_entity_ref"
                          value={entityRef}
                          onChange={(e) => setEntityRef(e.target.value)}
                          placeholder="Entity Ref (optional)"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Transfer Check Opt-in */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="check_transfer"
                    name="check_transfer"
                    value="true"
                    checked={checkTransfer}
                    onChange={(e) => setCheckTransfer(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 space-y-1">
                    <label htmlFor="check_transfer" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      Transfer State (PRV-05 :8155)
                    </label>
                    {checkTransfer && (
                      <div className="space-y-1">
                        <input
                          id="transfer_relationship_id"
                          name="transfer_relationship_id"
                          value={transferRelId}
                          onChange={(e) => setTransferRelId(e.target.value)}
                          placeholder="Relationship ID"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                        />
                        <input
                          id="transfer_mechanism_id"
                          name="transfer_mechanism_id"
                          value={transferMechId}
                          onChange={(e) => setTransferMechId(e.target.value)}
                          placeholder="Mechanism ID"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                        />
                        <input
                          id="destination_jurisdiction"
                          name="destination_jurisdiction"
                          value={destJurisdiction}
                          onChange={(e) => setDestJurisdiction(e.target.value)}
                          placeholder="Destination Jurisdiction (e.g. US)"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={evalPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow transition-all flex items-center gap-2"
              >
                {evalPending ? "Evaluating Invariants..." : "Evaluate Decision (POST :8153)"}
              </Button>
            </div>
          </form>

          {/* Result Banner & Evidence Breakdown */}
          {evalState.status !== "idle" && (
            <div className="space-y-4 pt-2">
              <ResultBanner
                tone={
                  evalState.status === "success"
                    ? evalState.decision?.result === "PERMIT"
                      ? "success"
                      : evalState.decision?.result === "RESTRICT"
                      ? "neutral"
                      : "error"
                    : "error"
                }
                message={evalState.message || ""}
              />

              {evalState.decision && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      {getResultBadge(evalState.decision.result)}
                      <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
                        Operation: {evalState.decision.proposed_operation}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Decision ID:</span>
                      <CopyableId value={evalState.decision.decision_id} className="text-xs font-mono font-bold" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                      <span className="text-[11px] text-slate-500 block mb-1">Subject Reference</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 break-all">
                        {evalState.decision.subject_ref}
                      </span>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                      <span className="text-[11px] text-slate-500 block mb-1">Input Fingerprint (§13.2)</span>
                      <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all">
                        {evalState.decision.input_fingerprint || "Computed at evaluation"}
                      </span>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                      <span className="text-[11px] text-slate-500 block mb-1">Notice Version Reference</span>
                      <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                        {evalState.decision.notice_version_id || "N/A (No consent dependency)"}
                      </span>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                      <span className="text-[11px] text-slate-500 block mb-1">Decided At (Audit Timestamp)</span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {new Date(evalState.decision.decided_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Machine-enforceable constraints for RESTRICT (§13.1 Rule 7) */}
                  {evalState.decision.constraints && evalState.decision.constraints.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20 space-y-2">
                      <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                        <Lock className="h-4 w-4 text-blue-600" />
                        Machine-Enforceable Output Constraints (§13.1 Rule 7):
                      </span>
                      <div className="space-y-1.5">
                        {evalState.decision.constraints.map((constraint, idx) => (
                          <div key={idx} className="rounded bg-white/80 p-2 text-xs border border-blue-100 dark:bg-slate-800 dark:border-blue-900">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {constraint.type}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 font-medium">
                                {constraint.description}
                              </span>
                            </div>
                            {constraint.parameters && (
                              <pre className="mt-1 text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-50 p-1.5 rounded dark:bg-slate-900">
                                {JSON.stringify(constraint.parameters, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {evalState.decision.reason_codes && evalState.decision.reason_codes.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 block mb-1.5">
                        Enforcement Reason Codes (§32):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {evalState.decision.reason_codes.map((code, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-right">
                    <span className="text-[11px] text-slate-400">
                      Actor Principal: {evalState.decision.actor_principal_id} | Correlation ID: {evalState.decision.correlation_id || "None"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Look Up Stored Decision Evidence ── */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <History className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Decision Durability Evidence Lookup (GET /privacy/decisions)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Retrieve permanent, immutable decision evidence from PostgreSQL storage (§13.2 &ldquo;decision durability&rdquo;).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={lookupAction} className="flex gap-3">
            <input
              id="decision_id"
              name="decision_id"
              placeholder="Enter decision UUID (e.g. copied from evaluation above)"
              className={`${FIELD} flex-1 font-mono text-xs`}
              required
            />
            <Button
              type="submit"
              disabled={lookupPending}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-4 py-2 rounded-lg shrink-0 flex items-center gap-1.5"
            >
              <Search className="h-3.5 w-3.5" />
              {lookupPending ? "Fetching..." : "Look up"}
            </Button>
          </form>

          {lookupState.status !== "idle" && (
            <div className="space-y-3">
              <ResultBanner
                tone={lookupState.status === "success" ? "success" : "error"}
                message={lookupState.message || ""}
              />
              {lookupState.decision && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600">Stored Decision:</span>
                    {getResultBadge(lookupState.decision.result)}
                  </div>
                  <JsonBlock value={lookupState.decision} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
