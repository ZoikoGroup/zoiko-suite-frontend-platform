import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { DelegationRegisterPanel, GrantDelegationForm } from "@/components/admin/delegations";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Delegated Authority | Zoiko Suite" };

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * The grant form needs the signed-in principal, because the delegator defaults
 * to it — a principal may only delegate their own authority, and prefilling
 * anything else would invite the one request the service is built to refuse.
 */
async function GrantForm() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return (
    <GrantDelegationForm
      principalId={session.principalId}
      legalEntityId={session.legalEntityId ?? ""}
      // Minted here, once per render of this route. Every write ends in
      // refresh(), so a grant that lands produces a fresh key for the next one
      // while a retry of the same submission reuses it and replays.
      correlationId={crypto.randomUUID()}
    />
  );
}

export default function DelegationsPage() {
  return (
    <div>
      <PageHeader
        title="Delegated Authority"
        description="Who may act for whom — time-bound, entity-scoped, one action at a time. A delegation may never exceed the delegator’s own authority, and nothing here is ever deleted: grants end by revocation or by expiry, and both are terminal."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Delegation register</CardTitle>
            <CardDescription>
              Every delegation you are entitled to see. With DELEGATION_VIEW on the legal entity this
              is the entity&rsquo;s full register; without it, the delegations you are personally
              party to. Statuses are current as of this read — a due delegation flips to EXPIRED when
              the register is read, not by a background job.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <DelegationRegisterPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Grant a delegation</CardTitle>
            <CardDescription>
              Hand one of your own authorities to another principal for a fixed window. The service
              verifies that the delegator actually holds the action before writing anything, so a
              delegation can never manufacture authority that did not already exist. Submitting the
              same form twice replays the first grant rather than creating a second.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <GrantForm />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this register will refuse</CardTitle>
            <CardDescription>
              Recorded here because each of these reads as a permission problem and is not one — they
              are the control working
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  You may only delegate your own authority.
                </strong>{" "}
                Naming someone else as delegator needs DELEGATION_ADMINISTER on the entity. Until
                18 Aug it needed nothing at all: the service checked that the named delegator held
                the action, never that the caller had any right to give it away — so anyone able to
                create a delegation could name a colleague as delegator, name themselves as
                delegate, and take that colleague&rsquo;s authority.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  An administrator may not be the beneficiary.
                </strong>{" "}
                DELEGATION_ADMINISTER lets you arrange delegations between other people. It does not
                let you route their authority to yourself — that is the same escalation by a longer
                route, and it is refused however the grant is worded.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A delegation cannot exceed its delegator.
                </strong>{" "}
                Before writing anything the service asks authorization-svc whether the delegator
                actually holds the action being delegated. If they do not, nothing is written — you
                cannot hand on what you were never given.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Expiry is observed, not scheduled.
                </strong>{" "}
                No background job sweeps this table. A delegation past its window flips to EXPIRED
                the next time the register is read, and authority.expired is published at that
                moment — so a grant nobody looks at stays ACTIVE in the row until someone does.
                The window is what bounds the authority; the status is how this page reports it.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
