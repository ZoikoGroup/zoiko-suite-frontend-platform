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
  AbacRulesPanel,
  AccessDecisionLookup,
  AssignmentsPanel,
  AssignRoleForm,
  AttachBundleForm,
  DeclareAbacRuleForm,
  DecisionLogPanel,
  DelegatedAccessCheckForm,
  DefineRoleForm,
  DelegateAuthorityForm,
  EvaluateAccessForm,
  EvaluationDelegationsPanel,
  EntityScopeCheckForm,
  EvaluationRolesPanel,
  RoleCataloguePanel,
  SoDPrecheckForm,
  SoDRulesPanel,
  UpdateRoleForm,
} from "@/components/admin/access-control";
import { listRoleDefinitions } from "@/lib/api/access-control";
import {
  explainAuthorizationError,
  listRoleAssignments,
  listSoDRules,
} from "@/lib/api/authorization";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Roles & Access Control | Zoiko Suite" };

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

async function Catalogue() {
  const identity = await sessionIdentity();
  if (!identity) return null;
  return <RoleCataloguePanel identity={identity} />;
}

/**
 * Both write forms need the current role list — one to choose what to change,
 * the other to choose what to attach a bundle to. Read once and shared rather
 * than fetched per form, so the two dropdowns cannot disagree about what exists.
 */
