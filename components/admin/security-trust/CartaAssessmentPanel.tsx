"use client";

import { useState, useEffect } from "react";
import { fetchPanelList } from "@/lib/panel-fetch";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Lock,
  UserCheck,
  Smartphone,
  Globe,
  Activity,
  AlertTriangle,
  Play,
  Server,
  Bot
} from "lucide-react";

export type CartaDecision = "ALLOW" | "STEP_UP_MFA" | "ISOLATE" | "DENY";
export type CartaRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AccessContext = {
  subject_id: string;
  subject_type: "USER" | "SERVICE_ACCOUNT" | "BOT";
  device_trust_level: number; // 0–100
  ip_address: string;
  is_known_location: boolean;
  resource_sensitivity: "LOW" | "MEDIUM" | "HIGH" | "RESTRICTED";
  action_requested: string;
  time_of_day_hour: number;
};

export type CartaAssessment = {
  id: string;
  tenant_id?: string;
  legal_entity_id?: string;
  subject_id: string;
  context: AccessContext;
  trust_score: number;
  risk_level: CartaRiskLevel;
  decision: CartaDecision;
  risk_factors: string[];
  assessment_timestamp: string;
};

const DECISION_BADGES: Record<CartaDecision, { bg: string; text: string; icon: React.ElementType }> = {
  ALLOW: {
    bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    text: "Allow Access",
    icon: ShieldCheck,
  },
  STEP_UP_MFA: {
    bg: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    text: "Step-up MFA Required",
    icon: AlertTriangle,
  },
  ISOLATE: {
    bg: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    text: "Isolate Session",
    icon: ShieldAlert,
  },
  DENY: {
    bg: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    text: "Deny Access",
    icon: Lock,
  },
};

const RISK_BADGES: Record<CartaRiskLevel, string> = {
  LOW: "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200",
  MEDIUM: "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200",
  HIGH: "text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200",
  CRITICAL: "text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200",
};

