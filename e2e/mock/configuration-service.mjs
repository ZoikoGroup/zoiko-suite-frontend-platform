// Hermetic stand-in for configuration-feature-flag-svc (:8086 in the real
// stack), used by the Playwright E2E suite. Implements every route the Go
// service registers, so /admin/settings can be exercised without Postgres,
// Kafka, authorization-svc or the gateway:
//
//   POST /v1/config                                         (append-only upsert)
//   GET  /v1/config?environment=&tenant_id=
//   GET  /v1/config/{key}?environment=&tenant_id=            (exact tuple)
//   POST /v1/flags
//   GET  /v1/flags?environment=&tenant_id=
//   GET  /v1/flags/{key}?environment=&tenant_id=
//   GET  /healthz, /readyz
//
// WHAT THIS MOCK IS FOR, AND WHAT IT IS NOT FOR
//
// It is not a second implementation of the service's rules. Row-level security,
// the transactional outbox, the partial unique index and the event payloads are
// the service's own correctness and are proved against real Postgres and a
// running stack by the Go suite and scripts/audit.sh. A spec that asserts a rule
// only this file enforces has proved nothing.
//
// It exists to answer what the Go tests structurally cannot: does the CONSOLE
// send the canonical §4 headers the envelope middleware demands on writes, does
// it read the fields it renders out of the real response shape, and does it tell
// the operator the right thing for each refusal this service can produce.
//
// So the parts modelled faithfully are the ones the console can get wrong, all
// matched to the running service's handler rather than inferred:
//
//   * 201 vs 200, which is THE distinction on this service. A value that
//     genuinely changed is 201; re-submitting the value already in force is 200
//     with the existing row and NOTHING written. A console that collapses them
//     into "saved" tells an operator it recorded a change it did not record.
//
//   * Append-only versioning. A changed value gets a NEW id and the predecessor
//     is end-dated, never overwritten — so a spec can assert the console shows
//     history rather than a mutated row.
//
//   * Exact-tuple lookup with NO fallback. GET /v1/config/{key} matches
//     (key, environment, tenant_id) exactly. A tenant miss does NOT fall back to
//     the environment-wide default, so a 404 says nothing about whether a global
//     value exists — the single most misread response this service produces, and
//     the reason the console's miss message has to say so.
//
//   * Scope. tenant_id absent means the environment-wide DEFAULT, which is a
//     real scope and not a missing value. The LIST routes behave differently
//     again: they return the caller's tenant PLUS the globals, and naming a
//     foreign tenant is 403 tenant_scope_mismatch.
//
//   * The {"error": "<code>"} body shape. The console's
//     explainConfigurationError only fires if that code reaches it.
//
// Deliberately NOT modelled: the authorization decision (every caller here is
// permitted unless a spec arms a refusal), the outbox and the event pipeline.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 18086);

// Same identities the rest of the hermetic suite uses (see e2e/helpers.ts).
const TENANT = "11111111-1111-1111-1111-111111111111";
const ADMIN = "33333333-3333-3333-3333-333333333333";

// ─── Seed ─────────────────────────────────────────────────────────────────────
//
// Chosen so the page reads sensibly on first load AND so every branch of
// explainFlag is on screen, because those four states are exactly what an
// operator misreads:
//
//   on at 100%   — everyone has it
//   on at 25%    — a fifth of people have it; two people see different things
//   off at 40%   — off for EVERYONE; the share is dormant, not active
//   on at 0%     — on, but reaching nobody (the normal start of a staged release)
//
// Plus one global flag, to prove the console distinguishes "your organisation"
// from "everyone in this environment".

const seedFlags = () => [
  {
    flag_id: "cf000000-0000-4000-8000-0000000000f1",
    key: "payroll.new_ui",
    enabled: true,
    environment: "local",
    tenant_id: TENANT,
    rollout_percentage: 100,
    effective_from: "2026-03-01T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-03-01T00:00:00.000Z",
  },
  {
    flag_id: "cf000000-0000-4000-8000-0000000000f2",
    key: "expenses.receipt_scan",
    enabled: true,
    environment: "local",
    tenant_id: TENANT,
    rollout_percentage: 25,
    effective_from: "2026-02-01T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-02-01T00:00:00.000Z",
  },
  {
    flag_id: "cf000000-0000-4000-8000-0000000000f3",
    key: "treasury.fx_preview",
    enabled: false,
    environment: "local",
    tenant_id: TENANT,
    rollout_percentage: 40,
    effective_from: "2026-01-15T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-01-15T00:00:00.000Z",
  },
  {
    flag_id: "cf000000-0000-4000-8000-0000000000f4",
    key: "ledger.staged_close",
    enabled: true,
    environment: "local",
    tenant_id: null, // the environment-wide default
    rollout_percentage: 0,
    effective_from: "2026-01-10T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-01-10T00:00:00.000Z",
  },
];

