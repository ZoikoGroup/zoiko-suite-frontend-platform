// Hermetic stand-in for identity-context-svc (:8080 in the real stack) used by
// the Playwright E2E suite. Implements every route the Go service registers, so
// the console's whole identity surface can be exercised without Postgres, Redis,
// Kafka or the gateway:
//
//   POST   /v1/authenticate
//   GET    /.well-known/jwks.json
//   POST   /v1/context/resolve
//   GET    /v1/context/session/{id}
//   GET    /v1/context/session/{id}/explain
//   POST   /v1/context/session/{id}/invalidate
//   POST   /v1/context/cache/refresh
//   POST   /v1/context/tenant/invalidate
//   POST   /v1/context/support
//   GET    /v1/context/support/{id}
//   DELETE /v1/context/support/{id}
//   GET    /v1/principals/{id}
//   GET    /v1/principals/{id}/roles
//   GET    /v1/principals/{id}/delegations
//   PUT    /v1/principals/{id}/status
//   GET    /health
//
// Envelopes are synthetic JWT-shaped strings (header.payload.signature) whose
// payload the console decodes — the console does not verify signatures (that is
// gateway-auth-svc's job in the real stack), so this needs no keys.

import { createServer } from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT ?? 18080);

// ─── Seed data ────────────────────────────────────────────────────────────────

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const SUPPORT_TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const seedPrincipals = [
  {
    principal_id: "33333333-3333-3333-3333-333333333333",
    tenant_id: TENANT_A,
    principal_type: "HUMAN",
    identity_provider_subject: "admin@zoikosuite.com|ADFS|10001",
    email: "admin@zoikosuite.com",
    display_name: "Lingaraj (Super Admin)",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    data_classification: "internal",
    password: "Zoiko@Governance1",
  },
  {
    principal_id: "44444444-4444-4444-4444-444444444444",
    tenant_id: TENANT_A,
    principal_type: "HUMAN",
    identity_provider_subject: "tax.officer@zoikosuite.com|ADFS|10002",
    email: "tax.officer@zoikosuite.com",
    display_name: "Dr. Alistair Vance",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    data_classification: "internal",
    password: "Zoiko@Tax2026!",
  },
  {
    principal_id: "88888888-8888-8888-8888-888888888888",
    tenant_id: TENANT_A,
    principal_type: "HUMAN",
    identity_provider_subject: "procurement@zoikosuite.com|ADFS|10008",
    email: "procurement@zoikosuite.com",
    display_name: "Marcus Sterling",
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    data_classification: "internal",
    password: "Zoiko@Commercial2026!",
  },
  {
    principal_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    tenant_id: TENANT_B,
    principal_type: "HUMAN",
    identity_provider_subject: "someone@other-tenant.io|ADFS|20001",
    email: "someone@other-tenant.io",
    display_name: "Other Tenant User",
    status: "ACTIVE",
    created_at: "2026-02-15T00:00:00.000Z",
    data_classification: "internal",
    // A principal that exists to prove cross-tenant reads answer 404.
  },
  {
    principal_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    tenant_id: SUPPORT_TENANT,
    principal_type: "HUMAN",
    identity_provider_subject: "support.eng@zoikosuite.com|ADFS|90001",
    email: "support.eng@zoikosuite.com",
    display_name: "Priya Natarajan (Support)",
    status: "ACTIVE",
    created_at: "2026-03-01T00:00:00.000Z",
    data_classification: "restricted",
    password: "Zoiko@Support2026!",
  },
];

const principals = new Map(seedPrincipals.map((p) => [p.principal_id, { ...p }]));

