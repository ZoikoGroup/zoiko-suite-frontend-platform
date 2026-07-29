import type { Metadata } from "next";
import { Suspense } from "react";
import { FileText, ShieldCheck, Store, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { IssueOrderForm, PurchaseOrderPanel } from "@/components/admin/commercial-ops";
import { DOMAINS } from "@/lib/constants";

export const metadata: Metadata = { title: "Commercial Ops" };

const DOMAIN = DOMAINS.find((d) => d.key === "commercial-ops")!;

/** Services in this domain that are not yet wired to the console. */
const UPCOMING = [
  {
    icon: FileText,
    title: "Purchase Request Service",
    body: "Pre-commitment approval. An APPROVED request is what a purchase order normally originates from.",
  },
  {
    icon: Store,
    title: "Vendor Due Diligence",
    body: "Counterparty screening and vendor approval state, checked before spend is committed.",
  },
  {
    icon: Wallet,
    title: "Invoice Approval Service",
    body: "Three-way match between order, receipt, and invoice before payment is released.",
  },
  {
    icon: ShieldCheck,
    title: "Spend Controls",
    body: "Per-entity limits and signatory authority enforced through the approval matrix.",
  },
];

function TableSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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

export default function CommercialOpsPage() {
  return (
    <div>
      <PageHeader title={DOMAIN.label} description={DOMAIN.purpose} />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Issue a purchase order</CardTitle>
            <CardDescription>
              Live, writable. Backed by purchase-order-svc, reached on the single gateway
              port at /purchase-order-svc. Issue, amend, and close are each checked against
              authorization-svc first and fail closed — if authorization cannot be
              determined, the action is refused rather than allowed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <IssueOrderForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Order register</CardTitle>
            <CardDescription>
              Every order for this tenant. Amending restates the total and appends an
              immutable amendment record — it never overwrites history, and it does not
              change the order&apos;s status. Closing is terminal.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {/* Its own boundary so a slow backend can't hold up the issue form. */}
          <Suspense fallback={<TableSkeleton />}>
            <PurchaseOrderPanel />
          </Suspense>
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
                  <item.icon className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
