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
  AttachBundleForm,
  DefineRoleForm,
  ManageBundleForms,
  RoleCataloguePanel,
  UpdateRoleForm,
} from "@/components/admin/access-control";
import {
  listAllPermissionBundles,
  listRoleDefinitions,
} from "@/lib/api/access-control";
import {
  explainAuthorizationError,
  isAssignmentActive,
  listRoleAssignments,
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
 * The write forms on this page all need the current role list — to choose what
 * to define, change, attach to or manage. The manage form also needs every
 * bundle in one read. Both are fetched here once and shared, so the dropdowns
 * cannot disagree about what exists and the manage form does not fan out one
 * request per role.
 */
async function WriteForms() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  const [rolesResult, bundlesResult] = await Promise.all([
    listRoleDefinitions(identity),
    listAllPermissionBundles(identity),
  ]);
  const roles = rolesResult.ok ? (rolesResult.data ?? []) : [];
  const bundles = bundlesResult.ok ? (bundlesResult.data ?? []) : [];
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

      <Card>
        <CardHeader>
          <CardTitle>Edit or detach a permission bundle</CardTitle>
          <CardDescription>
            Change what an attached bundle permits, or withdraw it from its role. Both propagate to
            authorization-svc in the same request and fail closed — so a state shown here is a
            state the platform is actually enforcing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bundles.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No permission bundles to manage yet. Attach one above first.
            </p>
          ) : (
            <ManageBundleForms roles={roles} bundles={bundles} legalEntityId={legalEntityId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * How many of the roles above anybody actually holds — read from
 * authorization-svc, which owns grants.
 *
 * The grants themselves are on the Authorization page. This stays here as a
 * count because a full catalogue of well-formed roles reads like configured
 * access control and is not the same thing: without it, this page would show
 * every definition and nothing to say whether any of them is in use.
 */
async function GrantsSummary() {
  const identity = await sessionIdentity();
  if (!identity) return null;

  const [assignmentsResult, rolesResult] = await Promise.all([
    listRoleAssignments(identity),
    listRoleDefinitions(identity),
  ]);

  if (!assignmentsResult.ok) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Could not read grants from authorization-svc:{" "}
        {explainAuthorizationError(assignmentsResult.error.message)}
      </p>
    );
  }

  const live = (assignmentsResult.data ?? []).filter((a) => isAssignmentActive(a));
  const roles = rolesResult.ok ? (rolesResult.data ?? []) : [];
  const heldRoleIds = new Set(live.map((a) => a.role_id));
  const unheld = roles.filter((r) => !heldRoleIds.has(r.role_definition_id)).length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <dl className="flex flex-wrap gap-8 text-sm">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Live grants</dt>
          <dd className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {live.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Roles nobody holds</dt>
          <dd className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {rolesResult.ok ? unheld : "—"}
          </dd>
        </div>
      </dl>
      <Link
        href="/admin/authorization"
        className="text-sm font-medium text-navy-700 underline hover:text-navy-900 dark:text-navy-300 dark:hover:text-navy-100"
      >
        Grant, revoke and check access on Authorization
      </Link>
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
        front door to authorization-svc's admin API for DEFINITIONS: each write
        here is authorized against a legal entity, idempotent on a correlation
        id, and propagated synchronously — which the admin API itself, called
        directly, is none of.

        Grants, separation-of-duties rules and the evaluation plane belong to
        authorization-svc and live on /admin/authorization. They used to sit
        below the catalogue on this page; the count in GrantsSummary is what
        keeps "defined" and "held" visibly different here.
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
          A role defined and bundled here grants nothing to anyone until it is <em>assigned</em>,
          and assignments live in authorization-svc. The panel below says how many grants exist;
          the{" "}
          <Link href="/admin/authorization" className="font-medium underline">
            Authorization
          </Link>{" "}
          page is where they are made and checked.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who holds these roles</CardTitle>
          <CardDescription>
            Read from authorization-svc. A complete catalogue with no grants is configured
            definitions, not configured access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-12 w-full rounded-lg" />}>
            <GrantsSummary />
          </Suspense>
        </CardContent>
      </Card>

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
    </div>
  );
}
