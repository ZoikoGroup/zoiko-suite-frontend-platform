// Hermetic stand-in for delegated-authority-svc (:8136 in the real stack),
// used by the Playwright E2E suite. Implements every route the Go service
// registers, so the whole Delegated Authority console (/admin/delegations) can
// be exercised without Postgres, authorization-svc, the gateway or the event
// pipeline:
//
//   GET    /v1/delegations?legal_entity_id=&delegator_principal_id=&delegate_principal_id=&status=&limit=&offset=
//   GET    /v1/delegations/{delegation_id}
//   POST   /v1/delegations/            (idempotent on correlation_id)
//   POST   /v1/delegations/{delegation_id}/revoke
//   GET    /healthz, /readyz
//
// WHAT THIS MOCK IS FOR, AND WHAT IT IS NOT FOR
//
// It is not a second implementation of the service's business rules. RLS,
// scope precedence, the outbox, lazy expiry and the event pipeline are the
// service's own correctness and are proved against real Postgres in the Go
// suite (internal/store/pg_store_test.go). A spec that asserts a rule only
// this file enforces has proved nothing.
//
// It exists to answer the questions the Go tests structurally cannot: does the
// CONSOLE send the canonical §4 headers the service's envelope middleware
// demands on writes, does it read the fields it renders out of the real
// response shape, and does it tell the reader the right thing for each of the
// register's refusals — a replay that changed nothing must not read as a new
// grant, a governance refusal must not read as an error.
//
// So the parts modelled faithfully are the ones the console can get wrong,
// ALL matched to the running service's handler rather than inferred:
//
//   * Header enforcement. Reads gate in the handler (requireTenant then
//     requirePrincipal), answering 401 `tenant_missing` / `identity_missing`.
//     Writes are gated by the envelope middleware before any handler runs:
//     tenant_id and actor_subject_id as 401 `envelope_incomplete`, the rest
//     (request_id, correlation_id, source_channel, idempotency_key,
//     legal_entity_id) as 400 — always with a structured violations array.
//   * Error body shape. The handler answers business refusals with
//     `{"error_code","error_message"}` — NOT the envelope's error/detail. The
//     console's explainDelegationError only fires if that message reaches it,
//     so the mock must speak the handler's dialect for the refusals below to
//     be honest. (lib/api/client.ts readErrorDetail folds both dialects.)
//   * The refusal ORDER in CreateDelegation. self_dealing (403) comes before
//     delegator_mismatch (403), which comes before the delegator-holds-the-
//     action check (delegator_lacks_authority, 403). The order matters: a
//     mismatched delegator routed to the caller is self-dealing and must not
//     answer as delegator_mismatch.
//   * The read scope dichotomy. legal_entity_id present → entity-wide read
//     requiring DELEGATION_VIEW; absent → only delegations the caller is party
//     to, and naming another principal is refused as 403, never silently
//     widened to the caller.
//   * Idempotency on (tenant_id, correlation_id), answering 200 with the
//     ORIGINAL grant — a replay is byte-identical to a 201, and the console's
//     neutral rendering depends on telling the two apart.
//
// Deliberately NOT modelled: authz-svc lookups (the demo bundle's grants are
// hard-coded below), the outbox, cross-tenant enumeration subtleties, and the
// real sweep's event publications.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 18086);

// Same identities the rest of the hermetic suite uses (see e2e/helpers.ts).
const TENANT = "11111111-1111-1111-1111-111111111111";
const LEGAL_ENTITY = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const COLLEAGUE = "44444444-4444-4444-4444-444444444444";

// ─── Seed ─────────────────────────────────────────────────────────────────────
//
// Four grants on the demo entity, all involving the demo principal so the
// register reads sensibly on first load: one this principal granted, one where
// they are the delegate, plus one of each terminal state — a revoked grant is
// the ordinary end of a delegation, an expired one is a grant whose window
// closed on its own, and both must render "terminal" (no revoke affordance)
// rather than vanishing. Nothing here is ever deleted.

const SEEDED_PO_ISSUE_ID = "de000000-0000-4000-8000-000000000001";

