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
  AttachBundleForm,
  DefineRoleForm,
  RoleCataloguePanel,
  UpdateRoleForm,
} from "@/components/admin/access-control";
import { listRoleDefinitions } from "@/lib/api/access-control";
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

        Per-principal role ASSIGNMENTS are deliberately absent. They live in
        authorization-svc and are not reachable from this service, so a role
        defined here grants nothing to anybody until it is assigned elsewhere.
        Saying so on the page matters more than it might seem: a full catalogue
        of well-formed roles reads like configured access control, and it is not
        the same thing.
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
            What it deliberately does not.
          </strong>{" "}
          Assigning a role to a principal is not this service&apos;s to do — assignments live in
          authorization-svc. A role defined and bundled here grants nothing to anyone until it is
          assigned. A complete catalogue is not the same as configured access.
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
    </div>
  );
}
