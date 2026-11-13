// The KPI row and the three panels above the register: where jurisdictions are
// covered by a released pack, how pack versions move to publication, and what
// is waiting for a second person. Every figure is a live count; a source that
// cannot be read says so instead of showing zero.

import Link from "next/link";
import { AlertTriangle, ClipboardCheck, FileCheck2, FileClock, FileWarning, Globe2, Layers, ScrollText } from "lucide-react";
import { Card } from "@/components/ui";
import { ConsolePanel, KpiCard, KpiGrid, Pipeline, PanelNote } from "@/components/admin/console";
import type { SessionIdentity } from "@/lib/auth";
import { sourceAwaitingReview } from "@/lib/api/jurisdictions";
import { cn } from "@/lib/utils";
import {
  loadImports,
  loadJurisdictions,
  loadNotices,
  loadPacks,
  loadRegions,
  loadRemediation,
  loadSources,
  loadSummary,
  releasedCoverage,
  tabHref,
} from "./data";
import { Chip } from "./shared";

const UNREAD = "—";

export async function JurisdictionKpis({ identity }: { identity: SessionIdentity }) {
  const [summary, regions, sources] = await Promise.all([loadSummary(identity), loadRegions(identity), loadSources(identity)]);
  const s = summary.data;
  const pendingSources = sources.data ? sources.data.filter(sourceAwaitingReview).length : null;
  const awaiting = s ? s.kpis.rules_draft + s.attention.proposed_imports + s.pack_pipeline.review : null;
  const attention = s ? s.kpis.open_drift_and_remediation : null;
  return (
    <KpiGrid>
      <KpiCard
        label="Jurisdictions configured"
        icon={Globe2}
        value={s ? s.kpis.active_jurisdictions : UNREAD}
        tone={s ? "navy" : "neutral"}
        status={regions.data ? `${regions.data.length} region${regions.data.length === 1 ? "" : "s"}` : s ? undefined : "Unavailable"}
        helper={regions.data ? "with explicit rule scope" : s ? "regions unavailable" : undefined}
        href={tabHref("registry")}
      />
      <KpiCard
        label="Published rule packs"
        icon={FileCheck2}
        value={s ? s.kpis.pack_versions_released : UNREAD}
        tone={s ? "green" : "neutral"}
        status={s ? "Released" : "Unavailable"}
        helper={s ? `${s.pack_pipeline.deployed} deployed · signed & versioned` : undefined}
        href={tabHref("packs", { status: "RELEASED" })}
      />
      <KpiCard
        label="Source checks pending"
        icon={FileClock}
        value={pendingSources ?? UNREAD}
        tone={pendingSources === null ? "neutral" : pendingSources > 0 ? "amber" : "green"}
        status={pendingSources === null ? "Unavailable" : pendingSources > 0 ? "Requires review" : "All reviewed"}
        helper={pendingSources === null ? undefined : s ? `before citing · ${s.attention.open_source_change_notices} change notice(s) open` : "before citing"}
        href={tabHref("sources", { state: "PENDING" })}
      />
      <KpiCard
        label="Drift & remediation"
        icon={AlertTriangle}
        value={attention ?? UNREAD}
        tone={attention === null ? "neutral" : attention > 0 ? "red" : "green"}
        status={attention === null ? "Unavailable" : attention > 0 ? "Action needed" : "None open"}
        helper={s ? `${s.attention.drifted_rules} drifted rule(s) · ${s.attention.open_remediation_cases} case(s)` : undefined}
        href={tabHref("rules", { drift: "OPEN" })}
      />
      <KpiCard
        label="Awaiting a second person"
        icon={ClipboardCheck}
        value={awaiting ?? UNREAD}
        tone={awaiting === null ? "neutral" : awaiting > 0 ? "amber" : "green"}
        status={awaiting === null ? "Unavailable" : "Maker-checker"}
        helper={s ? `${s.kpis.rules_draft} rule(s) · ${s.attention.proposed_imports} import(s) · ${s.pack_pipeline.review} pack review(s)` : undefined}
        href={tabHref("rules", { status: "DRAFT" })}
      />
    </KpiGrid>
  );
}

