// notification-svc (:8133, /notification-svc through the gateway)
// — governed delivery of notifications for workflows, deadlines, escalations,
// approvals, and status changes.
//
// WHAT "SENT" MEANS, PER CHANNEL. This module used to open by saying there was
// no provider wired up and that SENT meant "the stub accepted it". A real SMTP
// provider now sits behind EMAIL, so that is no longer true — but the caveat it
// was protecting still applies, in a narrower and more precise form:
//
//   IN_APP  — SENT genuinely means delivered. The notification row IS the
//             delivery; the recipient reads it back from the same register,
//             and no third party stands between the claim and the fact. It is
//             the only channel that can honestly claim receipt, and it carries
//             read state (read_at) to prove someone opened it.
//
//   EMAIL   — SENT means a mail provider ACCEPTED the message. Not that it was
//             delivered, and certainly not that anyone read it.
//             ZS-SVC-Y-001 §0.4 forbids treating provider acceptance as proof
//             a person received, read or was legally served with a notice, so
//             nothing in this console may render it as such. provider_response
//             carries the acceptance evidence.
//
//   WEBHOOK — no provider exists. Recorded FAILED with a reason naming what is
//             missing, rather than reported as sent. It is out of NCD's scope
//             entirely (§1.3) — XIC owns machine-to-machine exchange.
//
//   SMS     — withdrawn. It was accepted, resolved a recipient, and then failed
//             every send: the one channel that advertised a capability the
//             platform does not have. It is now refused at the request boundary
//             with the same 400 an unknown channel gets. Stored SMS rows still
//             exist and still render.
//
// FAILED is now genuinely reachable: a refused recipient, an unresolvable
// address, or an unconfigured provider all produce it. It still comes back with
// a 201, because 03-microservices.md §9.7 requires that notification failure
// must not collapse the source workflow — a payroll run that finalized
// correctly cannot be told it failed because an employee has no address on file.
//
// An unrecognised channel is a 400 at the request boundary rather than a FAILED
// record. It used to reach the adapter and be reported as a delivery failure,
// so a caller's typo left a stored FAILED row and a notification.failed event
// on the bus — evidence of an attempt no provider ever saw.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/**
 * Channels accepted for a NEW notification.
 *
 * "SMS" is absent: the service withdrew it, and a send naming it is refused
 * with 400 at the request boundary. Historical rows still carry the value, so
 * anything RENDERING a stored notification reads `channel` as a plain string
 * rather than narrowing to this type — a register that could not display what
 * it recorded would be worse than one showing a withdrawn channel.
 */
export type NotificationChannel = "EMAIL" | "IN_APP" | "WEBHOOK";
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

  /**
   * The endpoint the message was actually delivered to, snapshotted at send
   * time — never recomputed. Absent for IN_APP, which has no endpoint outside
   * the platform.
   */
  recipient_address?: string;

  /**
   * Where that address came from. The control ZS-SVC-Y-001 §0.4 asks for:
   * an address vouched for by the identity authority and one handed over in
   * the request must stay distinguishable after the fact.
   */
  recipient_address_source?: "IDENTITY_CONTEXT" | "REQUEST";

  /**
   * Acceptance evidence — which provider took the message and under what
   * identifier. Evidence of acceptance ONLY; it is not a delivery receipt and
   * must not be rendered as one.
   */
  provider_response?: string;

  /**
   * When the recipient opened an in-app notice. Absent means unread. Only ever
   * set on IN_APP: this service cannot observe whether an email was opened,
   * and does not pretend to.
   */
  read_at?: string;

  /** How many delivery attempts have concluded. 0 until the first finishes. */
  delivery_attempts?: number;

  /**
   * When the next delivery attempt is due.
   *
   * Present ONLY while status is PENDING, and its presence is what separates
   * the two meanings of PENDING: set means a transient failure is scheduled to
   * be re-attempted, absent means an attempt is in flight right now. Use
   * `isRetrying` rather than testing this directly.
   */
  next_attempt_at?: string;

  /** When the most recent attempt was made. */
  last_attempt_at?: string;
};

/**
 * Whether delivery failed transiently and another attempt is scheduled.
 *
 * This is NOT a failure to render as one. The notice has not been given up on;
 * `failure_reason` holds why the LAST attempt failed, and a later attempt may
 * still succeed. Showing it as FAILED would tell an operator a payslip notice
 * did not go out while the platform is still actively sending it.
 */
export function isRetrying(n: Notification): boolean {
  return n.status === "PENDING" && Boolean(n.next_attempt_at);
}

