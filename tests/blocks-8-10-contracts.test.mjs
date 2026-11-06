// Contract guard for the Blocks 8-10 console clients (Intelligence & Reporting,
// Security & Trust, Integration & Extensibility) and the tax clients.
//
// Run: npm test
//
// 1. Static: the clients call the services' own /v1 routes with the caller's
//    identity as headers, the proxy reports failures instead of answering [],
//    and no sample data or hardcoded tenant is shown as live.
// 2. Backend: each client route is registered by its service. Read from the
//    backend source (ZOIKO_BACKEND_DIR, default ../zoiko-suite-backend);
//    skipped, not passed, when that checkout does not have the services.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKEND = path.resolve(process.env.ZOIKO_BACKEND_DIR ?? path.join(ROOT, "..", "zoiko-suite-backend"));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ROUTE = read("app/api/v1/[...path]/route.ts");
const CLIENTS = ["lib/api/intelligence.ts", "lib/api/security-trust.ts", "lib/api/integration.ts"];

const PANEL_DIRS = ["components/admin/intelligence", "components/admin/security-trust", "components/admin/integration"];
const panelFiles = () =>
  PANEL_DIRS.flatMap((d) =>
    fs
      .readdirSync(path.join(ROOT, d))
      .filter((f) => f.endsWith(".tsx") && f !== "AIGovernancePanel.tsx")
      .map((f) => path.join(d, f)),
  );

/** The source of every proxy branch for these domains. */
function domainBranches(prefix) {
  return [...ROUTE.matchAll(new RegExp(`if \\(endpoint === "${prefix}[^"]*"\\) \\{[\\s\\S]*?\\n  \\}`, "g"))].map((m) => m[0]);
}

