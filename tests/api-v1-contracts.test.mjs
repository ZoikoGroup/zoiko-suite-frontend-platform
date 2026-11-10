// Contract guard for the console's /api/v1 proxy and the upstream routes its
// clients call.
//
// Run: npm test
//
// 1. Every /api/v1 path the browser fetches must have a handler in
//    app/api/v1/[...path]/route.ts. A missing one is a 404 the panel then shows
//    as an empty register; /resolutions, /journal-entries, /fiscal-periods and
//    /cash-positions all shipped that way.
// 2. Each corrected client must call a route its service actually registers.
//    Read from the backend source (ZOIKO_BACKEND_DIR, default
//    ../zoiko-suite-backend); skipped, not passed, when it is not checked out.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKEND = path.resolve(process.env.ZOIKO_BACKEND_DIR ?? path.join(ROOT, "..", "zoiko-suite-backend"));
const HAS_BACKEND = fs.existsSync(path.join(BACKEND, "services"));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ROUTE = read("app/api/v1/[...path]/route.ts");

/**
 * Browser paths with no handler that predate this guard. Each is a known 404,
 * listed so a NEW one fails the test. Remove an entry when it is mapped; the
 * last test fails until you do. Most belong to components whose pages were
 * removed in 0e670c0; evidence-manifests is called from the live Compliance page.
 */
const KNOWN_UNMAPPED = [
  "audit/events",
  "benefits/plans",
  "compensation/structures",
  "employees",
  "leave/requests",
  "org/departments",
  "payroll-exceptions",
  "payroll-runs",
  "payroll-tax/profiles",
  "payroll/runs",
  "terminations",
];

function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, "components"));
  walk(path.join(ROOT, "app", "admin"));
  files.push(path.join(ROOT, "lib", "finance-timeline-counts.ts"));
  return files;
}

/** Every literal /api/v1 path fetched from the browser, without query string. */
function browserPaths() {
  const out = new Set();
  const add = (p) => out.add(p.replace(/\?.*$/, "").replace(/\/$/, ""));
  for (const f of sourceFiles()) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/fetch\(\s*["'`]\/api\/v1\/([^"'`$]+)["'`]/g)) add(m[1]);
    // Process timelines fetch(`/api/v1/${ep}`) over a table of ["path", "step"] pairs.
    if (/fetch\(`\/api\/v1\/\$\{(ep|path)\}/.test(src)) {
      for (const m of src.matchAll(/\[\s*"([a-z][a-z0-9/-]*(?:\?[^"]*)?)"\s*,\s*"[a-z-]+"\s*\]/g)) add(m[1]);
    }
    if (f.endsWith("finance-timeline-counts.ts")) {
      for (const m of src.matchAll(/path:\s*"([a-z][^"]*)"/g)) add(m[1]);
    }
  }
  return out;
}

