import type { Metadata } from "next";
import { Suspense } from "react";
import { FileStack, Gavel, Handshake, ScrollText } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { ContractRegisterPanel, DraftContractForm } from "@/components/admin/legal";
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
    </div>
  );
}
