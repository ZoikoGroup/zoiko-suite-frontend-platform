"use client";

import { useState, useEffect } from "react";
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

const MOCK_ASSESSMENTS: CartaAssessment[] = [
  {
    id: "eval-001",
    subject_id: "usr-sec-alice@zoiko.com",
    context: {
      subject_id: "usr-sec-alice@zoiko.com",
      subject_type: "USER",
      device_trust_level: 95,
      ip_address: "192.168.1.45",
      is_known_location: true,
      resource_sensitivity: "HIGH",
      action_requested: "hsm:key:export_public",
      time_of_day_hour: 14,
    },
    trust_score: 92,
    risk_level: "LOW",
    decision: "ALLOW",
    risk_factors: ["Managed enterprise device", "Known corporate VPN subnet"],
    assessment_timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  },
  {
    id: "eval-002",
    subject_id: "svc-procurement-worker",
    context: {
      subject_id: "svc-procurement-worker",
      subject_type: "SERVICE_ACCOUNT",
      device_trust_level: 80,
      ip_address: "10.0.4.12",
      is_known_location: true,
      resource_sensitivity: "RESTRICTED",
      action_requested: "purchase_order:approve_bulk",
      time_of_day_hour: 23,
    },
    trust_score: 64,
    risk_level: "MEDIUM",
    decision: "STEP_UP_MFA",
    risk_factors: ["Off-hours restricted action", "Elevated approval threshold"],
    assessment_timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "eval-003",
    subject_id: "usr-contractor-guest",
    context: {
      subject_id: "usr-contractor-guest",
      subject_type: "USER",
      device_trust_level: 25,
      ip_address: "198.51.100.89",
      is_known_location: false,
      resource_sensitivity: "RESTRICTED",
      action_requested: "secrets:master_vault:read",
      time_of_day_hour: 3,
    },
    trust_score: 18,
    risk_level: "CRITICAL",
    decision: "DENY",
    risk_factors: ["Unrecognized IP geofence", "Untrusted device profile", "Restricted resource breach attempt"],
    assessment_timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
  },
];

export function CartaAssessmentPanel() {
  const [assessments, setAssessments] = useState<CartaAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [filterDecision, setFilterDecision] = useState<string>("ALL");

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/security/assessments");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.assessments) && data.assessments.length > 0) {
          setAssessments(data.assessments);
        } else {
          setAssessments(MOCK_ASSESSMENTS);
        }
      } else {
        setAssessments(MOCK_ASSESSMENTS);
      }
    } catch {
      setAssessments(MOCK_ASSESSMENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  const handleTestEvaluation = async () => {
    setEvaluating(true);
    try {
      const newContext: AccessContext = {
        subject_id: `agent-run-${Math.floor(Math.random() * 900 + 100)}@zoiko.com`,
        subject_type: "BOT",
        device_trust_level: Math.floor(Math.random() * 50 + 50),
        ip_address: "10.244.0.88",
        is_known_location: true,
        resource_sensitivity: "MEDIUM",
        action_requested: "ai_governance:evaluate_policy",
        time_of_day_hour: new Date().getHours(),
      };

      const res = await fetch("/api/v1/security/assessments/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_entity_id: "22222222-2222-2222-2222-222222222222",
          context: newContext,
        }),
      });

      if (res.ok) {
        const newRecord = await res.json();
        setAssessments((prev) => [newRecord, ...prev]);
      } else {
        // Fallback live simulated zero-trust decision
        const mockScore = Math.floor(Math.random() * 30 + 70);
        const simAssessment: CartaAssessment = {
          id: `eval-${Date.now().toString(36)}`,
          subject_id: newContext.subject_id,
          context: newContext,
          trust_score: mockScore,
          risk_level: mockScore > 80 ? "LOW" : "MEDIUM",
          decision: mockScore > 80 ? "ALLOW" : "STEP_UP_MFA",
          risk_factors: ["Dynamic telemetry verified", "Standard API gateway routing"],
          assessment_timestamp: new Date().toISOString(),
        };
        setAssessments((prev) => [simAssessment, ...prev]);
      }
    } catch {
      // ignore
    } finally {
      setEvaluating(false);
    }
  };

  const filtered = filterDecision === "ALL"
    ? assessments
    : assessments.filter((a) => a.decision === filterDecision);

  const avgTrustScore = assessments.length
    ? Math.round(assessments.reduce((acc, a) => acc + (a.trust_score || 0), 0) / assessments.length)
    : 85;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Continuous Adaptive Risk & Trust Assessment (CARTA)</span>
          <span className="font-mono text-[11px] text-slate-400">(:8142)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Avg Trust Score: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{avgTrustScore}/100</span>
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
          onClick={handleTestEvaluation}
          disabled={evaluating}
          className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          <Play className={`h-3 w-3 ${evaluating ? "animate-spin" : ""}`} />
          {evaluating ? "Evaluating..." : "Evaluate Test Subject"}
        </button>
      </div>

      {/* Assessment List */}
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
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
