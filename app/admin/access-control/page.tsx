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
  AssignmentsPanel,
  AssignRoleForm,
  AttachBundleForm,
  DefineRoleForm,
  RoleCataloguePanel,
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
    </div>
  );
}