test("the clients call /v1 service routes, never the old /api/v1 paths", () => {
  for (const f of CLIENTS) {
    assert.doesNotMatch(read(f), /apiGet[^(]*\(\s*"\w+",\s*"\/api\/v1\//, `${f} calls an /api/v1 path on a service`);
  }
});

test("tenant is sent as a header only: no tenant_id query or body in the clients", () => {
  for (const f of CLIENTS) {
    const src = read(f);
    assert.doesNotMatch(src, /query:\s*\{\s*tenant_id/, `${f} sends tenant_id as a query parameter`);
    assert.doesNotMatch(src, /tenant_id:\s*tenantId/, `${f} sends a body tenant_id`);
    // Every service call carries the caller's identity.
    const calls = [...src.matchAll(/api(Get|Post)<[^(]*?>\(\s*"[a-zA-Z]+",[\s\S]*?\);/g)].map((m) => m[0]);
    assert.ok(calls.length > 0, `${f} has no service calls`);
    for (const c of calls) assert.match(c, /identity/, `${f}: a call without identity: ${c.slice(0, 80)}`);
  }
});

test("every write carries X-Purpose-Context (the services' envelope requires it on writes)", () => {
  // Without it key-management-svc and hris-connector-svc answer
  // 400 envelope_incomplete: purpose_context (seen live on the zv stack).
  for (const f of ["lib/api/security-trust.ts", "lib/api/integration.ts"]) {
    const posts = [...read(f).matchAll(/apiPost<[^(]*?>\(\s*"[a-zA-Z]+",[\s\S]*?\);/g)].map((m) => m[0]);
    for (const p of posts) assert.match(p, /purposeContext: "[a-z.]+"/, `${f}: a write without purposeContext: ${p.slice(0, 90)}`);
  }
});

test("Blocks 8-10 proxy handlers report failures and use no hardcoded tenant", () => {
  const branches = ["intelligence/", "security/", "integration/"].flatMap(domainBranches);
  assert.ok(branches.length >= 16, `expected the Blocks 8-10 handlers, found ${branches.length}`);
  for (const b of branches) {
    assert.doesNotMatch(b, /res\.ok \? res\.data/, `turns a failure into an empty list:\n${b.slice(0, 120)}`);
    assert.doesNotMatch(b, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, `hardcoded id:\n${b.slice(0, 120)}`);
  }
  // The write mappings for these domains too.
  for (const re of [/rotateMatch\) \{[\s\S]*?\n  \}/, /"security\/assessments\/evaluate"\) \{[\s\S]*?\n  \}/, /hrisSyncMatch\) \{[\s\S]*?\n  \}/]) {
    const m = ROUTE.match(re);
    assert.ok(m, `missing mapping ${re}`);
    assert.doesNotMatch(m[0], /11111111-|tenantId \?\?/);
  }
});

test("carta evaluation uses the session's legal entity, not one from the body", () => {
  const b = ROUTE.match(/"security\/assessments\/evaluate"\) \{[\s\S]*?\n  \}/)[0];
  assert.match(b, /legal_entity_id: identity\.legalEntityId/);
});

test("no sample data or invented figures in the tax client or the Blocks 8-10 panels", () => {
  const tax = read("lib/api/tax.ts");
  assert.doesNotMatch(tax, /ENABLE_MOCK_FALLBACK|FALLBACK_(RULES|INTERFACES|DRAFTS)|getFallbackForService/);
  assert.doesNotMatch(tax, /11111111-1111-1111-1111-111111111111/);
  for (const f of panelFiles()) {
    const src = read(f);
    assert.doesNotMatch(src, /MOCK_|simAssessment|mockScore/, `${f} has sample data`);
    assert.doesNotMatch(src, /\(:8\d{3}\)|svc :8\d{3}|port: ":?8\d{3}"/, `${f} shows a hardcoded port`);
    assert.doesNotMatch(src, /\|\| (6|8|12|24)\b|"(6 Active|4 Connected|3 Systems|8 Envelopes)"/, `${f} has a stand-in figure`);
    assert.doesNotMatch(src, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, `${f} has a hardcoded id`);
  }
});

test("Blocks 8-10 panels read through fetchPanelList and so show failures", () => {
  // A panel that calls fetch() directly (SIEM needs exporter counts; actions
  // read their result) must check the response status itself.
  const direct = panelFiles().filter((f) => /fetch\(\s*[`"]\/api\/v1\/(intelligence|security|integration)\//.test(read(f)));
  for (const f of direct) assert.match(read(f), /res\.ok/, `${f} fetches without checking the status`);
  for (const f of panelFiles().filter((f) => /Panel\.tsx$/.test(f))) {
    const src = read(f);
    if (/\/api\/v1\//.test(src)) assert.match(src, /fetchPanelList|res\.ok/, `${f} has no failure handling`);
  }
});

// ── Backend routes, read from the service source ─────────────────────────────

/** client path -> service and the router registrations that serve it. */
const UPSTREAM = [
  ["intelligence.ts", "/v1/anomalies", "anomaly-detection-svc", [/"\/v1\/anomalies"/]],
  ["intelligence.ts", "/v1/forecasts", "forecasting-svc", [/"\/v1\/forecasts"/]],
  ["intelligence.ts", "/v1/risk-scores", "compliance-risk-scoring-svc", [/"\/v1\/risk-scores"/]],
  ["intelligence.ts", "/v1/reconciliations", "reconciliation-intelligence-svc", [/"\/v1\/reconciliations"/]],
  ["intelligence.ts", "/v1/reports/definitions", "reporting-orchestration-svc", [/"\/v1\/reports"/, /"\/definitions"/]],
  ["intelligence.ts", "/v1/recommendations", "decision-support-svc", [/"\/v1\/recommendations"/]],
  ["intelligence.ts", "/v1/migrations/", "migration-integrity-svc", [/"\/v1\/migrations"/]],
  ["security-trust.ts", "/v1/mtls/certificates", "mtls-management-svc", [/"\/v1\/mtls"/, /"\/certificates"/]],
  ["security-trust.ts", "/v1/siem/events", "siem-integration-svc", [/"\/v1\/siem"/, /"\/events"/, /exporter_id/]],
  ["security-trust.ts", "/v1/siem/exporters", "siem-integration-svc", [/"\/exporters"/]],
  ["security-trust.ts", "/v1/carta/assessments", "carta-svc", [/"\/v1\/carta"/, /"\/assessments"/]],
  ["security-trust.ts", "/v1/keys", "key-management-svc", [/"\/v1\/keys"/, /"\/\{id\}\/rotate"/]],
  ["integration.ts", "/v1/bridges", "connectivity-api-bridge-svc", [/"\/v1\/bridges"/]],
  ["integration.ts", "/v1/banking/connections", "banking-connector-svc", [/"\/v1\/banking\/connections"/]],
  ["integration.ts", "/v1/hris/integrations", "hris-connector-svc", [/"\/v1\/hris"/, /"\/integrations"/]],
  ["integration.ts", "/v1/hris/sync", "hris-connector-svc", [/Post\("\/sync"/]],
  ["integration.ts", "/v1/esignature/envelopes", "esignature-integration-svc", [/Get\("\/v1\/esignature\/envelopes"/]],
  ["integration.ts", "/v1/external-data-feeds/subscriptions", "external-data-feed-svc", [/"\/v1\/external-data-feeds"/, /"\/subscriptions"/]],
];

function serviceSource(service) {
  const dir = path.join(BACKEND, "services", service, "internal");
  if (!fs.existsSync(dir)) return null;
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

const HAS_BLOCKS_8_10 = serviceSource("carta-svc")?.includes('"/assessments"') ?? false;

for (const [client, route, service, registers] of UPSTREAM) {
  test(
    `client and service agree: ${service} ${route}`,
    { skip: HAS_BLOCKS_8_10 ? false : `no Blocks 8-10 backend checkout at ${BACKEND}` },
    () => {
      assert.ok(read(`lib/api/${client}`).includes(`"${route}"`), `${client} does not call ${route}`);
      const src = serviceSource(service);
      assert.ok(src, `${service} not found`);
      for (const re of registers) assert.match(src, re, `${service}: ${re}`);
    },
  );
}
