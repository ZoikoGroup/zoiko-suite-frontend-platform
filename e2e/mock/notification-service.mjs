// Hermetic stand-in for notification-svc (:8133 in the real stack), used by the
// Playwright E2E suite. Implements every route the Go service registers, so
// /admin/notifications and the topbar bell can be exercised without Postgres,
// Kafka, an SMTP relay, authorization-svc or the gateway:
//
//   POST /v1/notifications/                (send; idempotent on correlation_id)
//   GET  /v1/notifications/                (register, or the caller's own inbox)
//   GET  /v1/notifications/unread-count
//   GET  /v1/notifications/templates
//   GET  /v1/notifications/{id}
//   POST /v1/notifications/{id}/read
//   GET  /healthz, /readyz
//
// ── WHAT THIS MOCK IS FOR, AND WHAT IT IS NOT FOR ────────────────────────────
//
// It is not a second implementation of the service's rules. Row-level security,
// the transactional outbox, the retry backoff, the stranded sweep and the SMTP
// provider are the service's own correctness, proved against real Postgres and
// a running stack by its Go suite and scripts/audit.sh. A spec asserting a rule
// only this file enforces has proved nothing.
//
// It exists to answer what the Go tests structurally cannot: does the CONSOLE
// send the canonical §4 headers the envelope middleware demands on writes, does
// it read the fields it renders out of the real response shape, and — the big
// one here — does it tell the operator the truth about what happened.
//
// That last one is why this mock is shaped the way it is. On this service
// almost every interesting outcome is a 2xx:
//
//   * A FAILED delivery is a 201. 03-microservices.md §9.7 requires that
//     notification failure must not collapse the source workflow, so the
//     service answers 201 and puts the truth in `status`. A console that reads
//     the HTTP code reports a notice as sent when it demonstrably was not.
//
//   * A transient failure is ALSO a 201, with status PENDING and
//     next_attempt_at set. That is neither sent nor failed: the platform is
//     still actively delivering it. A console that falls through to its success
//     branch tells an operator a provider accepted a notice that had just
//     refused it; one that renders it as FAILED reports a payslip notice as
//     undelivered while it is still going out.
//
//   * A replay is a 200 with the ORIGINAL notification. A console that treats
//     200 and 201 alike claims to have sent something twice, or claims a second
//     send happened when nothing did.
//
// So the mock models exactly the branches the console can get wrong, matched to
// the running service's handler:
//
//   * Idempotency on (tenant_id, correlation_id) → 200 replay vs 201 create.
//   * Per-channel delivery semantics: IN_APP is SENT and carries read state;
//     EMAIL is SENT with provider_response as ACCEPTANCE evidence; WEBHOOK is
//     recorded FAILED naming what is missing; SMS is refused with 400 at the
//     boundary, leaving nothing recorded.
//   * Recipient-address provenance (IDENTITY_CONTEXT vs REQUEST), which is the
//     control ZS-SVC-Y-001 §0.4 asks for.
//   * Read state: IN_APP only, recipient only, and the FIRST read is kept.
//   * The unread count is the CALLER's, with no principal parameter.
//   * The two different list reads — legal_entity_id present is the entity's
//     register, absent is the caller's own inbox.
//   * The {"error": "<code>"} body shape, because explainNotificationError only
//     fires if that code reaches it.
//
// Deliberately NOT modelled: the authorization decision (every caller here is
// permitted unless a spec arms a refusal), the outbox, the event pipeline and
// the retry worker's own scheduling.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 18133);

// Same identities the rest of the hermetic suite uses (see e2e/helpers.ts).
const TENANT = "11111111-1111-1111-1111-111111111111";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const OTHER_PRINCIPAL = "44444444-4444-4444-4444-444444444444";