export type ListNotificationsInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  recipientPrincipalId?: string;
  status?: NotificationStatus;
  /**
   * Restrict to in-app notices the recipient has not opened — what an inbox
   * shows when filtered to unread. Implies IN_APP: the service will not report
   * an email as "unread", because nothing can ever clear it.
   */
  unreadOnly?: boolean;
};

/**
 * List notifications.
 *
 * The service decides what you are entitled to read from WHO is asking, and
 * `legal_entity_id` selects between two different reads:
 *
 * - supplied → the entity's register, authorized against it (403 without a
 *   NOTIFICATION_VIEW grant there).
 * - omitted → the caller's own inbox. The service forces the recipient filter
 *   to the calling principal, and refuses a `recipient_principal_id` naming
 *   anyone else with a 403.
 *
 * It used to authorize only when the filter was present, which meant omitting
 * it — the easier request — returned every notification in the tenant, subjects
 * and bodies included, to a principal holding no grant at all. Passing the
 * entity is therefore not a nicety: it is what makes this an authorized read of
 * the register rather than an unauthorized read of everything.
 *
 * Bounded by the service at 100 rows per page unless `limit` says otherwise
 * (max 500). Returns a bare JSON array, not an envelope — checked rather than
 * assumed.
 */
export async function listNotifications(
  input: ListNotificationsInput,
): Promise<ApiResult<Notification[]>> {
  const result = await apiGet<Notification[] | null>("notification", "/v1/notifications/", {
    query: {
      legal_entity_id: input.legalEntityId,
      recipient_principal_id: input.recipientPrincipalId,
      status: input.status,
      // Omitted rather than sent as "false": the service reads this as a
      // literal "true" and an absent parameter is the default.
      ...(input.unreadOnly ? { unread_only: "true" } : {}),
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

/**
 * Mark an in-app notice as read.
 *
 * Only the RECIPIENT may do this, and the service enforces it — a
 * NOTIFICATION_VIEW grant lets an administrator read the register, but reading
 * the register is not the recipient seeing their notice, and it must not clear
 * their badge. Anyone else gets a 403.
 *
 * Idempotent: calling it again returns 200 with the ORIGINAL read_at. The
 * service keeps the first read, so "when did they first see this" does not
 * decay into "when did they last look" as an inbox re-renders.
 *
 * IN_APP only. Marking an EMAIL read is a 400 — this platform cannot observe
 * whether a message delivered by an external provider was opened.
 */
export async function markNotificationRead(
  id: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<Notification>> {
  return apiPost<Notification>("notification", `/v1/notifications/${id}/read`, {}, { identity });
}

export type UnreadCount = {
  recipient_principal_id: string;
  unread_count: number;
  /** Always IN_APP — the count says which channel it can speak for. */
  channel: string;
};

/**
 * How many in-app notices the CALLER has not opened — the number on the bell.
 *
 * There is no principal parameter, deliberately: a per-principal unread total
 * that anyone could query would report on colleagues' attention.
 */
export async function getUnreadCount(
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiResult<UnreadCount>> {
  return apiGet<UnreadCount>("notification", "/v1/notifications/unread-count", { identity });
}

/** One template in the catalogue, as the service describes it. */
export type NotificationTemplate = {
  name: string;
  /** The subject the template will send under. Not caller-supplied. */
  subject: string;
  /**
   * Variables the template refuses to render without. The service returns 400
   * `missing_template_variables` rather than sending a message with a blank
   * organization name or an empty login link, so a form built from this list
   * is the difference between a submit that works and one that cannot.
   */
  required_variables: string[];
};

/**
 * The template catalogue.
 *
 * Fetched rather than hardcoded. The templates and their required-variable
 * contracts live in the service binary; a second copy here would drift the
 * first time one gains a variable, and the failure would be a 400 on submit
 * with no field on the form to fix it.
 */
export async function listNotificationTemplates(
  identity: Identity & { tenantId: string },
): Promise<ApiResult<NotificationTemplate[]>> {
  const result = await apiGet<{ templates: NotificationTemplate[] } | null>(
    "notification",
    "/v1/notifications/templates",
    { identity },
  );
  if (!result.ok) return result;
  if (!result.data || !Array.isArray(result.data.templates)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "notification-svc returned no template catalogue",
      },
    };
  }
  return { ok: true, data: result.data.templates };
}

export type SendNotificationInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  recipientPrincipalId: string;
  channel: string;
  sourceEventType?: string;
  sourceReference?: string;

  /**
   * Free-text content. Mutually exclusive with `template` — the service
   * refuses a request carrying both with 400 `conflicting_content`, because
   * supplying each would leave it ambiguous which one the recipient got.
   */
  subject?: string;
  body?: string;

  /**
   * Render a catalogue template instead of supplying subject and body. The
   * template provides both, and `variables` fills its placeholders; anything
   * it lists in `required_variables` must be present and non-blank.
   *
   * Values are escaped by the service for the context they land in, so an
   * organization name containing markup arrives as text rather than as markup.
   */
  template?: string;
  variables?: Record<string, string>;
  /** Idempotency key. The service replays the stored notification for a
   *  repeat, so a retry cannot send the same notice twice. */
  correlationId: string;

  /**
   * Override recipient resolution for EMAIL. Left unset — the normal case —
   * the address is read from identity-context-svc's record for the recipient
   * principal, which is the authoritative contact fact and is recorded as
   * such.
   *
   * Set it only for a recipient who is not yet an established principal, such
   * as the registration_received notice that goes to somebody whose
   * organization has not been approved. The service records that the address
   * came from the request rather than from the identity authority, so the two
   * never become indistinguishable.
   */
  recipientAddress?: string;
};

/**
 * Record and deliver a governed notification.
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
      correlation_id: input.correlationId,
      // Omitted rather than sent empty: the service rejects unknown fields and
      // stores an absent body as NULL.
      //
      // subject in particular must be ABSENT, not empty, when a template is
      // used: the service treats a non-empty subject alongside a template as
      // conflicting content and refuses the whole request.
      ...(input.subject ? { subject: input.subject } : {}),
      ...(input.template ? { template: input.template } : {}),
      ...(input.variables && Object.keys(input.variables).length > 0
        ? { variables: input.variables }
        : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.sourceEventType ? { source_event_type: input.sourceEventType } : {}),
      ...(input.sourceReference ? { source_reference: input.sourceReference } : {}),
      ...(input.recipientAddress ? { recipient_address: input.recipientAddress } : {}),
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
 * record"; the difference is whether delivery has concluded. What SENT is
 * worth depends on the channel, and the module comment sets that out: for
 * IN_APP it means delivered, for EMAIL it means a provider accepted it.
 */
export type NotificationReading = "sent" | "pending" | "retrying" | "failed";

export function readNotification(n: Notification): NotificationReading {
  if (n.status === "FAILED") return "failed";
  if (n.status === "SENT") return "sent";
  // Checked before the plain PENDING fall-through: a scheduled retry is a
  // distinct thing to show. It has a failure_reason on it, and rendering that
  // as a failure would report a notice as undelivered while the platform is
  // still actively trying to deliver it.
  if (isRetrying(n)) return "retrying";
  return "pending";
}

export type NotificationStats = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  /**
   * Awaiting another delivery attempt after a transient failure. Counted
   * separately from both `pending` and `failed`: these are neither idle nor
   * given up on, and folding them into `failed` would overstate how much did
   * not go out.
   */
  retrying: number;
  /** Distinct recipients with at least one notification. */
  recipients: number;
};

export function summariseNotifications(notifications: Notification[]): NotificationStats {
  const recipients = new Set<string>();
  const stats: NotificationStats = {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    retrying: 0,
    recipients: 0,
  };

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
      case "retrying":
        stats.retrying += 1;
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
    return "No caller identity reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("tenant_missing")) {
    return "The request carried no tenant scope (X-Tenant-Id), so the service refused it rather than reading across tenants. Sign in again.";
  }
  if (message.includes("unsupported_channel")) {
    return "That delivery channel is not one the service supports. Choose EMAIL, IN_APP, or WEBHOOK. SMS was withdrawn — it used to be accepted and then failed every send, so it is now refused up front rather than recorded as a delivery that failed.";
  }
  if (message.includes("invalid_limit") || message.includes("invalid_offset")) {
    return "The register read asked for an out-of-range page. limit must be 1–500 and offset must not be negative.";
  }
  if (message.includes("request_too_large")) {
    return "The notification body exceeded the service's 256 KiB request limit.";
  }
  if (message.includes("notification_not_found")) {
    return "No notification with that id exists for this tenant. Row-level security hides another tenant's notification the same way, so both read as not found.";
  }
  if (message.includes("conflicting_content")) {
    return "A template and a subject/body were both supplied. They are mutually exclusive — a template provides the subject and body itself, and accepting both would leave it ambiguous which one the recipient actually received.";
  }
  if (message.includes("unknown_template")) {
    return "That template is not in the catalogue. The list is served by the service itself, so a name that is not on it does not exist in this build.";
  }
  if (message.includes("missing_template_variables")) {
    return "The template was not given every variable it requires, so the service refused to render it. Sending a partial message is worse than refusing: the recipient would get an email with a blank organization name or an empty login link.";
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
