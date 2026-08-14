import { cookies } from "next/headers";
import { CloudOff, BellOff, BellRing } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listNotifications,
  explainNotificationError,
  type Notification,
} from "@/lib/api/notifications";
import { NotificationTable } from "./NotificationTable";

/**
 * The delivery register.
 *
 * Session-scoped read: the service filters by the tenant carried on
 * X-Tenant-Id, and row-level security hides another tenant's rows the same way
 * as a not-found.
 */
export async function NotificationPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.email) {
    return (
      <PanelEmptyState
        icon={BellOff}
        label="Sign in to read the register"
        hint="The delivery register is scoped to the signed-in tenant."
      />
    );
  }

  const result = await listNotifications({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Delivery register unavailable"
        hint={`${explainNotificationError(result.error.message)} — the service itself could not be reached, so this is not a filter problem.`}
      />
    );
  }

  const notifications: Notification[] = result.data;

  if (notifications.length === 0) {
    return (
      <PanelEmptyState
        icon={BellRing}
        label="No notifications on record"
        hint="Send one from the form above — it appears here with its delivery status."
      />
    );
  }

  return <NotificationTable notifications={notifications} />;
}