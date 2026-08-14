// notification-svc (:8133, /notification-svc through the gateway)
// — governed delivery of notifications for workflows, deadlines, escalations,
// approvals, and status changes.
//
// THE STUB IS THE WHOLE STORY: there is no email/SMS/webhook provider wired up
// on this platform. deliverStub in the service logs a "delivery" and always
// succeeds for EMAIL, SMS, IN_APP, or WEBHOOK. So a SENT status means "the
// service recorded it and its stub adapter accepted it", NOT "someone actually
// received an email". The only way to exercise the FAILED path is an
// unsupported channel, and that still answers 201 — the service's own critical
// constraint (03-microservices.md §9.7) is that notification failure must not
// collapse the source workflow, so the caller sees a normal 201 with
// status: FAILED instead of an error.
//
// The console therefore renders delivery status without implying real-world
// delivery: SENT is "recorded, stub-delivered", FAILED is "recorded, delivery
// failed", PENDING is "recorded, delivery not attempted".

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type NotificationChannel = "EMAIL" | "SMS" | "IN_APP" | "WEBHOOK";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

/** Wire shape. Field names match the Go json tags exactly. */
export type Notification = {
  notification_id: string;
  tenant_id: string;
  legal_entity_id: string;
  recipient_principal_id: string;
  channel: string;
  subject: string;
  body?: string;
  status: NotificationStatus;
  source_event_type?: string;
  source_reference?: string;
  correlation_id: string;
  created_by_principal_id: string;
  created_at: string;
  /** Present only when delivery concluded. */
  sent_at?: string;
  /** Present only on FAILED. */
  failure_reason?: string;
};

export type ListNotificationsInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  recipientPrincipalId?: string;
  status?: NotificationStatus;
};

/**
 * List the tenant's notifications.
 *
 * All three filters are applied by the service. When `legal_entity_id` is
 * present the service authorizes the read against that entity (403 if this
 * principal has no NOTIFICATION_VIEW grant there); when it is absent the list
 * is scoped to the tenant from X-Tenant-Id.
 *
 * Returns a bare JSON array, not an envelope — checked rather than assumed.
 */
export async function listNotifications(
  input: ListNotificationsInput,
): Promise<ApiResult<Notification[]>> {
  const result = await apiGet<Notification[] | null>("notification", "/v1/notifications/", {
    query: {
      legal_entity_id: input.legalEntityId,
      recipient_principal_id: input.recipientPrincipalId,
      status: input.status,
    },
    identity: input.identity,
  });

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "notification-svc returned a non-array notification list",
      },
    };
  }
  return { ok: true, data: result.data };
}

/** One notification by id. */
export async function getNotification(
  id: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<Notification>> {
  return apiGet<Notification>("notification", `/v1/notifications/${id}`, { identity });
}

export type SendNotificationInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  recipientPrincipalId: string;
  channel: string;
  subject: string;
  body?: string;
  sourceEventType?: string;
  sourceReference?: string;
  /** Idempotency key. The service replays the stored notification for a
   *  repeat, so a retry cannot send the same notice twice. */
  correlationId: string;
};

/**
 * Record and "deliver" a governed notification.
 *
 * 201 means a new notification was recorded; 200 means the correlation id was
 * already processed and the stored result was replayed. A FAILED status still
 * comes back as 201 — see the module comment.
 */
export async function sendNotification(
  input: SendNotificationInput,
): Promise<ApiWriteResult<Notification>> {
  return apiPost<Notification>(
    "notification",
    "/v1/notifications/",
    {
      recipient_principal_id: input.recipientPrincipalId,
      legal_entity_id: input.identity.legalEntityId,
      channel: input.channel,
      subject: input.subject,
      correlation_id: input.correlationId,
      // Omitted rather than sent empty: the service rejects unknown fields and
      // stores an absent body as NULL.
      ...(input.body ? { body: input.body } : {}),
      ...(input.sourceEventType ? { source_event_type: input.sourceEventType } : {}),
      ...(input.sourceReference ? { source_reference: input.sourceReference } : {}),
    },
    { identity: input.identity },
  );
}

/**
 * How a notification should READ, as distinct from what it says.
 *
 * The distinction that matters is FAILED vs everything else. A FAILED
 * notification is recorded proof that the notice did not go out — it is an
 * operational signal, not a cosmetic state. SENT and PENDING are both "on
 * record"; the difference is whether the stub adapter accepted delivery.
 */
export type NotificationReading = "sent" | "pending" | "failed";

export function readNotification(n: Notification): NotificationReading {
  if (n.status === "FAILED") return "failed";
  if (n.status === "SENT") return "sent";
  return "pending";
}

export type NotificationStats = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  /** Distinct recipients with at least one notification. */
  recipients: number;
};

export function summariseNotifications(notifications: Notification[]): NotificationStats {
  const recipients = new Set<string>();
  const stats: NotificationStats = { total: 0, sent: 0, failed: 0, pending: 0, recipients: 0 };

  for (const n of notifications) {
    stats.total += 1;
    recipients.add(n.recipient_principal_id);
    switch (readNotification(n)) {
      case "sent":
        stats.sent += 1;
        break;
      case "failed":
        stats.failed += 1;
        break;
      default:
        stats.pending += 1;
    }
  }

  stats.recipients = recipients.size;
  return stats;
}

/** Turn a backend failure into something an operator can act on. */
export function explainNotificationError(message: string): string {
  if (message.includes("forbidden")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Sending (NOTIFICATION_SEND) and reading (NOTIFICATION_VIEW) are separate grants, so holding one does not imply the other.";
  }
  if (message.includes("authz_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity or tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("notification_not_found")) {
    return "No notification with that id exists for this tenant. Row-level security hides another tenant's notification the same way, so both read as not found.";
  }
  if (message.includes("missing_fields")) {
    return "A required field was empty or blank: recipient_principal_id, legal_entity_id, channel, subject, and correlation_id are all required.";
  }
  if (message.includes("invalid_json")) {
    return "The service could not parse the request body.";
  }
  if (message.includes("store_unavailable")) {
    return "notification-svc could not record the notification, so it was NOT delivered and no proof of delivery was written. Delivery failure never surfaces as an error to the caller by design — but this particular failure happened before the record existed, so there is nothing to read back. Try again with a fresh correlation id.";
  }
  return message;
}
