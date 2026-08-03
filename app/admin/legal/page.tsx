import type { Metadata } from "next";
import { Suspense } from "react";
import { Scale, FileText, AlertTriangle, FileCode, Briefcase } from "lucide-react";
import { DOMAINS } from "@/lib/constants";
import {
  BoardResolutionsPanel,
  ObligationTrackingPanel,
  ContractLifecyclePanel,
  ClausesAndTemplatesPanel,
  CorporateActionsAndCounterpartiesPanel,
  LegalActionHeader,
} from "@/components/admin/legal";

export const metadata: Metadata = { title: "Legal & Contracts | Zoiko Suite" };

/** Skeleton row used while a panel's Suspense boundary is resolving. */
function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

/** Reusable section card with a header strip. */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  ports,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  ports: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20">
            <Icon className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </span>
          <div>
            <h2
              id={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-mono font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          :{ports}
        </span>
      </div>

      {/* Card body */}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default async function LegalPage() {
  const domain = DOMAINS.find((d) => d.key === "legal")!;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {domain.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{domain.purpose}</p>
      </div>

      {/* ── Interactive Action Header ───────────────────────────────── */}
      <LegalActionHeader />

      {/* ── Core Service Badges ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {domain.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          </div>
        ))}
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* ── Live Service Panels ─────────────────────────────────────── */}
      <div className="space-y-6">
        {/* 1 — Contract Master */}
        <SectionCard
          icon={FileText}
          title="Contract Lifecycle Management"
          subtitle="contract-lifecycle-svc — agreements, counterparties, and lifecycle transitions"
          ports="8119"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <ContractLifecyclePanel />
          </Suspense>
        </SectionCard>

        {/* 2 — Clauses & Templates */}
        <SectionCard
          icon={FileCode}
          title="Clauses & Contract Templates"
          subtitle="clause-template-svc — standard clause library and contract assembly templates"
          ports="8120"
        >
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <ClausesAndTemplatesPanel />
          </Suspense>
        </SectionCard>

        {/* 3 — Legal Obligation Tracking */}
        <SectionCard
          icon={AlertTriangle}
          title="Legal Obligation Tracking"
          subtitle="obligation-tracking-svc — contractual, regulatory, and policy commitments"
          ports="8121"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <ObligationTrackingPanel />
          </Suspense>
        </SectionCard>

        {/* 4 — Board Resolutions & Governance */}
        <SectionCard
          icon={Scale}
          title="Board Governance & Resolutions"
          subtitle="board-resolutions-svc — board meetings, resolution voting, and corporate minutes"
          ports="8122"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <BoardResolutionsPanel />
          </Suspense>
        </SectionCard>

        {/* 5 — Corporate Actions & Counterparties */}
        <SectionCard
          icon={Briefcase}
          title="Corporate Actions & Counterparties"
          subtitle="corporate-actions-svc & counterparty-management-svc — equity execution and vendor risk governance"
          ports="8123, 8124"
        >
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <CorporateActionsAndCounterpartiesPanel />
          </Suspense>
        </SectionCard>
      </div>
    </div>
  );
}
