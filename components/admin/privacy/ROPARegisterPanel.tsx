import { cookies } from "next/headers";
import { CloudOff, ShieldAlert, BookOpen } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listROPA } from "@/lib/api/privacy-purpose-registry";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  VALIDATED: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  SUBMITTED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  APPROVED: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  SUSPENDED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  REJECTED: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  RETIRED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

/**
 * The Article 30 "Record of Processing Activities" register, read directly
 * from privacy-purpose-registry-svc (:8151) — GET /privacy/ropa. This is the
 * one endpoint this service exposes for listing activities; it has no
 * general "list all activities" route.
 */
export async function ROPARegisterPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in to view the ROPA register." />
    );
  }

  const identity = { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId };
  const res = await listROPA({}, identity);

  if (!res.ok) {
    return (
      <PanelEmptyState icon={CloudOff} tone="warning" label="privacy-purpose-registry-svc unavailable" hint={res.error.message} />
    );
  }

  const activities = res.data.data;

  if (activities.length === 0) {
    return (
      <PanelEmptyState icon={BookOpen} label="No processing activities on the ROPA register" hint="Only ACTIVE (and other post-draft) activity versions appear here." />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {["Owner", "Role", "Purposes", "Jurisdictions", "Status"].map((h) => (
              <th key={h} className={HEAD + " text-left"}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {activities.map((a) => (
            <tr key={a.activity_version_id}>
              <td className={CELL}>
                <div className="font-medium text-slate-800 dark:text-slate-200">{a.owner}</div>
                <div className="text-xs text-slate-400 font-mono">{a.activity_id}</div>
              </td>
              <td className={CELL}>{a.privacy_role}</td>
              <td className={CELL}>{a.purpose_ids.length}</td>
              <td className={CELL}>{a.jurisdictions.join(", ") || "—"}</td>
              <td className={CELL}>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[a.version_status] ?? ""}`}>
                  {a.version_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
