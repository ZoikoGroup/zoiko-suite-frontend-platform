import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { InstanceHistoryLookup, CrossWorkflowSearch } from "@/components/admin/workflow-history";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Workflow History | Zoiko Suite" };

export default async function WorkflowHistoryPage() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  return (
    <div>
      <PageHeader
        title="Workflow History"
        description="The durable, append-only history of every workflow instance on the platform — built entirely from events every workflow-driven service publishes. A workflow's approvals, escalations and completion are recorded here even if the workflow's own service is later unavailable."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Look up one workflow instance</CardTitle>
            <CardDescription>
              Paste a workflow instance ID from any workflow-driven page (Purchase Orders, Invoice
              Approval, and others all use the same underlying workflow engine). A 404 here means no
              history exists for that ID in your tenant — deliberately indistinguishable from an ID
              belonging to another tenant, so this cannot be used to probe for IDs that exist elsewhere.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <InstanceHistoryLookup />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Search across workflows</CardTitle>
            <CardDescription>
              Every history event for a legal entity within a date range, across every workflow
              instance — useful for an audit sweep rather than following one workflow. Unlike the lookup
              above, an empty result here is an ordinary answer: it means nothing happened in that window,
              not that something is being withheld.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CrossWorkflowSearch legalEntityId={session?.legalEntityId ?? ""} />
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this service guarantees, and what it does not</CardTitle>
            <CardDescription>
              Recorded here because the panels above cannot show it, and a reader who assumes otherwise
              would trust this service further than it can carry
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Nothing is rewritten, and nothing is deleted.
                </strong>{" "}
                Every event is stored append-only, and the database itself refuses an UPDATE or DELETE —
                even from this service&rsquo;s own database connection.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Replays are safe.
                </strong>{" "}
                Every event carries a producer-assigned ID, and the same event delivered twice is stored
                once — a Kafka redelivery never duplicates history.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Recorded time is this service&rsquo;s clock, not the workflow&rsquo;s.
                </strong>{" "}
                &ldquo;Recorded at&rdquo; is set when this service durably stored the event, not when the
                originating action happened — deliberate tamper-evidence, so a producer cannot backdate its
                own history.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
