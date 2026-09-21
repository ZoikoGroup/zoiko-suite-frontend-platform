// Hermetic stand-in for secret-vault-integration-svc (:8087 in the real stack),
// used by the Playwright E2E suite. Implements every route the Go service
// registers, so the whole Secret Vault console can be exercised without
// Postgres, Kafka, authorization-svc, a vault backend or the gateway:
//
//   POST   /v1/secret-policies
//   GET    /v1/secret-policies?secret_class=&tenant_id=&legal_entity_id=
//   POST   /v1/secret-policies/{id}/versions
//   GET    /v1/secret-policies/{id}/versions
//   POST   /v1/secret-policies/{id}/versions/{version_id}/activate
//   POST   /v1/secret-policies/{id}/material
//   POST   /v1/secret-policies/{id}/rotate
//   POST   /v1/secrets/broker
//   GET    /v1/secrets/leases
//   GET    /v1/secrets/leases/{lease_id}
//   POST   /v1/secrets/leases/{lease_id}/revoke
//   GET    /v1/secrets/audit
//   GET    /healthz, /readyz
//
// WHAT THIS MOCK IS FOR, AND WHAT IT IS NOT FOR
//
// It is not a second implementation of the service's business rules, and a spec
// that asserts a rule only this file enforces has proved nothing. It exists to
// answer questions the Go test suite structurally cannot: does the CONSOLE send
// the canonical §4 headers, does it read the fields it renders out of the real
// response shape, and does it tell the reader the right thing for each of the
// broker's three outcomes.
//
// So the parts modelled faithfully are the ones the console can get wrong:
//
//   * §4 header enforcement, matched against the RUNNING service rather than
//     inferred — see envelopeViolation below for the read/write asymmetry and
//     why an over-strict mock is worse than none. This is the whole reason the
//     mock checks headers at all: the console shipped for weeks sending none of
//     them — the principal went in the body while the service reads
//     X-Principal-Id — so every write answered 401 and nothing caught it.
//   * The three broker outcomes as three distinct statuses, because the console
//     renders a different explanation for each and collapsing them is the exact
//     failure the deny-by-absence posture creates.
//   * Response field names, which is what the panels destructure.
//
// Deliberately NOT modelled: RLS, scope precedence, the real crypto, effective
// dating, and the computed EXPIRED read. Those are the service's own
// correctness and are proved against real Postgres in its store suite.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 18087);

const TENANT_A = "11111111-1111-1111-1111-111111111111";

// ─── Seed ─────────────────────────────────────────────────────────────────────
//
// One fully provisioned path, so the console has something to render on first
// load, and one path deliberately left at step 3 (version created, never
// activated). The second is not filler: "created but never activated" is the
// single most common real misconfiguration, it answers 404 from the broker, and
// a console that cannot distinguish it from "no such path" sends its reader to
// the wrong fix.

const SEEDED_PATH = "integrations/stripe/webhook-signing-key";
const DRAFT_ONLY_PATH = "integrations/acme/never-activated";
const ALLOWED_WORKLOAD = "77777777-7777-7777-7777-777777777777";
const DENIED_WORKLOAD = "99999999-9999-9999-9999-999999999999";