const seedRoles = [
  {
    assignment_id: "ra-0001",
    principal_id: "33333333-3333-3333-3333-333333333333",
    role_id: "role-platform-admin",
    legal_entity_id: ENTITY,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2099-12-31T00:00:00.000Z",
    assigned_by: "33333333-3333-3333-3333-333333333333",
  },
  {
    assignment_id: "ra-0002",
    principal_id: "33333333-3333-3333-3333-333333333333",
    role_id: "role-identity-admin",
    legal_entity_id: null,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2099-12-31T00:00:00.000Z",
    assigned_by: "33333333-3333-3333-3333-333333333333",
  },
  {
    assignment_id: "ra-0003",
    principal_id: "44444444-4444-4444-4444-444444444444",
    role_id: "role-tax-lead",
    legal_entity_id: ENTITY,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2099-12-31T00:00:00.000Z",
    assigned_by: "33333333-3333-3333-3333-333333333333",
  },
];

const seedDelegations = [
  {
    delegated_authority_id: "da-0001",
    delegator_principal_id: "44444444-4444-4444-4444-444444444444",
    delegate_principal_id: "33333333-3333-3333-3333-333333333333",
    scope_type: "ENTITY_SCOPED",
    legal_entity_id: ENTITY,
    authority_limit_type: "MONETARY",
    authority_limit_value: 250000,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2027-01-01T00:00:00.000Z",
    revocation_status: "ACTIVE",
  },
  {
    delegated_authority_id: "da-0002",
    delegator_principal_id: "88888888-8888-8888-8888-888888888888",
    delegate_principal_id: "33333333-3333-3333-3333-333333333333",
    scope_type: "ACTION_SCOPED",
    legal_entity_id: null,
    authority_limit_type: null,
    authority_limit_value: null,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2026-12-31T00:00:00.000Z",
    revocation_status: "ACTIVE",
  },
];

const roleAssignments = [...seedRoles];
const delegations = [...seedDelegations];

// ─── Runtime state ────────────────────────────────────────────────────────────

const bearerTokens = new Map(); // token -> { principal_id, tenant_id, issued_at }
const sessions = new Map(); // session_id -> session record
const supportContexts = new Map(); // support_context_id -> grant record
const refreshLog = []; // one entry per /v1/context/cache/refresh

let idSeq = 1;
const nextId = (prefix) => `${prefix}-${String(idSeq++).padStart(5, "0")}`;
const nextEvidence = () => `ev-${String(idSeq).padStart(6, "0")}`;

// E2E-only control: restore the pristine seed so each test is isolated from
// whatever earlier tests left in the in-memory store. Not a real-service route.
function reset() {
  principals.clear();
  for (const p of seedPrincipals) principals.set(p.principal_id, { ...p });
  roleAssignments.splice(0, roleAssignments.length, ...seedRoles.map((r) => ({ ...r })));
  delegations.splice(0, delegations.length, ...seedDelegations.map((d) => ({ ...d })));
  bearerTokens.clear();
  sessions.clear();
  supportContexts.clear();
  refreshLog.length = 0;
  idSeq = 1;
}

// ─── Envelope shaping ─────────────────────────────────────────────────────────

