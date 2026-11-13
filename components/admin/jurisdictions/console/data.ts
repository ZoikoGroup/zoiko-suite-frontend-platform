// Jurisdictions & Rules console: URL state and the reads one render needs.
//
// Everything a reader can change lives in the URL (?tab, ?q, filters, ?page,
// ?id, ?pane, ?ver), so a filtered view or an open record can be bookmarked
// and shared, and the page renders on the server with no client state.
// Reads are wrapped in React's cache(), so the KPI row, the panels, a
// register and its drawer that need the same list fetch it once per request.

import { cache } from "react";
import type { ApiError, ApiResult } from "@/lib/api/client";
import type { SessionIdentity } from "@/lib/auth";
import * as J from "@/lib/api/jurisdictions";
import { listEntities, type LegalEntity } from "@/lib/api/tenants";

export const BASE = "/admin/jurisdictions";

export type Query = Record<string, string | undefined>;

export const TABS = [
  { key: "registry", label: "Jurisdiction registry" },
  { key: "rules", label: "Rules" },
  { key: "packs", label: "Rule packs" },
  { key: "applicability", label: "Applicability decisions" },
  { key: "sources", label: "Source authority" },
  { key: "history", label: "Change history" },
  { key: "rollouts", label: "Rollouts" },
  { key: "calendars", label: "Calendars" },
  { key: "terms", label: "Payment terms" },
  { key: "obligations", label: "Obligation rules" },
  { key: "remediation", label: "Remediation" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export function tabOf(q: Query): TabKey {
  return TABS.some((t) => t.key === q.tab) ? (q.tab as TabKey) : "registry";
}

/** A link to this page with `changes` applied over `base` (undefined drops a key). */
export function href(base: Query, changes: Query = {}): string {
  const merged: Query = { ...base, ...changes };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") sp.set(k, v);
  const s = sp.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** A link to a tab, optionally filtered. */
export function tabHref(tab: TabKey, extra: Query = {}): string {
  return href({}, { tab: tab === "registry" ? undefined : tab, ...extra });
}

/** One read's outcome, kept with its error so a panel can say what failed. */
export type Read<T> = { data: T | null; error: ApiError | null };

export function settle<T>(r: ApiResult<T>): Read<T> {
  return r.ok ? { data: r.data, error: null } : { data: null, error: r.error };
}

export type Ctx = {
  identity: SessionIdentity;
  /** The signed-in principal: the maker never sees the checker's buttons. */
  me: string;
};

// ── cached reads (one fetch per request) ─────────────────────────────────────

export const loadSummary = cache((identity: SessionIdentity) => J.getSummary(identity).then(settle));
export const loadJurisdictions = cache((identity: SessionIdentity) => J.listAllJurisdictions(identity).then(settle));
export const loadSources = cache((identity: SessionIdentity) => J.listSources(identity).then(settle));
export const loadRegions = cache((identity: SessionIdentity) => J.listRegions(identity).then(settle));
export const loadRings = cache((identity: SessionIdentity) => J.listRings(identity).then(settle));
export const loadKeys = cache((identity: SessionIdentity) => J.listSigningKeys(identity).then(settle));
export const loadRegimes = cache((identity: SessionIdentity) => J.listRegimes(identity).then(settle));
export const loadNotices = cache((identity: SessionIdentity) => J.listNotices(identity).then(settle));
export const loadImports = cache((identity: SessionIdentity) => J.listImports(identity).then(settle));
export const loadParked = cache((identity: SessionIdentity) => J.listParkedEvents(identity).then(settle));
export const loadRemediation = cache((identity: SessionIdentity) => J.listRemediationCases(identity).then(settle));
export const loadRollouts = cache((identity: SessionIdentity) => J.listRollouts(identity).then(settle));
export const loadCalendars = cache((identity: SessionIdentity) => J.listCalendars(identity).then(settle));
export const loadObligationRules = cache((identity: SessionIdentity) => J.listObligationRules(identity).then(settle));
export const loadRules = cache((jurisdictionId: string, identity: SessionIdentity) => J.listRules(jurisdictionId, identity).then(settle));
export const loadEntities = cache(async (identity: SessionIdentity): Promise<Read<LegalEntity[]>> =>
  identity.tenantId ? settle(await listEntities(identity.tenantId, identity)) : { data: null, error: { kind: "malformed", message: "The session names no tenant." } },
);

export type PackWithVersions = J.Pack & { versions: J.PackVersion[]; versionsError: ApiError | null };

/** Every pack with its versions (manifests name the jurisdictions they cover). */
export const loadPacks = cache(async (identity: SessionIdentity): Promise<Read<PackWithVersions[]>> => {
  const packs = await J.listPacks(identity);
  if (!packs.ok) return { data: null, error: packs.error };
  const withVersions = await Promise.all(
    packs.data.map(async (p) => {
      const v = await J.listPackVersions(p.pack_ref, identity);
      return { ...p, versions: v.ok ? v.data : [], versionsError: v.ok ? null : v.error };
    }),
  );
  return { data: withVersions, error: null };
});

/** The version a pack presents: its newest RELEASED, else its newest of any status. */
export function currentVersion(p: PackWithVersions): J.PackVersion | undefined {
  const byNewest = [...p.versions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return byNewest.find((v) => v.status === "RELEASED") ?? byNewest[0];
}

/** Jurisdiction code → the released pack versions that name it. */
export function releasedCoverage(packs: PackWithVersions[] | null): Map<string, { pack: PackWithVersions; version: J.PackVersion }[]> {
  const out = new Map<string, { pack: PackWithVersions; version: J.PackVersion }[]>();
  for (const p of packs ?? []) {
    for (const v of p.versions) {
      if (v.status !== "RELEASED") continue;
      for (const code of v.manifest?.jurisdiction_ids ?? []) {
        const list = out.get(code) ?? [];
        list.push({ pack: p, version: v });
        out.set(code, list);
      }
    }
  }
  return out;
}

/** Every pack version that names a jurisdiction code, whatever its status. */
export function packsNaming(packs: PackWithVersions[] | null, code: string): { pack: PackWithVersions; version: J.PackVersion }[] {
  const out: { pack: PackWithVersions; version: J.PackVersion }[] = [];
  for (const p of packs ?? []) for (const v of p.versions) if (v.manifest?.jurisdiction_ids?.includes(code)) out.push({ pack: p, version: v });
  return out.sort((a, b) => b.version.created_at.localeCompare(a.version.created_at));
}

export function jurisdictionLabel(byId: Map<string, J.Jurisdiction>, id: string | null | undefined): string {
  if (!id) return "—";
  const j = byId.get(id);
  return j ? `${j.jurisdiction_name} (${j.jurisdiction_code})` : `${id.slice(0, 8)}…`;
}

/** A regional-indicator flag for a two-letter country code; nothing for anything else. */
export function flagOf(code: string): string {
  const cc = code.split("-")[0].toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function day(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
