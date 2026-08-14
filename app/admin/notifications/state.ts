// Shared contract between the notification Server Actions and the forms that
// call them. Outside actions.ts because a "use server" file may only export
// async functions.

import type { Notification } from "@/lib/api/notifications";

/**
 * `sent` and `failed` are separate states on purpose: the service's critical
 * constraint is that delivery failure must not collapse the source workflow, so
 * it answers 201 for both. A form that reported both as "delivered" would
 * present a FAILED notice as proof it went out.
 */
export type SendNotificationState = {
  status: "idle" | "sent" | "replayed" | "failed" | "denied" | "error";
  message: string;
  notification?: Notification;
};

export const IDLE_SEND_STATE: SendNotificationState = { status: "idle", message: "" };