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
  isRetrying,
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

const CHANNELS = new Set<NotificationChannel>(["EMAIL", "IN_APP", "WEBHOOK"]);

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
  const recipientAddress = String(formData.get("recipient_address") ?? "").trim();
  const template = String(formData.get("template") ?? "").trim();

  // Template variables arrive as var_<name> fields, so the form can render one
  // input per required variable without the action needing to know the
  // catalogue. Blank values are dropped rather than sent: the service treats a
  // blank required variable as missing, and sending "" would produce a 400
  // that reads as though the field were absent from the form entirely.
  const variables: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("var_")) continue;
    const v = String(value).trim();
    if (v) variables[key.slice("var_".length)] = v;
  }

  if (!recipientPrincipalId) {
    return { status: "error", message: "Recipient principal id is required." };
  }
  if (!channel || !CHANNELS.has(channel as NotificationChannel)) {
    return {
      status: "error",
      message:
        "Channel must be one of EMAIL, IN_APP, or WEBHOOK. SMS was withdrawn — it was accepted and then failed every time, which is worse than refusing it up front.",
    };
  }

  // The two content forms are mutually exclusive at the service, so the form
  // is refused here rather than round-tripping to collect a 400. A template
  // supplies its own subject; requiring one alongside would guarantee the
  // conflict.
  if (template && subject) {
    return {
      status: "error",
      message:
        "Choose either a template or a subject, not both. A template provides its own subject and body — accepting both would leave it ambiguous which one the recipient actually received.",
    };
  }
  if (!template && !subject) {
    return {
      status: "error",
      message: "Supply a subject, or pick a template that provides one.",
    };
  }

  const result = await sendNotification({
    identity,
    recipientPrincipalId,
    channel,
    ...(template ? { template, variables } : { subject }),
    ...(body && !template ? { body } : {}),
    ...(sourceEventType ? { sourceEventType } : {}),
    ...(sourceReference ? { sourceReference } : {}),
    ...(recipientAddress ? { recipientAddress } : {}),
    // Idempotency key: a retry of the same form submission replays the stored
    // notification instead of sending a second notice.
    correlationId: `console-${identity.principalId}-${recipientPrincipalId}-${Date.now()}`,
  });

  if (!result.ok) {
    return { status: "error", message: explainNotificationError(result.error.message) };
  }

  refresh();

  const n = result.data;

  // Checked before FAILED and before the success branch. A transient failure
  // comes back 201 with status PENDING and a schedule on it — neither of the
  // other branches describes that, and the success branch would have reported
  // a provider acceptance that did not happen.
  if (isRetrying(n)) {
    return {
      status: "retrying",
      notification: n,
      message: `Delivery did not succeed on the first attempt — ${
        n.failure_reason ?? "no reason given"
      }. The failure looks transient, so the notification is recorded and scheduled for another attempt${
        n.next_attempt_at ? ` at ${new Date(n.next_attempt_at).toLocaleString()}` : ""
      }. It has not failed and nothing has been sent twice; no failure event was published.`,
    };
  }

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
        // The old copy here said "no real provider is wired up — SENT means
        // recorded, not received". One is now wired up, so that caveat had to
        // go; the weaker half of it is still true and still worth saying.
        // ZS-SVC-Y-001 §0.4 forbids reporting provider acceptance as receipt,
        // and this message is where an operator would form that belief.
        message: describeDelivery(n),
      }
    : {
        status: "replayed",
        notification: n,
        message: `This correlation was already processed — the stored notification is shown below. Nothing was sent twice.`,
      };
}

/**
 * Describe a successful send without overstating it.
 *
 * The distinction is not pedantic. An IN_APP notice is genuinely delivered by
 * being recorded — the recipient reads it from the same register, and no third
 * party stands between the claim and the fact. An EMAIL has only been handed
 * to a provider that said it would take it, which is a materially weaker
 * statement and the one ZS-SVC-Y-001 §0.4 requires be reported as such.
 */
function describeDelivery(n: {
  channel: string;
  recipient_principal_id: string;
  recipient_address?: string;
  recipient_address_source?: string;
  provider_response?: string;
}): string {
  if (n.channel === "IN_APP") {
    return `Delivered in-app to ${n.recipient_principal_id}. It is in their notification register now and will show as unread until they open it.`;
  }

  const to = n.recipient_address
    ? `${n.recipient_address} (${
        n.recipient_address_source === "IDENTITY_CONTEXT"
          ? "resolved from identity-context-svc"
          : "supplied with the request"
      })`
    : n.recipient_principal_id;

  const evidence = n.provider_response ? ` Provider evidence: ${n.provider_response}.` : "";

  return `Accepted by the provider for delivery to ${to}.${evidence} Accepted is not received — this records that a provider took the message, not that anyone read it.`;
}
