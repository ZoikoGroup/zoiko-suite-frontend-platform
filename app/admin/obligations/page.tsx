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
import { PageHeader, LookupById } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import {
  ObligationRegisterPanel,
  RaiseObligationForm,
  TransitionObligationForm,
  AddFilingRequirementForm,
  JurisdictionField,
} from "@/components/admin/obligations";
import { OBLIGATION_STATUSES, OBLIGATION_TYPES } from "@/lib/api/obligations";
import { lookupObligation, lookupFilingRequirements } from "./actions";

export const metadata: Metadata = { title: "Obligations" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

/**
 * A date input gives "YYYY-MM-DD"; the service requires full RFC3339 and 400s on
 * anything else, naming the field. Converting here rather than passing the raw
 * value through means a filter never fails for a reason the reader cannot see.
 */
function toRfc3339(date: string | undefined): string | undefined {
  return date ? `${date}T00:00:00Z` : undefined;
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

const SUBMIT_BUTTON =
  "h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900";

export default async function ObligationsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const jurisdictionId = one(params.jurisdiction_id);
  const obligationType = one(params.obligation_type);
  const status = one(params.status);
  const dueBeforeDate = one(params.due_before);
  const dueAfterDate = one(params.due_after);
  const allEntities = one(params.scope) === "all";

  return (
    <div>
      <PageHeader
        title="Obligations"
        description="The statutory, regulatory and contractual duties this platform is tracking — what is owed, to which jurisdiction, by when, and whether it has been discharged. Every obligation is bound to a legal entity and a jurisdiction, and carries a reference back to whatever created it."
      />

      <Card className="mb-6 border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div>
            <CardTitle>Read this register knowing three things</CardTitle>
            <CardDescription>
              Each one changes how a row should be interpreted, and none is visible in the data
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Nothing sweeps deadlines
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                No scheduler moves a row to OVERDUE when its due date passes — the service says so
                itself and expects an external caller to drive it. So an obligation can be weeks
                past due and still read OPEN. The register counts those separately rather than
                trusting the status field.
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/30 dark:bg-rose-500/5">
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                No tenant isolation
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                This service reads no tenant header and has no row-level security. The legal-entity
                filter is a filter, not a boundary: an unfiltered read returns every entity&apos;s
                obligations. There is also no authorization check on any write.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Codes are global and dedup is partial
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Reusing an obligation code returns the stored record rather than writing. Dedup
                compares only entity, jurisdiction, type and due date — so a repeat with a
                different severity is accepted as a match and the new severity is discarded.
              </p>
            </div>
          </div>
          <p className="border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <strong className="font-medium text-slate-800 dark:text-slate-100">
              What this service does enforce, it enforces properly.
            </strong>{" "}
            Every obligation must be jurisdiction-bound, and the jurisdiction is validated against
            jurisdiction-rules-svc on the write path — an unknown ID is refused, and an unreachable
            validator refuses the write too rather than storing an unvalidated jurisdiction. The
            status state machine is real, CLOSED is genuinely terminal, and{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
              source_reference
            </code>{" "}
            is mandatory, so an obligation that cannot be traced to what created it cannot be
            recorded at all.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Obligation register</CardTitle>
            <CardDescription>
              {allEntities
                ? "Every legal entity. This is the unfiltered read — it crosses entity boundaries because the service has none."
                : "Scoped to your session legal entity. That is a filter, not an isolation boundary."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <div>
              <label htmlFor="status" className={LABEL}>
                Status
              </label>
              <select id="status" name="status" defaultValue={status ?? ""} className={FIELD}>
                <option value="">Any status</option>
                {OBLIGATION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="obligation_type" className={LABEL}>
                Type
              </label>
              <select
                id="obligation_type"
                name="obligation_type"
                defaultValue={obligationType ?? ""}
                className={FIELD}
              >
                <option value="">Any type</option>
                {OBLIGATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="due_after" className={LABEL}>
                Due after
              </label>
              <input
                id="due_after"
                name="due_after"
                type="date"
                defaultValue={dueAfterDate ?? ""}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="due_before" className={LABEL}>
                Due before
              </label>
              <input
                id="due_before"
                name="due_before"
                type="date"
                defaultValue={dueBeforeDate ?? ""}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="scope" className={LABEL}>
                Scope
              </label>
              <select id="scope" name="scope" defaultValue={allEntities ? "all" : "entity"} className={FIELD}>
                <option value="entity">My legal entity</option>
                <option value="all">All entities</option>
              </select>
            </div>
            {/* A GET form submits only its own fields, so the jurisdiction filter
                set from a register link would be cleared by filtering on status.
                Carried as a hidden field to keep it. */}
            {jurisdictionId && (
              <input type="hidden" name="jurisdiction_id" value={jurisdictionId} />
            )}
            <button type="submit" className={SUBMIT_BUTTON}>
              Filter register
            </button>
          </form>

          {(status || obligationType || dueBeforeDate || dueAfterDate || jurisdictionId) && (
            <Link
              href="/admin/obligations"
              className="inline-block text-xs font-medium text-navy-700 underline-offset-2 hover:underline dark:text-navy-300"
            >
              Clear all filters
            </Link>
          )}

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense
              key={`${status ?? ""}:${obligationType ?? ""}:${dueBeforeDate ?? ""}:${dueAfterDate ?? ""}:${jurisdictionId ?? ""}:${allEntities}`}
              fallback={<TableSkeleton />}
            >
              <ObligationRegisterPanel
                allEntities={allEntities}
                jurisdictionId={jurisdictionId}
                obligationType={obligationType}
                status={status}
                dueBefore={toRfc3339(dueBeforeDate)}
                dueAfter={toRfc3339(dueAfterDate)}
              />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Raise an obligation</CardTitle>
            <CardDescription>
              Live, writable. Every field is mandatory — there is no partial obligation, because a
              duty without a deadline, an owner, or a traceable source cannot be acted on.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RaiseObligationForm jurisdictionField={<JurisdictionField />} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Move an obligation&apos;s status</CardTitle>
            <CardDescription>
              The state machine is real and CLOSED is terminal. A request for the status a row is
              already in is accepted and changes nothing — reported as such rather than as a
              success.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TransitionObligationForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Record a filing requirement</CardTitle>
            <CardDescription>
              Filing requirements live beneath an obligation. They are created PENDING and stay
              PENDING — nothing in this service advances them, so this records that a filing is
              required, never that it was made.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddFilingRequirementForm />
          <p className="border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Note: filing against a CLOSED obligation is permitted. There is no guard, and it
            succeeds — the obligation lifecycle does not gate its filings.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Read a stored record</CardTitle>
            <CardDescription>
              For following an ID out of a log or checking whether a write landed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <LookupById
            action={lookupObligation}
            inputName="obligation_id"
            label="Obligation ID"
            placeholder="From the register above"
            hint="The full stored record, including closed_at and the source pointers."
          />
          <LookupById
            action={lookupFilingRequirements}
            inputName="filings_obligation_id"
            label="Filing requirements for an obligation"
            placeholder="From the register above"
            hint="A 404 here means no such obligation; an obligation with no filings returns an empty list instead, so the two are distinguishable."
            buttonLabel="List filings"
          />
        </CardContent>
      </Card>
    </div>
  );
}
