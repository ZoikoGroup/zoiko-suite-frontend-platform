import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton, Button } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import {
  CreatePrecedenceRuleForm,
  FactResolverPanel,
  PrecedenceRegisterPanel,
  RecordFactForm,
} from "@/components/admin/source-authority";

export const metadata: Metadata = { title: "Source Authority | Zoiko Suite" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : undefined;
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default async function SourceAuthorityPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const fieldFamily = one(params.field_family);
  const entityRef = one(params.entity_ref);
  const includeSuperseded = one(params.include_superseded) === "true";

  // Minted once per render of this route. Every write ends in refresh(), so a
  // write that lands produces a fresh key for the next one while a retry of the
  // same submission reuses it and replays.
  const ruleCorrelationId = crypto.randomUUID();
  const factCorrelationId = crypto.randomUUID();

  return (
    <div>
      <PageHeader
        title="Source Authority"
        description="Which connected system's value to trust for a field, right now. Precedence rules rank the source systems; normalized facts record what each one actually reported. When two equally-ranked sources disagree, the answer is that there is no answer — resolution blocks rather than guessing."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Resolve a value</CardTitle>
            <CardDescription>
              Ask for one field on one entity and see both the answer and the workings: every source
              that reported, what each said, and which rule decided between them. Facts are
              tenant-scoped, so this only ever reads your own.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-5 grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className={LABEL} htmlFor="q_field_family">
                Field family
              </label>
              <input
                className={FIELD}
                id="q_field_family"
                name="field_family"
                defaultValue={fieldFamily ?? ""}
                placeholder="PAYROLL_GROSS_PAY"
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="q_entity_ref">
                Entity reference
              </label>
              <input
                className={FIELD}
                id="q_entity_ref"
                name="entity_ref"
                defaultValue={entityRef ?? ""}
                placeholder="emp-1041"
              />
            </div>
            {includeSuperseded ? (
              <input type="hidden" name="include_superseded" value="true" />
            ) : null}
            <Button type="submit">Resolve</Button>
          </form>

          <Suspense key={`${fieldFamily}|${entityRef}`} fallback={<PanelSkeleton rows={3} />}>
            <FactResolverPanel fieldFamily={fieldFamily} entityRef={entityRef} />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Precedence register</CardTitle>
              <CardDescription>
                Which source system outranks which, per field family. Platform-wide reference data —
                every tenant is ranked by the same topology, because trusting ADP over a spreadsheet
                is a statement about the systems, not about anyone&rsquo;s records. Reading it needs
                SOURCE_AUTHORITY_MAP_VIEW.
              </CardDescription>
            </div>
            <Link
              href={{
                pathname: "/admin/source-authority",
                query: {
                  ...(fieldFamily ? { field_family: fieldFamily } : {}),
                  ...(entityRef ? { entity_ref: entityRef } : {}),
                  ...(includeSuperseded ? {} : { include_superseded: "true" }),
                },
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {includeSuperseded ? "Show only rules in force" : "Show full history"}
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense key={String(includeSuperseded)} fallback={<PanelSkeleton />}>
            <PrecedenceRegisterPanel includeSuperseded={includeSuperseded} />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Record a precedence rule</CardTitle>
            <CardDescription>
              Rank one source system for one field family, from a given instant. The rule is
              immutable once recorded: to change a ranking you end this rule and record a new one,
              which is what keeps a resolution made last week explainable by the register today.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreatePrecedenceRuleForm correlationId={ruleCorrelationId} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Record an observation</CardTitle>
            <CardDescription>
              What one source system reported, for one entity, at one moment. Append-only — this
              never edits an existing fact, because the history of what each source said and when is
              the evidence behind every resolution. A correction is a later observation.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RecordFactForm correlationId={factCorrelationId} />
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this register will refuse</CardTitle>
            <CardDescription>
              Recorded here because each of these reads as a failure and is not one — they are the
              control working
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A tie is not broken, it is reported.
                </strong>{" "}
                Two sources at the same rank that disagree produce no value at all. Picking one
                arbitrarily is exactly what §D2 forbids: a material fact nobody can vouch for must
                stop a downstream decision, not quietly supply it. The conflict route says where to
                take it.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A source nobody has ranked is named, not dropped.
                </strong>{" "}
                The resolver used to join facts to rules and an unranked source simply vanished — so
                &ldquo;nobody has ranked this source yet&rdquo; and &ldquo;this source lost&rdquo;
                looked identical, and a disagreement with the winner never surfaced. Unranked
                reporters are now listed alongside the resolution.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A rule cannot be edited, or ended in the past.
                </strong>{" "}
                Only its window closes, and only from now on. Back-dating would rewrite which rule
                was in force when an earlier resolution was made, so a decision already taken would
                stop being explainable — doc7 §D1&rsquo;s &ldquo;never silently back-write&rdquo;
                applied to the rules rather than the facts.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A retry replays; it does not write twice.
                </strong>{" "}
                Every write is idempotent on its correlation id and answers 200 rather than 201 on a
                replay. On an append-only fact log this is not housekeeping: a duplicated row would
                be an observation that no source ever made.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Facts are tenant data; rules are not.
                </strong>{" "}
                Resolution reads only your tenant&rsquo;s observations, and refuses outright without
                a tenant. Until this pass normalized facts had no tenant column at all, so one pool
                held every tenant&rsquo;s values and a guessed entity reference was the whole of the
                access control.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
