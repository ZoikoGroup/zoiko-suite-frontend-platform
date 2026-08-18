import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  JurisdictionRegisterPanel,
  RegisterJurisdictionForm,
  RecordRuleForm,
  RulePackExplorer,
} from "@/components/admin/jurisdictions";
import { listJurisdictions } from "@/lib/api/jurisdictions";

export const metadata: Metadata = { title: "Jurisdictions | Zoiko Suite" };

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
 * The forms need the register to offer real jurisdictions.
 *
 * A free-text UUID field is the alternative, and it is the same trap the
 * obligations page already documented: every value a human types comes back
 * 404, because this register is the thing that decides whether an id exists.
 * When the service is unreachable the selects are empty rather than absent —
 * the panel above says why, and a form offering nothing is more honest than one
 * offering a text box that cannot succeed.
 */
async function JurisdictionForms() {
  const result = await listJurisdictions();
  const jurisdictions = result.ok ? result.data : [];
  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Resolve a rule pack</CardTitle>
            <CardDescription>
              What actually applies somewhere, at a date. Rules are collected from the jurisdiction
              and every ancestor, then narrowed so exactly one wins per domain and code — the most
              specific jurisdiction first, then the latest effective-from within it. The chain the
              answer was assembled from is shown with it, because a governed decision has to be able
              to explain its own basis afterwards.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RulePackExplorer jurisdictions={jurisdictions} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Register a jurisdiction</CardTitle>
            <CardDescription>
              Governed and platform-scoped: authorization-svc must grant JURISDICTION_CREATE on the
              platform scope, not on a legal entity — &ldquo;GB&rdquo; is not owned by one. An
              identical re-submission answers 200 and writes nothing; the same key with different
              attributes is refused, because that redefines a jurisdiction other records are already
              bound to.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RegisterJurisdictionForm jurisdictions={jurisdictions} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Record a rule</CardTitle>
            <CardDescription>
              An applicability rule attached to one jurisdiction. It resolves into that
              jurisdiction&rsquo;s rule pack and into every jurisdiction nested inside it, unless one
              of them declares the same code itself.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RecordRuleForm jurisdictions={jurisdictions} />
        </CardContent>
      </Card>
    </>
  );
}

export default function JurisdictionsPage() {
  return (
    <div>
      <PageHeader
        title="Jurisdictions & Rules"
        description="The register every other service defers to for “which law applies here”. Jurisdictions nest, their rules are effective-dated, and legal drift is tracked separately from whether a rule is in force."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Jurisdiction register</CardTitle>
            <CardDescription>
              Every registered jurisdiction and how it nests. obligations-svc and
              tenant-entity-registry-svc both validate against this register and fail closed, so an
              id that does not resolve here resolves nowhere — and while this service is unreachable,
              no obligation can be raised at all.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <JurisdictionRegisterPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <JurisdictionForms />
      </Suspense>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this register does not decide</CardTitle>
            <CardDescription>
              Recorded here because the panels above cannot show it, and a reader who assumes
              otherwise would trust this service further than it can carry
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Applicability, never amounts.
                </strong>{" "}
                A rule payload says who a rule applies to, how often they file, and which authority
                it answers to. Thresholds, rates and bands belong to the Tax and Payroll services — a
                figure recorded here would be a second copy of a number this register does not own,
                and the two would drift apart silently.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Drift is asserted, not detected.
                </strong>{" "}
                Nothing watches legislation and marks a rule DRIFTED. Someone records it, with their
                reason, and the history is append-only. A rule showing CURRENT means nobody has said
                otherwise — not that it has been checked.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  A drifted rule is still in force.
                </strong>{" "}
                Legal drift and rule status are separate axes on purpose. A rule can be ACTIVE and
                DRIFTED at once — still resolving into every pack, and known to have diverged from
                the law it encodes. That combination is the thing worth looking for on this page.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Reads are public; writes are not.
                </strong>{" "}
                Jurisdictions are PUBLIC-classified reference data, so the read endpoints take no
                credential — that is deliberate, not a gap. Every mutation is authorized and fails
                closed.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