function seed() {
  const policies = [
    {
      secret_policy_id: "aaaa0000-0000-4000-8000-000000000001",
      secret_class: "INTEGRATION_TOKEN",
      secret_path: SEEDED_PATH,
      created_at: "2026-01-01T00:00:00.000Z",
      created_by_principal_id: "33333333-3333-3333-3333-333333333333",
      data_classification: "restricted",
    },
    {
      secret_policy_id: "aaaa0000-0000-4000-8000-000000000002",
      secret_class: "DATABASE_CREDENTIAL",
      secret_path: DRAFT_ONLY_PATH,
      created_at: "2026-01-01T00:00:00.000Z",
      created_by_principal_id: "33333333-3333-3333-3333-333333333333",
      data_classification: "restricted",
    },
  ];

  const versions = [
    {
      secret_policy_version_id: "bbbb0000-0000-4000-8000-000000000001",
      secret_policy_id: "aaaa0000-0000-4000-8000-000000000001",
      tenant_id: TENANT_A,
      legal_entity_id: null,
      allowed_workload_ids: [ALLOWED_WORKLOAD],
      max_lease_duration_seconds: 300,
      effective_from: "2026-01-01T00:00:00.000Z",
      effective_to: null,
      version_status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    },
    {
      secret_policy_version_id: "bbbb0000-0000-4000-8000-000000000002",
      secret_policy_id: "aaaa0000-0000-4000-8000-000000000002",
      tenant_id: TENANT_A,
      legal_entity_id: null,
      allowed_workload_ids: [ALLOWED_WORKLOAD],
      max_lease_duration_seconds: 300,
      effective_from: "2026-01-01T00:00:00.000Z",
      effective_to: null,
      version_status: "DRAFT",
      created_at: "2026-01-01T00:00:00.000Z",
      created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    },
  ];

  // Only the activated path has material. The DRAFT path would fail at policy
  // resolution first, so its absence here is never reached.
  const material = new Set([SEEDED_PATH]);

  return {
    policies,
    versions,
    material,
    leases: [],
    audit: [],
    rotations: new Map(),
    // Every request this mock received, for header assertions. The presence of
    // a §4 header is already enforced below, but its VALUE is not — a
    // purpose_context of the wrong string passes every presence check while
    // recording the wrong reason in the audit log, and only reading the sent
    // value catches that.
    requests: [],
  };
}

let db = seed();

// ─── §4 canonical input contract ──────────────────────────────────────────────

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Mirrors what secret-vault-integration-svc actually enforces, verified against
 * the running service rather than inferred from its policy declaration.
 *
 * The two halves are deliberately asymmetric, and getting that wrong in either
 * direction makes the suite lie:
 *
 *   READS   need only X-Tenant-Id. The envelope middleware applies to material
 *           writes (non-GET/HEAD), so a GET reaches the handler untouched and
 *           the handler's own requireTenant is the whole check. An earlier
 *           version of this mock demanded a principal on reads too and reported
 *           every read panel as 401 missing_principal — a defect in the mock
 *           that read exactly like a defect in the console.
 *   WRITES  need X-Tenant-Id, an actor (X-Principal-Id for a human subject or
 *           X-Workload-Id for a workload) and X-Request-Id, all three as 401
 *           envelope_incomplete with a violations array; then X-Purpose-Context
 *           and Idempotency-Key as 400.
 *
 * 401 for the identity fields, 400 for the rest: a missing tenant or actor means
 * the request never passed gateway verification, and telling the caller to fix
 * its payload would send it looking in the wrong place.
 */
