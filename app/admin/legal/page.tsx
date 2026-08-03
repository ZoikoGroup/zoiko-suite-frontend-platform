import type { Metadata } from "next";
import { Suspense } from "react";
import {
  FileStack,
  Gavel,
  Handshake,
  ScrollText,
  Scale,
  FileText,
  AlertTriangle,
  FileCode,
  Briefcase,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  ContractRegisterPanel,
  DraftContractForm,
  LegalActionHeader,
  ContractLifecyclePanel,
  ClausesAndTemplatesPanel,
  ObligationTrackingPanel,
  BoardResolutionsPanel,
  CorporateActionsAndCounterpartiesPanel,
} from "@/components/admin/legal";
import { DOMAINS } from "@/lib/constants";

export const metadata: Metadata = { title: "Legal & Contracts" };

const DOMAIN = DOMAINS.find((d) => d.key === "legal")!;

/** Services in this domain that are not yet wired to the console. */
const UPCOMING = [
  {
    icon: ScrollText,
    title: "Clause & Template Service",
    body: "Approved clause library. A drafted contract should assemble from vetted clauses rather than free text.",
  },
  {
    icon: Gavel,
    title: "Legal Approvals Service",
    body: "The approval matrix that PENDING_APPROVAL is meant to wait on. Until it is wired, approval is a status and not a gate.",
  },
  {
    icon: Handshake,
    title: "Counterparty Management",
    body: "The register the counterparty ID on a contract should resolve to, with screening state.",
  },
  {
    icon: FileStack,
    title: "Document Vault",
    body: "Custody of the executed document referenced when a contract is activated.",
  },
];

/**
 * Section wrapper for the domain-summary panels that came from the platform work
 * on main. Kept alongside the contract console above rather than replacing it:
 * the console is the write path against contract-lifecycle-svc, these are
 * read-only summaries across the wider legal domain, and both are wanted.
 */
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
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
            <Icon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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

      <div className="p-5">{children}</div>
    </section>
  );
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function LegalPage() {
  return (
    <div>
      <PageHeader title={DOMAIN.label} description={DOMAIN.purpose} />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Draft a contract</CardTitle>
            <CardDescription>
              Live, writable. Backed by contract-lifecycle-svc, reached on the single gateway
              port at /contract-lifecycle-svc. Contracts are created as DRAFT at v1 and are not
              in force until activated.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DraftContractForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Contract register</CardTitle>
            <CardDescription>
              Every agreement for this tenant. Revising the terms appends an immutable version
              and bumps the version number — it never overwrites history, and it does not change
              the contract&apos;s status. Open a contract to move it through its lifecycle.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {/* Its own boundary so a slow backend can't hold up the draft form. */}
          <Suspense fallback={<RegisterSkeleton />}>
            <ContractRegisterPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6 border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>Governance gaps in this service</CardTitle>
            <CardDescription>
              Recorded here because the register above cannot show them, and a reader who assumes
              otherwise would draw the wrong conclusion from it
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Contract writes are not authorized.
                </strong>{" "}
                contract-lifecycle-svc builds an authorization-svc client and never calls it, so
                no contract mutation is checked against a grant and none can fail closed. This is
                unlike purchase-order-svc, where every write is checked before it is applied.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Approval is a status, not a gate.
                </strong>{" "}
                Activation refuses only ACTIVE and TERMINATED contracts, so a DRAFT can be signed
                into force without ever passing through PENDING_APPROVAL.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Submission leaves no trace.
                </strong>{" "}
                Every other transition appends a version row. Submitting for approval appends none
                and records no actor, so the version history cannot show that a contract was ever
                submitted, or by whom.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rest of the domain</CardTitle>
            <CardDescription>Wired to the console as each service comes online</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {UPCOMING.map((item) => (
              <div
                key={item.title}
                className="flex gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors duration-150 hover:border-navy-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-navy-500 dark:hover:bg-slate-800/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
                  <item.icon
                    className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Domain summaries across the wider legal estate, from the platform work
          on main. Kept below the contract console rather than in place of it. */}
      <LegalActionHeader />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {DOMAIN.coreServices.map((svc) => (
          <div
            key={svc}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span className="truncate">{svc}</span>
            <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-6">
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