const handled = new Set([...ROUTE.matchAll(/endpoint === "([^"]+)"/g)].map((m) => m[1]));

test("every browser /api/v1 path has a proxy handler (apart from the known gaps)", () => {
  const unmapped = [...browserPaths()].filter((p) => !handled.has(p) && !KNOWN_UNMAPPED.includes(p));
  assert.deepEqual(unmapped, []);
});

test("the four reported 404s are resolved", () => {
  for (const p of ["resolutions", "fiscal-periods", "journals"]) assert.ok(handled.has(p), `${p} has no handler`);
  const paths = browserPaths();
  // The browser no longer asks for the two names no service serves.
  assert.equal(paths.has("journal-entries"), false);
  assert.equal(paths.has("cash-positions"), false);
});

test("the proxy refuses requests without a session instead of using a demo identity", () => {
  const fn = ROUTE.slice(ROUTE.indexOf("async function resolveIdentity"), ROUTE.indexOf("const UNAUTHENTICATED"));
  assert.match(fn, /if \(!session\?\.principalId \|\| !session\.tenantId\) return null;/);
  assert.doesNotMatch(fn, /\?\? "[0-9a-f-]{36}"/);
  assert.equal((ROUTE.match(/if \(!identity\) return UNAUTHENTICATED\(\);/g) ?? []).length, 2, "GET and POST both check");
});

test("AI governance examples are flagged as illustrative", () => {
  for (const ep of ["ai-governance/runs", "ai-governance/risk-classifications", "ai-governance/model-providers"]) {
    const at = ROUTE.indexOf(`endpoint === "${ep}"`);
    assert.ok(at > 0, `${ep} handler missing`);
    assert.match(ROUTE.slice(at, at + 400), /illustrative: true/, `${ep} is not flagged`);
  }
});

test("health probes use the same registry key as each domain's own client", () => {
  const health = read("lib/api/health.ts");
  const keyOf = (domain) => health.match(new RegExp(`\\b${domain}: \\[\\s*\\{[^}]*key: "(\\w+)"`))?.[1];
  assert.equal(keyOf("delegations"), "delegatedAuthority");
  assert.match(read("lib/api/delegations.ts"), /apiGet<[^>]+>\("delegatedAuthority"/);
  assert.equal(keyOf("evidence"), "evidence");
  assert.match(read("lib/api/evidence.ts"), /apiGet<[^>]+>\(\s*"evidence"/);
});

test("KNOWN_UNMAPPED lists only paths that are still unmapped", () => {
  const paths = browserPaths();
  const stale = KNOWN_UNMAPPED.filter((p) => handled.has(p) || !paths.has(p));
  assert.deepEqual(stale, []);
});

// ── Upstream routes, read from the backend source ────────────────────────────

/** Frontend client file -> the path it calls, and where the service registers it. */
const UPSTREAM = [
  {
    name: "board-resolutions-svc GET /v1/resolutions",
    client: ["lib/api/legal.ts", "/v1/resolutions"],
    service: "board-resolutions-svc",
    registers: [/r\.Route\("\/v1\/resolutions"/, /r\.Get\("\/", h\.ListResolutions\)/],
  },
  {
    name: "financial-close-svc GET /v1/close/periods (legal_entity_id required)",
    client: ["lib/api/financial-close.ts", '"/v1/close/periods"'],
    service: "financial-close-svc",
    registers: [/r\.Route\("\/v1\/close\/periods"/, /r\.Get\("\/", h\.ListFiscalPeriods\)/, /"legal_entity_id is required"/],
  },
  {
    name: "general-ledger-svc GET /v1/journals",
    client: ["lib/api/general-ledger.ts", '"/v1/journals"'],
    service: "general-ledger-svc",
    registers: [/r\.Route\("\/v1\/journals"/, /r\.Get\("\/", h\.ListJournals\)/],
  },
  {
    name: "treasury-svc GET /v1/treasury/positions (legal_entity_id required)",
    client: ["lib/api/finance.ts", "/v1/treasury/positions?"],
    service: "treasury-svc",
    registers: [/r\.Route\("\/v1\/treasury"/, /r\.Get\("\/positions", h\.GetCashPositions\)/, /"legal_entity_id is required"/],
  },
  {
    name: "accounts-receivable-svc GET /v1/invoices",
    client: ["lib/api/accounts-receivable.ts", '"/v1/invoices/"'],
    service: "accounts-receivable-svc",
    registers: [/r\.Route\("\/v1\/invoices"/, /r\.Get\("\/", h\.ListInvoices\)/],
  },
  {
    name: "accounts-payable-svc GET /v1/invoices",
    client: ["lib/api/accounts-payable.ts", '"/v1/invoices"'],
    service: "accounts-payable-svc",
    registers: [/r\.Route\("\/v1\/invoices"/, /r\.Get\("\/", h\.ListInvoices\)/],
  },
  {
    name: "bank-reconciliation-svc GET /v1/statement-lines",
    client: ["lib/api/bank-reconciliation.ts", '"/v1/statement-lines"'],
    service: "bank-reconciliation-svc",
    registers: [/r\.Route\("\/v1\/statement-lines"/, /r\.Get\("\/", h\.ListStatementLines\)/],
  },
  {
    name: "intercompany-accounting-svc GET /v1/intercompany/entries",
    client: ["lib/api/intercompany.ts", "/v1/intercompany/entries"],
    service: "intercompany-accounting-svc",
    registers: [/r\.Route\("\/v1\/intercompany\/entries"/, /r\.Get\("\/", h\.ListEntries\)/],
  },
  {
    name: "audit-event-store-svc GET /v1/events and POST /v1/events/verify",
    client: ["lib/api/audit-events.ts", '"/v1/events/verify"'],
    service: "audit-event-store-svc",
    registers: [
      /r\.Get\("\/v1\/events", h\.listEvents\)/,
      /r\.Post\("\/v1\/events\/verify", h\.verifyEventsChain\)/,
      /json:"events"/,
      /json:"hash_chain_valid"/,
      /json:"verified"/,
    ],
  },
];

function serviceSource(service) {
  const dir = path.join(BACKEND, "services", service, "internal");
  let src = "";
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".go") && !e.name.endsWith("_test.go")) src += fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return src;
}

for (const u of UPSTREAM) {
  test(`client and service agree: ${u.name}`, { skip: HAS_BACKEND ? false : `no backend checkout at ${BACKEND}` }, () => {
    assert.ok(read(u.client[0]).includes(u.client[1]), `${u.client[0]} does not call ${u.client[1]}`);
    const src = serviceSource(u.service);
    for (const re of u.registers) assert.match(src, re, `${u.service}: ${re}`);
  });
}

test(
  "ai-governance-svc still has no AI-run list (why /ai-governance/runs is illustrative)",
  { skip: HAS_BACKEND ? false : `no backend checkout at ${BACKEND}` },
  () => {
    const src = serviceSource("ai-governance-svc");
    const block = src.slice(src.indexOf('r.Route("/v1/ai-runs"'), src.indexOf('r.Route("/v1/action-risk-classifications"'));
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /r\.Get\("\/", /, "a run list now exists: wire /ai-governance/runs to it and drop the examples");
  },
);
