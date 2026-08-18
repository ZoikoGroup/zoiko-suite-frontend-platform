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
 * Scoped to the session's legal entity, and that is load-bearing rather than
 * cosmetic: notification-svc authorizes a list read against the legal entity
 * it is given (403 without a NOTIFICATION_VIEW grant there). A request that
 * omits it is treated as the caller asking for their OWN inbox and is filtered
 * to notifications addressed to them — which is not what a register is. Sending
 * the entity is what makes this the entity's register, and what makes the read
 * authorized instead of merely tenant-filtered.
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
    legalEntityId: session.legalEntityId,
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