// Narrow stand-in for tenant-entity-registry-svc (:8081 in the real stack),
// used by the Playwright E2E suite.
//
// WHY THIS EXISTS, AND WHY IT IS NOT A FULL MOCK
//
// It is here to test gateway-auth-svc's FRONTEND contract, not the registry's.
// gateway-auth-svc has no console of its own and correctly should not — it is
// a router callout with one machine endpoint that application code never calls.
// What it does have is a contract with the console: when it refuses a request
// before Traefik forwards it, the refusal reaches the browser carrying
//
//     X-Tenant-Context: denied      (403 — the registry decided; re-auth won't help)
//     X-Tenant-Context: unresolved  (503 — no decision could be obtained; retry)
//
// Traefik returns an unsuccessful ForwardAuth reply to the client verbatim, so
// from the console's point of view these arrive on the response to whichever
// backend service it was addressing. lib/api/client.ts reads the header off
// every response and app/admin/tenants/failures.ts turns it into the message a
// reader sees.
//
// That path had no test coverage at all. It reuses 403 and 503 — the same
// statuses a backend uses for completely unrelated reasons — so if this
// service's header name or status codes changed, the console would silently
// report a suspended tenant as "authorization-svc refused your principal",
// sending the reader to an RBAC grant that was never the problem, and nothing
// would fail.
//
// So this mock implements only what /admin/tenants needs in order to render,
// plus a switch that makes it answer as the gateway would. Unknown GETs return
// an empty list rather than 404: the page reads a dozen endpoints and the point
// here is the refusal path, not registry fidelity.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 18081);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ENTITY_A = "22222222-2222-2222-2222-222222222222";

function seed() {
  return {
    // "none" | "denied" | "unresolved" — what the gateway would do to the next
    // request. Set via POST /_e2e/tenant-context.
    gateway: "none",
    tenant: {
      tenant_id: TENANT_A,
      legal_name: "Zoiko Group Holdings Plc",
      status: "ACTIVE",
      lifecycle_state: "OPERATING",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    entities: [
      {
        legal_entity_id: ENTITY_A,
        tenant_id: TENANT_A,
        entity_code: "ZG-UK-01",
        legal_name: "Zoiko Group UK Ltd",
        trading_name: "Zoiko UK",
        status: "ACTIVE",
        jurisdiction_id: "GB",
        created_at: "2026-01-01T00:00:00.000Z",
        version: 1,
      },
    ],
  };
}

let db = seed();

function send(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

/**
 * Answer as gateway-auth-svc would when it refuses before the registry is
 * reached, or return null to let the request through.
 *
 * The two branches are deliberately different statuses, mirroring
 * handler.denyResolution: ErrDenied is a decision the registry made and
 * re-authenticating will not change it, so 403. ErrUnavailable is the ABSENCE
 * of a decision — answering 403 would tell the caller it had been refused when
 * in fact nothing could be determined — so 503 with Retry-After.
 */
function gatewayRefusal() {
  if (db.gateway === "denied") {
    return {
      status: 403,
      body: "tenant context denied",
      headers: { "X-Tenant-Context": "denied", "X-Auth-Denial-Reason": "tenant_context_denied" },
    };
  }
  if (db.gateway === "unresolved") {
    return {
      status: 503,
      body: "tenant context could not be resolved",
      headers: {
        "X-Tenant-Context": "unresolved",
        "X-Auth-Denial-Reason": "tenant_context_unresolved",
        "Retry-After": "5",
      },
    };
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && (path === "/healthz" || path === "/readyz")) {
    return send(res, 200, { status: "ok" });
  }

  if (method === "POST" && path === "/_e2e/reset") {
    db = seed();
    return send(res, 200, { reset: true });
  }

  // Test-only. Puts the gateway into a refusal mode for subsequent requests.
  if (method === "POST" && path === "/_e2e/tenant-context") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let mode = "none";
    try {
      mode = JSON.parse(Buffer.concat(chunks).toString("utf8")).mode ?? "none";
    } catch {
      /* default */
    }
    db.gateway = mode;
    return send(res, 200, { gateway: db.gateway });
  }

  // Everything below is "a request the console addressed to the registry". The
  // gateway sits in front of all of it, so its refusal applies to reads and
  // writes alike — which is the point: the console must not mistake one for
  // the registry's own answer.
  const refusal = gatewayRefusal();
  if (refusal) {
    res.writeHead(refusal.status, {
      "Content-Type": "text/plain",
      ...refusal.headers,
    });
    return res.end(refusal.body);
  }

  if (method === "GET" && path === `/v1/tenants/${TENANT_A}`) {
    return send(res, 200, db.tenant);
  }
  if (method === "GET" && path === `/v1/tenants/${TENANT_A}/entities`) {
    return send(res, 200, db.entities);
  }
  if (method === "GET" && path.startsWith("/v1/entities/")) {
    const id = path.split("/")[3];
    const entity = db.entities.find((e) => e.legal_entity_id === id);
    // Sub-resources (/status, /jurisdictions, /versions, …) are not modelled.
    if (path.split("/").length > 4) return send(res, 200, []);
    return entity ? send(res, 200, entity) : send(res, 404, { error: "not_found" });
  }

  // PATCH /v1/entities/{id} — the write the spec drives, because its action is
  // one of the few whose supported-failure list includes "tenant-context".
  if (method === "PATCH" && path.startsWith("/v1/entities/")) {
    const id = path.split("/")[3];
    const entity = db.entities.find((e) => e.legal_entity_id === id);
    if (!entity) return send(res, 404, { error: "not_found" });
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let patch = {};
    try {
      patch = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(res, 400, { error: "invalid_json" });
    }
    Object.assign(entity, patch, { version: entity.version + 1 });
    return send(res, 200, entity);
  }

  // Forgiving default. The page reads a dozen endpoints this mock does not
  // model; an empty list lets it render so the spec can reach the form.
  if (method === "GET") return send(res, 200, []);

  send(res, 404, { error: "not_found", path });
});

server.listen(PORT, () => {
  console.log(`[mock tenant-entity-registry-svc] listening on :${PORT}`);
});
