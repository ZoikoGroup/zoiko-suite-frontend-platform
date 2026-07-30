import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, CloudOff, ShieldAlert } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import {
  ContractStatusBadge,
  ContractTerms,
  LifecycleActions,
  VersionTimeline,
} from "@/components/admin/legal";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { getContract } from "@/lib/api/contracts";

export const metadata: Metadata = { title: "Contract" };

/** `params` is a promise in Next 16 — typed explicitly rather than through the
 *  generated PageProps helper so this file compiles before route types exist. */
type ContractPageProps = { params: Promise<{ contractId: string }> };

function TimelineSkeleton() {
  return (
    <div className="space-y-4 pl-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-3 w-full max-w-md rounded" />
        </div>
      ))}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/legal"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-700 dark:text-slate-400 dark:hover:text-navy-300"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Contract register
    </Link>
  );
}

/**
 * One contract, read fresh from contract-lifecycle-svc.
 *
 * Deliberately re-reads the contract rather than carrying it over from the
 * register: a lifecycle action taken here is checked by the service against the
 * status it holds now, so the buttons this page offers have to be derived from
 * the same reading, not from a list that may be a minute old.
 */
export default async function ContractPage({ params }: ContractPageProps) {
  const { contractId } = await params;

  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <div>
        <BackLink />
        <Card>
          <CardContent>
            <PanelEmptyState
              icon={ShieldAlert}
              tone="warning"
              label="No active session"
              hint="Sign in again to read this contract."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await getContract(contractId, identity);

  // A 404 is a missing contract and gets the not-found page. Anything else is
  // the service failing, which is a different fact and must not be reported as
  // "this contract does not exist".
  if (!result.ok) {
    if (result.error.status === 404) notFound();

    return (
      <div>
        <BackLink />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Contract unavailable</CardTitle>
              <CardDescription>
                The contract could not be read. This is a service failure, not a missing record.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PanelEmptyState
              icon={CloudOff}
              tone="warning"
              label="contract-lifecycle-svc did not answer"
              hint={result.error.message}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const contract = result.data;

  return (
    <div>
      <BackLink />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {contract.title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {contract.contract_type} ·{" "}
            {contract.counterparty_name || contract.counterparty_id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ContractStatusBadge status={contract.status} />
          <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
            v{contract.version}
          </span>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>
              Only the transitions contract-lifecycle-svc will accept from {contract.status} are
              offered. The service re-checks on arrival — these buttons reflect its rules, they do
              not enforce them.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LifecycleActions contract={contract} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Terms</CardTitle>
            <CardDescription>As currently stored, at v{contract.version}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ContractTerms contract={contract} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Version history</CardTitle>
            <CardDescription>
              Immutable snapshots, oldest first. Appended on draft, revision, activation, and
              termination — but not on submission for approval, which the service does not
              version.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {/* Its own boundary — the history is a second round trip and should not
              delay the contract's own details or its action buttons. */}
          <Suspense fallback={<TimelineSkeleton />}>
            <VersionTimeline contractId={contract.contract_id} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