async function WriteForms() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  const rolesResult = await listRoleDefinitions(identity);
  const roles = rolesResult.ok ? (rolesResult.data ?? []) : [];
  const legalEntityId = identity.legalEntityId ?? "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Define a role</CardTitle>
          <CardDescription>
            Records the definition here and provisions it into authorization-svc in the same
            request. A new role grants nothing until a bundle is attached.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Minted per render of this route. Every write ends in refresh(), so
              a definition that lands produces a fresh key for the next one
              while a retry of the same submission reuses it and replays. */}
          <DefineRoleForm legalEntityId={legalEntityId} correlationId={crypto.randomUUID()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attach a permission bundle</CardTitle>
          <CardDescription>
            The actions a role permits. Provisioned into authorization-svc against the role, so the
            grant is live as soon as this returns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Define a role first — a bundle attaches to one.
            </p>
          ) : (
            <AttachBundleForm
              roles={roles}
              legalEntityId={legalEntityId}
              correlationId={crypto.randomUUID()}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retire, reactivate, or rename</CardTitle>
          <CardDescription>
            Retiring is a real control, not a label: it clears the role&apos;s active flag in
            authorization-svc, and the authorize path joins through that flag. It is also
            reversible — assignments are left intact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing to change yet.</p>
          ) : (
            <UpdateRoleForm roles={roles} legalEntityId={legalEntityId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The live authorization plane — authorization-svc, not access-control-svc.
 *
 * Reads both registers in parallel because neither depends on the other and
 * the page should not pay for two sequential round trips. Roles come from
 * access-control-svc as well, so the assignment form can offer codes instead
 * of UUIDs and the table can label rows.
 *
 * A failed read renders as an empty register with the reason, rather than
 * throwing: the definition panels above are still usable and still true, and
 * taking the whole page down because one service is unreachable would hide
 * them for no benefit.
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
          Could not read the live plane from authorization-svc: {readError} The registers below may
          be incomplete. The definition panels above are unaffected.
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
              Define a role first — there is nothing to assign.
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
 * Deliberately LAST on the page, after the definitions, the grants and the
 * conflict rules. The order is an argument: everything above is what an
 * operator configures, and this is the only place that says what any of it
 * actually amounts to. A page that ended at "Live grants" invited the reading
 * that a well-formed set of grants IS the access control — and the whole
 * lesson of this service is that grants are one of five layers, four of which
 * can take an action away again.
 */
async function EvaluationPlane() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-4 text-xs leading-relaxed text-slate-600 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">
            This is the service every other service asks.
          </strong>{" "}
          A permission check runs through five layers in order: the roles somebody holds, then
          any authority lent to them, then whether the combination breaks a separation-of-duties
          rule, then whether they are acting on their own work, then any attribute condition on
          the action. The first two can grant; the last three can only take away.
        </p>
        <p className="mt-2">
          <strong className="text-slate-900 dark:text-slate-100">
            A refusal is not the same as a failure.
          </strong>{" "}
          &ldquo;You may not&rdquo; is an answer, recorded with the reason it was reached.
          &ldquo;We could not determine whether you may&rdquo; is the service declining to
          guess — nothing is decided and nothing is recorded, and every service asking that
          question is refusing to write while it lasts. The panels below never show those the
          same way.
        </p>
      </div>

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
            can only find one after it already exists — which used to mean discovering that a
            role must not go to somebody by giving it to them and watching every use of it be
            refused. This records nothing.
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
            The other two questions the check above cannot answer. Asking &ldquo;which
            companies&rdquo; through it costs one recorded decision per company for a question
            nobody acted on; &ldquo;whose authority&rdquo; it cannot answer at all, because it
            reports the role as the reason whenever somebody holds an action both in their own
            right and by delegation. Neither of these records anything.
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
          <CardTitle>The decision history</CardTitle>
          <CardDescription>
            Every permission check ever made, searchable by person, action, answer and date. Until
            now this record could only be read one row at a time by reference — and a
            refusal&rsquo;s reference is returned to the service that was refused and nowhere
            else, so explaining a refusal started by reading another service&rsquo;s logs.
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
            When you already have the reference — from the answer a check gave you, or from a
            service that was refused — this reads that one decision back directly. Searching the
            history above is the way in when you do not.
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
            The row a permission check actually joins through. A role retired in the catalogue at
            the top of this page while it is still enforced here is a retirement that is a label
            and not a control — which is why both lists are shown.
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
            more than the lender holds themselves, and it shrinks automatically if the
            lender&rsquo;s own access does.
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
              You can only lend what you hold yourself, and only you can withdraw it again. What
              it confers is checked against your own access on every decision, so it narrows on
              its own if yours does.
            </p>
            <DelegateAuthorityForm />
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <CardTitle>Attribute conditions</CardTitle>
          <CardDescription>
            The last layer, and the only one that judges the request rather than the person. Every
            condition here can take an action away and none can grant one — so a condition is
            never the fix for somebody being unable to do their job.
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
              In force the moment it saves, with nobody having to do anything else. The easiest
              way to get this wrong is to require an attribute the calling service does not send —
              which refuses the action for everybody, immediately.
            </p>
            <DeclareAbacRuleForm />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccessControlPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <PageHeader
        title="Roles & Access Control"
        description="The governed authoring layer for the roles and permission bundles every other service is authorized by."
      />

      {/*
        What this page is, and what it is not.
        ---------------------------------------
        access-control-svc does not hold live RBAC. authorization-svc does, and
        every service's authz check depends on it. This page is the governed
        front door to authorization-svc's admin API: each write here is
        authorized against a legal entity, idempotent on a correlation id, and
        propagated synchronously — which the admin API itself, called directly,
        is none of.

        Per-principal ASSIGNMENTS and SoD rules are not access-control-svc's to
        serve — it exposes only /v1/role-definitions. The LivePlane section
        below therefore reads and writes authorization-svc (:8089) directly,
        via lib/api/authorization.ts. That is a deliberate second client on
        this one page, not an accident: routing assignments through
        access-control-svc would mean inventing endpoints there that nothing
        else needs.

        Why it is on this page at all: a full catalogue of well-formed roles
        reads like configured access control and is not the same thing. Keeping
        the grants beside the definitions is what makes the difference legible.
      */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">What this page changes.</strong>{" "}
          Every write here reaches authorization-svc in the same request and fails closed, so the
          catalogue never claims a role the platform is not actually enforcing. Retiring a role
          clears its active flag there and takes effect on the next authorization decision.
        </p>
        <p className="mt-2">
          <strong className="text-slate-900 dark:text-slate-100">
            Definitions and grants are different things.
          </strong>{" "}
          A role defined and bundled above grants nothing to anyone until it is{" "}
          <em>assigned</em>. Assignments and segregation-of-duties rules live in authorization-svc
          rather than access-control-svc, so the panels below talk to that service directly. A
          complete catalogue is not the same as configured access — the &ldquo;Live grants&rdquo;
          panel is the one that says who can actually do anything.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Role catalogue</CardTitle>
          <CardDescription>
            Every role defined in this tenant, with the actions each one permits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <Catalogue />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <WriteForms />
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <LivePlane />
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={8} />}>
        <EvaluationPlane />
      </Suspense>
    </div>
  );
}