/** Configured jurisdictions grouped by type, and how many a released pack covers. */
async function CoveragePanel({ identity }: { identity: SessionIdentity }) {
  const [jurisdictions, packs] = await Promise.all([loadJurisdictions(identity), loadPacks(identity)]);
  if (!jurisdictions.data) {
    return (
      <ConsolePanel title="Jurisdiction coverage" description="Configured jurisdictions by type">
        <PanelNote>The jurisdiction register is unavailable.</PanelNote>
      </ConsolePanel>
    );
  }
  const covered = releasedCoverage(packs.data);
  const active = jurisdictions.data.filter((j) => j.active_flag);
  const groups = new Map<string, { total: number; covered: number }>();
  for (const j of active) {
    const key = j.jurisdiction_type || "OTHER";
    const g = groups.get(key) ?? { total: 0, covered: 0 };
    g.total++;
    if (covered.has(j.jurisdiction_code)) g.covered++;
    groups.set(key, g);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  const shown = sorted.slice(0, 3);
  const rest = sorted.slice(3).reduce((acc, [, g]) => ({ total: acc.total + g.total, covered: acc.covered + g.covered }), { total: 0, covered: 0 });
  if (rest.total) shown.push(["Other types", rest]);
  return (
    <ConsolePanel title="Jurisdiction coverage" description="Active jurisdictions by type · bar = share with a released pack" link={{ label: "View all", href: tabHref("registry") }}>
      {shown.length === 0 ? (
        <PanelNote>No jurisdiction is configured yet.</PanelNote>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map(([type, g]) => {
            const pct = g.total ? Math.round((g.covered / g.total) * 100) : 0;
            return (
              <Link
                key={type}
                href={type === "Other types" ? tabHref("registry") : tabHref("registry", { type })}
                scroll={false}
                className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3 transition-colors hover:border-navy-200 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <span className="flex items-center justify-between text-[11.5px] text-slate-500 dark:text-slate-400">
                  <span className="truncate">{type.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                  <span className="tabular-nums">{g.total}</span>
                </span>
                <span className="mt-1 block text-[17px] font-bold text-navy-950 dark:text-white">
                  {g.total} jurisdiction{g.total === 1 ? "" : "s"}
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" title={`${g.covered} of ${g.total} covered by a released pack`}>
                  <span className={cn("block h-full rounded-full", pct >= 50 ? "bg-navy-600 dark:bg-navy-400" : "bg-gold-500")} style={{ width: `${pct}%` }} />
                </span>
                <span className="mt-1.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  {g.covered} of {g.total} with a released pack
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </ConsolePanel>
  );
}

async function PublicationPanel({ identity }: { identity: SessionIdentity }) {
  const summary = await loadSummary(identity);
  const p = summary.data?.pack_pipeline;
  return (
    <ConsolePanel title="Controlled rule publication" description="Segregated review stages; draft changes never auto-publish" link={{ label: "View change queue", href: tabHref("packs") }}>
      {!p ? (
        <PanelNote>The publication pipeline is unavailable.</PanelNote>
      ) : (
        <Pipeline
          stages={[
            { label: "Draft", value: p.draft, caption: "New or changed versions", href: tabHref("packs", { status: "DRAFT" }) },
            { label: "In review", value: p.review, caption: "Tests and independent reviews", href: tabHref("packs", { status: "REVIEW" }) },
            { label: "Certified", value: p.certified, caption: "Dual-control gate passed", href: tabHref("packs", { status: "CERTIFIED" }) },
            { label: "Published", value: p.released, caption: "Signed, versioned packs", href: tabHref("packs", { status: "RELEASED" }) },
          ]}
          note={
            <>
              Effective-dated publishing, rollback records and immutable decision evidence
              {p.withdrawn + p.emergency_blocked > 0 && ` · ${p.withdrawn} withdrawn, ${p.emergency_blocked} blocked`}
            </>
          }
        />
      )}
    </ConsolePanel>
  );
}

type QueueItem = { key: string; title: string; caption: string; chip: string; tone: "warning" | "danger" | "info"; href: string; icon: typeof ScrollText; at: string };

async function QueuePanel({ identity }: { identity: SessionIdentity }) {
  const [sources, notices, imports, packs, cases, jurisdictions] = await Promise.all([
    loadSources(identity),
    loadNotices(identity),
    loadImports(identity),
    loadPacks(identity),
    loadRemediation(identity),
    loadJurisdictions(identity),
  ]);
  const code = new Map((jurisdictions.data ?? []).map((j) => [j.jurisdiction_id, j.jurisdiction_code]));
  const items: QueueItem[] = [];
  for (const s of sources.data ?? []) {
    if (sourceAwaitingReview(s))
      items.push({ key: `s${s.source_id}`, title: s.title, caption: `Source check · ${code.get(s.jurisdiction_id) ?? s.authority}`, chip: "Review", tone: "warning", href: tabHref("sources", { id: s.source_id }), icon: ScrollText, at: s.created_at });
  }
  for (const n of notices.data ?? []) {
    if (n.status !== "CLOSED")
      items.push({ key: `n${n.notice_id}`, title: n.title, caption: `Source change · ${n.change_type.replaceAll("_", " ").toLowerCase()}`, chip: n.status === "OPEN" ? "Review" : "In review", tone: "warning", href: tabHref("history", { id: `notice:${n.notice_id}` }), icon: FileWarning, at: n.created_at });
  }
  for (const b of imports.data ?? []) {
    if (b.status === "PROPOSED")
      items.push({ key: `i${b.batch_id}`, title: b.summary, caption: `Import · ${b.source_standard} ${b.source_version}`, chip: "Approve", tone: "info", href: tabHref("history", { id: `import:${b.batch_id}` }), icon: Layers, at: b.proposed_at });
  }
  for (const p of packs.data ?? []) {
    for (const v of p.versions) {
      if (v.status === "REVIEW")
        items.push({ key: `p${v.pack_version_id}`, title: `${p.pack_name} ${v.version}`, caption: `Rule pack · ${p.pack_ref}`, chip: "Queue", tone: "info", href: tabHref("packs", { id: p.pack_ref, ver: v.version }), icon: FileCheck2, at: v.created_at });
    }
  }
  for (const c of cases.data ?? []) {
    if (c.status === "OPEN")
      items.push({ key: `c${c.case_id}`, title: `${c.pack_ref}@${c.version} remediation`, caption: `${c.progress?.pending ?? c.decisions_total} decision(s) to disposition`, chip: "Resolve", tone: "danger", href: tabHref("remediation", { id: c.case_id }), icon: AlertTriangle, at: c.opened_at });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  const failed = [sources, notices, imports, packs, cases].filter((r) => r.error).length;
  return (
    <ConsolePanel title="Review & change queue" description="Live items waiting for a second person" link={{ label: "Open worklist", href: tabHref("history") }}>
      {items.length === 0 ? (
        <PanelNote>{failed ? "Part of the queue is unavailable; nothing readable is waiting." : "Nothing is waiting for a second person."}</PanelNote>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.slice(0, 4).map((i) => (
            <li key={i.key}>
              <Link href={i.href} scroll={false} className="flex items-center gap-3 py-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                  <i.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{i.title}</span>
                  <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">{i.caption}</span>
                </span>
                <Chip text={i.chip} tone={i.tone} />
              </Link>
            </li>
          ))}
          {items.length > 4 && <li className="pt-2 text-[11.5px] text-slate-500">and {items.length - 4} more</li>}
        </ul>
      )}
    </ConsolePanel>
  );
}

export function JurisdictionPanels({ identity }: { identity: SessionIdentity }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <CoveragePanel identity={identity} />
      <PublicationPanel identity={identity} />
      <QueuePanel identity={identity} />
    </div>
  );
}

/** The small scope chips above the register (mock: "33 configured · Tenant-aware scope …"). */
export async function ScopeChips({ identity }: { identity: SessionIdentity }) {
  const j = await loadJurisdictions(identity);
  const chip = "rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <Card className="flex flex-wrap items-center gap-2 border-dashed px-4 py-2 shadow-none hover:shadow-none">
      <span className={chip}>{j.data ? `${j.data.filter((x) => x.active_flag).length} configured` : "Register unavailable"}</span>
      <span className={chip}>Platform-scoped reference data</span>
      <span className={chip}>Entity-aware applicability</span>
    </Card>
  );
}
