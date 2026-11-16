// HTTP tests for the /api/v1 proxy against stub upstream services.
//
// Opt-in, because they need a production build:
//   npm run build
//   ZOIKO_HTTP_TESTS=1 npm test          (PowerShell: $env:ZOIKO_HTTP_TESTS=1; npm test)
//
// The stubs implement only what each real service's handler was read to do
// (routes, required identity headers and query parameters, response shapes);
// see tests/api-v1-contracts.test.mjs for the source checks. They are not the
// services, and passing here is not end-to-end verification against a live
// backend.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENABLED = process.env.ZOIKO_HTTP_TESTS === "1";
const BUILT = fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"));
const skip = !ENABLED ? "set ZOIKO_HTTP_TESTS=1 to run" : !BUILT ? "run `npm run build` first" : false;

const PRINCIPAL = "33333333-3333-3333-3333-333333333333";
const TENANT = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";
// Sessions are HMAC-signed (lib/auth.ts signSessionPayload); the app below is
// started with this secret so the test can sign its own cookie.
const SESSION_SECRET = "http-test-session-secret-at-least-32-characters";
const PAYLOAD = Buffer.from(
  JSON.stringify({ email: "http-test@zoikosuite.test", name: "HTTP Test", role: "Tester", principalId: PRINCIPAL, tenantId: TENANT, legalEntityId: ENTITY, iat: Date.now() }),
).toString("base64url");
const SESSION =`${PAYLOAD}.${crypto.createHmac("sha256", SESSION_SECRET).update(PAYLOAD).digest("base64url")}`;

/** Every request the stub upstream received. */
const seen = [];
let stub;
let app;
let base;

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Stub upstream: one server, one path prefix per service. */
function upstream(req, res) {
  const url = new URL(req.url, "http://stub");
  const [, svc, ...rest] = url.pathname.split("/");
  const route = "/" + rest.join("/");
  const q = url.searchParams;
  const principal = req.headers["x-principal-id"];
  const tenant = req.headers["x-tenant-id"];
  seen.push({ svc, route, query: Object.fromEntries(q), principal, tenant });

  if (svc === "board-resolutions-svc" && route === "/v1/resolutions") {
    if (!principal || !tenant) return json(res, 401, { error: "identity_missing" });
    return json(res, 200, { resolutions: [{ resolution_id: "res-1" }, { resolution_id: "res-2" }], total: 2, limit: 50, offset: 0 });
  }
  if (svc === "financial-close-svc" && route === "/v1/close/periods") {
    if (!q.get("legal_entity_id")) return json(res, 400, { error: "missing_fields" });
    if (!principal || !tenant) return json(res, 401, { error: "identity_missing" });
    return json(res, 200, [{ fiscal_period_id: "fp-1", period_name: "2026-10", close_status: "SOFT_CLOSE" }]);
  }
  if (svc === "general-ledger-svc" && route === "/v1/journals") {
    if (!tenant) return json(res, 401, { error: "tenant_missing" });
    return json(res, 200, [{ journal_id: "j-1", status: q.get("status") }]);
  }
  if (svc === "accounts-receivable-svc" && route === "/v1/invoices/") {
    if (!tenant) return json(res, 401, { error: "tenant_missing" });
    return json(res, 200, [{ invoice_id: "ar-1" }, { invoice_id: "ar-2" }, { invoice_id: "ar-3" }]);
  }
  if (svc === "accounts-payable-svc" && route === "/v1/invoices") {
    // Authorization refusal, to check that a 403 is passed on as a 403.
    return json(res, 403, { error: "forbidden", message: "no grant" });
  }
  if (svc === "intercompany-accounting-svc" && route === "/v1/intercompany/entries") {
    if (!principal) return json(res, 401, { error: "identity_missing" });
    if (q.get("source_legal_entity_id") === ENTITY) {
      return json(res, 200, [{ intercompany_entry_id: "ic-a" }, { intercompany_entry_id: "ic-b" }]);
    }
    if (q.get("target_legal_entity_id") === ENTITY) {
      return json(res, 200, [{ intercompany_entry_id: "ic-b" }, { intercompany_entry_id: "ic-c" }]);
    }
    return json(res, 200, [{ intercompany_entry_id: "unfiltered-should-not-be-requested" }]);
  }
  json(res, 404, { error: `stub has no ${svc}${route}` });
}