// Values of several shapes, because describeConfigValue renders each one
// differently and a table that only ever holds numbers proves one branch.
const seedConfig = () => [
  {
    config_id: "cf000000-0000-4000-8000-0000000000c1",
    key: "payroll.release.batch_size",
    value: 250,
    environment: "local",
    tenant_id: TENANT,
    effective_from: "2026-03-01T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-03-01T00:00:00.000Z",
  },
  {
    config_id: "cf000000-0000-4000-8000-0000000000c2",
    key: "close.cutoff_timezone",
    value: "Europe/London",
    environment: "local",
    tenant_id: TENANT,
    effective_from: "2026-02-01T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-02-01T00:00:00.000Z",
  },
  {
    config_id: "cf000000-0000-4000-8000-0000000000c3",
    key: "notifications.digest",
    value: { hour: 17, weekdays_only: true },
    environment: "local",
    tenant_id: null, // the environment-wide default
    effective_from: "2026-01-05T00:00:00.000Z",
    effective_to: null,
    created_by_principal_id: ADMIN,
    created_at: "2026-01-05T00:00:00.000Z",
  },
];

let flags = seedFlags();
let config = seedConfig();

// An outcome a spec can arm for one write, so the console's handling of a
// refusal is exercised without making it the mock's normal behaviour. Cleared
// after it fires.
let armedRefusal = null;

function reset() {
  flags = seedFlags();
  config = seedConfig();
  armedRefusal = null;
}

// ─── Envelope (ZS-ARCH-SVC-001 §4) ───────────────────────────────────────────

