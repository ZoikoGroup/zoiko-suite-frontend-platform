"use client";

import { useState, useEffect, useActionState, useTransition } from "react";
import {
  PlusCircle,
  Send,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Archive,
  ShieldCheck,
  Search,
  Filter,
  History,
  RefreshCw,
  FileText,
  AlertTriangle,
  Info,
  Layers,
  ArrowRight,
  Shield,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui";
import { ResultBanner, CopyableId, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, HINT, CELL, HEAD } from "@/components/admin/shared/form";
import {
  createPurposeAction,
  createPurposeVersionAction,
  publishPurposeVersionAction,
  createActivityAction,
  createActivityVersionAction,
  validateActivityAction,
  submitActivityAction,
  approveActivityAction,
  rejectActivityAction,
  activateActivityAction,
  suspendActivityAction,
  resumeActivityAction,
  retireActivityAction,
  fetchActivityAuditAction,
  getPurposesList,
  getRopaList,
} from "@/app/admin/privacy/purpose-registry-actions";
import { IDLE_PURPOSE_REGISTRY_STATE, type PurposeRegistryActionState } from "@/app/admin/privacy/purpose-registry-state";
import type { PurposeVersion, ProcessingActivityVersion, ActivityLifecycleAudit } from "@/lib/api/privacy-purpose-registry";

const TONE: Record<"idle" | "success" | "error", BannerTone> = { idle: "neutral", success: "success", error: "error" };

function IdBanner(state: PurposeRegistryActionState) {
  if (state.status === "idle" && !state.message) return null;
  return (
    <ResultBanner tone={TONE[state.status]} message={state.message}>
      <div className="space-y-1.5 mt-2">
        {state.purposeId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 font-semibold opacity-80">Purpose ID:</span>
            <CopyableId value={state.purposeId} className="text-[11px]" />
          </div>
        )}
        {state.versionId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 font-semibold opacity-80">Purpose Version ID:</span>
            <CopyableId value={state.versionId} className="text-[11px]" />
          </div>
        )}
        {state.activityId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 font-semibold opacity-80">Activity ID:</span>
            <CopyableId value={state.activityId} className="text-[11px]" />
          </div>
        )}
        {state.activityVersionId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 font-semibold opacity-80">Activity Version ID:</span>
            <CopyableId value={state.activityVersionId} className="text-[11px]" />
          </div>
        )}
        {state.findings && state.findings.length > 0 && (
          <div className="mt-2 rounded bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            <div className="font-semibold mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Minimum Activation Gate Findings:
            </div>
            <ul className="list-disc space-y-0.5 pl-4">
              {state.findings.map((f, i) => (
                <li key={i}>
                  <span className="font-mono font-bold">[{f.code}]</span> <span className="underline">{f.field}</span>: {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ResultBanner>
  );
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300",
  VALIDATED: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200",
  SUBMITTED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200",
  APPROVED: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200",
  SUSPENDED: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-300",
  REJECTED: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200",
  RETIRED: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300",
  PUBLISHED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200",
};

export function PurposeRegistryWorkbench() {
  const [subTab, setSubTab] = useState<"purposes" | "activities" | "lifecycle" | "audit" | "deletion">("purposes");
  const [purposes, setPurposes] = useState<PurposeVersion[]>([]);
  const [activities, setActivities] = useState<ProcessingActivityVersion[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Search & Filter States
  const [purposeSearch, setPurposeSearch] = useState("");
  const [purposeStatusFilter, setPurposeStatusFilter] = useState("ALL");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityRoleFilter, setActivityRoleFilter] = useState("ALL");

  // Selection states
  const [selectedPurpose, setSelectedPurpose] = useState<PurposeVersion | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ProcessingActivityVersion | null>(null);

  // Publish form IDs are independent of the table selection: the purposes list
  // is published-only, so a newly created DRAFT can never be selected from it.
  // A selected row only supplies the defaults; typed/pasted IDs are what submit.
  const [publishPurposeId, setPublishPurposeId] = useState("");
  const [publishVersionId, setPublishVersionId] = useState("");
  useEffect(() => {
    if (selectedPurpose) {
      setPublishPurposeId(selectedPurpose.purpose_id);
      setPublishVersionId(selectedPurpose.purpose_version_id);
    }
  }, [selectedPurpose]);

  // Audit trail state
  const [auditActivityId, setAuditActivityId] = useState("");
  const [auditRecords, setAuditRecords] = useState<ActivityLifecycleAudit[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditMessage, setAuditMessage] = useState("");

  // Lifecycle target inputs
  const [targetActivityId, setTargetActivityId] = useState("");
  const [targetVersionId, setTargetVersionId] = useState("");

  // Form states
  const [createPurposeState, createPurposeFormAction, createPurposePending] = useActionState(createPurposeAction, IDLE_PURPOSE_REGISTRY_STATE);
  const [editPurposeState, editPurposeFormAction, editPurposePending] = useActionState(createPurposeVersionAction, IDLE_PURPOSE_REGISTRY_STATE);
  const [publishPurposeState, publishPurposeFormAction, publishPurposePending] = useActionState(publishPurposeVersionAction, IDLE_PURPOSE_REGISTRY_STATE);

  const [createActivityState, createActivityFormAction, createActivityPending] = useActionState(createActivityAction, IDLE_PURPOSE_REGISTRY_STATE);
  const [editActivityState, editActivityFormAction, editActivityPending] = useActionState(createActivityVersionAction, IDLE_PURPOSE_REGISTRY_STATE);

  const [lifecycleState, setLifecycleState] = useState<PurposeRegistryActionState>(IDLE_PURPOSE_REGISTRY_STATE);
  const [lifecyclePending, startLifecycleTransition] = useTransition();

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [purpList, actList] = await Promise.all([getPurposesList(), getRopaList()]);
      setPurposes(purpList);
      setActivities(actList);
    } catch (e) {
      console.error("Failed loading purpose registry data", e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update target fields when an activity is selected
  useEffect(() => {
    if (selectedActivity) {
      setTargetActivityId(selectedActivity.activity_id);
      setTargetVersionId(selectedActivity.activity_version_id);
      setAuditActivityId(selectedActivity.activity_id);
    }
  }, [selectedActivity]);

  // Sync latest created IDs to local lists & targets
  useEffect(() => {
    if (createPurposeState.status === "success" && createPurposeState.purposeId) {
      loadData();
    }
  }, [createPurposeState]);

  useEffect(() => {
    if (createActivityState.status === "success" && createActivityState.activityId) {
      setTargetActivityId(createActivityState.activityId);
      if (createActivityState.activityVersionId) {
        setTargetVersionId(createActivityState.activityVersionId);
      }
      setAuditActivityId(createActivityState.activityId);
      loadData();
    }
  }, [createActivityState]);

  const handleFetchAudit = async (actId: string) => {
    if (!actId) return;
    setLoadingAudit(true);
    setAuditMessage("");
    try {
      const res = await fetchActivityAuditAction(actId);
      if (res.status === "success" && res.auditRecords) {
        setAuditRecords(res.auditRecords);
        setAuditMessage(`Found ${res.auditRecords.length} audit trail event(s).`);
      } else {
        setAuditRecords([]);
        setAuditMessage(res.message);
      }
    } catch {
      setAuditMessage("Failed to query audit trail.");
    } finally {
      setLoadingAudit(false);
    }
  };

  const executeLifecycle = (actionFn: (prev: PurposeRegistryActionState, fd: FormData) => Promise<PurposeRegistryActionState>, extraFields?: Record<string, string>) => {
    startLifecycleTransition(async () => {
      const fd = new FormData();
      fd.append("activity_id", targetActivityId);
      fd.append("activity_version_id", targetVersionId);
      if (extraFields) {
        Object.entries(extraFields).forEach(([k, v]) => fd.append(k, v));
      }
      const res = await actionFn(IDLE_PURPOSE_REGISTRY_STATE, fd);
      setLifecycleState(res);
      loadData();
      if (targetActivityId) {
        handleFetchAudit(targetActivityId);
      }
    });
  };

  // Filtered purposes
  const filteredPurposes = purposes.filter((p) => {
    const matchSearch =
      !purposeSearch ||
      p.statement.toLowerCase().includes(purposeSearch.toLowerCase()) ||
      p.purpose_id.toLowerCase().includes(purposeSearch.toLowerCase()) ||
      p.compatibility_class.toLowerCase().includes(purposeSearch.toLowerCase());
    const matchStatus = purposeStatusFilter === "ALL" || p.version_status === purposeStatusFilter;
    return matchSearch && matchStatus;
  });

  // Filtered activities
  const filteredActivities = activities.filter((a) => {
    const matchSearch =
      !activitySearch ||
      a.owner.toLowerCase().includes(activitySearch.toLowerCase()) ||
      (a.privacy_owner && a.privacy_owner.toLowerCase().includes(activitySearch.toLowerCase())) ||
      a.activity_id.toLowerCase().includes(activitySearch.toLowerCase()) ||
      a.jurisdictions.some((j) => j.toLowerCase().includes(activitySearch.toLowerCase()));
    const matchRole = activityRoleFilter === "ALL" || a.privacy_role === activityRoleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-6">
      {/* ── Sub-navigation ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSubTab("purposes")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === "purposes"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>1. Purposes Registry</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] dark:bg-slate-700">
              {purposes.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab("activities")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === "activities"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>2. Processing Activities (ROPA)</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] dark:bg-slate-700">
              {activities.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab("lifecycle")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === "lifecycle"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>3. Lifecycle Runner</span>
            {targetActivityId && (
              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                (Active)
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab("audit")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === "audit"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>4. Audit Trail & History</span>
            {auditRecords.length > 0 && (
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-bold">
                {auditRecords.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab("deletion")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === "deletion"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>5. Immutability & Deletion Rule</span>
          </button>
        </div>

        <Button
          onClick={loadData}
          loading={loadingData}
          size="sm"
          variant="secondary"
          className="text-xs h-7 gap-1.5"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh Registry
        </Button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 1: PURPOSES REGISTRY
      ──────────────────────────────────────────────────────────────────────── */}
      {subTab === "purposes" && (
        <div className="space-y-6">
          {/* Explorer Table with Search & Filter */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Lawful Processing Purposes</h4>
                <p className="text-xs text-slate-500">GDPR Article 6/9 Lawful basis registry with append-only versioning</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search purposes..."
                    value={purposeSearch}
                    onChange={(e) => setPurposeSearch(e.target.value)}
                    className={`${FIELD} pl-8 text-xs py-1.5 w-48`}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={purposeStatusFilter}
                    onChange={(e) => setPurposeStatusFilter(e.target.value)}
                    className={`${FIELD} text-xs py-1.5 w-32`}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredPurposes.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-lg">
                No purposes match the filter criteria. Register a new lawful purpose below.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className={`${HEAD} text-left`}>Purpose ID / Statement</th>
                      <th className={`${HEAD} text-left`}>Compatibility</th>
                      <th className={`${HEAD} text-left`}>Lawful Basis</th>
                      <th className={`${HEAD} text-left`}>Necessity Rationale</th>
                      <th className={`${HEAD} text-left`}>Status</th>
                      <th className={`${HEAD} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPurposes.map((p) => {
                      const isSelected = selectedPurpose?.purpose_id === p.purpose_id;
                      return (
                        <tr
                          key={p.purpose_version_id}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                            isSelected ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""
                          }`}
                        >
                          <td className={CELL}>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 max-w-sm truncate" title={p.statement}>
                              {p.statement}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>ID: {p.purpose_id}</span>
                              <span>•</span>
                              <span>v: {p.purpose_version_id}</span>
                            </div>
                          </td>
                          <td className={CELL}>
                            <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {p.compatibility_class}
                            </span>
                          </td>
                          <td className={CELL}>
                            <span className="font-mono text-[11px]">
                              {p.lawful_basis_refs.join(", ") || "—"}
                            </span>
                          </td>
                          <td className={CELL}>
                            <div className="max-w-xs truncate text-slate-600 dark:text-slate-400" title={p.necessity_rationale}>
                              {p.necessity_rationale || <span className="italic text-slate-400">None (Gate 3)</span>}
                            </div>
                          </td>
                          <td className={CELL}>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                STATUS_BADGE[p.version_status] ?? ""
                              }`}
                            >
                              {p.version_status}
                            </span>
                          </td>
                          <td className={`${CELL} text-right space-x-1.5`}>
                            <Button
                              size="sm"
                              variant={isSelected ? "primary" : "secondary"}
                              className="text-[11px] h-6 px-2"
                              onClick={() => setSelectedPurpose(p)}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create & Version/Publish Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Purpose Form */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Register New Purpose (DRAFT)</h4>
              </div>

              <form action={createPurposeFormAction} className="space-y-3">
                <div>
                  <label htmlFor="statement" className={LABEL}>
                    Purpose Statement <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="statement"
                    name="statement"
                    required
                    rows={2}
                    placeholder="Process customer contact details to deliver purchased goods and provide post-sale support."
                    className={FIELD}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="compatibility_class" className={LABEL}>
                      Compatibility Class <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="compatibility_class"
                      name="compatibility_class"
                      required
                      placeholder="PRIMARY"
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label htmlFor="lawful_basis_refs" className={LABEL}>
                      Lawful Basis Refs <span className="text-slate-400">(Gate 4)</span>
                    </label>
                    <input
                      id="lawful_basis_refs"
                      name="lawful_basis_refs"
                      placeholder="GDPR-6-1-B, GDPR-6-1-F"
                      className={FIELD}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="necessity_rationale" className={LABEL}>
                      Necessity Rationale <span className="text-slate-400">(Gate 3)</span>
                    </label>
                    <input
                      id="necessity_rationale"
                      name="necessity_rationale"
                      placeholder="Required for fulfilment of contract terms"
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label htmlFor="special_condition_refs" className={LABEL}>
                      Special Condition Refs <span className="text-slate-400">(Gate 4 sensitive)</span>
                    </label>
                    <input
                      id="special_condition_refs"
                      name="special_condition_refs"
                      placeholder="GDPR-9-2-A"
                      className={FIELD}
                    />
                  </div>
                </div>

                <Button type="submit" loading={createPurposePending} size="sm" className="w-full">
                  {!createPurposePending && <PlusCircle className="h-3.5 w-3.5" />}
                  Create Purpose Version
                </Button>
                <IdBanner {...createPurposeState} />
              </form>
            </div>

            {/* Version / Edit & Publish Purpose Form */}
            <div className="space-y-6">
              {/* Publish Form */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Publish Purpose Version</h4>
                </div>
                <p className="text-xs text-slate-500">
                  Published versions are immutable. Segregation of Duties (§18) prohibits the maker from publishing their own draft.
                </p>

                <form action={publishPurposeFormAction} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Purpose ID</label>
                      <input
                        name="purpose_id"
                        required
                        value={publishPurposeId}
                        onChange={(e) => setPublishPurposeId(e.target.value)}
                        placeholder="Select or enter Purpose ID"
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Version ID</label>
                      <input
                        name="purpose_version_id"
                        required
                        value={publishVersionId}
                        onChange={(e) => setPublishVersionId(e.target.value)}
                        placeholder="Select or enter Version ID"
                        className={`${FIELD} font-mono text-xs`}
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                    <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      Publishing runs as the user you are signed in as. The maker cannot publish their own draft (§18 SoD,
                      403); an independent checker must sign in with their own account to publish.
                    </p>
                  </div>

                  <Button type="submit" loading={publishPurposePending} size="sm" variant="secondary" className="w-full">
                    {!publishPurposePending && <ShieldCheck className="h-3.5 w-3.5" />}
                    Publish Version
                  </Button>
                  <IdBanner {...publishPurposeState} />
                </form>
              </div>

              {/* Edit / New Version Form */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Create New Version (Edit Purpose)</h4>
                </div>
                <p className="text-xs text-slate-500">
                  Under PRV-020, published versions cannot be updated in-place; amending creates a succeeding version linked to the parent.
                </p>

                <form action={editPurposeFormAction} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Purpose ID</label>
                      <input
                        name="purpose_id"
                        required
                        value={selectedPurpose?.purpose_id ?? ""}
                        className={`${FIELD} font-mono text-xs`}
                        readOnly
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Parent Version ID</label>
                      <input
                        name="parent_version_id"
                        required
                        value={selectedPurpose?.purpose_version_id ?? ""}
                        className={`${FIELD} font-mono text-xs`}
                        readOnly
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL}>Amended Statement</label>
                    <textarea
                      name="statement"
                      required
                      defaultValue={selectedPurpose ? `${selectedPurpose.statement} (Amended v2)` : ""}
                      rows={2}
                      className={FIELD}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Compatibility Class</label>
                      <input
                        name="compatibility_class"
                        required
                        defaultValue={selectedPurpose?.compatibility_class ?? ""}
                        className={FIELD}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Lawful Basis Refs</label>
                      <input
                        name="lawful_basis_refs"
                        defaultValue={selectedPurpose?.lawful_basis_refs.join(", ") ?? ""}
                        className={FIELD}
                      />
                    </div>
                  </div>

                  <Button type="submit" loading={editPurposePending} size="sm" variant="secondary" className="w-full">
                    {!editPurposePending && <PlusCircle className="h-3.5 w-3.5" />}
                    Create Amended Purpose Version
                  </Button>
                  <IdBanner {...editPurposeState} />
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 2: PROCESSING ACTIVITIES (ROPA)
      ──────────────────────────────────────────────────────────────────────── */}
      {subTab === "activities" && (
        <div className="space-y-6">
          {/* Activities Explorer */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">ROPA Processing Activities</h4>
                <p className="text-xs text-slate-500">Article 30 register records of controller/processor activities</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search owner, jurisdiction..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className={`${FIELD} pl-8 text-xs py-1.5 w-44`}
                  />
                </div>

                <select
                  value={activityRoleFilter}
                  onChange={(e) => setActivityRoleFilter(e.target.value)}
                  className={`${FIELD} text-xs py-1.5 w-32`}
                >
                  <option value="ALL">All Roles</option>
                  <option value="CONTROLLER">CONTROLLER</option>
                  <option value="PROCESSOR">PROCESSOR</option>
                  <option value="JOINT_CONTROLLER">JOINT_CONTROLLER</option>
                </select>

                {/* The RoPA list endpoint (GET /privacy/ropa) returns ACTIVE versions only, so
                    a lifecycle-status filter could never match anything else. */}
                <span
                  title="GET /privacy/ropa returns ACTIVE versions in force only"
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  ACTIVE only
                </span>
              </div>
            </div>

            {filteredActivities.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-lg">
                No active ROPA records found. Fill the registration form below to create a processing activity.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className={`${HEAD} text-left`}>Activity ID / Owner</th>
                      <th className={`${HEAD} text-left`}>Role</th>
                      <th className={`${HEAD} text-left`}>Purposes</th>
                      <th className={`${HEAD} text-left`}>Data Categories</th>
                      <th className={`${HEAD} text-left`}>Jurisdictions</th>
                      <th className={`${HEAD} text-left`}>Status</th>
                      <th className={`${HEAD} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredActivities.map((a) => {
                      const isSelected = selectedActivity?.activity_id === a.activity_id;
                      return (
                        <tr
                          key={a.activity_version_id}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                            isSelected ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""
                          }`}
                        >
                          <td className={CELL}>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {a.owner}
                              {a.privacy_owner && <span className="font-normal text-slate-400"> (Privacy: {a.privacy_owner})</span>}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                              {a.activity_id} • v:{a.activity_version_id}
                            </div>
                          </td>
                          <td className={CELL}>
                            <span className="font-semibold">{a.privacy_role}</span>
                          </td>
                          <td className={CELL}>
                            <span className="font-mono text-[11px]">{a.purpose_ids.length} linked</span>
                          </td>
                          <td className={CELL}>
                            <div className="max-w-[140px] truncate" title={a.data_categories.join(", ")}>
                              {a.data_categories.join(", ") || "—"}
                            </div>
                          </td>
                          <td className={CELL}>
                            <span>{a.jurisdictions.join(", ") || "—"}</span>
                          </td>
                          <td className={CELL}>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                STATUS_BADGE[a.version_status] ?? ""
                              }`}
                            >
                              {a.version_status}
                            </span>
                          </td>
                          <td className={`${CELL} text-right space-x-1.5`}>
                            <Button
                              size="sm"
                              variant={isSelected ? "primary" : "secondary"}
                              className="text-[11px] h-6 px-2"
                              onClick={() => {
                                setSelectedActivity(a);
                                setSubTab("lifecycle");
                              }}
                            >
                              Manage Lifecycle
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create Processing Activity Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-indigo-600" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Register New Processing Activity (DRAFT)</h4>
            </div>

            <form action={createActivityFormAction} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="privacy_role" className={LABEL}>
                    Privacy Role <span className="text-rose-500">*</span>
                  </label>
                  <select id="privacy_role" name="privacy_role" defaultValue="CONTROLLER" className={FIELD}>
                    <option value="CONTROLLER">CONTROLLER</option>
                    <option value="PROCESSOR">PROCESSOR</option>
                    <option value="JOINT_CONTROLLER">JOINT_CONTROLLER</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="owner" className={LABEL}>
                    Business Owner <span className="text-rose-500">*</span> (Gate 1)
                  </label>
                  <input
                    id="owner"
                    name="owner"
                    required
                    placeholder="commercial-ops-team"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="privacy_owner" className={LABEL}>
                    Privacy Owner <span className="text-rose-500">*</span> (Gate 1)
                  </label>
                  <input
                    id="privacy_owner"
                    name="privacy_owner"
                    required
                    placeholder="privacy-officer@zoikosuite.com"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="purpose_ids" className={LABEL}>
                    Linked Purpose IDs <span className="text-rose-500">*</span> (Gate 3)
                  </label>
                  <input
                    id="purpose_ids"
                    name="purpose_ids"
                    required
                    placeholder="Comma-separated IDs"
                    defaultValue={selectedPurpose?.purpose_id ?? ""}
                    className={`${FIELD} font-mono text-xs`}
                  />
                  {selectedPurpose && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                      Pre-filled from selected purpose: {selectedPurpose.purpose_id}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="subject_classes" className={LABEL}>
                    Subject Classes <span className="text-slate-400">(Gate 5)</span>
                  </label>
                  <input
                    id="subject_classes"
                    name="subject_classes"
                    placeholder="CUSTOMERS, PROSPECTS"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="data_categories" className={LABEL}>
                    Data Categories <span className="text-slate-400">(Gate 5 Taxonomy)</span>
                  </label>
                  <input
                    id="data_categories"
                    name="data_categories"
                    placeholder="CONTACT_INFO, FINANCIAL"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="sources" className={LABEL}>
                    Sources <span className="text-slate-400">(Gate 5, PRV-019)</span>
                  </label>
                  <input
                    id="sources"
                    name="sources"
                    placeholder="web-checkout, crm-import"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="recipients" className={LABEL}>
                    Recipients <span className="text-slate-400">(Gate 5, PRV-019)</span>
                  </label>
                  <input
                    id="recipients"
                    name="recipients"
                    placeholder="payment-processor, support-vendor"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="jurisdictions" className={LABEL}>
                    Jurisdictions <span className="text-slate-400">(Gate 5 ISO Code)</span>
                  </label>
                  <input
                    id="jurisdictions"
                    name="jurisdictions"
                    placeholder="GB, US"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="retention_rule_refs" className={LABEL}>
                    Retention Rule Refs <span className="text-rose-500">*</span> (Gate 6)
                  </label>
                  <input
                    id="retention_rule_refs"
                    name="retention_rule_refs"
                    required
                    placeholder="RET-ORD-7Y"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="transfer_refs" className={LABEL}>
                    Transfer Refs <span className="text-slate-400">(Gate 6 multi-jurisdiction)</span>
                  </label>
                  <input
                    id="transfer_refs"
                    name="transfer_refs"
                    placeholder="TRANSFER-MECH-DPF"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="processor_refs" className={LABEL}>
                    Processor Refs <span className="text-slate-400">(Gate 6 for PROCESSOR)</span>
                  </label>
                  <input
                    id="processor_refs"
                    name="processor_refs"
                    placeholder="PRV-PROC-01"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="notice_consent_dependency" className={LABEL}>
                    Notice / Consent Dependency (Gate 7)
                  </label>
                  <select id="notice_consent_dependency" name="notice_consent_dependency" defaultValue="" className={FIELD}>
                    <option value="">Select…</option>
                    <option value="REQUIRED">REQUIRED</option>
                    <option value="NOT_REQUIRED">NOT_REQUIRED</option>
                    <option value="CONDITIONAL">CONDITIONAL</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="dpia_tia_status" className={LABEL}>
                    DPIA / TIA Status (Gate 8)
                  </label>
                  <select id="dpia_tia_status" name="dpia_tia_status" defaultValue="" className={FIELD}>
                    <option value="">Select…</option>
                    <option value="RESOLVED">RESOLVED (Permits Activation)</option>
                    <option value="REVIEW_REQUIRED">REVIEW_REQUIRED (Blocks)</option>
                    <option value="NOT_REQUIRED">NOT_REQUIRED</option>
                  </select>
                </div>
              </div>

              <Button type="submit" loading={createActivityPending} size="sm">
                {!createActivityPending && <PlusCircle className="h-3.5 w-3.5" />}
                Create Processing Activity
              </Button>
              <IdBanner {...createActivityState} />
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 3: LIFECYCLE RUNNER
      ──────────────────────────────────────────────────────────────────────── */}
      {subTab === "lifecycle" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Processing Activity Lifecycle Runner
                </h4>
                <p className="text-xs text-slate-500">
                  Execute Figure 4 state machine transitions: DRAFT → VALIDATED → SUBMITTED → APPROVED → ACTIVE → SUSPENDED → RETIRED
                </p>
              </div>

              {selectedActivity && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Current Status:</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      STATUS_BADGE[selectedActivity.version_status] ?? ""
                    }`}
                  >
                    {selectedActivity.version_status}
                  </span>
                </div>
              )}
            </div>

            {/* Target ID Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>
                  Target Activity ID <span className="text-rose-500">*</span>
                </label>
                <input
                  value={targetActivityId}
                  onChange={(e) => setTargetActivityId(e.target.value)}
                  placeholder="Paste Activity ID or select from Table"
                  className={`${FIELD} font-mono text-xs`}
                />
              </div>

              <div>
                <label className={LABEL}>
                  Target Version ID <span className="text-rose-500">*</span>
                </label>
                <input
                  value={targetVersionId}
                  onChange={(e) => setTargetVersionId(e.target.value)}
                  placeholder="Paste Version ID or select from Table"
                  className={`${FIELD} font-mono text-xs`}
                />
              </div>
            </div>

            {/* Maker-Checker Segregation of Duties Control */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="flex items-start gap-2.5">
                <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <div>
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Maker-checker (§18 Segregation of Duties)
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Every transition runs as the user you are signed in as. The maker of a version cannot approve or reject it (403 SOD_DENIED); an independent checker must sign in with their own account to approve or reject.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {/* Validate */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">1. Pre-flight Gate Check</div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full text-xs gap-1.5"
                  disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                  onClick={() => executeLifecycle(validateActivityAction)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                  Validate (Gates §8.2)
                </Button>
                <p className="text-[10px] text-slate-400">Verifies all 8 minimum activation gates.</p>
              </div>

              {/* Submit */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">2. Formal Submission</div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full text-xs gap-1.5"
                  disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                  onClick={() => executeLifecycle(submitActivityAction)}
                >
                  <Send className="h-3.5 w-3.5 text-amber-600" />
                  Submit for Approval
                </Button>
                <p className="text-[10px] text-slate-400">Transitions VALIDATED → SUBMITTED.</p>
              </div>

              {/* Approve */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">3. Governance Approval</div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full text-xs gap-1.5"
                  disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                  onClick={() => executeLifecycle(approveActivityAction)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                  Approve Activity
                </Button>
                <p className="text-[10px] text-slate-400">Transitions SUBMITTED → APPROVED.</p>
              </div>

              {/* Activate */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">4. Live Activation</div>
                <Button
                  size="sm"
                  className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                  onClick={() => executeLifecycle(activateActivityAction)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Activate on ROPA
                </Button>
                <p className="text-[10px] text-slate-400">Transitions APPROVED → ACTIVE.</p>
              </div>
            </div>

            {/* Post-Activation Controls (Suspend, Resume, Retire, Reject) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                size="sm"
                variant="secondary"
                className="text-xs gap-1.5"
                disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                onClick={() => executeLifecycle(suspendActivityAction)}
              >
                <Pause className="h-3.5 w-3.5 text-amber-600" />
                Suspend Activity
              </Button>

              <Button
                size="sm"
                variant="secondary"
                className="text-xs gap-1.5"
                disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                onClick={() => executeLifecycle(resumeActivityAction)}
              >
                <Play className="h-3.5 w-3.5 text-emerald-600" />
                Resume Activity
              </Button>

              <Button
                size="sm"
                variant="secondary"
                className="text-xs gap-1.5 text-rose-600 hover:text-rose-700"
                disabled={lifecyclePending || !targetActivityId || !targetVersionId}
                onClick={() => executeLifecycle(retireActivityAction)}
              >
                <Archive className="h-3.5 w-3.5 text-rose-600" />
                Retire Activity (Compliant End)
              </Button>
            </div>

            <IdBanner {...lifecycleState} />
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 4: AUDIT TRAIL & HISTORY
      ──────────────────────────────────────────────────────────────────────── */}
      {subTab === "audit" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Regulatory Audit Trail (activity_lifecycle_audit)
                </h4>
                <p className="text-xs text-slate-500">
                  Append-only immutable record of all lifecycle transitions, actors, and correlation IDs
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Activity ID"
                  value={auditActivityId}
                  onChange={(e) => setAuditActivityId(e.target.value)}
                  className={`${FIELD} text-xs py-1.5 font-mono w-64`}
                />
                <Button
                  onClick={() => handleFetchAudit(auditActivityId)}
                  loading={loadingAudit}
                  size="sm"
                  className="text-xs h-8"
                >
                  <History className="h-3.5 w-3.5" />
                  View Audit Trail
                </Button>
              </div>
            </div>

            {auditMessage && (
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {auditMessage}
              </p>
            )}

            {auditRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-lg">
                No audit events loaded. Enter an Activity ID or select one from the ROPA tab to view its regulatory history.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className={`${HEAD} text-left`}>Timestamp</th>
                      <th className={`${HEAD} text-left`}>Action</th>
                      <th className={`${HEAD} text-left`}>Transition</th>
                      <th className={`${HEAD} text-left`}>Actor Principal</th>
                      <th className={`${HEAD} text-left`}>Correlation ID</th>
                      <th className={`${HEAD} text-left`}>Details / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {auditRecords.map((evt) => (
                      <tr key={evt.audit_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className={`${CELL} text-slate-500`}>
                          {new Date(evt.recorded_at).toLocaleTimeString()} {new Date(evt.recorded_at).toLocaleDateString()}
                        </td>
                        <td className={CELL}>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{evt.action}</span>
                        </td>
                        <td className={CELL}>
                          <span className="text-slate-400">{evt.from_status ?? "—"}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{evt.to_status}</span>
                        </td>
                        <td className={`${CELL} text-[11px]`}>
                          {evt.actor_principal_id}
                        </td>
                        <td className={`${CELL} text-[11px] text-slate-500`}>
                          {evt.correlation_id}
                        </td>
                        <td className={`${CELL} text-[11px]`}>
                          {evt.reason || "Standard lifecycle transition"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 5: IMMUTABILITY & REGULATORY DELETION
      ──────────────────────────────────────────────────────────────────────── */}
      {subTab === "deletion" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400">
            <Shield className="h-5 w-5" />
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Regulatory Immutability Doctrine & Deletion Verification
            </h4>
          </div>

          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              In accordance with <strong>GDPR Article 30 (ROPA)</strong>, <strong>ISO 27701</strong>, and the ZoikoSuite Architectural Principles (§20 & §32):
            </p>

            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50 space-y-2 border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                Why hard SQL DELETE is structurally blocked:
              </div>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>PostgreSQL Triggers:</strong> The database enforces <code>reject_audit_mutation</code> on <code>activity_lifecycle_audit</code> and <code>reject_outbox_mutation</code> on <code>event_outbox</code>.
                </li>
                <li>
                  <strong>RLS Policy Absence:</strong> Neither <code>purposes</code> nor <code>processing_activities</code> tables contain a <code>DELETE</code> row-level security policy; any direct SQL <code>DELETE</code> produces a database policy violation.
                </li>
                <li>
                  <strong>Audit Permanence:</strong> Regulators require proof of what personal data was processed, under what lawful basis, and when. Destroying historical records is non-compliant.
                </li>
              </ul>
            </div>

            <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/20 space-y-2 border border-emerald-200 dark:border-emerald-800">
              <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                The Compliant Deletion Workflow (Lifecycle RETIRE):
              </div>
              <p>
                To terminate or deprecate a processing activity, the operator triggers the <strong>RETIRE</strong> transition. This updates the state to <code>RETIRED</code>, stamps <code>effective_to</code> at the server instant, records an immutable audit entry in <code>activity_lifecycle_audit</code>, and publishes a <code>privacy.activity.lifecycle.changed</code> event to Kafka outbox.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
