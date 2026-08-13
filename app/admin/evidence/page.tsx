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
import { PageHeader, LookupById } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import {
  CatalogPanel,
  CreateRequirementForm,
  RetireRequirementForm,
  EvaluateEvidenceForm,
} from "@/components/admin/evidence";
import { DOMAIN_CODES } from "./state";
import { lookupRequirement, lookupEvaluation } from "./actions";

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
        description="The gate that decides whether the evidence required before an action may complete actually exists. A catalog of effective-dated requirements, and an evaluator that answers against them."
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
                SATISFIED
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Every effective requirement was matched. The action may proceed.
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/30 dark:bg-rose-500/5">
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">MISSING</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                At least one requirement is unmet. The action must be blocked.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                NO_REQUIREMENTS_DEFINED
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Nothing is configured to check. Not a pass — the action is simply ungated.
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            The third exists so an empty catalog cannot be mistaken for a verified one. Reporting
            it as SATISFIED would make &ldquo;nobody has configured this yet&rdquo; look identical
            to &ldquo;checked and complete&rdquo; — so this console renders it amber and says so.
          </p>
          <p className="border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <strong className="font-medium text-slate-800 dark:text-slate-100">
              This is the strictest service in the suite about its own boundaries.
            </strong>{" "}
            Catalog writes are checked against authorization-svc and fail{" "}
            <em>closed</em>. A missing tenant header is a 400 rather than a silent fallback to a
            placeholder tenant. A body tenant that disagrees with the verified header is a 403. And
            an unreachable document-vault-svc yields a 503 rather than a MISSING verdict — refusing
            to answer beats writing a false fact into an append-only ledger.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Requirement catalog</CardTitle>
            <CardDescription>
              Includes retired requirements, deliberately — hiding them would misrepresent what
              the gate used to require, which is what an audit needs to see.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <label htmlFor="domain_code" className={LABEL}>
                Domain
              </label>
              <select
                id="domain_code"
                name="domain_code"
                defaultValue={domainCode ?? ""}
                className={FIELD}
              >
                <option value="">All domains</option>
                {DOMAIN_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="action_type" className={LABEL}>
                Action type
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
            <CardTitle>Evaluate an action</CardTitle>
            <CardDescription>
              The gate itself. A completed determination always returns 200, so read the outcome —
              MISSING arrives as a success.
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
            <CardTitle>Read a stored record</CardTitle>
            <CardDescription>
              Evaluations are append-only and froze their payloads at decision time, so an old
              record still explains itself after the catalog has moved on.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <LookupById
            action={lookupEvaluation}
            inputName="evaluation_id"
            label="Evaluation ID"
            placeholder="Returned by an evaluation above"
            hint="Includes the unmet and present-artifact payloads as they stood when the call was made."
          />
          <LookupById
            action={lookupRequirement}
            inputName="requirement_id"
            label="Requirement ID"
            placeholder="From the catalog table"
            hint="Full record including the requirement payload."
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Add a requirement</CardTitle>
            <CardDescription>
              Live, writable. A tenant-wide requirement gates every legal entity, so its
              authorization is checked against the tenant rather than one entity.
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
            <CardTitle>Retire a requirement</CardTitle>
            <CardDescription>
              There is no delete route and no soft-delete flag in this service. Retirement is
              effective end-dating, and doing it twice is reported rather than silently accepted.
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
