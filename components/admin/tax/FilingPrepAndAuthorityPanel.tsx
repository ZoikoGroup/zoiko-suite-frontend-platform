import { cookies } from "next/headers";
import { CloudOff, FileCheck, ShieldAlert, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listFilingDrafts, listTaxAuthorityInterfaces, type FilingDraft, type TaxAuthorityInterface } from "@/lib/api/tax";
import { TestConnectionButton } from "./TestConnectionButton";

const VALIDATION_STATUS_CONFIG: Record<
  string,
  { bar: string; pct: number; label: string; badge: string }
> = {
  UNVALIDATED: { bar: "bg-slate-300",  pct: 0,   label: "Not started",  badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400" },
  PREPARED:    { bar: "bg-blue-500",   pct: 50,  label: "Half-way",     badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  FINALIZED:   { bar: "bg-emerald-500",pct: 100, label: "Ready to file",badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  BLOCKED:     { bar: "bg-red-500",    pct: 0,   label: "Blocked",      badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
};

const AUTHORITY_STATUS_COLORS: Record<string, string> = {
  ACTIVE:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
};

const AUTH_TYPE_COLORS: Record<string, string> = {
  "OAuth2":           "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "mTLS + SAML2":     "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  "Singpass / Corppass OIDC": "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
};

function DueDateCountdown({ dueDate }: { dueDate?: string }) {
  if (!dueDate) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
        <Clock className="h-3 w-3" /> Scheduled
      </span>
    );
  }
  const today = new Date();
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
        <Clock className="h-3 w-3" /> Scheduled
      </span>
    );
  }
  const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" />
        Overdue {Math.abs(days)}d
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 animate-pulse">
        <Clock className="h-3 w-3" /> Due today
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" /> {days}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      <Clock className="h-3 w-3" /> {days}d left
    </span>
  );
}

function ReadinessBar({ status }: { status: string }) {
  const cfg = VALIDATION_STATUS_CONFIG[status] ?? VALIDATION_STATUS_CONFIG.UNVALIDATED;
  const isBlocked = status === "BLOCKED";

  return (
    <div className="space-y-1 min-w-[110px]">
      <div className="flex h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        {isBlocked ? (
          <div className="h-full w-full bg-red-400 opacity-50" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px)" }} />
        ) : (
          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${cfg.pct}%` }} />
        )}
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{cfg.label}</p>
    </div>
  );
}

function AuthTypeBadge({ authType }: { authType: string }) {
  const cls = AUTH_TYPE_COLORS[authType] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {authType}
    </span>
  );
}

export async function FilingPrepAndAuthorityPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view filing drafts and authority interfaces."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [draftsRes, authorityRes] = await Promise.all([
    listFilingDrafts(identity),
    listTaxAuthorityInterfaces(identity),
  ]);

  if (!draftsRes.ok && draftsRes.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="filing-preparation-svc unavailable"
        hint={draftsRes.error.message}
      />
    );
  }

  const drafts: FilingDraft[] = draftsRes.ok ? draftsRes.data : [];
  const interfaces: TaxAuthorityInterface[] = authorityRes.ok ? authorityRes.data : [];

  return (
    <div className="space-y-6">
      {/* ── Filing Drafts ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Filing Preparation Drafts ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <PanelEmptyState
            icon={FileCheck}
            label="No filing drafts"
            hint="Filing drafts created in filing-preparation-svc will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Filing Type", "Period", "Due Date / Countdown", "Readiness", "Validation Status", "Notes"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {drafts.map((d, idx) => (
                  <tr
                    key={d.draft_id ?? `draft-row-${idx}`}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{d.filing_type}</p>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{d.draft_id}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {d.period_key}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{d.due_date}</p>
                        <DueDateCountdown dueDate={d.due_date} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ReadinessBar status={d.validation_status} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          VALIDATION_STATUS_CONFIG[d.validation_status]?.badge ??
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {d.validation_status === "FINALIZED" && (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        {d.validation_status}
                      </span>
                      {d.block_reasons && (
                        <p className="mt-1 text-[10px] text-red-500 dark:text-red-400 max-w-[160px] truncate">
                          {d.block_reasons}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 max-w-[180px]">
                      {d.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tax Authority Connections ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Tax Authority Connections ({interfaces.length})
        </h3>
        {interfaces.length === 0 ? (
          <PanelEmptyState
            icon={FileCheck}
            label="No authority connections registered"
            hint="Configured interfaces in tax-authority-interface-svc will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {[
                    "Authority Code",
                    "Authority Name",
                    "Protocol",
                    "Auth Type",
                    "Endpoint",
                    "Status",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {interfaces.map((iface) => (
                  <tr
                    key={iface.interface_id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                      {iface.authority_code}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {iface.authority_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {iface.protocol}
                    </td>
                    <td className="px-4 py-3">
                      <AuthTypeBadge authType={iface.auth_type} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 max-w-[180px] truncate">
                      {iface.api_endpoint}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          AUTHORITY_STATUS_COLORS[iface.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {iface.status === "ACTIVE" && (
                          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                        )}
                        {iface.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TestConnectionButton
                        interfaceId={iface.interface_id}
                        authorityCode={iface.authority_code}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
