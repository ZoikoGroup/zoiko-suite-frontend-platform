// Hermetic stand-in for access-control-svc (:8137 in the real stack), used by
// the Playwright E2E suite. Implements every route the Go service registers, so
// the definition half of /admin/access-control can be exercised without
// Postgres, Kafka, authorization-svc or the gateway:
//
//   GET    /v1/role-definitions/?status=&scope_type=&search=&limit=&offset=
//   GET    /v1/role-definitions/{role_definition_id}
//   POST   /v1/role-definitions/                           (idempotent)
//   PATCH  /v1/role-definitions/{role_definition_id}
//   GET    /v1/role-definitions/{id}/permission-bundles
//   POST   /v1/role-definitions/{id}/permission-bundles    (idempotent)
//   GET    /v1/role-definitions/{id}/permission-bundles/{bundle_id}
//   PATCH  /v1/role-definitions/{id}/permission-bundles/{bundle_id}
//   DELETE /v1/role-definitions/{id}/permission-bundles/{bundle_id}
//   GET    /v1/permission-bundles/?role_id=&active_flag=&search=&limit=&offset=
//   GET    /healthz, /readyz
//
// WHAT THIS MOCK IS FOR, AND WHAT IT IS NOT FOR
//
// It is not a second implementation of the service's rules. RLS, the
// transactional outbox, the propagation ordering into authorization-svc's admin
// API and the event payloads are the service's own correctness and are proved
// against real Postgres and a running stack by the Go suite and scripts/audit.sh.
// A spec that asserts a rule only this file enforces has proved nothing.
//
// It exists to answer what the Go tests structurally cannot: does the CONSOLE
// send the canonical §4 headers the envelope middleware demands on writes, does
// it read the fields it renders out of the real response shape, and does it tell
// the operator the right thing for each refusal this register can produce.
//
// So the parts modelled faithfully are the ones the console can get wrong, all
// matched to the running service's handler rather than inferred:
//
//   * Header enforcement. Reads gate in the handler (requireCaller then
//     requireTenant) answering 401 identity_missing / tenant_missing — and
//     requireCaller accepts X-Workload-Id as well as X-Principal-Id, because
//     identity-context-svc reads this catalogue as a workload. Writes are gated
//     by the envelope middleware ahead of any handler: tenant_id and
//     actor_subject_id as 401 envelope_incomplete, request_id, correlation_id,
//     source_channel, idempotency_key and legal_entity_id as 400, always with a
//     structured violations array.
//   * Error body shape. The handler answers business refusals with
//     {"error_code","error_message"} — NOT the envelope's error/detail. The
//     console's explainAccessControlError only fires if that message reaches
//     it. (lib/api/client.ts readErrorDetail folds both dialects.)
//   * 201 vs 200. A first create is 201; a replay of the same correlation_id is
//     200 with the ORIGINAL definition. The console renders those differently
//     and the real service answered 201 to both until this pass, so a mock that
//     also answered 201 to both would have hidden the defect rather than caught
//     it.
//   * 409 on a duplicate role_code or bundle_code, with the error codes
//     role_code_exists / bundle_code_exists. Both used to surface as 503
//     store_unavailable.
//   * 404, not 503, for a malformed id. role_definition_id is a UUID column, so
//     a non-UUID used to raise 22P02 and leave as store_unavailable with the raw
//     SQLSTATE in the body.
//
// Deliberately NOT modelled: the authorization decision (every caller here is
// permitted unless the fixture below says otherwise), the admin-API
// propagation, the outbox and the event pipeline.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 18137);

// Same identities the rest of the hermetic suite uses (see e2e/helpers.ts).
const TENANT = "11111111-1111-1111-1111-111111111111";
const LEGAL_ENTITY = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Seed ─────────────────────────────────────────────────────────────────────
//
// Three definitions so the catalogue reads sensibly on first load: one ACTIVE
// role with a bundle attached (the ordinary case), one ACTIVE role with NO
// bundle (a role that grants nothing — the state the console warns about), and
// one RETIRED role, which must still be listed. Nothing here is ever deleted;
// retiring and detaching keep their rows, matching the service.

const SEED_ROLE_WITH_BUNDLE = "ac000000-0000-4000-8000-000000000001";
const SEED_ROLE_NO_BUNDLE = "ac000000-0000-4000-8000-000000000002";
const SEED_ROLE_RETIRED = "ac000000-0000-4000-8000-000000000003";
const SEED_BUNDLE = "ac000000-0000-4000-8000-0000000000b1";