export function CartaAssessmentPanel() {
  const [assessments, setAssessments] = useState<CartaAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [filterDecision, setFilterDecision] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [ctx, setCtx] = useState({
    subject_id: "",
    subject_type: "",
    device_trust_level: "",
    ip_address: "",
    is_known_location: false,
    resource_sensitivity: "",
    action_requested: "",
    time_of_day_hour: "",
  });
  const ctxComplete =
    ctx.subject_id.trim() && ctx.subject_type && ctx.device_trust_level !== "" && ctx.ip_address.trim() &&
    ctx.resource_sensitivity && ctx.action_requested.trim() && ctx.time_of_day_hour !== "";

  // Only carta-svc's own assessments are shown. There is no sample data: an
  // empty list or a failed read is shown as it is.
  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      setAssessments(await fetchPanelList<CartaAssessment>("/api/v1/security/assessments", "assessments", "carta-svc"));
    } catch (e) {
      setAssessments([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  // Sends an evaluation of the access context the reader entered to carta-svc
  // and records what it decided. The legal entity is the session's (the proxy
  // sets it). This used to evaluate a random subject with a random trust level
  // and a fixed IP, and carta-svc stored each of those invented assessments.
  const handleEvaluation = async () => {
    setEvaluating(true);
    setActionError(null);
    try {
      const newContext: AccessContext = {
        subject_id: ctx.subject_id.trim(),
        subject_type: ctx.subject_type as AccessContext["subject_type"],
        device_trust_level: Number(ctx.device_trust_level),
        ip_address: ctx.ip_address.trim(),
        is_known_location: ctx.is_known_location,
        resource_sensitivity: ctx.resource_sensitivity as AccessContext["resource_sensitivity"],
        action_requested: ctx.action_requested.trim(),
        time_of_day_hour: Number(ctx.time_of_day_hour),
      };

      const res = await fetch("/api/v1/security/assessments/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: newContext }),
      });

      const body = await res.json().catch(() => null);
      if (res.ok && body?.id) {
        setAssessments((prev) => [body as CartaAssessment, ...prev]);
        setFormOpen(false);
      } else if (res.status === 401) {
        setActionError("Your session has expired — sign in again.");
      } else {
        setActionError(`carta-svc refused the evaluation: ${body?.error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      setActionError("The evaluation could not be sent to carta-svc.");
    } finally {
      setEvaluating(false);
    }
  };

  const filtered = filterDecision === "ALL"
    ? assessments
    : assessments.filter((a) => a.decision === filterDecision);

  const avgTrustScore = assessments.length
    ? `${Math.round(assessments.reduce((acc, a) => acc + (a.trust_score || 0), 0) / assessments.length)}/100`
    : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Continuous Adaptive Risk & Trust Assessment (CARTA)</span>
          <span className="font-mono text-[11px] text-slate-400">carta-svc</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Avg Trust Score: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{avgTrustScore}</span>
          </span>
          <button
            type="button"
            onClick={fetchAssessments}
            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Reload
          </button>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Filter Decision:</span>
          <select
            value={filterDecision}
            onChange={(e) => setFilterDecision(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Decisions ({assessments.length})</option>
            <option value="ALLOW">ALLOW</option>
            <option value="STEP_UP_MFA">STEP_UP_MFA</option>
            <option value="ISOLATE">ISOLATE</option>
            <option value="DENY">DENY</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          aria-expanded={formOpen}
          className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Play className="h-3 w-3" />
          Evaluate Access
        </button>
      </div>

      {formOpen && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4 dark:border-slate-800">
          <input aria-label="Subject ID" placeholder="Subject ID" value={ctx.subject_id} onChange={(e) => setCtx({ ...ctx, subject_id: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
          <select aria-label="Subject type" value={ctx.subject_type} onChange={(e) => setCtx({ ...ctx, subject_type: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
            <option value="">Subject type…</option>
            <option value="USER">User</option>
            <option value="SERVICE_ACCOUNT">Service account</option>
            <option value="BOT">Bot</option>
          </select>
          <input aria-label="Device trust level (0-100)" placeholder="Device trust 0-100" type="number" min={0} max={100} value={ctx.device_trust_level} onChange={(e) => setCtx({ ...ctx, device_trust_level: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
          <input aria-label="IP address" placeholder="IP address" value={ctx.ip_address} onChange={(e) => setCtx({ ...ctx, ip_address: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
          <select aria-label="Resource sensitivity" value={ctx.resource_sensitivity} onChange={(e) => setCtx({ ...ctx, resource_sensitivity: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
            <option value="">Sensitivity…</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="RESTRICTED">Restricted</option>
          </select>
          <input aria-label="Action requested" placeholder="Action requested" value={ctx.action_requested} onChange={(e) => setCtx({ ...ctx, action_requested: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
          <input aria-label="Hour of day (0-23)" placeholder="Hour 0-23" type="number" min={0} max={23} value={ctx.time_of_day_hour} onChange={(e) => setCtx({ ...ctx, time_of_day_hour: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={ctx.is_known_location} onChange={(e) => setCtx({ ...ctx, is_known_location: e.target.checked })} />
            Known location
          </label>
          <button
            type="button"
            onClick={handleEvaluation}
            disabled={evaluating || !ctxComplete}
            className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-4"
          >
            {evaluating ? "Evaluating..." : "Send to carta-svc"}
          </button>
        </div>
      )}

      {actionError && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{actionError}</p>
      )}

      {/* Assessment List */}
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {error ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
            No access risk assessments found.
          </div>
        ) : (
          filtered.map((item) => {
            const badge = DECISION_BADGES[item.decision] || DECISION_BADGES.ALLOW;
            const Icon = badge.icon;
            const riskBadge = RISK_BADGES[item.risk_level] || RISK_BADGES.LOW;

            return (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.context.subject_type === "BOT" ? (
                        <Bot className="h-4 w-4" />
                      ) : item.context.subject_type === "SERVICE_ACCOUNT" ? (
                        <Server className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                        {item.subject_id}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Action: <span className="font-mono text-slate-700 dark:text-slate-300">{item.context.action_requested}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.bg}`}>
                      <Icon className="h-3 w-3" />
                      {item.decision}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${riskBadge}`}>
                      {item.risk_level}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 border-t border-slate-100 pt-2 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-slate-400" />
                    <span>Trust Score: <strong className="text-slate-700 dark:text-slate-300">{item.trust_score}/100</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                    <span>Device Trust: <strong className="text-slate-700 dark:text-slate-300">{item.context.device_trust_level}%</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    <span>IP: <strong className="font-mono text-slate-700 dark:text-slate-300">{item.context.ip_address}</strong></span>
                  </div>
                  <div className="text-right text-[10px] text-slate-400">
                    {new Date(item.assessment_timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {item.risk_factors && item.risk_factors.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.risk_factors.map((factor, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      >
                        • {factor}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
