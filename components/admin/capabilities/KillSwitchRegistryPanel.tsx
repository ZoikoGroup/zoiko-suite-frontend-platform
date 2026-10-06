"use client";

import { useState, useActionState } from "react";
import {
  Power,
  PowerOff,
  CheckCircle2,
  AlertTriangle,
  Search,
  History,
  Radio,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared";
import {
  engageKillSwitchAction,
  disengageKillSwitchAction,
  resolveKillSwitchAction,
  listKillSwitchHistoryAction,
  type KillSwitchActionState,
} from "@/app/admin/capabilities/kill-switch-actions";

const IDLE: KillSwitchActionState = { status: "idle" };

export function KillSwitchRegistryPanel({ initialPrincipalId }: { initialPrincipalId: string }) {
  const [activeSubtab, setActiveSubtab] = useState<"engage" | "disengage" | "resolve" | "history">("engage");

  // Server action states
  const [engageState, engageSubmit, engagePending] = useActionState(engageKillSwitchAction, IDLE);
  const [disengageState, disengageSubmit, disengagePending] = useActionState(disengageKillSwitchAction, IDLE);
  const [resolveState, resolveSubmit, resolvePending] = useActionState(resolveKillSwitchAction, IDLE);
  const [historyState, historySubmit, historyPending] = useActionState(listKillSwitchHistoryAction, IDLE);

  // Form input states for shared convenience
  const [plane, setPlane] = useState("PLANE_5_AI_AGENTS");
  const [domain, setDomain] = useState("AI_AUTOMATION");
  const [providerCode, setProviderCode] = useState("OPENAI");
  const [tenantScoped, setTenantScoped] = useState(false);

  return (
    <Card className="border-rose-200 shadow-sm dark:border-rose-950/40">
      <CardHeader className="border-b border-rose-100 bg-rose-50/50 dark:border-rose-900/30 dark:bg-rose-950/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              <PowerOff className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Operational Kill-Switch Registry (:8147)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Cross-cutting incident response control (doc7 §32.1): Plane/Domain/Provider/Tenant-scoped append-only emergency stops.
              </CardDescription>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 font-mono text-[11px] font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
            <Radio className="h-3 w-3 animate-pulse text-rose-600" />
            kill-switch-registry-svc :8147
          </span>
        </div>

        {/* Action Tabs */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-rose-100/60 pt-3 dark:border-rose-900/20">
          <button
            type="button"
            onClick={() => setActiveSubtab("engage")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSubtab === "engage"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-rose-50 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            <PowerOff className="h-3.5 w-3.5" />
            1. Engage Kill Switch
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab("disengage")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSubtab === "disengage"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-emerald-50 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            2. Disengage Kill Switch
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab("resolve")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSubtab === "resolve"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-blue-50 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            3. Resolve Scope Check
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab("history")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSubtab === "history"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-indigo-50 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            4. Audit History
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* ── Subtab 1: Engage Kill Switch ───────────────────────────────── */}
        {activeSubtab === "engage" && (
          <form action={engageSubmit} className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Emergency Incident Safety Stop (Privileged & Logged):
              </p>
              <p className="mt-1 text-[11px] leading-relaxed">
                Engaging a kill switch immediately halts all automated executions or upstream integrations matching this scope. Requires an audit reason and a designated reconciliation restart runbook reference. Committed records are preserved.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL}>Plane Scope</label>
                <select
                  name="plane"
                  value={plane}
                  onChange={(e) => setPlane(e.target.value)}
                  className={FIELD}
                >
                  <option value="PLANE_5_AI_AGENTS">PLANE_5_AI_AGENTS (AI & Automation)</option>
                  <option value="PLANE_1_FOUNDATIONAL">PLANE_1_FOUNDATIONAL (Core Infrastructure)</option>
                  <option value="PLANE_3_COMMERCIAL">PLANE_3_COMMERCIAL (Finance & Procurement)</option>
                  <option value="">(None / Cross-Plane Stop)</option>
                </select>
                <p className={HINT}>Architectural plane tier</p>
              </div>

              <div>
                <label className={LABEL}>Domain Scope</label>
                <select
                  name="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={FIELD}
                >
                  <option value="AI_AUTOMATION">AI_AUTOMATION (AI Governance Engine)</option>
                  <option value="PAYMENTS">PAYMENTS (Payment Processing)</option>
                  <option value="COMMERCIAL_OPS">COMMERCIAL_OPS (Procurement & Orders)</option>
                  <option value="TAX_AUTHORITY">TAX_AUTHORITY (E-Filing Interfaces)</option>
                  <option value="">(None / Cross-Domain Stop)</option>
                </select>
                <p className={HINT}>Business domain dimension</p>
              </div>

              <div>
                <label className={LABEL}>Provider Code (Optional)</label>
                <input
                  name="provider_code"
                  value={providerCode}
                  onChange={(e) => setProviderCode(e.target.value)}
                  placeholder="e.g. OPENAI, STRIPE, PLAID"
                  className={`${FIELD} uppercase font-mono`}
                />
                <p className={HINT}>Leave empty for all providers</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="tenant_scoped_engage"
                name="tenant_scoped"
                value="true"
                checked={tenantScoped}
                onChange={(e) => setTenantScoped(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <label htmlFor="tenant_scoped_engage" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Scope to current Tenant only (Leave unchecked for platform-wide stop)
              </label>
            </div>

            <div>
              <label className={LABEL}>
                Audit Reason / Incident Trigger (<span className="text-rose-500">*</span>)
              </label>
              <input
                name="reason"
                required
                defaultValue="Critical safety breach: anomalous model hallucinations detected in production automation agent."
                placeholder="Describe reason for emergency halt"
                className={FIELD}
              />
              <p className={HINT}>Mandatory incident reason logged to audit trail</p>
            </div>

            <div>
              <label className={LABEL}>
                Reconciliation Procedure Runbook Ref (<span className="text-rose-500">*</span>)
              </label>
              <input
                name="reconciliation_procedure_ref"
                required
                defaultValue="runbook://incident-response/IR-2026-AI-KILLSWITCH-PROCEDURE"
                placeholder="e.g. runbook://incident-response/IR-2026-09"
                className={`${FIELD} font-mono text-xs`}
              />
              <p className={HINT}>Reference to disaster recovery and data reconciliation procedure</p>
            </div>

            <div>
              <label className={LABEL}>
                Approved By Principal ID (<span className="text-rose-500">*</span>)
              </label>
              <input
                name="approved_by_principal_id"
                required
                defaultValue={initialPrincipalId}
                className={`${FIELD} font-mono text-xs bg-slate-50 dark:bg-slate-800`}
              />
              <p className={HINT}>Senior operator principal authorising emergency halt</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                loading={engagePending}
                size="sm"
                className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700"
              >
                <PowerOff className="mr-1.5 h-4 w-4" />
                {engagePending ? "Engaging…" : "Engage Emergency Kill Switch"}
              </Button>
            </div>

            {engageState.status === "success" && (
              <div className={`rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{engageState.message}</span>
                </div>
                {engageState.event && (
                  <div className="mt-2 space-y-1 text-xs font-mono text-slate-700 dark:text-slate-300">
                    <div><span className="text-slate-400">Event ID:</span> {engageState.event.kill_switch_event_id}</div>
                    <div><span className="text-slate-400">Action:</span> <span className="font-bold text-rose-600">{engageState.event.action}</span></div>
                    <div><span className="text-slate-400">Runbook Ref:</span> {engageState.event.reconciliation_procedure_ref}</div>
                    <div><span className="text-slate-400">Created At:</span> {engageState.event.created_at}</div>
                  </div>
                )}
              </div>
            )}

            {engageState.status === "error" && (
              <div className={`rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>{engageState.message}</span>
              </div>
            )}
          </form>
        )}

        {/* ── Subtab 2: Disengage Kill Switch ────────────────────────────── */}
        {activeSubtab === "disengage" && (
          <form action={disengageSubmit} className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Operational Resume & Disengagement Procedure:
              </p>
              <p className="mt-1 text-[11px] leading-relaxed">
                Disengaging requires nominating the EXACT scope tuple being cleared. The action appends an immutable DISENGAGE event to the registry, releasing dependent downstream services.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL}>Plane Scope</label>
                <select
                  name="plane"
                  value={plane}
                  onChange={(e) => setPlane(e.target.value)}
                  className={FIELD}
                >
                  <option value="PLANE_5_AI_AGENTS">PLANE_5_AI_AGENTS (AI & Automation)</option>
                  <option value="PLANE_1_FOUNDATIONAL">PLANE_1_FOUNDATIONAL (Core Infrastructure)</option>
                  <option value="PLANE_3_COMMERCIAL">PLANE_3_COMMERCIAL (Finance & Procurement)</option>
                  <option value="">(None / Cross-Plane)</option>
                </select>
              </div>

              <div>
                <label className={LABEL}>Domain Scope</label>
                <select
                  name="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={FIELD}
                >
                  <option value="AI_AUTOMATION">AI_AUTOMATION (AI Governance Engine)</option>
                  <option value="PAYMENTS">PAYMENTS (Payment Processing)</option>
                  <option value="COMMERCIAL_OPS">COMMERCIAL_OPS (Procurement & Orders)</option>
                  <option value="TAX_AUTHORITY">TAX_AUTHORITY (E-Filing Interfaces)</option>
                  <option value="">(None / Cross-Domain)</option>
                </select>
              </div>

              <div>
                <label className={LABEL}>Provider Code</label>
                <input
                  name="provider_code"
                  value={providerCode}
                  onChange={(e) => setProviderCode(e.target.value)}
                  className={`${FIELD} uppercase font-mono`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="tenant_scoped_disengage"
                name="tenant_scoped"
                value="true"
                checked={tenantScoped}
                onChange={(e) => setTenantScoped(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="tenant_scoped_disengage" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Scope to current Tenant only
              </label>
            </div>

            <div>
              <label className={LABEL}>
                Disengagement Rationale / Incident Resolution (<span className="text-rose-500">*</span>)
              </label>
              <input
                name="reason"
                required
                defaultValue="Incident resolved: guardrail patch v2.4.1 deployed and automated safety regression tests passed."
                placeholder="Reason for resuming operations"
                className={FIELD}
              />
            </div>

            <div>
              <label className={LABEL}>
                Approved By Principal ID (<span className="text-rose-500">*</span>)
              </label>
              <input
                name="approved_by_principal_id"
                required
                defaultValue={initialPrincipalId}
                className={`${FIELD} font-mono text-xs bg-slate-50 dark:bg-slate-800`}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                loading={disengagePending}
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700"
              >
                <Power className="mr-1.5 h-4 w-4" />
                {disengagePending ? "Disengaging…" : "Disengage Kill Switch / Resume Operations"}
              </Button>
            </div>

            {disengageState.status === "success" && (
              <div className={`rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{disengageState.message}</span>
                </div>
                {disengageState.event && (
                  <div className="mt-2 space-y-1 text-xs font-mono text-slate-700 dark:text-slate-300">
                    <div><span className="text-slate-400">Event ID:</span> {disengageState.event.kill_switch_event_id}</div>
                    <div><span className="text-slate-400">Action:</span> <span className="font-bold text-emerald-600">{disengageState.event.action}</span></div>
                    <div><span className="text-slate-400">Resolution:</span> {disengageState.event.reason}</div>
                    <div><span className="text-slate-400">Disengaged At:</span> {disengageState.event.created_at}</div>
                  </div>
                )}
              </div>
            )}

            {disengageState.status === "error" && (
              <div className={`rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>{disengageState.message}</span>
              </div>
            )}
          </form>
        )}

        {/* ── Subtab 3: Resolve Scope Check ──────────────────────────────── */}
        {activeSubtab === "resolve" && (
          <form action={resolveSubmit} className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              <p className="font-semibold flex items-center gap-1.5">
                <Search className="h-4 w-4 text-blue-600" />
                Real-Time Downstream Pre-Execution Gate:
              </p>
              <p className="mt-1 text-[11px] leading-relaxed">
                Calls <code className="font-mono">GET /v1/kill-switches/resolve</code> to query hierarchical fallback across Plane $\rightarrow$ Domain $\rightarrow$ Provider $\rightarrow$ Tenant. Downstream microservices (like <code className="font-mono">ai-governance-svc</code>) execute this check before high-impact operations.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL}>Plane to Check</label>
                <select
                  name="plane"
                  value={plane}
                  onChange={(e) => setPlane(e.target.value)}
                  className={FIELD}
                >
                  <option value="PLANE_5_AI_AGENTS">PLANE_5_AI_AGENTS</option>
                  <option value="PLANE_1_FOUNDATIONAL">PLANE_1_FOUNDATIONAL</option>
                  <option value="PLANE_3_COMMERCIAL">PLANE_3_COMMERCIAL</option>
                  <option value="">(Unspecified)</option>
                </select>
              </div>

              <div>
                <label className={LABEL}>Domain to Check</label>
                <select
                  name="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={FIELD}
                >
                  <option value="AI_AUTOMATION">AI_AUTOMATION</option>
                  <option value="PAYMENTS">PAYMENTS</option>
                  <option value="COMMERCIAL_OPS">COMMERCIAL_OPS</option>
                  <option value="TAX_AUTHORITY">TAX_AUTHORITY</option>
                  <option value="">(Unspecified)</option>
                </select>
              </div>

              <div>
                <label className={LABEL}>Provider Code</label>
                <input
                  name="provider_code"
                  value={providerCode}
                  onChange={(e) => setProviderCode(e.target.value)}
                  className={`${FIELD} uppercase font-mono`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="tenant_scoped_resolve"
                name="tenant_scoped"
                value="true"
                checked={tenantScoped}
                onChange={(e) => setTenantScoped(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="tenant_scoped_resolve" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Check with Tenant Scope
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" loading={resolvePending} size="sm">
                <Search className="mr-1.5 h-4 w-4" />
                {resolvePending ? "Resolving…" : "Resolve Scope State"}
              </Button>
            </div>

            {resolveState.status === "success" && (
              <div
                className={`rounded-lg border p-4 text-sm ${
                  resolveState.resolution?.blocked
                    ? "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                    : "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {resolveState.resolution?.blocked ? (
                    <>
                      <XCircle className="h-5 w-5 text-rose-600" />
                      <span>BLOCKED: Active Kill Switch Halts Operations</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                      <span>CLEAR: Operations Permitted (No Blocking Switch)</span>
                    </>
                  )}
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <p>{resolveState.message}</p>
                  {(() => {
                    const match = resolveState.resolution?.matched_event || resolveState.resolution?.matching_event;
                    if (!match) return null;
                    return (
                      <div className="mt-2 rounded bg-white p-3 font-mono text-[11px] shadow-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] font-semibold uppercase text-slate-400 block mb-1">
                          Blocking Scope Event Record:
                        </span>
                        <div><span className="text-slate-400">Event ID:</span> {match.kill_switch_event_id}</div>
                        <div><span className="text-slate-400">Action:</span> <span className="font-bold text-rose-600">{match.action}</span></div>
                        <div><span className="text-slate-400">Reason:</span> {match.reason}</div>
                        {match.reconciliation_procedure_ref && (
                          <div><span className="text-slate-400">Runbook:</span> {match.reconciliation_procedure_ref}</div>
                        )}
                        <div><span className="text-slate-400">Approved By:</span> {match.approved_by_principal_id}</div>
                        <div><span className="text-slate-400">Timestamp:</span> {match.created_at}</div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {resolveState.status === "error" && (
              <div className={`rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>{resolveState.message}</span>
              </div>
            )}
          </form>
        )}

        {/* ── Subtab 4: Audit History ────────────────────────────────────── */}
        {activeSubtab === "history" && (
          <form action={historySubmit} className="space-y-4">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-200">
              <p className="font-semibold flex items-center gap-1.5">
                <History className="h-4 w-4 text-indigo-600" />
                Immutable Append-Only Audit Trail:
              </p>
              <p className="mt-1 text-[11px] leading-relaxed">
                Query the complete history of all ENGAGE and DISENGAGE events for this scope tuple from <code className="font-mono">kill-switch-registry-svc</code>. Events are append-only and cannot be mutated or purged.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL}>Plane</label>
                <input
                  name="plane"
                  value={plane}
                  onChange={(e) => setPlane(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Domain</label>
                <input
                  name="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Provider Code</label>
                <input
                  name="provider_code"
                  value={providerCode}
                  onChange={(e) => setProviderCode(e.target.value)}
                  className={`${FIELD} uppercase font-mono`}
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" loading={historyPending} size="sm">
                <History className="mr-1.5 h-4 w-4" />
                {historyPending ? "Fetching…" : "Retrieve Scope Transition History"}
              </Button>
            </div>

            {historyState.status === "success" && historyState.history && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Chronological Transition History ({historyState.history.length} {historyState.history.length === 1 ? "event" : "events"} recorded)
                  </span>
                  <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                    kill-switch-registry-svc :8147
                  </span>
                </div>

                {historyState.history.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No transition events found for this scope tuple.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {historyState.history.map((evt, idx) => {
                      const isEngage = evt.action === "ENGAGE";
                      return (
                        <div
                          key={evt.kill_switch_event_id || idx}
                          className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {idx + 1}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  isEngage
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                }`}
                              >
                                {evt.action}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-400">
                              {evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : ""}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                            <div><span className="text-slate-400">Event ID:</span> <span className="select-all text-slate-700 dark:text-slate-300">{evt.kill_switch_event_id}</span></div>
                            <div><span className="text-slate-400">Author:</span> {evt.created_by_principal_id}</div>
                            <div><span className="text-slate-400">Plane:</span> {evt.plane || "(All)"}</div>
                            <div><span className="text-slate-400">Domain:</span> {evt.domain || "(All)"}</div>
                            <div><span className="text-slate-400">Provider:</span> {evt.provider_code || "(All)"}</div>
                            <div><span className="text-slate-400">Tenant:</span> {evt.tenant_id || "(Platform-wide)"}</div>
                          </div>

                          <div className="mt-2 rounded bg-slate-50 p-2 text-xs dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                            <span className="text-slate-400 block font-semibold text-[10px] uppercase">Reason / Procedure:</span>
                            <p className="text-slate-700 dark:text-slate-300">{evt.reason}</p>
                            {evt.reconciliation_procedure_ref && (
                              <p className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
                                Runbook: {evt.reconciliation_procedure_ref}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2">
                  <JsonBlock value={historyState.history} />
                </div>
              </div>
            )}

            {historyState.status === "error" && (
              <div className={`rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>{historyState.message}</span>
              </div>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