const seedRoles = () => [
  {
    role_definition_id: SEED_ROLE_WITH_BUNDLE,
    tenant_id: TENANT,
    role_code: "FINANCE_APPROVER",
    role_name: "Finance Approver",
    role_scope_type: "LEGAL_ENTITY",
    status: "ACTIVE",
    created_by_principal_id: ADMIN,
    correlation_id: "seed-correlation-0001",
    created_at: "2026-01-03T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
  },
  {
    role_definition_id: SEED_ROLE_NO_BUNDLE,
    tenant_id: TENANT,
    role_code: "READ_ONLY_AUDITOR",
    role_name: "Read Only Auditor",
    role_scope_type: "TENANT",
    status: "ACTIVE",
    created_by_principal_id: ADMIN,
    correlation_id: "seed-correlation-0002",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
  {
    role_definition_id: SEED_ROLE_RETIRED,
    tenant_id: TENANT,
    role_code: "LEGACY_POSTER",
    role_name: "Legacy Poster",
    role_scope_type: "LEGAL_ENTITY",
    status: "RETIRED",
    created_by_principal_id: ADMIN,
    updated_by_principal_id: ADMIN,
    correlation_id: "seed-correlation-0003",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
];

const seedBundles = () => [
  {
    bundle_id: SEED_BUNDLE,
    tenant_id: TENANT,
    role_definition_id: SEED_ROLE_WITH_BUNDLE,
    bundle_code: "AP_FULL",
    permitted_actions: ["AP_INVOICE_APPROVE", "AP_PAYMENT_REQUEST"],
    active_flag: true,
    correlation_id: "seed-correlation-0101",
    created_at: "2026-01-03T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
  },
];

let roles = seedRoles();
let bundles = seedBundles();

// An outcome a spec can arm for one write, so the console's handling of it is
// exercised without making it the mock's normal behaviour. Cleared after it
// fires. Two shapes:
//
//   {status, error_code, error_message}   -> that refusal, once
//   {status: 200, replay_role_code}       -> 200 with the role already holding
//                                            that code, which is exactly what
//                                            the service answers to a replayed
//                                            create
//
// The replay form exists because the browser cannot reach that path on its own.
// The page mints a fresh correlation id on every server render and the hidden
// input carrying it is React-controlled, so a value written into the DOM is
// reconciled away before the submission is serialised — a retry from the
// browser is always a NEW intent. The service's own idempotency is proved where
// it lives: in the Go suite and in scripts/audit.sh against a running stack.
// What is proved here is the half only the console can get wrong — that a 200
// on a create renders as "nothing was written again" and not as a second role.
let armedRefusal = null;

function reset() {
  roles = seedRoles();
  bundles = seedBundles();
  armedRefusal = null;
}

// ─── Envelope (ZS-ARCH-SVC-001 §4) ───────────────────────────────────────────

/**
 * Validate the canonical envelope the way the service's middleware does.
 *
 * Returns null when the request is in contract, or {status, body} to answer
 * with. The split between 401 and 400 is the middleware's, not an invention:
 * a request that cannot say WHO is acting for WHICH tenant is unauthenticated;
 * one that can but omits its traceability or replay fields is malformed.
 */
function checkEnvelope(headers, isWrite) {
  const violations = [];
  const has = (h) => typeof headers[h] === "string" && headers[h].trim().length > 0;

  if (!has("x-tenant-id")) violations.push({ field: "tenant_id", reason: "missing" });
  if (!has("x-principal-id") && !has("x-workload-id")) {
    violations.push({ field: "actor_subject_id", reason: "missing" });
  }
  const unauthenticated = violations.length > 0;

  if (!has("x-request-id")) violations.push({ field: "request_id", reason: "missing" });
  if (!has("x-correlation-id")) violations.push({ field: "correlation_id", reason: "missing" });
  if (!has("x-source-channel")) violations.push({ field: "source_channel", reason: "missing" });
  if (isWrite) {
    if (!has("idempotency-key")) violations.push({ field: "idempotency_key", reason: "missing" });
    if (!has("x-legal-entity-id")) violations.push({ field: "legal_entity_id", reason: "missing" });
  }

  if (violations.length === 0) return null;

  // Reads run in write-strict mode: the envelope is parsed and reported but the
  // request is admitted, exactly as ZS_ENVELOPE_ENFORCEMENT defaults. Only the
  // identity half gates a read, and it gates in the handler rather than here.
  if (!isWrite) {
    return unauthenticated
      ? {
          status: 401,
          body: {
            error_code: violations.some((v) => v.field === "tenant_id")
              ? "tenant_missing"
              : "identity_missing",
            error_message: violations.some((v) => v.field === "tenant_id")
              ? "caller tenant scope missing"
              : "caller identity missing",
          },
        }
      : null;
  }

  return {
    status: unauthenticated ? 401 : 400,
    body: {
      error: "envelope_incomplete",
      detail: `access-control-svc: ${violations.map((v) => v.field).join(", ")}`,
      service: "access-control-svc",
      violations,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const refuse = (res, status, code, message) =>
  json(res, status, { error_code: code, error_message: message });

function json(res, status, body) {
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

const scoped = (list, tenantID) => list.filter((r) => r.tenant_id === tenantID);

/** Newest first, matching the service's ORDER BY created_at DESC. */
const newestFirst = (list) =>
  [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

function page(list, query) {
  const limit = Number(query.get("limit") ?? 0);
  const offset = Number(query.get("offset") ?? 0);
  let out = list;
  if (offset > 0) out = out.slice(offset);
  if (limit > 0) out = out.slice(0, limit);
  return out;
}

// ─── Server ──────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";
  const isWrite = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (path === "/healthz") return json(res, 200, { status: "OK" });
  if (path === "/readyz") {
    return json(res, 200, {
      status: "READY",
      components: { database: "ok", "authorization-svc": "ok" },
    });
  }
  if (path === "/_e2e/reset" && method === "POST") {
    reset();
    return json(res, 200, { reset: true });
  }
  if (path === "/_e2e/arm" && method === "POST") {
    armedRefusal = await readBody(req);
    return json(res, 200, { armed: armedRefusal });
  }

  const envelopeFault = checkEnvelope(req.headers, isWrite);
  if (envelopeFault) return json(res, envelopeFault.status, envelopeFault.body);

  const tenantID = String(req.headers["x-tenant-id"] ?? "");
  const principalID = String(req.headers["x-principal-id"] ?? "");

  // One armed refusal, then back to normal. Armed refusals apply to writes
  // only — a spec arming one wants to see how the console renders a refused
  // write, not a broken page.
  if (isWrite && armedRefusal) {
    const armed = armedRefusal;
    armedRefusal = null;
    if (armed.status === 200 && armed.replay_role_code) {
      const existing = roles.find(
        (r) => r.tenant_id === tenantID && r.role_code === armed.replay_role_code,
      );
      if (existing) return json(res, 200, existing);
    }
    return refuse(res, armed.status, armed.error_code, armed.error_message);
  }

  const flatBundles = path === "/v1/permission-bundles";
  const roleCollection = path === "/v1/role-definitions";
  const roleMatch = path.match(/^\/v1\/role-definitions\/([^/]+)$/);
  const bundleCollection = path.match(/^\/v1\/role-definitions\/([^/]+)\/permission-bundles$/);
  const bundleMatch = path.match(/^\/v1\/role-definitions\/([^/]+)\/permission-bundles\/([^/]+)$/);

  // ── GET /v1/permission-bundles ──────────────────────────────────────────
  if (flatBundles && method === "GET") {
    let out = newestFirst(scoped(bundles, tenantID));
    const roleID = url.searchParams.get("role_id");
    if (roleID) {
      // A malformed filter narrows to nothing rather than erroring — the
      // service guards the UUID cast before the query runs.
      out = UUID_RE.test(roleID) ? out.filter((b) => b.role_definition_id === roleID) : [];
    }
    const active = url.searchParams.get("active_flag");
    if (active !== null && active !== "") {
      if (active !== "true" && active !== "false") {
        return refuse(res, 400, "invalid_active_flag", "active_flag must be true or false");
      }
      out = out.filter((b) => b.active_flag === (active === "true"));
    }
    const search = url.searchParams.get("search");
    if (search) {
      out = out.filter((b) => b.bundle_code.toLowerCase().includes(search.toLowerCase()));
    }
    return json(res, 200, page(out, url.searchParams));
  }

  // ── GET /v1/role-definitions ────────────────────────────────────────────
  if (roleCollection && method === "GET") {
    let out = newestFirst(scoped(roles, tenantID));
    const status = url.searchParams.get("status");
    if (status) {
      if (status !== "ACTIVE" && status !== "RETIRED") {
        return refuse(res, 400, "invalid_status", `status must be ACTIVE or RETIRED, got "${status}"`);
      }
      out = out.filter((r) => r.status === status);
    }
    const scopeType = url.searchParams.get("scope_type");
    if (scopeType) {
      if (scopeType !== "LEGAL_ENTITY" && scopeType !== "TENANT") {
        return refuse(res, 400, "invalid_scope_type", "scope_type must be LEGAL_ENTITY or TENANT");
      }
      out = out.filter((r) => r.role_scope_type === scopeType);
    }
    const search = url.searchParams.get("search");
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) => r.role_code.toLowerCase().includes(q) || r.role_name.toLowerCase().includes(q),
      );
    }
    return json(res, 200, page(out, url.searchParams));
  }

  // ── POST /v1/role-definitions ───────────────────────────────────────────
  if (roleCollection && method === "POST") {
    const body = await readBody(req);
    if (body === null) return refuse(res, 400, "invalid_json", "malformed JSON body");
    const { legal_entity_id, role_code, role_name, role_scope_type, correlation_id } = body;
    if (!legal_entity_id || !role_code || !role_name || !role_scope_type || !correlation_id) {
      return refuse(
        res,
        400,
        "missing_fields",
        "legal_entity_id, role_code, role_name, role_scope_type, correlation_id are required",
      );
    }
    if (role_scope_type !== "LEGAL_ENTITY" && role_scope_type !== "TENANT") {
      return refuse(res, 400, "invalid_scope_type", "role_scope_type must be LEGAL_ENTITY or TENANT");
    }

    // Idempotency first. A replay carries the same correlation id AND the same
    // code, so checking uniqueness ahead of it would answer 409 to every retry
    // and destroy the idempotency the key exists to provide.
    const replay = roles.find((r) => r.tenant_id === tenantID && r.correlation_id === correlation_id);
    if (replay) return json(res, 200, replay);

    if (roles.some((r) => r.tenant_id === tenantID && r.role_code === role_code)) {
      return refuse(
        res,
        409,
        "role_code_exists",
        "a role definition with that role_code already exists in this tenant",
      );
    }

    const now = new Date().toISOString();
    const role = {
      role_definition_id: randomUUID(),
      tenant_id: tenantID,
      role_code,
      role_name,
      role_scope_type,
      status: "ACTIVE",
      created_by_principal_id: principalID,
      correlation_id,
      created_at: now,
      updated_at: now,
    };
    roles.push(role);
    return json(res, 201, role);
  }

  // ── /v1/role-definitions/{id} ───────────────────────────────────────────
  if (roleMatch) {
    const roleID = roleMatch[1];
    // A malformed id cannot name a row — 404, never the 503 the UUID cast used
    // to produce.
    const role = UUID_RE.test(roleID)
      ? roles.find((r) => r.tenant_id === tenantID && r.role_definition_id === roleID)
      : undefined;

    if (method === "GET") {
      if (!role) return refuse(res, 404, "not_found", "role definition not found");
      return json(res, 200, role);
    }
    if (method === "PATCH") {
      const body = await readBody(req);
      if (body === null) return refuse(res, 400, "invalid_json", "malformed JSON body");
      const { role_name, status } = body;
      if (status && status !== "ACTIVE" && status !== "RETIRED") {
        return refuse(res, 400, "invalid_status", `status must be ACTIVE or RETIRED, got "${status}"`);
      }
      if (!role) return refuse(res, 404, "not_found", "role definition not found");
      if (role_name) role.role_name = role_name;
      if (status) role.status = status;
      role.updated_by_principal_id = principalID;
      role.updated_at = new Date().toISOString();
      return json(res, 200, role);
    }
  }

  // ── /v1/role-definitions/{id}/permission-bundles ────────────────────────
  if (bundleCollection) {
    const roleID = bundleCollection[1];
    const roleExists =
      UUID_RE.test(roleID) &&
      roles.some((r) => r.tenant_id === tenantID && r.role_definition_id === roleID);

    if (method === "GET") {
      if (!UUID_RE.test(roleID)) return json(res, 200, []);
      return json(
        res,
        200,
        newestFirst(scoped(bundles, tenantID).filter((b) => b.role_definition_id === roleID)),
      );
    }
    if (method === "POST") {
      const body = await readBody(req);
      if (body === null) return refuse(res, 400, "invalid_json", "malformed JSON body");
      const { bundle_code, permitted_actions, correlation_id } = body;
      if (!bundle_code || !Array.isArray(permitted_actions) || permitted_actions.length === 0 || !correlation_id) {
        return refuse(
          res,
          400,
          "missing_fields",
          "bundle_code, permitted_actions, correlation_id are required",
        );
      }
      if (!roleExists) return refuse(res, 404, "not_found", "role definition not found");

      const replay = bundles.find(
        (b) => b.tenant_id === tenantID && b.correlation_id === correlation_id,
      );
      if (replay) return json(res, 200, replay);

      if (
        bundles.some(
          (b) =>
            b.tenant_id === tenantID &&
            b.role_definition_id === roleID &&
            b.bundle_code === bundle_code,
        )
      ) {
        return refuse(
          res,
          409,
          "bundle_code_exists",
          "a permission bundle with that bundle_code is already attached to this role",
        );
      }

      const now = new Date().toISOString();
      const bundle = {
        bundle_id: randomUUID(),
        tenant_id: tenantID,
        role_definition_id: roleID,
        bundle_code,
        permitted_actions,
        active_flag: true,
        correlation_id,
        created_at: now,
        updated_at: now,
      };
      bundles.push(bundle);
      return json(res, 201, bundle);
    }
  }

  // ── /v1/role-definitions/{id}/permission-bundles/{bundle_id} ────────────
  if (bundleMatch) {
    const [, roleID, bundleID] = bundleMatch;
    const bundle =
      UUID_RE.test(roleID) && UUID_RE.test(bundleID)
        ? bundles.find(
            (b) =>
              b.tenant_id === tenantID &&
              b.role_definition_id === roleID &&
              b.bundle_id === bundleID,
          )
        : undefined;

    if (method === "GET") {
      if (!bundle) return refuse(res, 404, "not_found", "permission bundle not found");
      return json(res, 200, bundle);
    }
    if (method === "PATCH") {
      const body = await readBody(req);
      if (body === null) return refuse(res, 400, "invalid_json", "malformed JSON body");
      const actions = body.permitted_actions;
      const active = body.active_flag;
      if (actions === undefined && active === undefined) {
        return refuse(res, 400, "nothing_to_update", "supply permitted_actions and/or active_flag");
      }
      if (Array.isArray(actions) && actions.length === 0) {
        return refuse(
          res,
          400,
          "empty_actions",
          "a bundle must permit at least one action; set active_flag to withdraw the bundle instead",
        );
      }
      if (!bundle) return refuse(res, 404, "not_found", "permission bundle not found");

      const actionsChanged =
        Array.isArray(actions) && JSON.stringify(actions) !== JSON.stringify(bundle.permitted_actions);
      const activeChanged = active !== undefined && active !== bundle.active_flag;
      // A submission that changes nothing is answered with the current record
      // and makes no remote call — the console renders that as its own state.
      if (!actionsChanged && !activeChanged) return json(res, 200, bundle);

      if (actionsChanged) bundle.permitted_actions = actions;
      if (activeChanged) bundle.active_flag = active;
      bundle.updated_by_principal_id = principalID;
      bundle.updated_at = new Date().toISOString();
      return json(res, 200, bundle);
    }
    if (method === "DELETE") {
      if (!url.searchParams.get("legal_entity_id")) {
        return refuse(res, 400, "missing_fields", "legal_entity_id is required");
      }
      if (!bundle) return refuse(res, 404, "not_found", "permission bundle not found");
      // Idempotent: an already-detached bundle answers 200 with the current
      // record, because the operator's intent is already satisfied.
      if (!bundle.active_flag) return json(res, 200, bundle);
      bundle.active_flag = false;
      bundle.updated_by_principal_id = principalID;
      bundle.updated_at = new Date().toISOString();
      return json(res, 200, bundle);
    }
  }

  return refuse(res, 404, "not_found", `no route for ${method} ${path}`);
});

server.listen(PORT, () => {
  process.stdout.write(`access-control-svc mock listening on :${PORT}\n`);
});

export { LEGAL_ENTITY, SEED_BUNDLE, SEED_ROLE_NO_BUNDLE, SEED_ROLE_RETIRED, SEED_ROLE_WITH_BUNDLE };
