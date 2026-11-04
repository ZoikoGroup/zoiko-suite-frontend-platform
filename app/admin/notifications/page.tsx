import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { SendNotificationForm, NotificationPanel } from "@/components/admin/notifications";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listNotificationTemplates,
  explainNotificationError,
  type NotificationTemplate,
} from "@/lib/api/notifications";

export const metadata: Metadata = { title: "Notifications | Zoiko Suite" };

/**
 * The template catalogue, read server-side so the form is drawn from what the
 * service actually offers rather than from a copy that can drift from it.
 *
 * A failure here is not fatal to the page: the form falls back to free-text
 * sending and says the catalogue was unreachable, which is a different
 * statement from offering an empty list of templates.
 */
async function loadTemplates(): Promise<{
  templates: NotificationTemplate[];
  templatesError?: string;
}> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return { templates: [] };

  const result = await listNotificationTemplates({
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  });

  return result.ok
    ? { templates: result.data }
    : { templates: [], templatesError: explainNotificationError(result.error.message) };
}

export default async function NotificationsPage() {
  const { templates, templatesError } = await loadTemplates();

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Governed delivery of notices for workflows, deadlines, escalations, and approvals."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Send a notification</CardTitle>
            {/*
              Every line break in the paragraph below carries an explicit {" "}, and there are no
              JSX comments inside it.

              Both rules were learned the hard way here. A literal space either side of an inline
              <strong> was silently dropped from the rendered output - the browser showed
              "EMAILSENT" and "WEBHOOKhas" while the source read correctly, so it passed a source
              review and was only caught by reading the DOM back. Putting an explanatory comment
              in the middle of the prose then produced "deliveredby", because an expression
              container splits the text into two JSXText nodes and the whitespace at each new
              boundary is trimmed.

              Which breaks are fragile is not obvious from looking: the ones adjacent to an
              element or expression boundary lose their space, the purely textual ones do not.
              So every join is explicit rather than guessed at, and prose wraps at an element,
              never mid-phrase.
            */}
            <CardDescription>
              Live, writable. Backed by notification-svc on :8133. Idempotent on a correlation id, so
              a retry replays the stored notification instead of sending a second one. What SENT is
              worth depends on the channel: an <strong>IN_APP</strong>{" "}
              notice is genuinely delivered by being recorded, while <strong>EMAIL</strong>{" "}
              SENT means a mail provider accepted the message &mdash; not that it arrived, and not{" "}
              that anyone read it. <strong>WEBHOOK</strong>{" "}
              has no provider and is recorded as FAILED naming what is missing, rather than{" "}
              reported as sent &mdash; machine-to-machine exchange is XIC&rsquo;s authority, not{" "}
              this service&rsquo;s. <strong>SMS</strong>{" "}
              has been withdrawn: it was accepted and then failed every send, so it is now refused{" "}
              at the boundary like any unrecognised channel, with a 400 rather than a stored{" "}
              FAILED delivery.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SendNotificationForm templates={templates} templatesError={templatesError} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Delivery register</CardTitle>
            <CardDescription>
              This legal entity&rsquo;s notifications, newest first. The read is authorized against
              the entity (NOTIFICATION_VIEW), not merely filtered by tenant. Each row records the
              address it was actually delivered to and whether that address came from the identity
              authority or from the caller. <strong>RETRYING</strong> rows have not failed: delivery
              did not land transiently and another attempt is scheduled, so the reason shown is why
              the last attempt did not succeed, not a verdict. FAILED rows are the
              ones worth acting on — they are recorded proof the notice did not go out.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-28 w-full rounded-lg" />}>
            <NotificationPanel />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