/**
 * Validate the canonical envelope the way the service's middleware does.
 *
 * Returns null when the request is in contract, or {status, body} to answer
 * with. The split between 401 and 400 is the middleware's, not an invention: a
 * request that cannot say WHO is acting for WHICH tenant is unauthenticated;
 * one that can but omits its traceability or replay fields is malformed.
 *
 * legal_entity_id is NOT required here, unlike access-control-svc: this
 * service's envelope policy marks it NotRequired, because configuration is
 * environment- and tenant-scoped rather than entity-scoped.
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
  if (isWrite && !has("idempotency-key")) {
    violations.push({ field: "idempotency_key", reason: "missing" });
  }

  if (violations.length === 0) return null;

  // Reads run in write-strict mode: the envelope is parsed and reported but the
  // request is admitted, exactly as ZS_ENVELOPE_ENFORCEMENT defaults. Only the
  // TENANT gates a read here, and it gates in the handler (requireTenant)
  // rather than in the middleware.
  //
  // Only the tenant — not the actor. This service's read handlers never ask for
  // a principal, and the console's list calls send none, so a mock that demanded
  // one would refuse every table on the page and report it as "cannot reach the
  // configuration service". Verified against the running service: a read with
  // X-Tenant-Id alone is 200, and one with no tenant at all is 401.
  if (!isWrite) {
    return violations.some((v) => v.field === "tenant_id")
      ? {
          status: 401,
          body: {
            error: "tenant_scope_missing",
            message:
              "X-Tenant-Id is required — the gateway sets it from a verified identity envelope",
          },
        }
      : null;
  }

  return {
    status: unauthenticated ? 401 : 400,
    body: { error: "envelope_incomplete", detail: "canonical service input contract", violations },
  };
}

// ─── Plumbing ────────────────────────────────────────────────────────────────

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** The service's refusal shape: {"error": "<code>", ...}. */
function refuse(res, status, code, extra = {}) {
  return json(res, status, { error: code, ...extra });
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

/** Currently-effective rows only — the ones with no end date. */
const effective = (list) => list.filter((r) => r.effective_to === null);

/**
 * The scope a row belongs to, as a comparable key.
 *
 * null and undefined tenant_id both mean the environment-wide default, and they
 * must compare equal — the service COALESCEs them to a nil-UUID sentinel for
 * exactly this reason.
 */
const scopeKey = (key, environment, tenantID) => `${key}\u0000${environment}\u0000${tenantID ?? ""}`;

/** Semantic JSON equality, as the service compares values — not byte equality. */
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";
  const isWrite = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (path === "/healthz") return json(res, 200, { status: "ok" });
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

  // One armed refusal, then back to normal. Writes only — a spec arming one
  // wants to see how the console renders a refused write, not a broken page.
  if (isWrite && armedRefusal) {
    const { status, ...body } = armedRefusal;
    armedRefusal = null;
    return json(res, status ?? 503, body);
  }

  // ── POST /v1/config and POST /v1/flags ──────────────────────────────────
  const isConfig = path === "/v1/config" || path.startsWith("/v1/config/");
  const list = isConfig ? config : flags;

  if (isWrite && (path === "/v1/config" || path === "/v1/flags")) {
    const body = await readBody(req);
    if (body === null) return refuse(res, 400, "invalid_json");

    // Field order matches the service's missingField(), so a spec asserting on
    // the named field gets the same answer the real service gives.
    if (!body.key) return refuse(res, 400, "missing_field", { field: "key" });
    if (isConfig) {
      if (body.value === undefined) return refuse(res, 400, "missing_field", { field: "value" });
    } else if (body.enabled === undefined || body.enabled === null) {
      // Deliberately not defaulted. On an append-only record "left blank" and
      // "off" are two different statements.
      return refuse(res, 400, "missing_field", { field: "enabled" });
    }
    if (!body.environment) return refuse(res, 400, "missing_field", { field: "environment" });
    if (!body.created_by_principal_id) {
      return refuse(res, 400, "missing_field", { field: "created_by_principal_id" });
    }

    const rollout = body.rollout_percentage === undefined ? 100 : body.rollout_percentage;
    if (!isConfig && (!Number.isInteger(rollout) || rollout < 0 || rollout > 100)) {
      return refuse(res, 400, "invalid_field", {
        field: "rollout_percentage",
        message: "must be between 0 and 100",
      });
    }

    // A scope the caller does not own is refused outright. A null tenant_id is
    // NOT a disagreement — it names the environment-wide default.
    const scopeTenant = body.tenant_id ?? null;
    if (scopeTenant !== null && scopeTenant !== tenantID) {
      return refuse(res, 403, "tenant_scope_mismatch", {
        message: "request tenant_id does not match the caller's verified tenant scope",
      });
    }

    const target = scopeKey(body.key, body.environment, scopeTenant);
    const current = effective(list).find(
      (r) => scopeKey(r.key, r.environment, r.tenant_id) === target,
    );

    // The idempotent path: the submitted value already equals the effective
    // one. Nothing is written, no version is created, and the EXISTING row
    // comes back with 200. A console that renders this as a save is lying.
    if (current) {
      const unchanged = isConfig
        ? sameValue(current.value, body.value)
        : current.enabled === body.enabled && current.rollout_percentage === rollout;
      if (unchanged) return json(res, 200, current);
    }

    // A real transition. The predecessor is END-DATED, not replaced.
    const now = new Date().toISOString();
    if (current) current.effective_to = now;

    const row = isConfig
      ? {
          config_id: randomUUID(),
          key: body.key,
          value: body.value,
          environment: body.environment,
          tenant_id: scopeTenant,
          effective_from: now,
          effective_to: null,
          created_by_principal_id: body.created_by_principal_id,
          created_at: now,
        }
      : {
          flag_id: randomUUID(),
          key: body.key,
          enabled: body.enabled,
          environment: body.environment,
          tenant_id: scopeTenant,
          rollout_percentage: rollout,
          effective_from: now,
          effective_to: null,
          created_by_principal_id: body.created_by_principal_id,
          created_at: now,
        };
    list.push(row);
    return json(res, 201, row);
  }

  // ── GET /v1/config and GET /v1/flags ────────────────────────────────────
  if (method === "GET" && (path === "/v1/config" || path === "/v1/flags")) {
    const claimed = url.searchParams.get("tenant_id");
    if (claimed && claimed !== tenantID) {
      return refuse(res, 403, "tenant_scope_mismatch", {
        message: "request tenant_id does not match the caller's verified tenant scope",
      });
    }
    const environment = url.searchParams.get("environment");
    // This tenant PLUS the globals that apply to it. An absent tenant filter
    // used to mean "no filter" — every tenant's configuration returned to any
    // caller — which is what made this console's tables a cross-tenant read.
    const rows = effective(list).filter(
      (r) =>
        (r.tenant_id === tenantID || r.tenant_id === null) &&
        (!environment || r.environment === environment),
    );
    return json(res, 200, rows);
  }

  // ── GET /v1/config/{key} and GET /v1/flags/{key} ────────────────────────
  const keyMatch = path.match(/^\/v1\/(config|flags)\/(.+)$/);
  if (method === "GET" && keyMatch) {
    const key = decodeURIComponent(keyMatch[2]);
    const environment = url.searchParams.get("environment");
    if (!environment) return refuse(res, 400, "missing_field", { field: "environment" });

    const claimed = url.searchParams.get("tenant_id");
    if (claimed && claimed !== tenantID) {
      return refuse(res, 403, "tenant_scope_mismatch", {
        message: "request tenant_id does not match the caller's verified tenant scope",
      });
    }

    // EXACT tuple. No fallback from a tenant miss to the global default — the
    // scoping rule the console's 404 message has to explain, because a reader
    // who assumes otherwise concludes the setting is unset when it is not.
    const wantScope = scopeKey(key, environment, claimed ?? null);
    const row = effective(list).find(
      (r) => scopeKey(r.key, r.environment, r.tenant_id) === wantScope,
    );
    if (!row) {
      return refuse(res, 404, keyMatch[1] === "config" ? "config_entry_not_found" : "feature_flag_not_found", { key });
    }
    return json(res, 200, row);
  }

  return refuse(res, 404, "not_found", { message: `no route for ${method} ${path}` });
});

server.listen(PORT, () => {
  process.stdout.write(`configuration-feature-flag-svc mock listening on :${PORT}\n`);
});

export { TENANT, ADMIN };
