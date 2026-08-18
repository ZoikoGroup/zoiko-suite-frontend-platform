import { cookies } from "next/headers";
import { CloudOff, Percent, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listTaxRules, listTaxDeterminations, type TaxRule, type TaxDetermination } from "@/lib/api/tax";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:      "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  ACTIVE:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  DEPRECATED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  CALCULATED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  APPLIED:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  OVERRIDDEN: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  REVERSED:   "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
};

const JURISDICTION_LABEL: Record<string, { flag: string; short: string }> = {
  "uk-gov-01":  { flag: "🇬🇧", short: "UK" },
  "us-fed-01":  { flag: "🇺🇸", short: "US" },
  "sg-iras-01": { flag: "🇸🇬", short: "SG" },
  "de-bzst-01": { flag: "🇩🇪", short: "DE" },
  "jur-uk-gb":  { flag: "🇬🇧", short: "UK" },
  "jur-us-fed": { flag: "🇺🇸", short: "US" },
  "jur-sg-01":  { flag: "🇸🇬", short: "SG" },
  "jur-sg-sg":  { flag: "🇸🇬", short: "SG" },
  "jur-de-fed": { flag: "🇩🇪", short: "DE" },
  "uk":         { flag: "🇬🇧", short: "UK" },
  "gb":         { flag: "🇬🇧", short: "UK" },
  "us":         { flag: "🇺🇸", short: "US" },
  "sg":         { flag: "🇸🇬", short: "SG" },
  "de":         { flag: "🇩🇪", short: "DE" },
};

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

/** Visual bar showing the tax rate relative to 100% */
function RateBar({ rate }: { rate: number }) {
  const pct = Math.min(rate, 100);
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <span className="w-9 text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
        {rate}%
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function JurisdictionPill({ jurisdictionId }: { jurisdictionId: string }) {
  const key = jurisdictionId?.toLowerCase();
  const j = JURISDICTION_LABEL[key] || Object.entries(JURISDICTION_LABEL).find(([k]) => key?.includes(k))?.[1];
  if (!j) return <span className="text-xs text-slate-400 font-mono">{jurisdictionId}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      <span>{j.flag}</span> {j.short}
    </span>
  );
}

export async function TaxRulesAndDeterminationPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view tax rules and determinations."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [rulesRes, determinationsRes] = await Promise.all([
    listTaxRules(identity),
    listTaxDeterminations(identity),
  ]);

  if (!rulesRes.ok && rulesRes.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="tax-rules-svc unavailable"
        hint={rulesRes.error.message}
      />
    );
  }

  const rules: TaxRule[] = rulesRes.ok ? rulesRes.data : [];
  const determinations: TaxDetermination[] = determinationsRes.ok ? determinationsRes.data : [];

  return (
    <div className="space-y-6">
      {/* ── Tax Rules ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Configured Tax Rules ({rules.length})
        </h3>
        {rules.length === 0 ? (
          <PanelEmptyState
            icon={Percent}
            label="No active tax rules"
            hint="Tax rules created in tax-rules-svc will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Jurisdiction", "Code", "Name", "Category", "Rate", "Effective", "Status"].map((h) => (
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
                {rules.map((r) => (
                  <tr
                    key={r.rule_id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <JurisdictionPill jurisdictionId={r.jurisdiction_id} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                      {r.rule_code}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 max-w-[180px] truncate">
                      {r.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RateBar rate={r.tax_rate_percentage} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {r.effective_from ? r.effective_from.split("T")[0] : "—"}
                      {r.effective_to && <span className="text-slate-300"> → {r.effective_to.split("T")[0]}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tax Determinations ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Tax Determinations ({determinations.length})
        </h3>
        {determinations.length === 0 ? (
          <PanelEmptyState
            icon={Percent}
            label="No determinations evaluated"
            hint="Evaluated transactions from tax-determination-svc will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Tx ID", "Source", "Jurisdiction", "Gross", "Taxable", "Calculated Tax", "Rate", "Status"].map((h) => (
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
                {determinations.map((d) => (
                  <tr
                    key={d.determination_id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                      {d.transaction_id}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {d.source_module}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <JurisdictionPill jurisdictionId={d.jurisdiction_id} />
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">{formatCurrency(d.gross_amount, d.currency)}</td>
                    <td className="px-4 py-3 text-xs">{formatCurrency(d.taxable_amount, d.currency)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(d.calculated_tax_amount, d.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <RateBar rate={d.tax_rate_percentage} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {d.status}
                      </span>
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
