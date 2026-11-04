import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  DecideWorkflowForm,
  DefineWorkflowForm,
  DefinitionCommandForm,
  LifecycleForm,
  StartWorkflowForm,
  VerifyReleaseForm,
  WorkflowLookup,
} from "@/components/admin/workflow/WorkflowForms";
import { DefinitionsPanel, PendingApprovalsPanel } from "@/components/admin/workflow/WorkflowPanels";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { listPendingApprovals, listWorkflowDefinitions } from "@/lib/api/workflow";

export const metadata: Metadata = { title: "Workflows & Approvals | Zoiko Suite" };

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
  return toIdentity(session);
}

async function Pending() {
  const identity = await sessionIdentity();
  if (!identity) return null;
  return <PendingApprovalsPanel result={await listPendingApprovals(identity)} />;
}

/**
 * The start form and both definition panels need the definition list; read it
 * once so the route picker and the register cannot disagree about what exists.
 */
async function Operate() {
  const identity = await sessionIdentity();
  if (!identity) return null;
  const definitions = await listWorkflowDefinitions(identity);
  const list = definitions.ok ? (definitions.data ?? []) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Start a workflow</CardTitle>
          <CardDescription>
            Opens an approval for something that needs one. You will not be able to approve it
            yourself, and nobody can decide more than one of its stages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StartWorkflowForm
            legalEntityId={identity.legalEntityId}
            idempotencyKey={crypto.randomUUID()}
            definitions={list}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decide the current stage</CardTitle>
          <CardDescription>
            As the stage&rsquo;s named approver, a delegate of that approver, a holder of its role, or
            the person it was escalated to. Each decision is checked against authorization-svc and
            recorded in the governance decision log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DecideWorkflowForm idempotencyKey={crypto.randomUUID()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escalate, cancel, reopen or invalidate</CardTitle>
          <CardDescription>
            Changes to a workflow other than a decision. Each needs its own WORKFLOW_* grant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LifecycleForm idempotencyKey={crypto.randomUUID()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Can this approval still be released against?</CardTitle>
          <CardDescription>
            An approval covers the subject as it was when approved. Give the subject&rsquo;s
            fingerprint as it is now; if it changed, the approval does not cover it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerifyReleaseForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow definitions</CardTitle>
          <CardDescription>
            Versioned routes a workflow can start from. A running workflow keeps the route it started
            with, so changing a definition never changes a decision already in progress. Listing and
            changing them needs WORKFLOW_READ and WORKFLOW_DEFINE at platform scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DefinitionsPanel result={definitions} />

          <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Register a definition
            </h3>
            <DefineWorkflowForm />
          </div>

          {list.length > 0 && (
            <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Activate, suspend, retire or supersede
              </h3>
              <DefinitionCommandForm definitions={list} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <PageHeader
        title="Workflows & Approvals"
        description="Multi-stage approvals for actions that need more than one person. An approval adds to authorization — it never replaces it."
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">Three rules hold whatever anyone&rsquo;s grants say.</strong>{" "}
          The person who started a workflow never decides it. Nobody decides two stages of the same
          workflow. A service account never decides one — a person has to.
        </p>
        <p className="mt-2">
          A workflow past its deadline expires on its own; a stage past its deadline escalates. When a
          policy or an approver&rsquo;s authority changes, pending approvals are re-checked, and one whose
          approver may no longer approve is escalated rather than left waiting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waiting for a decision</CardTitle>
          <CardDescription>
            Pending and escalated workflows in your tenant. Listing them needs WORKFLOW_READ at platform
            scope; without it you can still open any workflow you started or are due to decide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <Pending />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>View a workflow</CardTitle>
          <CardDescription>
            Its stages, where it stands, and the full approval trail — who acted, on whose authority,
            and the governance record each decision was filed under.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowLookup />
        </CardContent>
      </Card>

      <Suspense fallback={<PanelSkeleton rows={8} />}>
        <Operate />
      </Suspense>
    </div>
  );
}