const seedDelegations = () => [
  {
    delegation_id: SEEDED_PO_ISSUE_ID,
    tenant_id: TENANT,
    legal_entity_id: LEGAL_ENTITY,
    delegator_principal_id: ADMIN,
    delegate_principal_id: COLLEAGUE,
    action_type: "PO_ISSUE",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2026-12-31T00:00:00.000Z",
    status: "ACTIVE",
    created_by_principal_id: ADMIN,
    correlation_id: "seed-correlation-0001",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    revoked_by_principal_id: null,
    revoked_at: null,
    expired_at: null,
  },
  {
    // The demo principal as delegate: a colleague handed THEM authority.
    delegation_id: "de000000-0000-4000-8000-000000000002",
    tenant_id: TENANT,
    legal_entity_id: LEGAL_ENTITY,
    delegator_principal_id: COLLEAGUE,
    delegate_principal_id: ADMIN,
    action_type: "PAYMENT_APPROVE",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2026-12-31T00:00:00.000Z",
    status: "ACTIVE",
    created_by_principal_id: COLLEAGUE,
    correlation_id: "seed-correlation-0002",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    revoked_by_principal_id: null,
    revoked_at: null,
    expired_at: null,
  },
  {
    delegation_id: "de000000-0000-4000-8000-000000000003",
    tenant_id: TENANT,
    legal_entity_id: LEGAL_ENTITY,
    delegator_principal_id: ADMIN,
    delegate_principal_id: "55555555-5555-5555-5555-555555555555",
    action_type: "CONTRACT_SIGN",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2026-12-31T00:00:00.000Z",
    status: "REVOKED",
    created_by_principal_id: ADMIN,
    correlation_id: "seed-correlation-0003",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-03-01T09:15:00.000Z",
    revoked_by_principal_id: ADMIN,
    revoked_at: "2026-03-01T09:15:00.000Z",
    expired_at: null,
  },
  {
    // Expired by time, not by anyone acting. Expiry is observed on read.
    delegation_id: "de000000-0000-4000-8000-000000000004",
    tenant_id: TENANT,
    legal_entity_id: LEGAL_ENTITY,
    delegator_principal_id: ADMIN,
    delegate_principal_id: "66666666-6666-6666-6666-666666666666",
    action_type: "INVOICE_APPROVE",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2026-02-28T00:00:00.000Z",
    status: "EXPIRED",
    created_by_principal_id: ADMIN,
    correlation_id: "seed-correlation-0004",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-28T00:00:00.000Z",
    revoked_by_principal_id: null,
    revoked_at: null,
    expired_at: "2026-02-28T00:00:00.000Z",
  },
];

// The demo bundle's grants, mirrored from the e2e identity mock: the admin
// principal holds the full DELEGATION_* set on the demo entity — BUT NOT
// DELEGATION_ADMINISTER. Seeding that would restore the very escalation this
// service was fixed to refuse; an administrator who can arrange delegations
// between OTHER people and never be their beneficiary is exactly the closed
// escalation TESTING.md §19 exists to demonstrate.
const ADMIN_ACTIONS = new Set([
  "DELEGATION_CREATE",
  "DELEGATION_VIEW",
  "DELEGATION_REVOKE",
  "PAYMENT_APPROVE",
  "PO_ISSUE",
  "PO_APPROVE",
  "CONTRACT_SIGN",
  "RESOLUTION_PASS",
  "OBLIGATION_STATUS_UPDATE",
  "INVOICE_APPROVE",
]);

function seed() {
  return {
    delegations: seedDelegations(),
    // Every request this mock received, for header assertions. The middleware
    // already enforces PRESENCE; only reading the sent VALUES catches a header
    // carrying the right shape and the wrong content.
    requests: [],
  };
}

let db = seed();

// ─── §4 canonical input contract ──────────────────────────────────────────────

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isProbe(path) {
  return path === "/healthz" || path === "/readyz" || path === "/health";
}

