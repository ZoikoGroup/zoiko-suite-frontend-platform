import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import {
  ApplicablePolicyPanel,
  VersionHistoryPanel,
  CreatePolicyForm,
  CreateVersionForm,
  ActivateVersionForm,
  EvaluatePolicyForm,
} from "@/components/admin/policies";
import { POLICY_TYPES } from "@/lib/api/policies";

export const metadata: Metadata = { title: "Policies" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Scope = "global" | "tenant" | "entity";

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function PanelSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default async function PoliciesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const requestedType = one(params.policy_type);
  const policyType = (POLICY_TYPES as readonly string[]).includes(requestedType ?? "")
    ? (requestedType as string)
    : "APPROVAL_THRESHOLD";

  const requestedScope = one(params.scope);
  const scope: Scope =
    requestedScope === "global" || requestedScope === "entity" || requestedScope === "tenant"
      ? requestedScope
      : "tenant";

  const historyPolicyId = one(params.history_policy_id);

  return (
    <div>
      <PageHeader
        title="Policies"
        description="Named policies, their effective-dated versions, and evaluation of an action against whichever version is active. A policy is a container; the rules live on its versions, and only an ACTIVE version has any effect."
      />

      <Card className="mb-6 border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this service does and does not enforce</CardTitle>
            <CardDescription>Three limits that change how the page below reads</CardDescription>
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
                  Only APPROVAL_THRESHOLD can be evaluated.
                </strong>{" "}
                The other types can be created, versioned, and activated — and will then be
                enforced by nothing, because every evaluation against them answers 501. Active is
                not the same as applied.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Policy writes are not authorized.
                </strong>{" "}
                policy-svc checks no permission on create, version, or activate. Activation
                changes what the platform enforces and is gated only by this console&apos;s
                session check.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Evidence recording is best-effort.
                </strong>{" "}
                Every evaluation appends a decision to{" "}
                <Link
                  href="/admin/governance"
                  className="font-medium text-navy-700 underline-offset-4 hover:underline dark:text-navy-300"
                >
                  the governance log
                </Link>
                , but a failure there is logged and swallowed — evaluation still returns 200. A
                successful evaluation does not prove its evidence was stored.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Active policy set</CardTitle>
            <CardDescription>
              What would decide, for a given type and scope. Ordered most-specific first — the top
              row is the one evaluation actually uses.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-64">
              <label htmlFor="policy_type" className={LABEL}>
                Policy type
              </label>
              <select
                id="policy_type"
                name="policy_type"
                defaultValue={policyType}
                className={FIELD}
              >
                {POLICY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-56">
              <label htmlFor="scope" className={LABEL}>
                Scope
              </label>
              <select id="scope" name="scope" defaultValue={scope} className={FIELD}>
                <option value="global">Global only</option>
                <option value="tenant">This tenant</option>
                <option value="entity">This legal entity</option>
              </select>
            </div>
            <button
              type="submit"
              className="h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900"
            >
              Read policy set
            </button>
          </form>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={`${policyType}:${scope}`} fallback={<PanelSkeleton />}>
              <ApplicablePolicyPanel policyType={policyType} scope={scope} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Version history</CardTitle>
            <CardDescription>
              Every version of one policy, including drafts that were never activated and versions
              since superseded — the view that answers what a policy required at some past date.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Carried through so switching policy does not reset the policy-set
                reader above, which reads its own two params from the same URL. */}
            <input type="hidden" name="policy_type" value={policyType} />
            <input type="hidden" name="scope" value={scope} />
            <div className="flex-1">
              <label htmlFor="history_policy_id" className={LABEL}>
                Policy ID
              </label>
              <input
                id="history_policy_id"
                name="history_policy_id"
                defaultValue={historyPolicyId ?? ""}
                placeholder="pol-… or the ID returned when the policy was created"
                className={`${FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              className="h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900"
            >
              Read history
            </button>
          </form>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={historyPolicyId ?? "none"} fallback={<PanelSkeleton />}>
              <VersionHistoryPanel policyId={historyPolicyId} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Evaluate an amount</CardTitle>
            <CardDescription>
              The service&apos;s actual decision path. Compares the amount against the deciding
              version&apos;s threshold and records the outcome as evidence.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EvaluatePolicyForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Create a policy</CardTitle>
            <CardDescription>
              Step 1 of 3. A container with a stable code — reusing a code with different
              attributes is a conflict, not an update.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreatePolicyForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Add a draft version</CardTitle>
            <CardDescription>
              Step 2 of 3. The rule content and its scope. Created DRAFT, so it changes nothing
              yet.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreateVersionForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Activate a version</CardTitle>
            <CardDescription>
              Step 3 of 3, and the only write here that changes what the platform enforces.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ActivateVersionForm />
        </CardContent>
      </Card>
    </div>
  );
}
