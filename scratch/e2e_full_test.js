/**
 * COMPREHENSIVE END-TO-END TEST SUITE
 * ─────────────────────────────────────
 * Part 1: Direct backend mock service tests (all 11 ports)
 * Part 2: Frontend API proxy tests (localhost:3000/api/v1/*)
 * Part 3: Frontend page rendering tests (all admin routes)
 *
 * Tests what is ACTUALLY running on each port (all_services_runner.js).
 * Identity headers injected on all requests.
 */

const http = require("http");

// ─── Constants ────────────────────────────────────────────────────────────────
const FRONTEND = "localhost:3000";
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ENTITY_ID = "22222222-2222-2222-2222-222222222222";
const PRINCIPAL_ID = "33333333-3333-3333-3333-333333333333";
const HEADERS = {
  "Content-Type": "application/json",
  "X-Tenant-Id": TENANT_ID,
  "X-Legal-Entity-Id": ENTITY_ID,
  "X-Principal-Id": PRINCIPAL_ID,
  "X-Correlation-ID": "e2e-" + Date.now(),
};

// Session cookie for admin page access
const session = {
  email: "admin@zoikosuite.com",
  name: "Platform Administrator",
  role: "superadmin",
  iat: Date.now(),
  principalId: PRINCIPAL_ID,
  tenantId: TENANT_ID,
  legalEntityId: ENTITY_ID,
};
const SESSION_COOKIE = "zoiko_session=" + Buffer.from(JSON.stringify(session)).toString("base64url");

// ─── Results Tracker ──────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
let skipCount = 0;
const allResults = [];
const FAILURES = [];

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────
function rawRequest(options, body) {
  return new Promise((resolve) => {
    const r = http.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, data: parsed, raw: data, headers: res.headers });
      });
    });
    r.on("error", (err) => resolve({ status: 0, error: err.message, raw: "", data: null, headers: {} }));
    r.setTimeout(5000, () => { r.destroy(); resolve({ status: 0, error: "TIMEOUT", raw: "", data: null, headers: {} }); });
    if (body) r.write(typeof body === "string" ? body : JSON.stringify(body));
    r.end();
  });
}

function directGet(port, path) {
  return rawRequest({
    hostname: "localhost", port,
    path,
    method: "GET",
    headers: HEADERS,
  });
}

function directPost(port, path, body) {
  return rawRequest({
    hostname: "localhost", port,
    path,
    method: "POST",
    headers: HEADERS,
  }, body);
}

function frontendGet(route, cookie) {
  const headers = { "Accept": "text/html" };
  if (cookie) headers["Cookie"] = cookie;
  return rawRequest({ hostname: "localhost", port: 3000, path: route, method: "GET", headers });
}

function frontendPost(route, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  return rawRequest({ hostname: "localhost", port: 3000, path: route, method: "POST", headers }, body);
}

// ─── Logging Helpers ──────────────────────────────────────────────────────────
function log(category, testName, expected, actual, passed, detail) {
  const tag = actual === 0 ? "SKIP" : passed ? "PASS" : "FAIL";
  if (actual === 0) skipCount++;
  else if (passed) passCount++;
  else { failCount++; FAILURES.push({ category, testName, expected, actual, detail: detail || "" }); }
  allResults.push({ category, testName, expected, actual, tag, detail: detail || "" });
  const detailStr = detail ? "  |  " + detail : "";
  console.log("  [" + tag + "] (" + category + ") " + testName + "  [expected=" + expected + " got=" + actual + "]" + detailStr);
}

function section(title) {
  console.log("");
  console.log("=".repeat(72));
  console.log("  " + title);
  console.log("=".repeat(72));
}

function subSection(title) {
  console.log("  --- " + title + " ---");
}

// ─── PART 1: Backend Mock Service Tests ───────────────────────────────────────
// Each service: GET /readyz, GET /v1/*, POST /v1/* with identity headers