// A request that clears enforcement. `none` means admitted; otherwise an
// object describing the refusal and the dialect to answer in.
function enforcement(req, path) {
  if (isProbe(path)) return null;

  const h = req.headers;
  const tenant = h["x-tenant-id"];

  // The envelope middleware only refuses material state changes, so a read
  // gates in the hander: requireTenant, then requirePrincipal — both 401 with
  // the handler's error_code/error_message body.
  if (!WRITE_METHODS.has(req.method)) {
    if (!tenant) {
      return { status: 401, code: "tenant_missing", message: "tenant context missing" };
    }
    if (!h["x-principal-id"]) {
      return { status: 401, code: "identity_missing", message: "caller identity missing" };
    }
    return null;
  }

  const violations = [];
  if (!tenant) {
    violations.push({
      field: "tenant_id",
      header: "X-Tenant-Id",
      reason: "mandatory: tenant authority and isolation boundary",
    });
  }
  if (!h["x-principal-id"] && !h["x-workload-id"]) {
    violations.push({
      field: "actor_subject_id",
      header: "X-Principal-Id",
      reason:
        "mandatory: supply X-Principal-Id for a human subject or X-Workload-Id for a workload",
    });
  }
  if (!h["x-request-id"]) {
    violations.push({ field: "request_id", header: "X-Request-Id", reason: "mandatory: request tracing" });
  }
  if (!h["x-correlation-id"]) {
    violations.push({
      field: "correlation_id",
      header: "X-Correlation-ID",
      reason: "mandatory: end-to-end business trace",
    });
  }
  if (!h["x-source-channel"]) {
    violations.push({
      field: "source_channel",
      header: "X-Source-Channel",
      reason: "mandatory: one of web, api, batch, portal, integrated, mobile",
    });
  }
  if (violations.length > 0) {
    // 401 when a tenant or actor is missing — those two mean the request never
    // passed gateway verification — 400 for everything else.
    return {
      status: violations.some((v) => v.field === "tenant_id" || v.field === "actor_subject_id") ? 401 : 400,
      refusals: violations,
    };
  }

  // RequiredOnWrite for this service (internal/envelope/contract.go):
  // idempotency_key is INV-08 replay protection, legal_entity_id is INV-02
  // entity scoping. Both are 400, not 401.
  const conditional = [];
  if (!h["idempotency-key"]) {
    conditional.push({
      field: "idempotency_key",
      header: "Idempotency-Key",
      reason: "mandatory for material state changes: duplicate/replay protection (INV-08)",
    });
  }
  if (!h["x-legal-entity-id"]) {
    conditional.push({
      field: "legal_entity_id",
      header: "X-Legal-Entity-Id",
      reason: "mandatory for entity-specific records (INV-02)",
    });
  }
  if (conditional.length > 0) {
    return { status: 400, refusals: conditional };
  }
  return null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function send(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isUuid(value) {
  return UUID_RE.test(value);
}

// Lazy expiry, observed on read: an ACTIVE grant past its window flips to
// EXPIRED the moment the register is looked at, exactly like the service's
// sweepExpired. The console's only roll is rendering whatever the row says now.
function sweep(row) {
  if (row.status === "ACTIVE" && new Date(row.effective_to).getTime() < Date.now()) {
    row.status = "EXPIRED";
    row.expired_at = row.effective_to;
    row.updated_at = new Date().toISOString();
  }
  return row;
}

function holds(principalId, legalEntityId, action) {
  return principalId === ADMIN && legalEntityId === LEGAL_ENTITY && ADMIN_ACTIONS.has(action);
}

function paginate(rows, limit, offset) {
  return rows.slice(offset, offset + limit);
}

function findByTenant(id) {
  return db.delegations.find((d) => d.delegation_id === id && d.tenant_id === TENANT);
}

/**
 * Handler-level refusal: error_code/error_message, the shape the Go handler's
 * writeError emits. Distinct from the envellope middleware's error/detail on
 * purpose and kept apart because the console folds both dialects.
 */
function refuse(res, status, code, message) {
  return send(res, status, { error_code: code, error_message: message });
}

// ─── server ───────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const q = url.searchParams;
  const method = req.method;

  if (method === "GET" && (path === "/healthz" || path === "/readyz")) {
    return send(res, 200, { status: "ok" });
  }

  // Test-only. Restores the pristine seed so each spec starts identically
  // regardless of run order.
  if (method === "POST" && path === "/_e2e/reset") {
    db = seed();
    return send(res, 200, { reset: true });
  }

  // Test-only. The request journal, for asserting what the console SENT rather
  // than only what it rendered.
  if (method === "GET" && path === "/_e2e/requests") {
    return send(res, 200, db.requests);
  }

  let body;
  if (method !== "GET" && method !== "HEAD") {
    body = await readJson(req);
  }

  db.requests.push({
    method,
    path,
    query: Object.fromEntries(q),
    headers: { ...req.headers },
    // Reads the body before the route does, so the journal can say what a write
    // actually submitted — the correlation_id a POST carried is otherwise
    // unobservable, and the replay test depends on seeing it across two submits.
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });

  const rule = enforcement(req, path);
  if (rule) {
    if (rule.refusals) {
      // Envelope middleware dialect.
      return send(res, rule.status, {
        error: "envelope_incomplete",
        detail: "canonical input contract violated: " + rule.refusals.map((v) => v.field).join(", "),
        service: "delegated-authority-svc",
        violations: rule.refusals,
      });
    }
    return refuse(res, rule.status, rule.code, rule.message);
  }

  const tenant = req.headers["x-tenant-id"];
  // Present on reads by the read gates above; present on writes by the
  // envelope's actor_subject_id requirement.
  const principal = req.headers["x-principal-id"] || req.headers["x-workload-id"];

  // ── POST /v1/delegations/ ───────────────────────────────────────────────────
  if (method === "POST" && path === "/v1/delegations/") {
    body = body ?? {};
    for (const field of [
      "legal_entity_id",
      "delegator_principal_id",
      "delegate_principal_id",
      "action_type",
      "correlation_id",
    ]) {
      if (!body[field]) {
        return refuse(
          res,
          400,
          "missing_fields",
          "legal_entity_id, delegator_principal_id, delegate_principal_id, action_type, correlation_id are required",
        );
      }
    }
    if (body.delegator_principal_id === body.delegate_principal_id) {
      return refuse(res, 400, "delegate_is_delegator", "delegate_principal_id must differ from delegator_principal_id");
    }
    if (!(new Date(body.effective_to).getTime() > new Date(body.effective_from).getTime())) {
      return refuse(res, 400, "invalid_time_window", "effective_to must be after effective_from");
    }

    // Caller must hold DELEGATION_CREATE on the entity (or, when administering
    // for someone else, DELEGATION_ADMINISTER) — both read from the header
    // principal, never from the body.
    if (!holds(principal, body.legal_entity_id, "DELEGATION_CREATE")) {
      return refuse(res, 403, "forbidden", "authorization denied for this delegation action");
    }

    if (body.delegator_principal_id !== principal) {
      // Routing another principal's authority to yourself is the same escalation
      // by a longer route — refused even for an administrator, and ANSWERED as
      // self_dealing before delegator_mismatch: a caller who tried both asked
      // only the worse question.
      if (body.delegate_principal_id === principal) {
        return refuse(
          res,
          403,
          "self_dealing",
          "a delegation administered for another principal may not name the caller as delegate",
        );
      }
      if (!holds(principal, body.legal_entity_id, "DELEGATION_ADMINISTER")) {
        return refuse(res, 403, "delegator_mismatch", "caller may only delegate their own authority");
      }
    }

    // The core invariant: the delegator must actually hold what they are trying
    // to delegate. Checked against the NAMED delegator — with a mismatched
    // delegator, control never reaches here (the administer check already
    // refused), which matches the handler's ordering.
    if (!holds(body.delegator_principal_id, body.legal_entity_id, body.action_type)) {
      return refuse(res, 403, "delegator_lacks_authority", "delegator does not hold the authority being delegated");
    }

    // Idempotent on (tenant_id, correlation_id). A replay is answered 200 with
    // the ORIGINAL grant — the console's neutral "nothing was written" banner
    // depends on the body coming back intact, not on the status alone.
    const prior = db.delegations.find(
      (d) => d.tenant_id === tenant && d.correlation_id === body.correlation_id,
    );
    if (prior) {
      return send(res, 200, prior);
    }

    const now = new Date().toISOString();
    const grant = {
      delegation_id: randomUUID(),
      tenant_id: tenant,
      legal_entity_id: body.legal_entity_id,
      delegator_principal_id: body.delegator_principal_id,
      delegate_principal_id: body.delegate_principal_id,
      action_type: body.action_type,
      effective_from: body.effective_from,
      effective_to: body.effective_to,
      status: "ACTIVE",
      created_by_principal_id: principal,
      correlation_id: body.correlation_id,
      created_at: now,
      updated_at: now,
      revoked_by_principal_id: null,
      revoked_at: null,
      expired_at: null,
    };
    db.delegations.push(grant);
    return send(res, 201, grant);
  }

  // ── GET /v1/delegations/ ────────────────────────────────────────────────────
  if (method === "GET" && path === "/v1/delegations/") {
    switch (q.get("status") ?? "") {
      case "":
      case "ACTIVE":
      case "REVOKED":
      case "EXPIRED":
        break;
      default:
        // A misspelled filter must not read as an empty register.
        return refuse(res, 400, "unknown_status", "status must be one of ACTIVE, REVOKED, EXPIRED");
    }

    let limit = 50;
    let offset = 0;
    const rawLimit = q.get("limit");
    if (rawLimit !== null) {
      const n = Number(rawLimit);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return refuse(res, 400, "invalid_paging", "limit must be between 1 and 500 and offset must not be negative");
      }
      limit = n;
    }
    const rawOffset = q.get("offset");
    if (rawOffset !== null) {
      const n = Number(rawOffset);
      if (!Number.isInteger(n) || n < 0) {
        return refuse(res, 400, "invalid_paging", "limit must be between 1 and 500 and offset must not be negative");
      }
      offset = n;
    }

    const legalEntityId = q.get("legal_entity_id");
    if (legalEntityId) {
      // Entity-wide read: requires DELEGATION_VIEW on the entity.
      if (!holds(principal, legalEntityId, "DELEGATION_VIEW")) {
        return refuse(res, 403, "forbidden", "authorization denied for this delegation action");
      }
    } else {
      // No entity scope: the caller may only see what they are party to.
      // Asking after another principal's delegations is refused, not widened.
      const delegator = q.get("delegator_principal_id");
      const delegate = q.get("delegate_principal_id");
      if ((delegator && delegator !== principal) || (delegate && delegate !== principal)) {
        return refuse(
          res,
          403,
          "forbidden",
          "reading another principal's delegations requires legal_entity_id and DELEGATION_VIEW on it",
        );
      }
    }

    let rows = db.delegations.map(sweep);
    if (legalEntityId) {
      rows = rows.filter((d) => d.legal_entity_id === legalEntityId);
    } else {
      rows = rows.filter((d) => d.delegator_principal_id === principal || d.delegate_principal_id === principal);
    }
    const delegator = q.get("delegator_principal_id");
    if (delegator) rows = rows.filter((d) => d.delegator_principal_id === delegator);
    const delegate = q.get("delegate_principal_id");
    if (delegate) rows = rows.filter((d) => d.delegate_principal_id === delegate);
    const status = q.get("status");
    if (status) rows = rows.filter((d) => d.status === status);

    return send(res, 200, paginate(rows, limit, offset));
  }

  // ── /v1/delegations/{id} and /revoke ───────────────────────────────────────
  const delegationScoped = path.match(/^\/v1\/delegations\/([^/]+)(\/revoke)?$/);
  if (delegationScoped) {
    const [, delegationId, revoke] = delegationScoped;
    if (!isUuid(delegationId)) {
      // The store maps a malformed id to the same not-found it gives a
      // well-formed foreign id: nothing to be learned from which cast failed.
      return refuse(res, 404, "not_found", "delegation not found");
    }

    if (revoke && method === "POST") {
      const row = findByTenant(delegationId);
      if (!row) return refuse(res, 404, "not_found", "delegation not found");
      sweep(row);
      if (row.status !== "ACTIVE") {
        return refuse(res, 409, "invalid_transition", "invalid delegation status transition");
      }
      if (!holds(principal, row.legal_entity_id, "DELEGATION_REVOKE")) {
        return refuse(res, 403, "forbidden", "authorization denied for this delegation action");
      }
      row.status = "REVOKED";
      row.revoked_at = new Date().toISOString();
      row.revoked_by_principal_id = principal;
      row.updated_at = row.revoked_at;
      return send(res, 200, row);
    }

    if (!revoke && method === "GET") {
      const row = findByTenant(delegationId);
      if (!row) return refuse(res, 404, "not_found", "delegation not found");
      sweep(row);
      if (!holds(principal, row.legal_entity_id, "DELEGATION_VIEW")) {
        return refuse(res, 403, "forbidden", "authorization denied for this delegation action");
      }
      return send(res, 200, row);
    }
  }

  send(res, 404, { error: "not_found", path });
});

server.listen(PORT, () => {
  console.log(`[mock delegated-authority-svc] listening on :${PORT}`);
});

export { SEEDED_PO_ISSUE_ID, LEGAL_ENTITY, COLLEAGUE };