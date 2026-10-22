import type { Metadata } from "next";
import Link from "next/link";
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
  AbacRulesPanel,
  AccessDecisionLookup,
  AssignmentsPanel,
  AssignRoleForm,
  DeclareAbacRuleForm,
  DecisionLogPanel,
  DelegatedAccessCheckForm,
  DelegateAuthorityForm,
  EvaluateAccessForm,
  EvaluationDelegationsPanel,
  EntityScopeCheckForm,
  EvaluationRolesPanel,
  SoDPrecheckForm,
  SoDRulesPanel,
} from "@/components/admin/access-control";
import { listRoleDefinitions } from "@/lib/api/access-control";
import {
  explainAuthorizationError,
  listRoleAssignments,
  listSoDRules,
} from "@/lib/api/authorization";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Authorization | Zoiko Suite" };

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

/**
 * Grants and separation-of-duties rules — authorization-svc's live plane.
 *
 * Reads both registers in parallel because neither depends on the other. Roles
 * come from access-control-svc as well, so the assignment form can offer codes
 * instead of UUIDs and the table can label rows.
 *
 * A failed read renders as an empty register with the reason, rather than
 * throwing: the evaluation panels below are still usable, and taking the whole
 * page down because one read failed would hide them for no benefit.
 */
async function LivePlane() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  const [assignmentsResult, sodResult, rolesResult] = await Promise.all([
    listRoleAssignments(identity),
    listSoDRules(identity),
    listRoleDefinitions(identity),
  ]);

  const assignments = assignmentsResult.ok ? (assignmentsResult.data ?? []) : [];
  const sodRules = sodResult.ok ? (sodResult.data ?? []) : [];
  const roles = rolesResult.ok ? (rolesResult.data ?? []) : [];
  const legalEntityId = identity.legalEntityId ?? "";

  const readError = !assignmentsResult.ok
    ? explainAuthorizationError(assignmentsResult.error.message)
    : !sodResult.ok
      ? explainAuthorizationError(sodResult.error.message)
      : null;

  return (
    <div className="space-y-6">
      {readError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Could not read grants from authorization-svc: {readError} The registers below may be
          incomplete.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Grant a role</CardTitle>
          <CardDescription>
            The step that actually gives someone access. Writes straight to authorization-svc,
            which verifies the role belongs to your tenant before it accepts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No roles are defined yet, so there is nothing to grant. Define one on{" "}
              <Link href="/admin/access-control" className="font-medium underline">
                Roles &amp; Access
              </Link>{" "}
              first.
            </p>
          ) : (
            <AssignRoleForm
              roles={roles}
              legalEntityId={legalEntityId}
              correlationId={crypto.randomUUID()}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live grants</CardTitle>
          <CardDescription>
            Who currently holds what in this tenant. Revoking ends the grant on the next
            authorization check and keeps the row, so the history stays auditable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssignmentsPanel
            assignments={assignments}
            roles={roles}
            correlationId={crypto.randomUUID()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Separation of duties</CardTitle>
          <CardDescription>
            Action pairs nobody may hold together. A conflict denies both actions with basis{" "}
            <code className="font-mono text-[0.95em]">sod:conflict_with</code> — the grant stays,
            the use of it does not.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SoDRulesPanel rules={sodRules} correlationId={crypto.randomUUID()} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The evaluation plane: the questions the service exists to answer.
 *
 * After the grants, deliberately. Everything above is what an operator
 * configures, and this is the only place that says what any of it actually
 * amounts to — grants are one of five layers, and three of the others can take
 * an action away again.
 */
async function EvaluationPlane() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Check what somebody can do</CardTitle>
          <CardDescription>
            Ask the same question a service asks before it writes, and read the answer with its
            reason. The answer is recorded as a decision in its own right — this is not a
            rehearsal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EvaluateAccessForm legalEntityId={identity.legalEntityId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Would this grant break separation of duties?</CardTitle>
          <CardDescription>
            Asked <em>before</em> granting. A duty conflict is a combination, so the check above
            can only find one after it already exists. This records nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SoDPrecheckForm legalEntityId={identity.legalEntityId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where can somebody act, and on whose authority?</CardTitle>
          <CardDescription>
            The two questions the check above cannot answer cheaply. Asking &ldquo;which
            companies&rdquo; through it costs one recorded decision per company; &ldquo;whose
            authority&rdquo; it cannot answer at all, because it reports the role as the reason
            whenever somebody holds an action both in their own right and by delegation. Neither of
            these records anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <EntityScopeCheckForm legalEntityId={identity.legalEntityId ?? undefined} />

          <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
            <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Own authority, or borrowed?
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              For a step that needs two different people, this is the question — a delegate
              acting on the delegator&rsquo;s authority is not the second person.
            </p>
            <DelegatedAccessCheckForm legalEntityId={identity.legalEntityId ?? undefined} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision history</CardTitle>
          <CardDescription>
            Every permission check made, searchable by person, action, answer and date. A
            refusal&rsquo;s reference is returned only to the service that was refused, so this is
            where explaining one starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionLogPanel legalEntityId={identity.legalEntityId ?? undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Explain one decision by reference</CardTitle>
          <CardDescription>
            When you already have the reference — from a check above, or from a service that was
            refused — this reads that one decision back directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccessDecisionLookup />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles as the enforcing plane holds them</CardTitle>
          <CardDescription>
            The row a permission check actually joins through. A role retired on Roles &amp; Access
            while it is still enforced here is a retirement that is a label and not a control —
            which is why both lists exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <EvaluationRolesPanel identity={identity} />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Borrowed authority</CardTitle>
          <CardDescription>
            Who is currently acting on somebody else&rsquo;s behalf. A delegation can never confer
            more than the lender holds, and it shrinks automatically if the lender&rsquo;s own
            access does.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Suspense fallback={<PanelSkeleton />}>
            <EvaluationDelegationsPanel identity={identity} />
          </Suspense>

          <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
            <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Lend your authority to somebody
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              You can only lend what you hold yourself, and only you can withdraw it again.
            </p>
            <DelegateAuthorityForm />
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <CardTitle>Attribute conditions</CardTitle>
          <CardDescription>
            The last layer, and the only one that judges the request rather than the person. A
            condition can take an action away and never grant one — so it is never the fix for
            somebody being unable to do their job.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <AbacRulesPanel identity={identity} />
          </Suspense>

          <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
            <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Declare a condition
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              In force the moment it saves. Requiring an attribute the calling service does not
              send refuses the action for everybody, immediately.
            </p>
            <DeclareAbacRuleForm />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthorizationPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <PageHeader
        title="Authorization"
        description="The service every other service asks before it writes: who holds which role, which combinations are forbidden, and the recorded answer to every permission check."
      />

      <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-4 text-xs leading-relaxed text-slate-600 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">How a check is decided.</strong>{" "}
          Five layers, in order: the roles somebody holds, then any authority lent to them, then
          whether the combination breaks a separation-of-duties rule, then whether they are acting
          on their own work, then any attribute condition on the action. The first two can grant;
          the last three can only take away.
        </p>
        <p className="mt-2">
          <strong className="text-slate-900 dark:text-slate-100">
            A refusal is not a failure.
          </strong>{" "}
          &ldquo;You may not&rdquo; is an answer, recorded with its reason. &ldquo;We could not
          determine whether you may&rdquo; is the service declining to guess — nothing is decided
          or recorded, and every service asking is refusing to write while it lasts. The panels
          below never show those the same way.
        </p>
        <p className="mt-2">
          Role <em>definitions</em> and their permission bundles are authored on{" "}
          <Link href="/admin/access-control" className="font-medium underline">
            Roles &amp; Access
          </Link>
          , which provisions them here. A defined role grants nothing until it is granted below.
        </p>
      </div>

      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <LivePlane />
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={8} />}>
        <EvaluationPlane />
      </Suspense>
    </div>
  );
}
