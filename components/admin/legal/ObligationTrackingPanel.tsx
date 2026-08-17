import { cookies } from "next/headers";
import { AlertTriangle, CloudOff, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listObligations, type Obligation } from "@/lib/api/legal";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  FULFILLED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  BREACHED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  WAIVED: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  MEDIUM: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

function isDueSoon(dueDate: string): boolean {
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 7 && diffDays >= 0;
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date();
}

export async function ObligationTrackingPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view legal obligations."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listObligations(identity);

  if (!result.ok && result.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="obligation-tracking-svc unavailable"
        hint={result.error.message}
      />
    );
  }

  const obligations: Obligation[] = result.ok && Array.isArray(result.data) ? result.data : [];

  const breached = obligations.filter((o) => o.status === "BREACHED");
  const pending = obligations.filter((o) => o.status === "PENDING" || o.status === "IN_PROGRESS");
  const dueSoon = pending.filter((o) => isDueSoon(o.due_date));
  const overdue = pending.filter((o) => isOverdue(o.due_date) && o.status !== "FULFILLED");

  return (
    <div className="space-y-5">
      {/* Summary chips */}
      {obligations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <StatChip label="Total" value={obligations.length} color="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" />
          {breached.length > 0 && <StatChip label="Breached" value={breached.length} color="bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" />}
          {overdue.length > 0 && <StatChip label="Overdue" value={overdue.length} color="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" />}
          {dueSoon.length > 0 && <StatChip label="Due in 7d" value={dueSoon.length} color="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" />}
        </div>
      )}

      {obligations.length === 0 ? (
        <PanelEmptyState
          icon={AlertTriangle}
          label="No obligations recorded"
          hint="Obligations created via obligation-tracking-svc will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Title", "Type", "Risk", "Due", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {obligations.map((o) => {
                const over = o.status !== "FULFILLED" && isOverdue(o.due_date);
                return (
                  <tr key={o.obligation_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 max-w-[220px]">
                      <span className="block truncate">{o.title}</span>
                      {o.assigned_to && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">{o.assigned_to}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {(() => {
                        const rawObj = o as unknown as Record<string, unknown>;
                        const typeStr = o.obligation_type || (typeof rawObj.category === "string" ? rawObj.category : "CONTRACTUAL");
                        return typeStr.replace(/_/g, " ");
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const rawObj = o as unknown as Record<string, unknown>;
                        const risk = o.risk_level || (typeof rawObj.priority === "string" ? rawObj.priority : "MEDIUM");
                        return (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${RISK_COLORS[risk as keyof typeof RISK_COLORS] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                            {risk}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium ${over ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                        {o.due_date ? new Date(o.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        {over && " ⚠"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[o.status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                        {(o.status || "PENDING").replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      <span className="font-bold">{value}</span>
      {label}
    </span>
  );
}
