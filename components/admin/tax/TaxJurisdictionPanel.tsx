import { cookies } from "next/headers";
import { ShieldAlert, Globe } from "lucide-react";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listTaxRules,
  listVATReturns,
  listFilingDrafts,
  listTaxAuthorityInterfaces,
} from "@/lib/api/tax";

type JurisdictionCard = {
  id: string;
  flag: string;
  name: string;
  shortName: string;
  authority: string;
  activeRules: number;
  vatGstStatus: string | null;
  filingStatus: string | null;
  authorityStatus: string;
  taxTypes: string[];
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

  const [rulesRes, vatRes, draftsRes, authorityRes] = await Promise.all([
    listTaxRules(identity),
    listVATReturns(identity),
    listFilingDrafts(identity),
    listTaxAuthorityInterfaces(identity),
  ]);

  const rules = rulesRes.ok && Array.isArray(rulesRes.data) ? rulesRes.data : [];
  const vatReturns = vatRes.ok && Array.isArray(vatRes.data) ? vatRes.data : [];
  const drafts = draftsRes.ok && Array.isArray(draftsRes.data) ? draftsRes.data : [];
  const authorities = authorityRes.ok && Array.isArray(authorityRes.data) ? authorityRes.data : [];

  const JURISDICTIONS: { id: string; aliases: string[]; flag: string; name: string; shortName: string; authority: string; taxTypes: string[] }[] = [
    { id: "uk-gov-01",  aliases: ["uk-gov-01", "jur-uk-gb", "uk", "gb"],  flag: "🇬🇧", name: "United Kingdom", shortName: "UK",  authority: "HMRC",    taxTypes: ["VAT", "WHT"] },
    { id: "us-fed-01",  aliases: ["us-fed-01", "jur-us-fed", "us", "usa"], flag: "🇺🇸", name: "United States",  shortName: "US",  authority: "IRS",     taxTypes: ["CORPORATE_INCOME"] },
    { id: "sg-iras-01", aliases: ["sg-iras-01", "jur-sg-01", "jur-sg-sg", "sg"], flag: "🇸🇬", name: "Singapore",      shortName: "SG",  authority: "IRAS",    taxTypes: ["GST", "WHT"] },
    { id: "de-bzst-01", aliases: ["de-bzst-01", "jur-de-fed", "de", "deu"], flag: "🇩🇪", name: "Germany",        shortName: "DE",  authority: "BZSt",    taxTypes: ["WHT"] },
  ];

  function matches(jurId: string | undefined, aliases: string[]) {
    if (!jurId) return false;
    const lower = jurId.toLowerCase();
    return aliases.some((a) => lower === a.toLowerCase() || lower.includes(a.toLowerCase()));
  }

  const cards: JurisdictionCard[] = JURISDICTIONS.map((jur) => {
    const jRules = rules.filter((r) => matches(r.jurisdiction_id, jur.aliases) && r.status === "ACTIVE");

    // Most recent VAT return for this jurisdiction
    const jVat = vatReturns.filter((v) => matches(v.jurisdiction_id, jur.aliases));
    const latestVat = jVat.sort((a, b) => (b.tax_period ?? "").localeCompare(a.tax_period ?? ""))[0];

    // Most recent filing draft
    const jDraft = drafts.filter((d) => matches(d.jurisdiction_id, jur.aliases));
    const latestDraft = jDraft.sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""))[0];

    // Authority connection
    const jAuth = authorities.find((a) => matches(a.jurisdiction_id, jur.aliases));

    const authorityIsActive = jAuth ? (jAuth.status === "ACTIVE" || jAuth.is_active === true) : false;

    return {
      id: jur.id,
      flag: jur.flag,
      name: jur.name,
      shortName: jur.shortName,
      authority: jur.authority,
      activeRules: jRules.length,
      vatGstStatus: latestVat?.status ?? null,
      filingStatus: latestDraft?.validation_status ?? null,
      authorityStatus: jAuth ? (authorityIsActive ? "ACTIVE" : "INACTIVE") : "NONE",
      taxTypes: jur.taxTypes,
    };
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Jurisdiction Overview
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 hover:shadow-md transition-shadow duration-200 flex flex-col gap-3"
          >
            {/* Flag + name */}
            <div className="flex items-center gap-2">
              <span className="text-2xl" role="img" aria-label={card.name}>{card.flag}</span>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-none">
                  {card.shortName}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{card.authority}</p>
              </div>
            </div>

            {/* Tax types */}
            <div className="flex flex-wrap gap-1">
              {card.taxTypes.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                >
                  {t}
                </span>
              ))}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-y-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Rules</span>
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