function b64url(input) {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function makeJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "identity-context-test-key" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.${b64url("fake-signature")}`;
}

const SESSION_TTL_SECONDS = 300;
const TOKEN_TTL_SECONDS = 300;
const SUPPORT_CONTEXT_MAX_TTL_SECONDS = 3600;

function makeEnvelope({ principalId, tenantId, legalEntityId, correlationId, sessionContextId }) {
  const now = Date.now();
  const principal = principals.get(principalId);
  const principalRoles = roleAssignments.filter((r) => r.principal_id === principalId);
  const principalDelegations = delegations
    .filter((d) => d.delegate_principal_id === principalId && d.revocation_status === "ACTIVE")
    .map((d) => ({ ...d }));

  return makeJwt({
    principal: {
      principal_id: principalId,
      tenant_id: tenantId,
      principal_type: principal?.principal_type ?? "HUMAN",
      display_name: principal?.display_name ?? "—",
    },
    tenant_id: tenantId,
    legal_entity_id: legalEntityId,
    role_profile: {
      role_assignments: principalRoles.map((r) => ({ role_id: r.role_id, legal_entity_id: r.legal_entity_id })),
      permission_bundle_ids: ["GOV-01-CORE", "PLATFORM-ADMIN"],
    },
    delegated_authority: principalDelegations,
    session_trust_posture: {
      posture: "STANDARD",
      mfa_verified: false,
      adaptive_risk_score: 10,
      session_context_id: sessionContextId,
    },
    correlation_id: correlationId,
    schema_version: "1.0",
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + SESSION_TTL_SECONDS * 1000) / 1000),
  });
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, message, errorCode, evidenceId) {
  const body = { error: message };
  if (errorCode) body.error_code = errorCode;
  if (evidenceId) body.evidence_id = evidenceId;
  send(res, status, body);
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
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

// Bypass the canonical-contract header checks in the same places the real
// service does: /v1/authenticate is exempt (tenant in body), jwks + health are
// public, /v1/context/support attach takes X-Principal-Id only, and resolve is
// authorized by the bearer token itself.
function headerIdentity(req) {
  return {
    tenantId: String(req.headers["x-tenant-id"] ?? ""),
    principalId: String(req.headers["x-principal-id"] ?? ""),
  };
}

// ─── Route dispatch ───────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const method = req.method;
  const path = url.pathname;
  const segments = path.split("/").filter(Boolean); // e.g. ["v1","principals","{id}","roles"]

  try {
    // ----- public: health + jwks -----
    if (method === "GET" && path === "/health") {
      return send(res, 200, {
        status: "healthy",
        checks: { redis: "ok", postgres: "ok", outbox: "ok", outbox_pending: "0" },
        checked_at: new Date().toISOString(),
      });
    }

    if (method === "GET" && path === "/.well-known/jwks.json") {
      return send(res, 200, {
        keys: [
          {
            kty: "RSA",
            use: "sig",
            kid: "identity-context-test-key",
            alg: "RS256",
            n: "mock-modulus-AQAB",
            e: "AQAB",
          },
        ],
      });
    }

    if (method === "POST" && path === "/_e2e/reset") {
      reset();
      return send(res, 200, { reset: true });
    }

    // ----- v1 -----
    if (segments[0] !== "v1") return sendError(res, 404, "not found");

    // ----- POST /v1/authenticate (contract-exempt) -----
    if (method === "POST" && path === "/v1/authenticate") {
      const body = await readJson(req);
      if (!body || !body.tenant_id || !body.email || !body.password) {
        return sendError(res, 400, "tenant_id, email and password are required");
      }
      const principal = [...principals.values()].find(
        (p) =>
          p.email.toLowerCase() === String(body.email).toLowerCase() &&
          p.password === body.password &&
          p.tenant_id === body.tenant_id,
      );
      if (!principal) {
        // Uniform rejection by design — cannot enumerate accounts.
        return sendError(res, 401, "invalid credentials");
      }
      const token = `t_${principal.principal_id}_${Date.now().toString(36)}`;
      bearerTokens.set(token, {
        principal_id: principal.principal_id,
        tenant_id: principal.tenant_id,
        issued_at: Date.now(),
      });
      return send(res, 200, {
        access_token: token,
        token_type: "Bearer",
        expires_in: TOKEN_TTL_SECONDS,
        principal_id: principal.principal_id,
        tenant_id: principal.tenant_id,
        mfa_required: false,
      });
    }

    // ----- v1/context/* -----
    if (segments[1] === "context") {
      // POST /v1/context/resolve
      if (method === "POST" && path === "/v1/context/resolve") {
        const body = await readJson(req);
        const hasBearer = Boolean(body?.bearer_token);
        const hasSaml = Boolean(body?.saml_assertion);
        if (hasBearer === hasSaml) {
          return sendError(res, 400, "exactly one of bearer_token or saml_assertion must be provided", "CONTEXT_UNRESOLVED");
        }
        const legalEntityId = body?.legal_entity_id || String(req.headers["x-legal-entity-id"] ?? "");
        if (hasSaml) {
          return sendError(res, 400, "saml assertions are not supported", "UNSUPPORTED");
        }
        if (!legalEntityId) {
          return sendError(res, 401, "legal entity scope required");
        }
        const token = bearerTokens.get(body.bearer_token);
        if (!token || Date.now() - token.issued_at > TOKEN_TTL_SECONDS * 1000) {
          return sendError(res, 401, "token invalid or unverifiable", "CONTEXT_UNRESOLVED");
        }
        const principal = principals.get(token.principal_id);
        if (!principal || principal.status !== "ACTIVE") {
          return sendError(res, 401, "principal inactive or not found", "CONTEXT_UNRESOLVED");
        }
        const sessionContextId = nextId("sess");
        const envelopeJwt = makeEnvelope({
          principalId: principal.principal_id,
          tenantId: principal.tenant_id,
          legalEntityId,
          correlationId: body.correlation_id ?? "",
          sessionContextId,
        });
        sessions.set(sessionContextId, {
          session_context_id: sessionContextId,
          principal_id: principal.principal_id,
          tenant_id: principal.tenant_id,
          legal_entity_id: legalEntityId,
          envelope_jwt: envelopeJwt,
          decisions: ["ok", "ok", "ok", "ok", "ok", "ok"],
          issued_at: Date.now(),
          invalidated_at: null,
          invalidation_reason: null,
        });
        const evidenceId = nextEvidence();
        return send(res, 200, {
          envelope_jwt: envelopeJwt,
          evidence_id: evidenceId,
          session_context_id: sessionContextId,
          expires_at: Math.floor((Date.now() + SESSION_TTL_SECONDS * 1000) / 1000),
        });
      }

      // GET /v1/context/session/{id}
      if (method === "GET" && segments[2] === "session" && segments.length === 4) {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const session = sessions.get(segments[3]);
        // A session in another tenant answers 404, never 403 — no enumeration.
        if (!session) return sendError(res, 404, "session not found or expired");
        if (session.tenant_id !== tenantId) return sendError(res, 404, "session not found or expired");
        if (session.invalidated_at) return sendError(res, 404, "session not found or expired");
        return send(res, 200, { envelope_jwt: session.envelope_jwt });
      }

      // GET /v1/context/session/{id}/explain
      if (method === "GET" && segments.length === 5 && segments[4] === "explain") {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const session = sessions.get(segments[3]);
        if (!session || session.tenant_id !== tenantId) {
          return sendError(res, 404, "session not found, expired, or in another tenant", "CONTEXT_UNRESOLVED");
        }
        if (url.searchParams.get("as_of") && Number.isNaN(Date.parse(url.searchParams.get("as_of")))) {
          return sendError(res, 400, "as_of must be a valid RFC3339 timestamp", "CONTEXT_UNRESOLVED");
        }
        const dimensionNames = [
          "authenticated_principal",
          "tenant",
          "legal_entity_scope",
          "role_profile",
          "delegated_authority",
          "session_trust_posture",
        ];
        return send(res, 200, {
          session_context_id: session.session_context_id,
          decision_id: `decision-${session.session_context_id}`,
          evidence_id: `ev-${session.session_context_id}`,
          outcome: session.invalidated_at ? "INVALIDATED" : "RESOLVED",
          principal_id: session.principal_id,
          tenant_id: session.tenant_id,
          legal_entity_id: session.legal_entity_id,
          environment: "local",
          ingress_source: "web",
          dimensions: dimensionNames.map((name, i) => ({
            dimension: i + 1,
            name,
            result: session.decisions[i],
            source: i === 0 ? "token" : i <= 2 ? "store" : i === 3 ? "upstream:authorization-svc" : i === 4 ? "store" : "async-risk-cache",
            detail: i === 5 ? "adaptive_risk_score=10" : undefined,
          })),
          issued_at: new Date(session.issued_at).toISOString(),
          expires_at: new Date(session.issued_at + SESSION_TTL_SECONDS * 1000).toISOString(),
          invalidated_at: session.invalidated_at ? new Date(session.invalidated_at).toISOString() : undefined,
          invalidation_reason: session.invalidation_reason ?? undefined,
          as_of: url.searchParams.get("as_of") ? new Date(url.searchParams.get("as_of")).toISOString() : new Date().toISOString(),
          reconstructed_from: "session_contexts",
          correlation_id: "e2e-correlation",
          schema_version: "1.0",
        });
      }

      // POST /v1/context/session/{id}/invalidate
      if (method === "POST" && segments.length === 5 && segments[4] === "invalidate") {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const session = sessions.get(segments[3]);
        if (!session) return sendError(res, 404, "session not found or expired");
        if (session.tenant_id !== tenantId) return sendError(res, 404, "session not found or expired");
        const body = await readJson(req);
        const reason = body?.reason ?? "ADMIN_REVOKE";
        // Idempotent — re-submitting against an already-invalidated session is a no-op.
        if (!session.invalidated_at) {
          session.invalidated_at = Date.now();
          session.invalidation_reason = reason;
        }
        return send(res, 204);
      }

      // POST /v1/context/cache/refresh
      if (method === "POST" && path === "/v1/context/cache/refresh") {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const body = await readJson(req);
        if (!body?.reason) return sendError(res, 400, "reason is required");
        const identifiers = Array.isArray(body.ingress_identifiers) ? body.ingress_identifiers : [];
        refreshLog.push({ tenant_id: tenantId, reason: body.reason, identifiers, at: Date.now() });
        return send(res, 200, {
          bindings_refreshed: identifiers.length ? identifiers.length : 4,
          evidence_id: nextEvidence(),
        });
      }

      // POST /v1/context/tenant/invalidate
      if (method === "POST" && path === "/v1/context/tenant/invalidate") {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const body = await readJson(req);
        if (!body || !body.justification) {
          return sendError(res, 400, "justification is mandatory", "CONTEXT_UNRESOLVED");
        }
        let revoked = 0;
        for (const session of sessions.values()) {
          if (session.tenant_id === tenantId && !session.invalidated_at) {
            session.invalidated_at = Date.now();
            session.invalidation_reason = body.reason ?? "ADMIN_REVOKE";
            revoked += 1;
          }
        }
        return send(res, 200, { sessions_revoked: revoked, evidence_id: nextEvidence() });
      }

      // POST /v1/context/support (privileged; X-Principal-Id only)
      if (method === "POST" && path === "/v1/context/support") {
        const { principalId } = headerIdentity(req);
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const body = await readJson(req);
        if (!body) return sendError(res, 400, "invalid request body", "CONTEXT_UNRESOLVED");
        if (!body.tenant_id) {
          return sendError(res, 400, "tenant_id is required — authorisation is checked against the target tenant", "CONTEXT_UNRESOLVED");
        }
        const grantee = body.support_principal_id;
        const approver = body.approver_principal_id;
        const justification = body.justification ?? "";
        const reasonCode = body.reason_code;
        const ticketRef = body.ticket_ref;

        if (approver === grantee) {
          return sendError(res, 400, "self-approval is refused — there is no single-party form of this command", "BREAK_GLASS_REQUIRED");
        }
        if (justification.length < 20) {
          return sendError(
            res,
            400,
            "justification must be at least 20 characters — a justification nobody can act on is not evidence",
            "BREAK_GLASS_REQUIRED",
          );
        }
        if (!["INCIDENT_RESPONSE", "CUSTOMER_TICKET", "DATA_CORRECTION", "AUDIT_REQUEST"].includes(reasonCode)) {
          return sendError(res, 400, "unrecognised support reason code", "BREAK_GLASS_REQUIRED");
        }
        if (!ticketRef) {
          return sendError(res, 400, "ticket_ref is required", "BREAK_GLASS_REQUIRED");
        }
        const ttl = Number(body.ttl_seconds) || 3600;
        if (ttl > SUPPORT_CONTEXT_MAX_TTL_SECONDS) {
          return sendError(res, 400, `ttl_seconds exceeds the configured maximum of ${SUPPORT_CONTEXT_MAX_TTL_SECONDS}`, "BREAK_GLASS_REQUIRED");
        }
        const supportContextId = nextId("sctx");
        const now = Date.now();
        supportContexts.set(supportContextId, {
          support_context_id: supportContextId,
          tenant_id: body.tenant_id,
          support_principal_id: grantee,
          subject_principal_id: body.subject_principal_id ?? null,
          reason_code: reasonCode,
          justification,
          ticket_ref: ticketRef,
          approver_principal_id: approver,
          granted_at: new Date(now).toISOString(),
          expires_at: new Date(now + ttl * 1000).toISOString(),
          revoked_at: null,
          revocation_reason: null,
          reviewed_at: null,
          reviewed_by: null,
          evidence_id: nextEvidence(),
          correlation_id: body.correlation_id ?? "",
        });
        return send(res, 201, {
          support_context_id: supportContextId,
          expires_at: new Date(now + ttl * 1000).toISOString(),
          evidence_id: nextEvidence(),
        });
      }

      // GET /v1/context/support/{id}
      if (method === "GET" && segments.length === 4 && segments[2] === "support") {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const grant = supportContexts.get(segments[3]);
        if (!grant) return sendError(res, 404, "support context not found", "BREAK_GLASS_REQUIRED");
        return send(res, 200, grant);
      }

      // DELETE /v1/context/support/{id}
      if (method === "DELETE" && segments.length === 4 && segments[2] === "support") {
        const { tenantId, principalId } = headerIdentity(req);
        if (!tenantId) return sendError(res, 401, "missing X-Tenant-Id header");
        if (!principalId) return sendError(res, 401, "missing X-Principal-Id header");
        const grant = supportContexts.get(segments[3]);
        if (!grant) return sendError(res, 404, "support context not found", "BREAK_GLASS_REQUIRED");
        const body = await readJson(req);
        const reason = body?.reason ?? "MANUAL_REVOCATION";
        // Idempotent — re-revoking reports success without a second event, and the
        // FIRST reason stands, because the reason is the part an investigation reads.
        if (!grant.revoked_at) {
          grant.revoked_at = new Date().toISOString();
          grant.revocation_reason = reason;
        }
        return send(res, 204);
      }

      return sendError(res, 404, "not found");
    }

    // ----- v1/principals/* -----
    if (segments[1] === "principals" && segments.length >= 3) {
      const principalId = segments[2];
      const kind = segments[3];

      // Reads carry both headers; cross-tenant answers 404.
      const { tenantId, principalId: callerId } = headerIdentity(req);
      const principal = principals.get(principalId);
      if (!principal) return sendError(res, 404, "principal not found");
      if (principal.tenant_id !== tenantId) return sendError(res, 404, "principal not found");

      if (method === "GET" && kind === undefined) {
        return send(res, 200, principal);
      }
      if (method === "GET" && kind === "roles") {
        return send(
          res,
          200,
          roleAssignments.filter((r) => r.principal_id === principalId),
        );
      }
      if (method === "GET" && kind === "delegations") {
        return send(
          res,
          200,
          delegations.filter((d) => d.delegate_principal_id === principalId && d.revocation_status === "ACTIVE"),
        );
      }
      if (method === "PUT" && kind === "status") {
        if (!callerId) return sendError(res, 401, "missing X-Principal-Id header");
        const body = await readJson(req);
        if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(body?.status)) {
          return sendError(res, 400, "invalid status");
        }
        if (body.status === principal.status) {
          // Idempotent — re-applying same status is a no-op.
          return send(res, 204);
        }
        principal.status = body.status;
        return send(res, 204);
      }
      return sendError(res, 404, "not found");
    }

    return sendError(res, 404, "not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    return sendError(res, 500, message, "CONTEXT_UNRESOLVED");
  }
});

server.listen(PORT, () => {
  console.log(`[mock identity-context-svc] listening on :${PORT}`);
});