function envelopeViolation(req, path) {
  if (path === "/healthz" || path === "/readyz" || path === "/metrics") return null;

  const h = req.headers;
  const tenant = h["x-tenant-id"];

  if (!WRITE_METHODS.has(req.method)) {
    if (!tenant) {
      return {
        status: 401,
        body: {
          error: "tenant_scope_missing",
          message:
            "X-Tenant-Id is required — the gateway sets it from a verified identity envelope",
        },
      };
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
    violations.push({
      field: "request_id",
      header: "X-Request-Id",
      reason: "mandatory: request tracing",
    });
  }
  if (violations.length > 0) {
    return {
      status: 401,
      body: {
        error: "envelope_incomplete",
        detail:
          "canonical input contract violated: " + violations.map((v) => v.field).join(", "),
        service: "secret-vault-integration-svc",
        violations,
      },
    };
  }

  // purpose_context is this service's conditional §4 field: every write here is
  // governed sensitive access, so the reason is captured before material moves.
  if (!h["x-purpose-context"]) {
    return { status: 400, body: { error: "envelope_incomplete", field: "purpose_context" } };
  }
  if (!h["idempotency-key"]) {
    return { status: 400, body: { error: "envelope_incomplete", field: "idempotency_key" } };
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

/** The service answers 400 (naming the parameter), not 503, on a non-UUID id. */
function badUuid(res, field, value) {
  if (UUID_RE.test(value)) return false;
  send(res, 400, { error: "invalid_path_parameter", field });
  return true;
}

function recordAudit(entry) {
  db.audit.unshift({
    audit_log_id: randomUUID(),
    secret_class: "",
    tenant_id: null,
    legal_entity_id: null,
    lease_id: null,
    secret_policy_version_id: null,
    request_id: null,
    outcome_detail: "",
    correlation_id: "",
    recorded_at: new Date().toISOString(),
    // Subject and actor default to the same principal; callers override the
    // actor on REVOKED, which is the one event where they differ.
    acted_by_principal_id: entry.requested_by_principal_id ?? null,
    ...entry,
  });
}

function activeVersionForPath(secretPath, tenantId) {
  const policy = db.policies.find((p) => p.secret_path === secretPath);
  if (!policy) return null;
  const version = db.versions.find(
    (v) =>
      v.secret_policy_id === policy.secret_policy_id &&
      v.version_status === "ACTIVE" &&
      (v.tenant_id === null || v.tenant_id === tenantId),
  );
  if (!version) return null;
  return { policy, version };
}

function paginate(rows, query) {
  const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 200);
  const offset = Number(query.get("offset") ?? 0) || 0;
  return rows.slice(offset, offset + limit);
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

  db.requests.push({ method, path, query: Object.fromEntries(q), headers: { ...req.headers } });

  const violation = envelopeViolation(req, path);
  if (violation) return send(res, violation.status, violation.body);

  const tenant = req.headers["x-tenant-id"];
  const principal = req.headers["x-principal-id"] || req.headers["x-workload-id"];

  // ── POST /v1/secret-policies ────────────────────────────────────────────────
  if (method === "POST" && path === "/v1/secret-policies") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "invalid_json" });
    for (const field of ["secret_class", "secret_path", "created_by_principal_id"]) {
      if (!body[field]) return send(res, 400, { error: "missing_field", field });
    }
    const existing = db.policies.find((p) => p.secret_path === body.secret_path);
    if (existing) {
      // Idempotent on secret_path — but the same path under a different class
      // is a genuine conflict, not a replay.
      if (existing.secret_class !== body.secret_class) {
        return send(res, 409, {
          error: "secret_policy_conflict",
          secret_path: body.secret_path,
        });
      }
      return send(res, 200, existing);
    }
    const policy = {
      secret_policy_id: randomUUID(),
      secret_class: body.secret_class,
      secret_path: body.secret_path,
      created_at: new Date().toISOString(),
      created_by_principal_id: body.created_by_principal_id,
      data_classification: body.data_classification ?? "restricted",
    };
    db.policies.push(policy);
    return send(res, 201, policy);
  }

  // ── GET /v1/secret-policies ─────────────────────────────────────────────────
  if (method === "GET" && path === "/v1/secret-policies") {
    const secretClass = q.get("secret_class");
    if (!secretClass) return send(res, 400, { error: "missing_field", field: "secret_class" });
    const scopeTenant = q.get("tenant_id");
    const rows = db.versions
      .filter((v) => v.version_status === "ACTIVE")
      .map((v) => {
        const policy = db.policies.find((p) => p.secret_policy_id === v.secret_policy_id);
        return policy ? { ...v, secret_class: policy.secret_class, secret_path: policy.secret_path } : null;
      })
      .filter((v) => v && v.secret_class === secretClass)
      .filter((v) => (scopeTenant ? v.tenant_id === scopeTenant || v.tenant_id === null : true));
    return send(res, 200, rows);
  }

  // ── /v1/secret-policies/{id}/... ────────────────────────────────────────────
  const policyScoped = path.match(/^\/v1\/secret-policies\/([^/]+)\/(versions|material|rotate)(\/.*)?$/);
  if (policyScoped) {
    const [, policyId, leaf, rest] = policyScoped;
    if (badUuid(res, "secret_policy_id", policyId)) return;
    const policy = db.policies.find((p) => p.secret_policy_id === policyId);

    if (leaf === "versions" && !rest) {
      if (method === "GET") {
        if (!policy) return send(res, 200, []);
        return send(
          res,
          200,
          db.versions.filter((v) => v.secret_policy_id === policyId),
        );
      }
      if (method === "POST") {
        if (!policy) return send(res, 404, { error: "secret_policy_not_found" });
        const body = await readJson(req);
        if (!body) return send(res, 400, { error: "invalid_json" });
        if (!body.effective_from) {
          return send(res, 400, { error: "missing_field", field: "effective_from" });
        }
        const version = {
          secret_policy_version_id: randomUUID(),
          secret_policy_id: policyId,
          tenant_id: body.tenant_id ?? null,
          legal_entity_id: body.legal_entity_id ?? null,
          allowed_workload_ids: body.allowed_workload_ids ?? [],
          max_lease_duration_seconds: body.max_lease_duration_seconds ?? 300,
          effective_from: body.effective_from,
          effective_to: body.effective_to ?? null,
          // Always DRAFT. Activation is a separate, separately-authorized act.
          version_status: "DRAFT",
          created_at: new Date().toISOString(),
          created_by_principal_id: body.created_by_principal_id ?? principal,
        };
        db.versions.push(version);
        return send(res, 201, version);
      }
    }

    const activate = rest && rest.match(/^\/([^/]+)\/activate$/);
    if (leaf === "versions" && activate && method === "POST") {
      const versionId = activate[1];
      if (badUuid(res, "version_id", versionId)) return;
      const version = db.versions.find(
        (v) => v.secret_policy_version_id === versionId && v.secret_policy_id === policyId,
      );
      if (!version) return send(res, 404, { error: "secret_policy_version_not_found" });
      if (version.version_status === "ACTIVE") {
        // A repeat is a no-op and must SAY so: without this flag a real
        // transition and a replay are byte-identical 200s.
        return send(res, 200, { ...version, transitioned: false });
      }
      if (version.version_status !== "DRAFT") {
        return send(res, 409, { error: "invalid_transition" });
      }
      for (const other of db.versions) {
        if (
          other.secret_policy_id === policyId &&
          other.version_status === "ACTIVE" &&
          other.tenant_id === version.tenant_id
        ) {
          // Superseded, never deleted.
          other.version_status = "SUPERSEDED";
        }
      }
      version.version_status = "ACTIVE";
      return send(res, 200, { ...version, transitioned: true });
    }

    if (leaf === "material" && method === "POST") {
      if (!policy) return send(res, 404, { error: "secret_policy_not_found" });
      const body = await readJson(req);
      if (!body) return send(res, 400, { error: "invalid_json" });
      if (!body.material_base64) {
        return send(res, 400, { error: "missing_field", field: "material_base64" });
      }
      db.material.add(policy.secret_path);
      // The response never echoes the material back.
      return send(res, 200, { secret_path: policy.secret_path, written: true });
    }

    if (leaf === "rotate" && method === "POST") {
      if (!policy) return send(res, 404, { error: "secret_policy_not_found" });
      const body = await readJson(req);
      if (!body) return send(res, 400, { error: "invalid_json" });
      for (const field of ["request_id", "rotated_by_principal_id"]) {
        if (!body[field]) return send(res, 400, { error: "missing_field", field });
      }
      // Idempotent on request_id, and a replay reports the ORIGINAL count: 0
      // would read as "this rotation revoked nothing", the opposite of what
      // happened.
      const prior = db.rotations.get(body.request_id);
      if (prior) return send(res, 200, prior);

      const live = db.leases.filter(
        (l) => l.secret_path === policy.secret_path && l.status === "GRANTED",
      );
      for (const lease of live) {
        lease.status = "REVOKED";
        lease.revoked_at = new Date().toISOString();
        recordAudit({
          event_type: "REVOKED",
          secret_class: lease.secret_class,
          secret_path: lease.secret_path,
          requested_by_principal_id: lease.requested_by_principal_id,
          acted_by_principal_id: body.rotated_by_principal_id,
          tenant_id: lease.tenant_id,
          lease_id: lease.lease_id,
          outcome_detail: "revoked as a side effect of secret rotation",
        });
      }
      const result = {
        secret_policy_id: policyId,
        secret_path: policy.secret_path,
        revoked_lease_count: live.length,
        rotated_at: new Date().toISOString(),
      };
      db.rotations.set(body.request_id, result);
      recordAudit({
        event_type: "ROTATED",
        secret_class: policy.secret_class,
        secret_path: policy.secret_path,
        requested_by_principal_id: body.rotated_by_principal_id,
        acted_by_principal_id: body.rotated_by_principal_id,
        tenant_id: tenant,
        request_id: body.request_id,
        outcome_detail: `rotated; ${live.length} lease(s) revoked`,
      });
      return send(res, 200, result);
    }
  }

  // ── POST /v1/secrets/broker ─────────────────────────────────────────────────
  if (method === "POST" && path === "/v1/secrets/broker") {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: "invalid_json" });
    for (const field of ["secret_path", "requested_by_principal_id", "request_id"]) {
      if (!body[field]) return send(res, 400, { error: "missing_field", field });
    }

    // REQUESTED is written before the outcome is known, so it exists for
    // denials too.
    recordAudit({
      event_type: "REQUESTED",
      secret_path: body.secret_path,
      requested_by_principal_id: body.requested_by_principal_id,
      tenant_id: body.tenant_id ?? tenant,
    });

    const resolved = activeVersionForPath(body.secret_path, body.tenant_id ?? tenant);
    if (!resolved) {
      // Deny by absence. secret_class is genuinely unknown — no policy was
      // resolved to read it from.
      recordAudit({
        event_type: "DENIED",
        secret_path: body.secret_path,
        requested_by_principal_id: body.requested_by_principal_id,
        tenant_id: body.tenant_id ?? tenant,
        outcome_detail: "no applicable secret policy for this path/scope",
      });
      return send(res, 404, {
        error: "no_applicable_secret_policy",
        secret_path: body.secret_path,
      });
    }

    const { policy, version } = resolved;
    if (!version.allowed_workload_ids.includes(body.requested_by_principal_id)) {
      recordAudit({
        event_type: "DENIED",
        // Known here, unlike the 404 path: a policy WAS resolved.
        secret_class: policy.secret_class,
        secret_path: body.secret_path,
        requested_by_principal_id: body.requested_by_principal_id,
        tenant_id: body.tenant_id ?? tenant,
        secret_policy_version_id: version.secret_policy_version_id,
        outcome_detail: "requesting principal not in allowed_workload_ids",
      });
      return send(res, 403, { error: "access_denied", secret_path: body.secret_path });
    }

    if (!db.material.has(policy.secret_path)) {
      // Policy allowed it and the backend cannot serve it: step 4 was skipped.
      // No lease row is written.
      return send(res, 503, { error: "vault_backend_unavailable" });
    }

    // Idempotent on request_id: the durable lease is reused, the token
    // re-minted. A token is a bearer credential with its own lifetime, so
    // returning a cached one would hand back something closer to expiry than
    // the caller expects.
    const existing = db.leases.find((l) => l.request_id === body.request_id);
    if (existing) {
      return send(res, 200, {
        lease_id: existing.lease_id,
        secret_path: existing.secret_path,
        lease_token: `local-lease:${randomUUID()}`,
        expires_at: existing.expires_at,
      });
    }

    const lease = {
      lease_id: randomUUID(),
      request_id: body.request_id,
      secret_policy_version_id: version.secret_policy_version_id,
      secret_class: policy.secret_class,
      secret_path: policy.secret_path,
      requested_by_principal_id: body.requested_by_principal_id,
      tenant_id: body.tenant_id ?? tenant,
      legal_entity_id: body.legal_entity_id ?? null,
      status: "GRANTED",
      granted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + version.max_lease_duration_seconds * 1000).toISOString(),
      revoked_at: null,
      correlation_id: req.headers["x-correlation-id"] ?? "",
      created_at: new Date().toISOString(),
    };
    db.leases.unshift(lease);
    recordAudit({
      event_type: "GRANTED",
      secret_class: lease.secret_class,
      secret_path: lease.secret_path,
      requested_by_principal_id: lease.requested_by_principal_id,
      tenant_id: lease.tenant_id,
      lease_id: lease.lease_id,
      secret_policy_version_id: version.secret_policy_version_id,
    });
    return send(res, 200, {
      lease_id: lease.lease_id,
      secret_path: lease.secret_path,
      lease_token: `local-lease:${randomUUID()}`,
      expires_at: lease.expires_at,
    });
  }

  // ── GET /v1/secrets/leases ──────────────────────────────────────────────────
  if (method === "GET" && path === "/v1/secrets/leases") {
    let rows = db.leases.filter((l) => l.tenant_id === tenant || l.tenant_id === null);
    const principalFilter = q.get("principal");
    if (principalFilter) rows = rows.filter((l) => l.requested_by_principal_id === principalFilter);
    const classFilter = q.get("secret_class");
    if (classFilter) rows = rows.filter((l) => l.secret_class === classFilter);
    return send(res, 200, paginate(rows, q));
  }

  // ── /v1/secrets/leases/{id} and /revoke ─────────────────────────────────────
  const leaseScoped = path.match(/^\/v1\/secrets\/leases\/([^/]+)(\/revoke)?$/);
  if (leaseScoped) {
    const [, leaseId, revoke] = leaseScoped;
    if (badUuid(res, "lease_id", leaseId)) return;
    const lease = db.leases.find((l) => l.lease_id === leaseId);
    // A foreign tenant's lease is indistinguishable from one that never
    // existed. A 403 here would confirm the row exists, which is enough to
    // enumerate another tenant's leases one guess at a time.
    const visible = lease && (lease.tenant_id === tenant || lease.tenant_id === null);

    if (!revoke && method === "GET") {
      if (!visible) return send(res, 404, { error: "lease_not_found", lease_id: leaseId });
      return send(res, 200, lease);
    }

    if (revoke && method === "POST") {
      if (!visible) return send(res, 404, { error: "lease_not_found", lease_id: leaseId });
      if (lease.status === "REVOKED") {
        return send(res, 200, { ...lease, transitioned: false });
      }
      if (lease.status !== "GRANTED") {
        return send(res, 409, { error: "invalid_transition", lease_id: leaseId });
      }
      lease.status = "REVOKED";
      lease.revoked_at = new Date().toISOString();
      recordAudit({
        event_type: "REVOKED",
        secret_class: lease.secret_class,
        secret_path: lease.secret_path,
        // Subject is the holder; actor is the operator running this call. The
        // one event where the two genuinely differ.
        requested_by_principal_id: lease.requested_by_principal_id,
        acted_by_principal_id: principal,
        tenant_id: lease.tenant_id,
        lease_id: lease.lease_id,
      });
      return send(res, 200, { ...lease, transitioned: true });
    }
  }

  // ── GET /v1/secrets/audit ───────────────────────────────────────────────────
  if (method === "GET" && path === "/v1/secrets/audit") {
    let rows = db.audit.filter((e) => e.tenant_id === tenant || e.tenant_id === null);
    const principalFilter = q.get("principal");
    if (principalFilter) rows = rows.filter((e) => e.requested_by_principal_id === principalFilter);
    const pathFilter = q.get("secret_path");
    if (pathFilter) rows = rows.filter((e) => e.secret_path === pathFilter);
    const eventFilter = q.get("event_type");
    if (eventFilter) rows = rows.filter((e) => e.event_type === eventFilter);
    return send(res, 200, paginate(rows, q));
  }

  send(res, 404, { error: "not_found", path });
});

server.listen(PORT, () => {
  console.log(`[mock secret-vault-integration-svc] listening on :${PORT}`);
});

export { SEEDED_PATH, DRAFT_ONLY_PATH, ALLOWED_WORKLOAD, DENIED_WORKLOAD };
