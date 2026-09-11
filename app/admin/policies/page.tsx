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
import { FIELD, HINT, LABEL } from "@/components/admin/shared/form";
import {
  ApplicablePolicyPanel,
  VersionHistoryPanel,
  CreatePolicyForm,
  CreateVersionForm,
  ActivateVersionForm,
  EvaluatePolicyForm,
} from "@/components/admin/policies";
import { POLICY_TYPES, describePolicyType } from "@/lib/api/policies";

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
        description="The rules that decide whether something needs approving, and the limits they set. A rule is only a name — the limit lives on its versions, and a version applies to nothing until it is brought into force."
      />

      <Card className="mb-6 border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>Three things this page cannot do for you</CardTitle>
            <CardDescription>Worth knowing before you rely on anything below</CardDescription>
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
                  Only approval thresholds are acted on.
                </strong>{" "}
                The other kinds of rule can be created, given limits, and brought into force —
                and the platform will still never consult them. A rule being in force is not the
                same as a rule being applied.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Changing a rule needs permission, and is refused if it cannot be confirmed.
                </strong>{" "}
                Creating a rule, setting a limit and bringing one into force are each checked
                against your permissions before they are allowed. If that check cannot be
                carried out at all, the change is refused rather than waved through — so a
                refusal here can mean the permission service is unreachable, not that you lack
                the permission.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A check is not guaranteed to be kept on record.
                </strong>{" "}
                Every check you run is filed in{" "}
                <Link
                  href="/admin/governance"
                  className="font-medium text-navy-700 underline-offset-4 hover:underline dark:text-navy-300"
                >
                  the governance log
                </Link>
                , but if the filing fails the check still comes back with an answer. Getting an
                answer here does not prove it was recorded — look the reference up in the log
                when it matters.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>What is in force right now</CardTitle>
            <CardDescription>
              The rules that would decide, for a kind of rule and a scope. The narrowest rule
              wins, so the top row is the one that actually decides.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-72">
              <label htmlFor="policy_type" className={LABEL}>
                Kind of rule
              </label>
              <select
                id="policy_type"
                name="policy_type"
                defaultValue={policyType}
                className={FIELD}
              >
                {POLICY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {describePolicyType(type).label} ({type})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-64">
              <label htmlFor="scope" className={LABEL}>
                Who it applies to
              </label>
              <select id="scope" name="scope" defaultValue={scope} className={FIELD}>
                <option value="global">Every organisation on the platform</option>
                <option value="tenant">This organisation</option>
                <option value="entity">This legal entity only</option>
              </select>
            </div>
            <button
              type="submit"
              className="h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900"
            >
              Show them
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
            <CardTitle>The history of one rule</CardTitle>
            <CardDescription>
              Every limit a rule has ever had, including ones never brought into force and ones
              since replaced — the view that answers what the rule required on some past date.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Carried through so switching rule does not reset the reader
                above, which reads its own two params from the same URL. */}
            <input type="hidden" name="policy_type" value={policyType} />
            <input type="hidden" name="scope" value={scope} />
            <div className="flex-1">
              <label htmlFor="history_policy_id" className={LABEL}>
                Rule reference
              </label>
              <input
                id="history_policy_id"
                name="history_policy_id"
                defaultValue={historyPolicyId ?? ""}
                placeholder="e.g. 4f8c21ba-90d7-4e13-8a55-c7b02e6d41f9"
                className={`${FIELD} font-mono text-xs`}
                autoComplete="off"
              />
              <p className={HINT}>
                The long reference the service generated for the rule, not the short code you
                chose. Click a rule reference in the table above to copy it.
              </p>
            </div>
            <button
              type="submit"
              className="h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900"
            >
              Show the history
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
            <CardTitle>Check an amount</CardTitle>
            <CardDescription>
              Ask whether an amount needs approving. It is compared against whichever limit is in
              force, and the answer is filed for the record.
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
            <CardTitle>Create a rule</CardTitle>
            <CardDescription>
              Step 1 of 3. Just a name and a code. Reusing a code with different details is
              treated as redefining the rule, not updating it, and is refused.
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
            <CardTitle>Set the limit</CardTitle>
            <CardDescription>
              Step 2 of 3. The number the rule enforces, and who it applies to. Saving it changes
              nothing yet.
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
            <CardTitle>Bring a limit into force</CardTitle>
            <CardDescription>
              Step 3 of 3, and the only thing on this page that changes what the platform
              actually enforces.
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
