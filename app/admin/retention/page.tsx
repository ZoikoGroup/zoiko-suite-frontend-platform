import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  EngageHoldForm,
  LegalHoldRegisterPanel,
  RecordPolicyForm,
  ReleaseHoldForm,
  ResolveForm,
  RetentionPolicyPanel,
} from "@/components/admin/retention";
import { listLegalHolds } from "@/lib/api/retention";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Retention & Legal Holds | Zoiko Suite" };

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

async function sessionIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

async function Holds() {
  const identity = await sessionIdentity();
  if (!identity) return null;
  return <LegalHoldRegisterPanel identity={identity} />;
}

async function Policies() {
  const identity = await sessionIdentity();
  if (!identity) return null;
  return <RetentionPolicyPanel identity={identity} />;
}

/**
 * The release form needs the active holds, so it reads the register itself
 * rather than receiving it — the panel above renders every hold including
 * released ones, and offering a released hold as releasable would produce a 409
 * the operator could have been spared.
 */
async function ReleaseSection() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  const result = await listLegalHolds(identity, { holdStatus: "ACTIVE" });
  const active = result.ok ? (result.data ?? []) : [];

  return (
    <ReleaseHoldForm
      activeHolds={active}
      principalId={identity.principalId}
      correlationId={crypto.randomUUID()}
    />
  );
}

export default function RetentionPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <PageHeader
        title="Retention & Legal Holds"
        description="How long each class of record must be kept, and what is currently frozen regardless."
      />

      {/*
        The distinction this whole page exists to keep visible.

        retention-registry-svc answers "is it safe to delete, export or migrate
        this yet" with TWO independent findings and never one boolean. A hold
        blocks regardless of policy; a policy states a period regardless of
        holds. And a record past its minimum retention with no hold is still a
        decision the caller applies — this service deletes nothing, ever.

        Collapsing that into a single verdict is the failure mode worth designing
        against, because a green tick here reads as permission the service never
        gave.
      */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">Two findings, never one.</strong>{" "}
          An active legal hold blocks deletion, export and migration regardless of what any
          retention policy permits. The applicable policy separately states how long the record must
          be kept. Both are reported; neither overrides the other into a single verdict.
        </p>
        <p className="mt-2">
          <strong className="text-slate-900 dark:text-slate-100">
            This service deletes nothing.
          </strong>{" "}
          It is the register every other service consults before acting. &quot;No policy found&quot;
          is a gap in the register, not permission to delete.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Legal holds</CardTitle>
          <CardDescription>
            What is frozen right now. An active hold overrides every retention policy in its scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <Holds />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention policies</CardTitle>
          <CardDescription>
            How long each record class must be kept, and the basis cited for it. Policies are
            immutable — a change appends a new rule, so this is a history rather than a
            current-state table.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <Policies />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>May this be deleted yet?</CardTitle>
          <CardDescription>
            The same check every other service makes before it deletes, exports or migrates a
            record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResolveForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engage a legal hold</CardTitle>
          <CardDescription>
            Freezes its scope immediately, overriding every retention policy, until released.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Minted per render. Every write ends in refresh(), so a hold that
              lands produces a fresh key for the next one while a retry of the
              same submission replays. */}
          <EngageHoldForm correlationId={crypto.randomUUID()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Release a legal hold</CardTitle>
          <CardDescription>
            The privileged operation here — it unblocks deletion of records an authority ordered
            frozen. Only active holds are offered, and the approver is recorded on the row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton rows={2} />}>
            <ReleaseSection />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record a retention policy</CardTitle>
          <CardDescription>
            Immutable once recorded. Changing a rule appends a new one rather than editing this.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecordPolicyForm correlationId={crypto.randomUUID()} />
        </CardContent>
      </Card>
    </div>
  );
}