// The six templates the Go service compiles in, with the variables each refuses
// to render without. Kept in step with internal/templates/templates.go — the
// console builds one input per required variable from this list, so a drift
// here shows up as a form that cannot be submitted.
const TEMPLATES = [
  { name: "registration_received", subject: "We have received your registration", required_variables: ["organization_name"] },
  { name: "approved", subject: "Your organization has been approved", required_variables: ["organization_name", "login_url"] },
  { name: "rejected", subject: "Your registration could not be approved", required_variables: ["organization_name", "reason"] },
  { name: "suspended", subject: "Your organization has been suspended", required_variables: ["organization_name", "reason"] },
  { name: "reactivated", subject: "Your organization has been reactivated", required_variables: ["organization_name", "login_url"] },
  { name: "password_reset", subject: "Reset your password", required_variables: ["reset_url"] },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────
//
// Chosen so the register shows all four READINGS at once, because those four
// are exactly what an operator misreads:
//
//   SENT (IN_APP)   — genuinely delivered, and unread. The badge counts it.
//   SENT (EMAIL)    — a provider ACCEPTED it. Not a receipt.
//   RETRYING        — PENDING with a schedule. Has NOT failed.
//   FAILED          — recorded proof the notice did not go out.
//
// Plus one IN_APP notice already read, so the bell's count and the register's
// "Read <when>" marker can both be asserted against something that moved.

const iso = (d) => new Date(d).toISOString();

const seed = () => ({
  requests: [],
  armed: null,
  notifications: [
    {
      notification_id: "a0000000-0000-4000-8000-000000000001",
      tenant_id: TENANT,
      legal_entity_id: ENTITY,
      recipient_principal_id: ADMIN,
      channel: "IN_APP",
      subject: "Payroll cutoff approaching",
      body: "Cutoff for the next payroll run is Friday.",
      status: "SENT",
      source_event_type: "PAYROLL_RUN",
      source_reference: "pr-2026-09",
      correlation_id: "seed-payroll-cutoff",
      created_by_principal_id: ADMIN,
      created_at: iso("2026-09-20T09:00:00Z"),
      sent_at: iso("2026-09-20T09:00:00Z"),
      delivery_attempts: 1,
    },
    {
      notification_id: "a0000000-0000-4000-8000-000000000002",
      tenant_id: TENANT,
      legal_entity_id: ENTITY,
      recipient_principal_id: ADMIN,
      channel: "IN_APP",
      subject: "Expense claim approved",
      body: "EXP-2026-0412 was approved.",
      status: "SENT",
      source_event_type: "EXPENSE_CLAIM",
      source_reference: "EXP-2026-0412",
      correlation_id: "seed-expense-approved",
      created_by_principal_id: ADMIN,
      created_at: iso("2026-09-19T14:30:00Z"),
      sent_at: iso("2026-09-19T14:30:00Z"),
      // Already read: the first-read timestamp the console renders.
      read_at: iso("2026-09-19T15:02:11Z"),
      delivery_attempts: 1,
    },
    {
      notification_id: "a0000000-0000-4000-8000-000000000003",
      tenant_id: TENANT,
      legal_entity_id: ENTITY,
      recipient_principal_id: OTHER_PRINCIPAL,
      channel: "EMAIL",
      subject: "Invoice approval required",
      body: "Invoice INV-100 needs your approval.",
      status: "SENT",
      source_event_type: "INVOICE_APPROVAL",
      source_reference: "INV-100",
      correlation_id: "seed-invoice-approval",
      created_by_principal_id: ADMIN,
      created_at: iso("2026-09-21T08:15:00Z"),
      sent_at: iso("2026-09-21T08:15:03Z"),
      recipient_address: "approver@zoikosuite.example",
      recipient_address_source: "IDENTITY_CONTEXT",
      // Acceptance evidence, never a delivery receipt.
      provider_response: "250 2.0.0 Ok: queued as 4X9kT2",
      delivery_attempts: 1,
    },
    {
      // RETRYING. PENDING with a schedule and a reason for the LAST attempt.
      // The console must show this as amber-and-still-going, not as FAILED.
      notification_id: "a0000000-0000-4000-8000-000000000004",
      tenant_id: TENANT,
      legal_entity_id: ENTITY,
      recipient_principal_id: OTHER_PRINCIPAL,
      channel: "EMAIL",
      subject: "Payslip available",
      body: "Your September payslip is ready.",
      status: "PENDING",
      source_event_type: "PAYROLL_RUN",
      source_reference: "pr-2026-09",
      correlation_id: "seed-payslip-retrying",
      created_by_principal_id: ADMIN,
      created_at: iso("2026-09-21T09:00:00Z"),
      recipient_address: "employee@zoikosuite.example",
      recipient_address_source: "IDENTITY_CONTEXT",
      failure_reason: "451 4.7.1 greylisted, try again later",
      delivery_attempts: 2,
      last_attempt_at: iso("2026-09-21T09:04:00Z"),
      next_attempt_at: iso("2099-01-01T00:00:00Z"),
    },
    {
      // FAILED, with a caller-supplied address — so the console's
      // "caller-supplied" provenance marker has something to render.
      notification_id: "a0000000-0000-4000-8000-000000000005",
      tenant_id: TENANT,
      legal_entity_id: ENTITY,
      recipient_principal_id: OTHER_PRINCIPAL,
      channel: "EMAIL",
      subject: "We have received your registration",
      body: "<p>Thank you.</p>",
      status: "FAILED",
      source_event_type: "ORGANIZATION_REGISTRATION",
      source_reference: "org-northwind",
      correlation_id: "seed-registration-failed",
      created_by_principal_id: ADMIN,
      created_at: iso("2026-09-18T11:00:00Z"),
      sent_at: iso("2026-09-18T11:00:02Z"),
      recipient_address: "founder@northwind.example",
      recipient_address_source: "REQUEST",
      failure_reason: "550 5.1.1 no such mailbox",
      delivery_attempts: 1,
      last_attempt_at: iso("2026-09-18T11:00:02Z"),
    },
  ],
});

let db = seed();

// ─── HTTP plumbing ────────────────────────────────────────────────────────────

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

// The canonical Service Input Contract, ZS-ARCH-SVC-001 v2.0 §4, in the
// write-strict mode the real service runs.
//
// This is the single most valuable thing the mock does, and it is why every
// spec here asserts on the wire as well as on the page. The console shipped for
// weeks sending none of these headers and every page still RENDERED — it was
// every write that answered 401, silently, because reads were admitted. Nothing
// visible on screen could have caught it.
function envelopeViolation(headers, isWrite) {
  const has = (h) => typeof headers[h] === "string" && headers[h].trim().length > 0;

  // Identity first: its absence is a 401 on reads as well as writes, because
  // every handler on this service calls requirePrincipal.
  if (!has("x-tenant-id")) {
    return { status: 401, body: { error: "tenant_missing", message: "X-Tenant-Id is required" } };
  }
  if (!has("x-principal-id") && !has("x-workload-id")) {
    return { status: 401, body: { error: "identity_missing", message: "X-Principal-Id is required" } };
  }

  if (!isWrite) return null;

  const missing = [];
  if (!has("x-request-id")) missing.push("request_id");
  if (!has("x-source-channel")) missing.push("source_channel");
  if (!has("idempotency-key")) missing.push("idempotency_key");
  if (missing.length === 0) return null;

  return {
    status: 400,
    body: {
      error: "envelope_incomplete",
      message: `canonical envelope incomplete: ${missing.join(", ")}`,
      violations: missing.map((field) => ({ field, reason: "missing" })),
    },
  };
}

// ─── Delivery, as the real service decides it ─────────────────────────────────

// Channels accepted for a NEW notification. SMS is absent deliberately: it was
// accepted, resolved a recipient, and then failed every send, so it is now
// refused at the boundary with the same 400 an unknown channel gets. Nothing is
// recorded — a caller's typo used to leave a permanent FAILED row describing an
// attempt no provider ever saw.
const SUPPORTED = new Set(["EMAIL", "IN_APP", "WEBHOOK"]);

function deliver(channel, address) {
  if (channel === "IN_APP") {
    // The register row IS the delivery. The only channel that can honestly
    // claim receipt.
    return { status: "SENT" };
  }
  if (channel === "WEBHOOK") {
    // No provider exists, by design: §1.3 puts machine-to-machine exchange
    // outside this service's remit. Recorded FAILED naming what is missing,
    // rather than reported as sent.
    return {
      status: "FAILED",
      failure_reason:
        "webhook delivery is not this service's channel — machine-to-machine exchange is XIC's authority",
    };
  }
  // EMAIL. SENT means a provider ACCEPTED it — never that it arrived.
  if (!address) {
    return {
      status: "FAILED",
      failure_reason: "recipient resolution failed: recipient principal has no email address on record",
    };
  }
  return { status: "SENT", provider_response: `250 2.0.0 Ok: queued as ${randomUUID().slice(0, 6)}` };
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";
  const isWrite = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const q = url.searchParams;

  if (path === "/healthz") return send(res, 200, { status: "ok" });
  if (path === "/readyz") {
    return send(res, 200, {
      status: "READY",
      components: { database: "ok", "authorization-svc": "ok" },
    });
  }

  if (path === "/_e2e/reset" && method === "POST") {
    db = seed();
    return send(res, 200, { reset: true });
  }
  // Test-only. The request journal, for asserting what the console SENT rather
  // than only what it rendered.
  if (path === "/_e2e/requests" && method === "GET") {
    return send(res, 200, db.requests);
  }
  if (path === "/_e2e/arm" && method === "POST") {
    db.armed = await readBody(req);
    return send(res, 200, { armed: db.armed });
  }

  const body = isWrite ? await readBody(req) : undefined;
  db.requests.push({
    method,
    path,
    query: Object.fromEntries(q),
    headers: { ...req.headers },
    ...(body !== undefined ? { body } : {}),
  });

  const violation = envelopeViolation(req.headers, isWrite);
  if (violation) return send(res, violation.status, violation.body);

  const tenant = String(req.headers["x-tenant-id"]);
  const principal = String(req.headers["x-principal-id"] ?? req.headers["x-workload-id"]);
  const mine = (n) => n.tenant_id === tenant;

  // An armed refusal. A spec arming one wants to see how the console renders a
  // refusal it cannot predict for itself — a 403 that depends on a grant only
  // authorization-svc knows about, or the 503 that means the register could not
  // be reached.
  //
  // `path` is not a nicety. A single page load makes SEVERAL calls here — the
  // template catalogue, the entity register, and the bell's unread count and
  // unread list, the last two concurrently — so an untargeted arm is consumed
  // by whichever request happens to arrive first, and the spec then asserts
  // against a page where a DIFFERENT call failed. That is a flake that passes
  // and fails on scheduling.
  //
  // `hasQuery` narrows further, and it is what separates the two GET reads that
  // share a path. The entity REGISTER read carries legal_entity_id; the bell's
  // INBOX read does not, and carries unread_only instead. A spec proving the
  // register degrades cleanly must not take the bell down with it — the bell is
  // on every admin page, so an arm that catches it changes a surface the spec
  // is not looking at, and does so only when the polling happens to interleave.
  //
  // `times` exists for the same reason from the other side: the bell reads the
  // count and the list as two requests, and React re-invokes its mount effect in
  // development, so a spec proving "the inbox could not be read" needs every
  // read refused for as long as it looks — the register being down is not the
  // register being down for exactly two requests.
  if (db.armed) {
    const armed = db.armed;
    const appliesTo = armed.only ?? "write";
    const methodMatches = appliesTo === "any" || (appliesTo === "write") === isWrite;
    const pathMatches = !armed.path || path.startsWith(armed.path);
    const queryMatches = !armed.hasQuery || q.has(armed.hasQuery);
    if (methodMatches && pathMatches && queryMatches) {
      const remaining = (armed.times ?? 1) - 1;
      db.armed = remaining > 0 ? { ...armed, times: remaining } : null;
      const { status, only, path: _p, times: _t, hasQuery: _q, ...rest } = armed;
      return send(res, status ?? 503, rest);
    }
  }

  // ── GET /v1/notifications/templates ────────────────────────────────────────
  //
  // Registered before the {id} route, exactly as chi matches a static segment
  // ahead of a wildcard. No authorization and no tenant scope: the catalogue is
  // compiled into the binary and identical for every tenant. It still requires
  // an identity, which the envelope check above enforced.
  if (path === "/v1/notifications/templates" && method === "GET") {
    return send(res, 200, { templates: TEMPLATES });
  }

  // ── GET /v1/notifications/unread-count ─────────────────────────────────────
  //
  // No principal parameter, deliberately: a per-principal unread total anyone
  // could query would report on colleagues' attention. IN_APP only — counting
  // emails would produce a badge that only ever grows.
  if (path === "/v1/notifications/unread-count" && method === "GET") {
    const unread = db.notifications.filter(
      (n) => mine(n) && n.recipient_principal_id === principal && n.channel === "IN_APP" && !n.read_at,
    ).length;
    return send(res, 200, {
      recipient_principal_id: principal,
      unread_count: unread,
      channel: "IN_APP",
    });
  }

  // ── POST /v1/notifications/{id}/read ───────────────────────────────────────
  const readMatch = path.match(/^\/v1\/notifications\/([^/]+)\/read$/);
  if (readMatch && method === "POST") {
    const n = db.notifications.find((x) => x.notification_id === readMatch[1] && mine(x));
    if (!n) return send(res, 404, { error: "notification_not_found" });
    // Only the RECIPIENT. A NOTIFICATION_VIEW grant lets an administrator read
    // the register, and reading the register is not the recipient reading their
    // notice — it must not clear their badge.
    if (n.recipient_principal_id !== principal) {
      return send(res, 403, { error: "forbidden", message: "only the recipient may mark a notification read" });
    }
    if (n.channel !== "IN_APP") {
      return send(res, 400, {
        error: "channel_has_no_read_state",
        message:
          "read state applies to IN_APP notifications only; this service cannot observe whether a message delivered by an external provider was opened",
      });
    }
    // The FIRST read is kept. Inboxes re-issue this on every render, and
    // without it "when did they first see this" decays into "when did they last
    // look".
    n.read_at = n.read_at ?? new Date().toISOString();
    return send(res, 200, n);
  }

  // ── GET /v1/notifications/{id} ─────────────────────────────────────────────
  const idMatch = path.match(/^\/v1\/notifications\/([^/]+)$/);
  if (idMatch && method === "GET") {
    const n = db.notifications.find((x) => x.notification_id === idMatch[1] && mine(x));
    // Another tenant's notification is not_found, not forbidden: row-level
    // security hides it, and saying an id exists elsewhere is a disclosure.
    if (!n) return send(res, 404, { error: "notification_not_found" });
    return send(res, 200, n);
  }

  // ── GET /v1/notifications/ ─────────────────────────────────────────────────
  if (path === "/v1/notifications" && method === "GET") {
    const legalEntity = q.get("legal_entity_id") ?? "";
    let recipient = q.get("recipient_principal_id") ?? "";

    if (!legalEntity) {
      // No entity: this is the caller's own INBOX, not the register. The
      // recipient filter is forced to the caller, and naming anyone else is
      // refused rather than silently rewritten — authorization used to be
      // conditional on the filter being present, so omitting it returned every
      // notification in the tenant to a principal holding no grant at all.
      if (recipient && recipient !== principal) {
        return send(res, 403, {
          error: "forbidden",
          message:
            "reading another principal's notifications requires legal_entity_id and a NOTIFICATION_VIEW grant on it",
        });
      }
      recipient = principal;
    }

    const limit = Number(q.get("limit") ?? 100);
    if (Number.isNaN(limit) || limit < 1 || limit > 500) {
      return send(res, 400, { error: "invalid_limit", message: "limit must be between 1 and 500" });
    }
    const offset = Number(q.get("offset") ?? 0);
    if (Number.isNaN(offset) || offset < 0) {
      return send(res, 400, { error: "invalid_offset", message: "offset must not be negative" });
    }

    const status = q.get("status") ?? "";
    const unreadOnly = q.get("unread_only") === "true";

    const rows = db.notifications
      .filter((n) => mine(n))
      .filter((n) => (legalEntity ? n.legal_entity_id === legalEntity : true))
      .filter((n) => (recipient ? n.recipient_principal_id === recipient : true))
      .filter((n) => (status ? n.status === status : true))
      // unread_only implies IN_APP. read_at is NULL for every email and always
      // will be, so filtering unread without the channel would report every
      // email ever sent as unread.
      .filter((n) => (unreadOnly ? !n.read_at && n.channel === "IN_APP" : true))
      // Newest first, with the id as the tiebreaker — two notices recorded in
      // the same transaction share a timestamp, and a paged read could
      // otherwise show one row twice and skip another.
      .sort((a, b) =>
        a.created_at === b.created_at
          ? b.notification_id.localeCompare(a.notification_id)
          : b.created_at.localeCompare(a.created_at),
      )
      .slice(offset, offset + limit);

    // A bare JSON array, not an envelope.
    return send(res, 200, rows);
  }

  // ── POST /v1/notifications/ ────────────────────────────────────────────────
  if (path === "/v1/notifications" && method === "POST") {
    if (body === null) return send(res, 400, { error: "invalid_json" });

    const {
      recipient_principal_id: recipientID,
      legal_entity_id: entityID,
      channel,
      correlation_id: correlationID,
      template,
      variables,
      recipient_address: addressOverride,
    } = body;
    let { subject, body: text } = body;

    // Mutually exclusive. Accepting both would leave it ambiguous which one the
    // recipient actually received.
    if (template && (subject || text)) {
      return send(res, 400, {
        error: "conflicting_content",
        message: "supply either template (with variables) or subject and body, not both",
      });
    }

    if (template) {
      const t = TEMPLATES.find((x) => x.name === template);
      if (!t) return send(res, 400, { error: "unknown_template", message: `unknown template: ${template}` });
      const missing = t.required_variables.filter((v) => !String((variables ?? {})[v] ?? "").trim());
      if (missing.length > 0) {
        // Refusing beats sending a message with a blank organization name or an
        // empty login link.
        return send(res, 400, {
          error: "missing_template_variables",
          message: `template ${template} requires: ${missing.join(", ")}`,
        });
      }
      subject = t.subject;
      text = `<p>rendered ${template}</p>`;
    }

    if (!recipientID || !entityID || !channel || !subject || !correlationID) {
      return send(res, 400, {
        error: "missing_fields",
        message:
          "recipient_principal_id, legal_entity_id, channel, correlation_id are required, plus either subject or template",
      });
    }
    if (!SUPPORTED.has(channel)) {
      return send(res, 400, {
        error: "unsupported_channel",
        message: "channel must be one of EMAIL, IN_APP, WEBHOOK",
      });
    }
    if (addressOverride) {
      if (channel !== "EMAIL") {
        return send(res, 400, {
          error: "address_not_applicable",
          message:
            "recipient_address is only meaningful for EMAIL and SMS; an IN_APP notice is delivered by being recorded, and WEBHOOK is not this service's channel",
        });
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addressOverride)) {
        return send(res, 400, { error: "invalid_recipient_address", message: "mail: missing '@' or malformed address" });
      }
    }

    // Idempotent on (tenant_id, correlation_id). A repeat REPLAYS the stored
    // notification — 200, not 201, and the same id. A console that collapses
    // the two claims a second notice went out.
    const existing = db.notifications.find((n) => mine(n) && n.correlation_id === correlationID);
    if (existing) return send(res, 200, existing);

    // The address, and its PROVENANCE. §0.4 names notices sent to an unverified
    // free-text address with no recipient provenance as a thing this control
    // plane exists to prevent, so an address the identity authority vouched for
    // and one handed over in the request stay distinguishable after the fact.
    let address = "";
    let addressSource = "";
    if (channel === "EMAIL") {
      if (addressOverride) {
        address = addressOverride;
        addressSource = "REQUEST";
      } else {
        address = `${recipientID}@resolved.zoikosuite.example`;
        addressSource = "IDENTITY_CONTEXT";
      }
    }

    const outcome = deliver(channel, address);
    const now = new Date().toISOString();
    const n = {
      notification_id: randomUUID(),
      tenant_id: tenant,
      legal_entity_id: entityID,
      recipient_principal_id: recipientID,
      channel,
      subject,
      body: text ?? "",
      status: outcome.status,
      source_event_type: body.source_event_type ?? undefined,
      source_reference: body.source_reference ?? undefined,
      correlation_id: correlationID,
      created_by_principal_id: principal,
      created_at: now,
      sent_at: now,
      delivery_attempts: 1,
      last_attempt_at: now,
      ...(address ? { recipient_address: address, recipient_address_source: addressSource } : {}),
      ...(outcome.provider_response ? { provider_response: outcome.provider_response } : {}),
      ...(outcome.failure_reason ? { failure_reason: outcome.failure_reason } : {}),
    };
    db.notifications.push(n);

    // 201 even for FAILED. §9.7: notification failure must not collapse the
    // source operational workflow — a payroll run that finalized correctly
    // cannot be told it failed because an employee has no address on file.
    return send(res, 201, n);
  }

  return send(res, 404, { error: "not_found", message: `no route for ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`notification-svc mock listening on :${PORT}`);
});