before(async () => {
  if (skip) return;
  const stubPort = await freePort();
  const deadPort = await freePort(); // nothing listens: an unreachable service
  stub = http.createServer(upstream);
  await new Promise((r) => stub.listen(stubPort, "127.0.0.1", r));
  const s = (name) => `http://127.0.0.1:${stubPort}/${name}`;

  const appPort = await freePort();
  base = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(appPort)], {
    cwd: ROOT,
    env: {
      ...process.env,
      ZOIKO_SESSION_SECRET: SESSION_SECRET,
      ZOIKO_USE_GATEWAY: "false",
      ZOIKO_SERVICECTL: "false",
      ZOIKO_BOARD_RESOLUTIONS_URL: s("board-resolutions-svc"),
      ZOIKO_FINANCIAL_CLOSE_URL: s("financial-close-svc"),
      ZOIKO_GENERAL_LEDGER_URL: s("general-ledger-svc"),
      ZOIKO_ACCOUNTS_RECEIVABLE_URL: s("accounts-receivable-svc"),
      ZOIKO_ACCOUNTS_PAYABLE_URL: s("accounts-payable-svc"),
      ZOIKO_INTERCOMPANY_ACCOUNTING_URL: s("intercompany-accounting-svc"),
      ZOIKO_BANK_RECONCILIATION_URL: `http://127.0.0.1:${deadPort}`,
    },
    stdio: "ignore",
  });

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const r = await fetch(`${base}/login`);
      if (r.status < 500) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("next start did not come up within 60s");
    await new Promise((r) => setTimeout(r, 300));
  }
});

after(async () => {
  app?.kill();
  await new Promise((r) => (stub ? stub.close(r) : r()));
});

const get = (p, cookie = true) =>
  fetch(`${base}/api/v1/${p}`, { headers: cookie ? { Cookie: `zoiko_session=${SESSION}` } : {} });

test("no session: GET and POST are refused and nothing reaches a service", { skip }, async () => {
  const before = seen.length;
  const r1 = await get("resolutions", false);
  assert.equal(r1.status, 401);
  const r2 = await fetch(`${base}/api/v1/contracts`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
  assert.equal(r2.status, 401);
  assert.equal(seen.length, before, "an unauthenticated request reached an upstream service");
});

test("resolutions: board-resolutions-svc list, with the session's identity", { skip }, async () => {
  const r = await get("resolutions");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.resolutions.map((x) => x.resolution_id), ["res-1", "res-2"]);
  const call = seen.findLast((s) => s.svc === "board-resolutions-svc");
  assert.equal(call.route, "/v1/resolutions");
  assert.equal(call.principal, PRINCIPAL);
  assert.equal(call.tenant, TENANT);
});

test("fiscal-periods: /v1/close/periods with legal_entity_id from the session", { skip }, async () => {
  const r = await get("fiscal-periods");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.fiscal_periods.length, 1);
  const call = seen.findLast((s) => s.svc === "financial-close-svc");
  assert.equal(call.route, "/v1/close/periods");
  assert.equal(call.query.legal_entity_id, ENTITY);
  assert.equal(call.principal, PRINCIPAL);
});

test("journals: /v1/journals, status passed through, page limit reported", { skip }, async () => {
  const r = await get("journals?status=FINALIZED");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.journals.length, 1);
  assert.equal(body.page_limit, 200);
  const call = seen.findLast((s) => s.svc === "general-ledger-svc");
  assert.equal(call.route, "/v1/journals");
  assert.equal(call.query.status, "FINALIZED");
  assert.equal(call.query.legal_entity_id, ENTITY);
  assert.equal(call.query.limit, "200");
});

test("ar-invoices: receivables list scoped to the session's entity", { skip }, async () => {
  const body = await (await get("ar-invoices")).json();
  assert.equal(body.invoices.length, 3);
  assert.equal(seen.findLast((s) => s.svc === "accounts-receivable-svc").query.legal_entity_id, ENTITY);
});

test("intercompany/entries: both directions, merged by id, never unfiltered", { skip }, async () => {
  const before = seen.length;
  const body = await (await get("intercompany/entries")).json();
  assert.deepEqual(body.entries.map((e) => e.intercompany_entry_id).sort(), ["ic-a", "ic-b", "ic-c"]);
  const calls = seen.slice(before).filter((s) => s.svc === "intercompany-accounting-svc");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.query.source_legal_entity_id === ENTITY || c.query.target_legal_entity_id === ENTITY));
});

test("an upstream 403 is passed on as 403, not an empty list", { skip }, async () => {
  const r = await get("ap-invoices?status=PAYMENT_REQUESTED");
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.invoices, undefined);
  assert.equal(seen.findLast((s) => s.svc === "accounts-payable-svc").query.status, "PAYMENT_REQUESTED");
});

test("an unreachable service is a 502, not an empty list", { skip }, async () => {
  const r = await get("bank-reconciliation/statement-lines?status=MATCHED");
  assert.equal(r.status, 502);
  const body = await r.json();
  assert.equal(body.statement_lines, undefined);
  assert.equal(body.kind, "unreachable");
});

test("AI governance examples carry the illustrative flag", { skip }, async () => {
  for (const ep of ["ai-governance/runs", "ai-governance/risk-classifications", "ai-governance/model-providers"]) {
    const body = await (await get(ep)).json();
    assert.equal(body.illustrative, true, ep);
  }
});
