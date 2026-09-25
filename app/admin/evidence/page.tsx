import type { Metadata } from "next";
import { Suspense } from "react";
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
  CatalogPanel,
  CreateRequirementForm,
  RetireRequirementForm,
  EvaluateEvidenceForm,
  EvaluationLookup,
  RequirementLookup,
} from "@/components/admin/evidence";
import { domainLabel } from "@/lib/api/evidence";
import { DOMAIN_CODES } from "./state";

export const metadata: Metadata = { title: "Evidence Requirements" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default async function EvidencePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const domainCode = one(params.domain_code);
  const actionType = one(params.action_type);

  return (
    <div>
      <PageHeader
        title="Evidence Requirements"
        description="Decides whether the paperwork an action needs is actually on file before it can go ahead. Set out what each action requires, then check any action against it."
      />

      <Card className="mb-6 border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div>
            <CardTitle>Three outcomes, not two</CardTitle>
            <CardDescription>
              The design decision that makes this service worth trusting
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                It can go ahead
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Everything required is on file. Nothing is holding the action up.
              </p>
              <p className="mt-1.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                SATISFIED
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/30 dark:bg-rose-500/5">
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                It must be stopped
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Something required is not on file. The check says what to produce.
              </p>
              <p className="mt-1.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                MISSING
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Nothing is being checked
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                No evidence has been asked for here. Not approval — the action is simply not
                covered.
              </p>
              <p className="mt-1.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                NO_REQUIREMENTS_DEFINED
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            The third answer exists so that &ldquo;nobody has set this up yet&rdquo; cannot be
            mistaken for &ldquo;checked and complete&rdquo;. Most systems would report both as a
            pass. This one keeps them apart, and this page shows the third in amber and says
            plainly that nothing was checked.
          </p>
          <p className="border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <strong className="font-medium text-slate-800 dark:text-slate-100">
              When this service cannot be sure, it refuses rather than guesses.
            </strong>{" "}
            Your permission to change the catalog is checked before anything is saved, and if that
            check cannot be made, nothing is saved. If a request does not say which business or
            which person it is for, it is refused rather than assumed. And if the documents you
            list cannot be looked up, you get no answer at all — because recording evidence as
            missing during an outage would put something untrue into a record that is kept
            permanently.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Requirement catalog</CardTitle>
            <CardDescription>
              Withdrawn requirements are shown too, on purpose — hiding them would misrepresent
              what used to be required, which is exactly what an audit asks about.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <label htmlFor="domain_code" className={LABEL}>
                Business area
              </label>
              <select
                id="domain_code"
                name="domain_code"
                defaultValue={domainCode ?? ""}
                className={FIELD}
              >
                <option value="">All business areas</option>
                {DOMAIN_CODES.map((code) => (
                  <option key={code} value={code}>
                    {domainLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="action_type" className={LABEL}>
                Action
              </label>
              <input
                id="action_type"
                name="action_type"
                defaultValue={actionType ?? ""}
                placeholder="INVOICE_APPROVAL"
                className={FIELD}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              className="h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900"
            >
              Filter catalog
            </button>
          </form>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense
              key={`${domainCode ?? ""}:${actionType ?? ""}`}
              fallback={<TableSkeleton />}
            >
              <CatalogPanel domainCode={domainCode} actionType={actionType} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Check an action</CardTitle>
            <CardDescription>
              The gate itself. Answering is not the same as approving — a check that completes
              successfully can still tell you the action must be stopped, so read the answer rather
              than assuming it went through.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EvaluateEvidenceForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Look up a past check</CardTitle>
            <CardDescription>
              Every check is kept exactly as it was made and is never rewritten, so an old one
              still explains itself even after the requirements have since changed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EvaluationLookup />
          <RequirementLookup />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Add a requirement</CardTitle>
            <CardDescription>
              This saves straight away. A requirement covering every company is a broader change,
              so it needs permission over the whole business rather than one company.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreateRequirementForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Withdraw a requirement</CardTitle>
            <CardDescription>
              Nothing is ever deleted here. Withdrawing sets the date it stopped applying, and
              doing it twice tells you so rather than quietly appearing to work again.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RetireRequirementForm />
        </CardContent>
      </Card>
    </div>
  );
}
