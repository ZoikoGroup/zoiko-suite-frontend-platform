import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { SendNotificationForm, NotificationPanel } from "@/components/admin/notifications";

export const metadata: Metadata = { title: "Notifications | Zoiko Suite" };

export default function NotificationsPage() {
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
            <CardDescription>
              Live, writable. Backed by notification-svc on :8133. Idempotent on a correlation id, so
              a retry replays the stored notification instead of sending a second one. The
              platform ships no delivery provider — the stub adapter records the notice and reports
              SENT, so SENT means &ldquo;recorded and accepted by the stub&rdquo;, not that anyone
              received anything. An unrecognised channel is refused with a 400 rather than stored as
              a delivery that failed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SendNotificationForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Delivery register</CardTitle>
            <CardDescription>
              This legal entity&rsquo;s notifications, newest first. The read is authorized against
              the entity (NOTIFICATION_VIEW), not merely filtered by tenant. FAILED rows are the
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
