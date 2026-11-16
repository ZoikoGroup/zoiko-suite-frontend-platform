import { cookies } from "next/headers";
import { ShieldAlert, Globe, CloudOff } from "lucide-react";
import { listJurisdictions } from "@/lib/api/jurisdictions";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listTaxRules,
  listVATReturns,
  listFilingDrafts,
  listTaxAuthorityInterfaces,
} from "@/lib/api/tax";

type JurisdictionCard = {
  id: string;
  code: string;
  name: string;
  authorityType: string;
  active: boolean;
  activeRules: number;
  /** Categories of this jurisdiction's ACTIVE rules — what tax-rules-svc holds, not a description of the country. */
  ruleCategories: string[];
  vatGstStatus: string | null;
  filingStatus: string | null;
  authorityStatus: string;
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  ACCEPTED:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  FILED:     "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  PREPARED:  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  DRAFT:     "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  INACTIVE:  "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
  NONE:      "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-500",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? STATUS_BADGE.NONE;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export async function TaxJurisdictionPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Sign in to view jurisdiction status.
      </div>
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const [jurisdictionsRes, rulesRes, vatRes, draftsRes, authorityRes] = await Promise.all([
    listJurisdictions(),
    listTaxRules(identity),
    listVATReturns(identity),
    listFilingDrafts(identity),
    listTaxAuthorityInterfaces(identity),
  ]);

  // The cards are jurisdiction-rules-svc's register, nothing else. This used to
  // be a hardcoded table of four countries with flags, authority names and tax
  // types, matched to records by substring, so a record under any id containing
  // "gb" or "us" was counted against a country it may not belong to.
  if (!jurisdictionsRes.ok) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <CloudOff className="h-4 w-4 shrink-0" />
        jurisdiction-rules-svc could not be read: {jurisdictionsRes.error.message}
      </div>
    );
  }

  const rules = rulesRes.ok && Array.isArray(rulesRes.data) ? rulesRes.data : [];
  const vatReturns = vatRes.ok && Array.isArray(vatRes.data) ? vatRes.data : [];
  const drafts = draftsRes.ok && Array.isArray(draftsRes.data) ? draftsRes.data : [];
  const authorities = authorityRes.ok && Array.isArray(authorityRes.data) ? authorityRes.data : [];

  const cards: JurisdictionCard[] = jurisdictionsRes.data.map((j) => {
    const id = j.jurisdiction_id;
    const jRules = rules.filter((r) => r.jurisdiction_id === id && r.status === "ACTIVE");
    const latestVat = vatReturns
      .filter((v) => v.jurisdiction_id === id)
      .sort((a, b) => (b.tax_period ?? "").localeCompare(a.tax_period ?? ""))[0];
    const latestDraft = drafts
      .filter((d) => d.jurisdiction_id === id)
      .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""))[0];
    // tax-authority-interface-svc stores its jurisdiction as a free string, so
    // an interface is matched when that string is exactly this jurisdiction's
    // id or its code — never by substring.
    const jAuth = authorities.find((a) => a.jurisdiction === id || a.jurisdiction === j.jurisdiction_code);

    return {
      id,
      code: j.jurisdiction_code,
      name: j.jurisdiction_name,
      authorityType: j.authority_type,
      active: j.active_flag,
      activeRules: jRules.length,
      ruleCategories: [...new Set(jRules.map((r) => r.category))].sort(),
      vatGstStatus: latestVat?.status ?? null,
      filingStatus: latestDraft?.validation_status ?? null,
      authorityStatus: jAuth ? (jAuth.status === "ACTIVE" ? "ACTIVE" : "INACTIVE") : "NONE",
    };
  });

  const partial = [rulesRes, vatRes, draftsRes, authorityRes].filter((r) => !r.ok).length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Jurisdiction Overview
        </h3>
      </div>
      {partial > 0 && (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
          {partial} of the tax registers could not be read, so some counts and statuses below are incomplete.
        </p>
      )}
      {cards.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">jurisdiction-rules-svc has no jurisdictions registered.</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 hover:shadow-md transition-shadow duration-200 flex flex-col gap-3"
          >
            {/* Code + name, as registered */}
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-none">
                {card.code}
                {!card.active && <span className="ml-1.5 text-[10px] font-medium text-slate-400">inactive</span>}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{card.name}</p>
              {card.authorityType && (
                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{card.authorityType}</p>
              )}
            </div>

            {/* Categories of the active rules held for it */}
            <div className="flex flex-wrap gap-1">
              {card.ruleCategories.length === 0 ? (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">No active rules</span>
              ) : (
                card.ruleCategories.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {t}
                  </span>
                ))
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-y-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Active rules</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                {card.activeRules}
              </span>

              <span className="text-slate-500 dark:text-slate-400">VAT/GST</span>
              <span className="text-right">
                {card.vatGstStatus ? (
                  <StatusBadge status={card.vatGstStatus} />
                ) : (
                  <span className="text-slate-400 dark:text-slate-600">—</span>
                )}
              </span>

              <span className="text-slate-500 dark:text-slate-400">Filing</span>
              <span className="text-right">
                {card.filingStatus ? (
                  <StatusBadge status={card.filingStatus} />
                ) : (
                  <span className="text-slate-400 dark:text-slate-600">—</span>
                )}
              </span>

              <span className="text-slate-500 dark:text-slate-400">Authority</span>
              <span className="text-right">
                <StatusBadge status={card.authorityStatus} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
