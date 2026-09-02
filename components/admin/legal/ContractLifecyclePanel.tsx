import Link from "next/link";
import { cookies } from "next/headers";
import { CloudOff, FileText, ShieldAlert, ExternalLink } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listContracts, type Contract } from "@/lib/api/legal";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  EXPIRED: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  TERMINATED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  SUSPENDED: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
};

const TYPE_COLORS: Record<string, string> = {
  VENDOR: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  EMPLOYMENT: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  NDA: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  MSA: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400",
  SLA: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
  PARTNERSHIP: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  OTHER: "bg-slate-100 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400",
};

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-US")}`;
  }
}

function isExpiringSoon(contract: Contract): boolean {
  if (!contract.effective_to) return false;
  const expiry = new Date(contract.effective_to);
  const now = new Date();
  const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

export async function ContractLifecyclePanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view contracts."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listContracts(identity);

  if (!result.ok && result.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="contract-lifecycle-svc unavailable"
        hint={result.error.message}
      />
    );
  }

  const contracts: Contract[] = result.ok ? result.data : [];

  const active = contracts.filter((c) => c.status === "ACTIVE" || (c as any).stage === "EXECUTED");
  const draft = contracts.filter((c) => c.status === "DRAFT" || (c as any).stage === "DRAFT");
  const pending = contracts.filter((c) => c.status === "PENDING_APPROVAL" || (c as any).stage === "REVIEW");
  const expiringSoon = active.filter(isExpiringSoon);

  const totalValue = contracts
    .filter((c) => c.status === "ACTIVE" || (c as any).stage === "EXECUTED")
    .reduce((sum, c) => sum + (c.total_value ?? (c as any).value ?? 0), 0);

  return (
    <div className="space-y-5">
      {contracts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <StatChip label="Total" value={contracts.length} color="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" />
          {active.length > 0 && <StatChip label="Active" value={active.length} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" />}
          {pending.length > 0 && <StatChip label="Pending" value={pending.length} color="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" />}
          {draft.length > 0 && <StatChip label="Draft" value={draft.length} color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" />}
          {expiringSoon.length > 0 && <StatChip label="Expiring ≤30d" value={expiringSoon.length} color="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" />}
          {totalValue > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <span className="font-bold">{formatCurrency(totalValue, "USD")}</span>
              <span className="opacity-70">active value</span>
            </span>
          )}
        </div>
      )}

      {contracts.length === 0 ? (
        <PanelEmptyState
          icon={FileText}
          label="No contracts recorded"
          hint="Contracts created via contract-lifecycle-svc will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Title", "Type", "Counterparty", "Value", "Expires", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contracts.map((c) => {
                const status = (c.status ?? (c as any).stage ?? "DRAFT") as string;
                const warnExpiry = isExpiringSoon(c);
                const value = c.total_value ?? (c as any).value ?? 0;
                const currency = c.currency ?? "GBP";
                const type = (c.contract_type ?? (c as any).type ?? "MSA") as string;
                const counterparty = c.counterparty_name || (c as any).counterparty || c.counterparty_id || "—";
                const version = c.version ?? 1;

                return (
                  <tr key={c.contract_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 max-w-[220px]">
                      <Link
                        href={`/admin/legal/${encodeURIComponent(c.contract_id)}`}
                        className="group flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 hover:text-navy-600 dark:hover:text-gold-400 transition-colors"
                      >
                        <span className="truncate">{c.title}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-slate-400" />
                      </Link>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        <span>v{version}</span>
                        <span>•</span>
                        <span className="truncate max-w-[120px]">{c.contract_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TYPE_COLORS[type] ?? "bg-slate-100 text-slate-600"}`}>
                        {type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[140px]">
                      <span className="block truncate">{counterparty}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {value > 0 ? formatCurrency(value, currency) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.effective_to || (c as any).expires_at ? (
                        <span className={`text-xs font-medium ${warnExpiry ? "text-orange-500 dark:text-orange-400" : "text-slate-500 dark:text-slate-400"}`}>
                          {new Date(c.effective_to || (c as any).expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {warnExpiry && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Open-ended</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"}`}>
                        {status.replace(/_/g, " ")}
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