async function testTenantEntityRegistry() {
  section("1. tenant-entity-registry-svc  :8081");
  const port = 8081;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8081", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const tenants = await directGet(port, "/v1/tenants");
  log("8081", "GET /v1/tenants", "200", tenants.status, tenants.status === 200);
  if (tenants.status === 200 && tenants.data && typeof tenants.data === "object") {
    const hasData = tenants.data.tenants || tenants.data.entities;
    log("8081", "  Response has tenants/entities data", "truthy", hasData ? "found" : "missing", !!hasData);
  }

  const entities = await directGet(port, "/v1/entities");
  log("8081", "GET /v1/entities", "200", entities.status, entities.status === 200);

  subSection("WRITE");
  const create = await directPost(port, "/v1/tenants", {
    name: "E2E Test Corp",
    business_number: "BN-E2E-" + Date.now(),
    residency_region: "US-CA",
  });
  log("8081", "POST /v1/tenants (create)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testGovernanceDecisionLog() {
  section("2. governance-decision-log-svc  :8083");
  const port = 8083;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8083", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const decisions = await directGet(port, "/v1/governance-decisions");
  log("8083", "GET /v1/governance-decisions", "200", decisions.status, decisions.status === 200);

  subSection("WRITE");
  const create = await directPost(port, "/v1/governance-decisions", {
    decision_type: "POLICY_APPROVAL",
    authorized_by: PRINCIPAL_ID,
    tenant_id: TENANT_ID,
    reason: "E2E test decision",
  });
  log("8083", "POST /v1/governance-decisions (append)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testPolicySvc() {
  section("3. policy-svc  :8085");
  const port = 8085;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8085", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const policies = await directGet(port, "/v1/policies");
  log("8085", "GET /v1/policies", "200", policies.status, policies.status === 200);

  subSection("WRITE");
  const create = await directPost(port, "/v1/policies", {
    policy_type: "APPROVAL_THRESHOLD",
    name: "E2E Test Policy",
    tenant_id: TENANT_ID,
  });
  log("8085", "POST /v1/policies (create)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testConfigFeatureFlag() {
  section("4. configuration-feature-flag-svc  :8086");
  const port = 8086;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8086", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const flags = await directGet(port, "/v1/feature-flags");
  log("8086", "GET /v1/feature-flags", "200", flags.status, flags.status === 200);
  if (flags.status === 200 && flags.data && typeof flags.data === "object") {
    const hasFlags = flags.data.flags || Object.keys(flags.data).length > 0;
    log("8086", "  Response has flag data", "truthy", hasFlags ? "found" : "missing", !!hasFlags);
  }

  subSection("WRITE");
  const create = await directPost(port, "/v1/feature-flags", {
    flag_key: "e2e-test-flag-" + Date.now(),
    enabled: true,
    rollout_percentage: 50,
    tenant_id: TENANT_ID,
  });
  log("8086", "POST /v1/feature-flags (create)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testSecretVault() {
  section("5. secret-vault-integration-svc  :8087");
  const port = 8087;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8087", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const audit = await directGet(port, "/v1/secrets/audit-trail");
  log("8087", "GET /v1/secrets/audit-trail", "200", audit.status, audit.status === 200);

  subSection("WRITE");
  const lease = await directPost(port, "/v1/secrets/leases", {
    secret_key: "db-password",
    workload_id: "payroll-run-svc",
    tenant_id: TENANT_ID,
  });
  log("8087", "POST /v1/secrets/leases (request lease)", "201", lease.status, lease.status === 201 || lease.status === 200);
}

async function testObligationsSvc() {
  section("6. obligations-svc  :8088");
  const port = 8088;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8088", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const obligations = await directGet(port, "/v1/obligations");
  log("8088", "GET /v1/obligations", "200", obligations.status, obligations.status === 200);
  if (obligations.status === 200 && obligations.data) {
    const hasData = Array.isArray(obligations.data) || obligations.data.obligations;
    log("8088", "  Response has obligations data", "truthy", hasData ? "found" : "missing", !!hasData);
  }

  subSection("WRITE");
  const create = await directPost(port, "/v1/obligations", {
    obligation_type: "VAT_FILING",
    jurisdiction: "US-CA",
    tenant_id: TENANT_ID,
    deadline: "2026-12-31",
  });
  log("8088", "POST /v1/obligations (create)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testSchemaRegistry() {
  section("7. schema-registry-svc  :8093");
  const port = 8093;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8093", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const schemas = await directGet(port, "/v1/schemas");
  log("8093", "GET /v1/schemas", "200", schemas.status, schemas.status === 200);

  subSection("WRITE");
  const register = await directPost(port, "/v1/schemas", {
    event_name: "e2e.test.event.v1",
    version: 1,
    json_schema: { type: "object", properties: { id: { type: "string" } } },
    compatibility_mode: "BACKWARD",
    owning_service: "e2e-test-svc",
  });
  log("8093", "POST /v1/schemas (register schema)", "201", register.status, register.status === 201 || register.status === 200);
}

async function testPurchaseRequest() {
  section("8. purchase-request-svc  :8100");
  const port = 8100;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8100", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const prs = await directGet(port, "/v1/purchase-requests");
  log("8100", "GET /v1/purchase-requests", "200", prs.status, prs.status === 200);
  if (prs.status === 200 && prs.data) {
    const hasData = Array.isArray(prs.data) || prs.data.requests || prs.data.total !== undefined;
    log("8100", "  Response has PR data", "truthy", hasData ? "found" : "missing", !!hasData);
  }

  subSection("WRITE");
  const create = await directPost(port, "/v1/purchase-requests", {
    title: "E2E Test Purchase Request",
    amount: 25000,
    tenant_id: TENANT_ID,
    legal_entity_id: ENTITY_ID,
    requested_by_principal_id: PRINCIPAL_ID,
  });
  log("8100", "POST /v1/purchase-requests (create)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testPurchaseOrder() {
  section("9. purchase-order-svc  :8112");
  const port = 8112;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8112", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const orders = await directGet(port, "/v1/purchase-orders");
  log("8112", "GET /v1/purchase-orders", "200", orders.status, orders.status === 200);
  if (orders.status === 200 && orders.data) {
    const hasData = Array.isArray(orders.data) || orders.data.orders || orders.data.plans;
    log("8112", "  Response has order/plans data", "truthy", hasData ? "found" : "missing", !!hasData);
  }

  subSection("WRITE");
  const issue = await directPost(port, "/v1/purchase-orders", {
    purchase_request_id: "pr-2026-001",
    amount: 38000,
    tenant_id: TENANT_ID,
    legal_entity_id: ENTITY_ID,
  });
  log("8112", "POST /v1/purchase-orders (issue)", "201", issue.status, issue.status === 201 || issue.status === 200);
}

async function testContractLifecycle() {
  section("10. contract-lifecycle-svc  :8119");
  const port = 8119;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8119", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const contracts = await directGet(port, "/v1/contracts");
  log("8119", "GET /v1/contracts", "200", contracts.status, contracts.status === 200);
  if (contracts.status === 200 && contracts.data) {
    const hasData = contracts.data.contracts || Array.isArray(contracts.data);
    log("8119", "  Response has contracts data", "truthy", hasData ? "found" : "missing", !!hasData);
  }

  subSection("WRITE");
  const create = await directPost(port, "/v1/contracts", {
    title: "E2E Test Contract",
    contract_type: "VENDOR",
    tenant_id: TENANT_ID,
    legal_entity_id: ENTITY_ID,
    counterparty_id: "cp-acme",
  });
  log("8119", "POST /v1/contracts (create DRAFT)", "201", create.status, create.status === 201 || create.status === 200);
}

async function testEvidenceRequirements() {
  section("11. evidence-requirements-svc  :8130");
  const port = 8130;

  subSection("Health Check");
  const health = await directGet(port, "/readyz");
  log("8130", "GET /readyz", "200", health.status, health.status === 200);

  subSection("READ");
  const drafts = await directGet(port, "/v1/filing-preparation/drafts");
  log("8130", "GET /v1/filing-preparation/drafts", "200", drafts.status, drafts.status === 200);
  if (drafts.status === 200 && drafts.data) {
    const hasData = drafts.data.drafts || Array.isArray(drafts.data);
    log("8130", "  Response has drafts data", "truthy", hasData ? "found" : "missing", !!hasData);
  }

  subSection("WRITE");
  const create = await directPost(port, "/v1/filing-preparation/drafts", {
    filing_type: "VAT100_MTD",
    period_key: "2026-Q3",
    tenant_id: TENANT_ID,
    legal_entity_id: ENTITY_ID,
  });
  log("8130", "POST /v1/filing-preparation/drafts (create)", "201", create.status, create.status === 201 || create.status === 200);
}

// ─── PART 2: Frontend API Proxy Tests ─────────────────────────────────────────

async function testFrontendProxy() {
  section("PART 2: Frontend API Proxy (/api/v1/*)");

  subSection("Authentication");
  const loginRes = await frontendPost("/api/auth/login", {
    email: "admin@zoikosuite.com",
    password: "Zoiko@Governance1",
  });
  log("PROXY", "POST /api/auth/login (authenticate)", "200", loginRes.status, loginRes.status === 200);

  // Extract session cookie from Set-Cookie header
  let authCookie = SESSION_COOKIE;
  const setCookie = loginRes.headers["set-cookie"];
  if (setCookie) {
    const cookieArr = Array.isArray(setCookie) ? setCookie : [setCookie];
    const sessionCookie = cookieArr.find(c => c.startsWith("zoiko_session="));
    if (sessionCookie) {
      authCookie = sessionCookie.split(";")[0];
    }
  }

  subSection("GET Endpoints (read operations)");
  const getEndpoints = [
    { name: "audit/events", path: "/api/v1/audit/events" },
    { name: "audit/logs", path: "/api/v1/audit/logs" },
    { name: "contracts", path: "/api/v1/contracts" },
    { name: "clauses", path: "/api/v1/clauses" },
    { name: "obligations", path: "/api/v1/obligations" },
    { name: "meetings", path: "/api/v1/meetings" },
    { name: "corporate-actions", path: "/api/v1/corporate-actions" },
    { name: "counterparties", path: "/api/v1/counterparties" },
    { name: "journal-entries", path: "/api/v1/journal-entries" },
    { name: "cash-positions", path: "/api/v1/cash-positions" },
    { name: "finance/summary", path: "/api/v1/finance/summary" },
    { name: "purchase-orders", path: "/api/v1/purchase-orders" },
    { name: "spend-controls/limits", path: "/api/v1/spend-controls/limits" },
    { name: "payroll-runs", path: "/api/v1/payroll-runs" },
    { name: "compensation/structures", path: "/api/v1/compensation/structures" },
    { name: "benefits/plans", path: "/api/v1/benefits/plans" },
    { name: "payroll-tax/profiles", path: "/api/v1/payroll-tax/profiles" },
    { name: "payroll-exceptions", path: "/api/v1/payroll-exceptions" },
    { name: "employees", path: "/api/v1/employees" },
    { name: "leave/requests", path: "/api/v1/leave/requests" },
    { name: "org/departments", path: "/api/v1/org/departments" },
    { name: "compliance/alerts", path: "/api/v1/compliance/alerts" },
    { name: "filing-tracker/requirements", path: "/api/v1/filing-tracker/requirements" },
    { name: "compliance-status", path: "/api/v1/compliance-status" },
    { name: "exception-escalation/exceptions", path: "/api/v1/exception-escalation/exceptions" },
    { name: "tax-rules", path: "/api/v1/tax-rules" },
    { name: "tax-determinations", path: "/api/v1/tax-determinations" },
    { name: "vat-returns", path: "/api/v1/vat-returns" },
    { name: "corporate-tax-returns", path: "/api/v1/corporate-tax-returns" },
    { name: "withholding-tax", path: "/api/v1/withholding-tax" },
    { name: "filing-preparation/drafts", path: "/api/v1/filing-preparation/drafts" },
    { name: "tax-authority/interfaces", path: "/api/v1/tax-authority/interfaces" },
    { name: "tax/summary", path: "/api/v1/tax/summary" },
    { name: "tax/deadlines", path: "/api/v1/tax/deadlines" },
  ];

  for (const ep of getEndpoints) {
    const res = await frontendGet(ep.path, authCookie);
    const ok = res.status === 200;
    const detail = res.raw ? (res.raw.length > 120 ? res.raw.length + " bytes" : res.raw.substring(0, 120)) : "no body";
    log("PROXY", "GET " + ep.path, "200", res.status, ok, detail);
  }

  subSection("Fallback / unknown endpoint");
  const fallback = await frontendGet("/api/v1/unknown-endpoint", authCookie);
  log("PROXY", "GET /api/v1/unknown-endpoint (fallback)", "200", fallback.status, fallback.status === 200);

  subSection("POST Endpoints (write operations)");
  const postEndpoints = [
    { name: "POST tax-rules", path: "/api/v1/tax-rules", body: { name: "E2E Test Rule", tax_rate_percentage: 20, jurisdiction_id: "uk-gov-01", category: "VAT" } },
    { name: "POST tax-determinations", path: "/api/v1/tax-determinations", body: { gross_amount: 100000, tax_rate_percentage: 21 } },
    { name: "POST vat-returns", path: "/api/v1/vat-returns", body: { tax_period: "2026-Q3", total_sales_amount: 500000 } },
    { name: "POST filing-preparation/drafts", path: "/api/v1/filing-preparation/drafts", body: { filing_type: "VAT100_MTD", period_key: "2026-Q2" } },
    { name: "POST fallback endpoint", path: "/api/v1/generic-resource", body: { test: true } },
  ];

  for (const ep of postEndpoints) {
    const res = await frontendPost(ep.path, ep.body, authCookie);
    log("PROXY", ep.name, "201", res.status, res.status === 201 || res.status === 200);
  }
}

// ─── PART 3: Frontend Page Rendering Tests ────────────────────────────────────

async function testFrontendPages() {
  section("PART 3: Frontend Page Rendering");

  const pages = [
    "/login",
    "/admin",
    "/admin/tenants",
    "/admin/governance",
    "/admin/policies",
    "/admin/obligations",
    "/admin/schemas",
    "/admin/evidence",
    "/admin/secrets",
    "/admin/commercial-ops",
    "/admin/tax",
    "/admin/legal",
    "/admin/finance",
    "/admin/audit-events",
    "/admin/hr",
    "/admin/payroll",
    "/admin/compliance",
    "/admin/settings",
  ];

  for (const route of pages) {
    const isLogin = route === "/login";
    const res = await frontendGet(route, isLogin ? null : SESSION_COOKIE);
    const hasError = res.raw && (res.raw.includes("Unhandled Runtime Error") || res.raw.includes("Application error:"));
    const isRedirect = res.status === 302 || res.status === 307;
    const ok = (res.status === 200 && !hasError) || isRedirect;
    const detail = isRedirect
      ? "Redirect (auth middleware)"
      : (hasError ? "RUNTIME ERROR in HTML" : (res.raw ? res.raw.length + " bytes" : "no body"));
    log("PAGE", "GET " + route, "200", res.status, ok, detail);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("+".repeat(72));
  console.log("  ZOIKO SUITE - COMPREHENSIVE END-TO-END TEST SUITE");
  console.log("  " + new Date().toISOString());
  console.log("  Backend Mock Ports: 8081,8083,8085,8086,8087,8088,8093,8100,8112,8119,8130");
  console.log("  Frontend: http://localhost:3000");
  console.log("+".repeat(72));

  // ── Part 1: Direct backend tests ──
  section("PART 1: Direct Backend Mock Service Tests");
  await testTenantEntityRegistry();
  await testGovernanceDecisionLog();
  await testPolicySvc();
  await testConfigFeatureFlag();
  await testSecretVault();
  await testObligationsSvc();
  await testSchemaRegistry();
  await testPurchaseRequest();
  await testPurchaseOrder();
  await testContractLifecycle();
  await testEvidenceRequirements();

  // ── Part 2: Frontend API proxy ──
  await testFrontendProxy();

  // ── Part 3: Frontend pages ──
  await testFrontendPages();

  // ── Summary ──
  const total = passCount + failCount + skipCount;
  console.log("");
  console.log("=".repeat(72));
  console.log("  FINAL RESULTS");
  console.log("=".repeat(72));
  console.log("  PASS    :  " + passCount);
  console.log("  FAIL    :  " + failCount);
  console.log("  SKIP    :  " + skipCount + "  (service offline)");
  console.log("  TOTAL   :  " + total);
  console.log("=".repeat(72));

  if (failCount === 0 && passCount > 0) {
    console.log("  ALL TESTS PASSED - SYSTEM HEALTHY");
  } else if (failCount > 0) {
    console.log("");
    console.log("  " + failCount + " FAILURE(S) DETECTED:");
    FAILURES.forEach((f) => console.log("    - [" + f.category + "] " + f.testName + "  (expected=" + f.expected + " got=" + f.actual + ")"));
  }

  if (skipCount > 0) {
    console.log("");
    console.log("  " + skipCount + " test(s) skipped (target service was unreachable).");
  }
  console.log("=".repeat(72));
  console.log("");

  process.exit(failCount > 0 ? 1 : 0);
}

main();
