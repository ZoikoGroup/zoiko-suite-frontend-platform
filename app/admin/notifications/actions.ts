"use server";

// Server Actions for notification-svc (:8133).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  sendNotification,
  explainNotificationError,
  type NotificationChannel,
} from "@/lib/api/notifications";
import type { SendNotificationState } from "./state";

/** The principal a send is attributed to. */
async function requirePrincipal(): Promise<{
  principalId: string;
  tenantId: string;
  legalEntityId: string;
}> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId ?? "",
    legalEntityId: session.legalEntityId ?? "",
  };
}

const CHANNELS = new Set<NotificationChannel>(["EMAIL", "SMS", "IN_APP", "WEBHOOK"]);

/**
 * Send a governed notification.
 *
 * Deliberately surfaces the backend's FAILED status as its own state rather
 * than as an error: a 201 with status FAILED is a normal, recorded outcome on
 * this service (an unsupported channel is the only way to reach it today), and
 * reporting it as a submission failure would lose the recorded proof.
 */
export async function submitNotification(
  _previous: SendNotificationState,
  formData: FormData,
): Promise<SendNotificationState> {
  let identity: { principalId: string; tenantId: string; legalEntityId: string };
  try {
    identity = await requirePrincipal();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const recipientPrincipalId = String(formData.get("recipient_principal_id") ?? "").trim();
  const channel = String(formData.get("channel") ?? "").trim().toUpperCase();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const sourceEventType = String(formData.get("source_event_type") ?? "").trim();
  const sourceReference = String(formData.get("source_reference") ?? "").trim();

  if (!recipientPrincipalId) {
    return { status: "error", message: "Recipient principal id is required." };
  }
  if (!channel || !CHANNELS.has(channel as NotificationChannel)) {
    return {
      status: "error",
      message:
        "Channel must be one of EMAIL, SMS, IN_APP, or WEBHOOK. Any other channel is the only way this service records a FAILED delivery, and it does so silently by design.",
    };
  }
  if (!subject) return { status: "error", message: "Subject is required." };

  const result = await sendNotification({
    identity,
    recipientPrincipalId,
    channel,
    subject,
    ...(body ? { body } : {}),
    ...(sourceEventType ? { sourceEventType } : {}),
    ...(sourceReference ? { sourceReference } : {}),
    // Idempotency key: a retry of the same form submission replays the stored
    // notification instead of sending a second notice.
    correlationId: `console-${identity.principalId}-${recipientPrincipalId}-${Date.now()}`,
  });

  if (!result.ok) {
    return { status: "error", message: explainNotificationError(result.error.message) };
  }

  refresh();

  const n = result.data;
  if (n.status === "FAILED") {
    return {
      status: "failed",
      notification: n,
      message: `Notification recorded but delivery FAILED — ${n.failure_reason ?? "no reason given"}. This is on record as a failed delivery, not hidden.`,
    };
  }

  return result.status === 201
    ? {
        status: "sent",
        notification: n,
        message: `Notification recorded and stub-delivered (${n.channel}) to ${n.recipient_principal_id}. Remember: no real provider is wired up — SENT means recorded, not received.`,
      }
    : {
        status: "replayed",
        notification: n,
        message: `This correlation was already processed — the stored notification is shown below. Nothing was sent twice.`,
      };
}
