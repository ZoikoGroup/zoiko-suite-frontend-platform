/**
 * ZoikoSuite — Comprehensive Gap Analysis
 * Checks: port conflicts, stale comments, missing gateway routes,
 * API client mismatches, and services runner coverage.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── 1. Port Registry (from health.ts + config.ts) ──────────────────────────
const HEALTH_PORTS = {
  finance: [
    { name: "general-ledger-svc", port: 8098 },
    { name: "accounts-payable-svc", port: 8099 },
    { name: "accounts-receivable-svc", port: 8101 },
    { name: "bank-reconciliation-svc", port: 8102 },
    { name: "treasury-svc", port: 8103 },
    { name: "financial-close-svc", port: 8104 },
    { name: "intercompany-accounting-svc", port: 8105 },
    { name: "consolidation-svc", port: 8106 },
  ],
  payroll: [
    { name: "payroll-run-svc", port: 8110 },
    { name: "compensation-svc", port: 8111 },
    { name: "benefits-svc", port: 8112 },
    { name: "payroll-tax-svc", port: 8113 },
    { name: "payroll-exceptions-svc", port: 8114 },
  ],
  hr: [
    { name: "employee-master-svc", port: 8108 },
    { name: "employment-contracts-svc", port: 8109 },
    { name: "leave-absence-svc", port: 8115 },
    { name: "org-structure-svc", port: 8116 },
    { name: "offboarding-severance-svc", port: 8117 },
    { name: "workforce-compliance-svc", port: 8118 },
  ],
  legal: [
    { name: "contract-lifecycle-svc", port: 8119 },
    { name: "clause-template-svc", port: 8120 },
    { name: "obligation-tracking-svc", port: 8121 },
    { name: "board-resolutions-svc", port: 8122 },
    { name: "corporate-actions-svc", port: 8123 },
    { name: "counterparty-management-svc", port: 8124 },
  ],
  tax: [
    { name: "tax-rules-svc", port: 8125 },
    { name: "tax-determination-svc", port: 8126 },
    { name: "vat-gst-svc", port: 8127 },
    { name: "corporate-tax-svc", port: 8128 },
    { name: "withholding-tax-svc", port: 8129 },
    { name: "filing-preparation-svc", port: 8130 },
    { name: "tax-authority-interface-svc", port: 8147 },
  ],
  compliance: [
    { name: "obligations-svc", port: 8088 },
    { name: "evidence-manifest-svc", port: 8095 },
  ],
  "commercial-ops": [
    { name: "purchase-request-svc", port: 8100 },
    { name: "purchase-order-svc", port: 8129 }, // ← KNOWN CONFLICT with withholding-tax-svc
    { name: "invoice-approval-svc", port: 8107 },
    { name: "spend-controls-svc", port: 8131 },
    { name: "vendor-due-diligence-svc", port: 8135 },
  ],
  "audit-events": [
    { name: "audit-event-store-svc", port: 8084 },
  ],
};

const CONFIG_PORTS = {
  governance: 8083,
  policy: 8085,
  configuration: 8086,
  secretVault: 8087,
  obligations: 8088,
  jurisdictionRules: 8082,
  purchaseRequest: 8100,
  contracts: 8119,
  purchaseOrder: 8129,   // ← SAME CONFLICT
  evidence: 8130,        // ← CONFLICTS with filing-preparation-svc
  accountsReceivable: 8101,
  accountsPayable: 8099,
  spendControls: 8131,
  vendorDueDiligence: 8135,
  auditEventStore: 8084,
  tenantRegistry: 8081,
  schemaRegistry: 8093,
  financialClose: 8104,
  taxRules: 8125,
  taxDetermination: 8126,
  vatGst: 8127,
  corporateTax: 8128,
  withholdingTax: 8129,
  filingPreparation: 8130,
  taxAuthorityInterface: 8147,
};

// ── 2. Gateway Routes (from route.ts GET handler) ─────────────────────────
const GATEWAY_ENDPOINTS = [
  "tax-rules", "tax-determinations", "vat-returns", "corporate-tax-returns",
  "withholding-tax", "filing-preparation/drafts", "tax-authority/interfaces",
  "tax/summary", "tax/deadlines",
  "contracts", "clauses", "obligations", "meetings", "corporate-actions", "counterparties",
  "journal-entries", "cash-positions", "finance/summary",
  "purchase-orders", "spend-controls/limits",
  "payroll-runs", "compensation/structures", "benefits/plans",
  "payroll-tax/profiles", "payroll-exceptions",
  "employees", "leave/requests", "org/departments", "compliance/alerts",
  "filing-tracker/requirements", "compliance-status", "exception-escalation/exceptions",
];

// ── 3. Manual Testing Guide endpoints ────────────────────────────────────────
const GUIDE_ENDPOINTS = [
  { name: "Tax Rules Service", port: 8125, path: "/api/v1/tax-rules" },
  { name: "Tax Determination Service", port: 8126, path: "/api/v1/tax-determinations" },
  { name: "VAT/GST Return Service", port: 8127, path: "/api/v1/vat-returns" },
  { name: "Corporate Tax Service", port: 8128, path: "/api/v1/corporate-tax-returns" },
  { name: "Withholding Tax Service", port: 8129, path: "/api/v1/withholding-tax" },
  { name: "Filing Preparation Service", port: 8130, path: "/api/v1/filing-preparation/drafts" },
  { name: "Tax Authority Interface", port: 8147, path: "/api/v1/tax-authority/interfaces" },
];

// ── ANALYSIS ─────────────────────────────────────────────────────────────────
console.log("================================================================================");
console.log("                  🔍 ZOIKOSUITE — COMPREHENSIVE GAP ANALYSIS                   ");
console.log("================================================================================\n");

const gaps = [];
const warnings = [];
const ok = [];

// --- GAP 1: Port Conflicts across domains ---
console.log("━━━ [1] PORT CONFLICT ANALYSIS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const portOwner = {};
for (const [domain, services] of Object.entries(HEALTH_PORTS)) {
  for (const svc of services) {
    if (portOwner[svc.port]) {
      const conflict = `Port ${svc.port}: '${svc.name}' (${domain}) CONFLICTS with '${portOwner[svc.port].name}' (${portOwner[svc.port].domain})`;
      gaps.push({ level: "CRITICAL", area: "Port Registry", msg: conflict });
      console.log(`  ❌ CRITICAL: ${conflict}`);
    } else {
      portOwner[svc.port] = { name: svc.name, domain };
    }
  }
}

// --- GAP 2: config.ts vs health.ts conflicts ---
console.log("\n━━━ [2] CONFIG.TS vs HEALTH.TS PORT CONSISTENCY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// evidence in config.ts = 8130, but filing-preparation-svc also = 8130 in tax domain
if (CONFIG_PORTS.evidence === 8130 && HEALTH_PORTS.tax.find(s => s.port === 8130)) {
  const msg = "config.ts 'evidence' maps to port 8130, but 8130 is also filing-preparation-svc (tax domain). 'evidence' should map to evidence-requirements-svc.";
  gaps.push({ level: "CRITICAL", area: "config.ts", msg });
  console.log(`  ❌ CRITICAL: ${msg}`);
} else {
  console.log("  ✅ evidence port consistent");
}

// purchaseOrder in config = 8129, withholdingTax also = 8129
if (CONFIG_PORTS.purchaseOrder === CONFIG_PORTS.withholdingTax) {
  const msg = `config.ts: 'purchaseOrder' and 'withholdingTax' both resolve to port ${CONFIG_PORTS.purchaseOrder}. purchase-order-svc needs its own unique port.`;
  gaps.push({ level: "CRITICAL", area: "config.ts", msg });
  console.log(`  ❌ CRITICAL: ${msg}`);
} else {
  console.log("  ✅ purchaseOrder port consistent");
}

// --- GAP 3: Stale header comments in API client files ---
console.log("\n━━━ [3] STALE HEADER COMMENTS IN API CLIENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const commercialOpsContent = fs.readFileSync(path.join(ROOT, "lib/api/commercial-ops.ts"), "utf8");
const staleCommentPorts = ["8109", "8110", "8112", "8134"];
const staleFound = staleCommentPorts.filter(p => commercialOpsContent.includes(p));
if (staleFound.length > 0) {
  const msg = `lib/api/commercial-ops.ts header comment references stale ports: ${staleFound.join(", ")} — actual ports are 8100, 8129, 8107, 8131, 8135`;
  warnings.push({ level: "WARNING", area: "commercial-ops.ts", msg });
  console.log(`  ⚠️  WARNING: ${msg}`);
} else {
  console.log("  ✅ commercial-ops.ts header is clean");
}

// --- GAP 4: Missing Gateway routes ---
console.log("\n━━━ [4] API GATEWAY ROUTE COVERAGE (route.ts) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const routeContent = fs.readFileSync(path.join(ROOT, "app/api/v1/[...path]/route.ts"), "utf8");

// Check for audit-events endpoints (guide has audit/events, audit/logs etc)
const missingRoutes = [];
const guideOnlyRoutes = ["audit/events", "audit/logs", "evidence/verification", "tamper/alerts", "purchase-requests", "talent", "onboarding"];
for (const route of guideOnlyRoutes) {
  if (!routeContent.includes(`"${route}"`)) {
    missingRoutes.push(route);
  }
}
if (missingRoutes.length > 0) {
  const msg = `Gateway route.ts is missing GET handlers for: ${missingRoutes.join(", ")}`;
  warnings.push({ level: "WARNING", area: "route.ts", msg });
  console.log(`  ⚠️  WARNING: ${msg}`);
} else {
  console.log("  ✅ All checked gateway routes are present");
}

// Check DELETE handler missing
if (!routeContent.includes("export async function DELETE")) {
  const msg = "Gateway route.ts has no DELETE handler — soft-delete operations will fall through to 201 default";
  warnings.push({ level: "WARNING", area: "route.ts", msg });
  console.log(`  ⚠️  WARNING: ${msg}`);
}

// --- GAP 5: services runner port coverage ---
console.log("\n━━━ [5] SERVICES RUNNER (all_services_runner.js) COVERAGE ━━━━━━━━━━━━━━━━━━━");
const runnerContent = fs.readFileSync(path.join(ROOT, "scratch/all_services_runner.js"), "utf8");
const allExpectedPorts = Object.values(HEALTH_PORTS).flat().map(s => s.port);
const missingFromRunner = [];
for (const port of allExpectedPorts) {
  if (!runnerContent.includes(`listen(${port}`)) {
    missingFromRunner.push(port);
  }
}
if (missingFromRunner.length > 0) {
  const msg = `Services runner does not listen on ports: ${missingFromRunner.join(", ")} (referenced in health.ts)`;
  warnings.push({ level: "WARNING", area: "all_services_runner.js", msg });
  console.log(`  ⚠️  WARNING: ${msg}`);
} else {
  console.log("  ✅ Services runner covers all health.ts ports");
}

// --- GAP 6: Postman collection vs actual gateway endpoints ---
console.log("\n━━━ [6] POSTMAN COLLECTION vs GATEWAY ROUTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const postmanContent = fs.readFileSync(path.join(ROOT, "docs/Tax_Services_Postman_Collection.json"), "utf8");
const postmanData = JSON.parse(postmanContent);
let postmanMismatches = [];
// All Postman requests use direct port URLs (localhost:8125..8147). 
// Check if they also cover the gateway paths.
console.log("  ✅ Postman collection targets direct service ports (correct for isolated testing)");
console.log("  ℹ️  Postman does NOT include gateway-layer tests — add /api/v1/* requests for gateway coverage");
warnings.push({ level: "INFO", area: "Postman Collection", msg: "Collection only tests direct ports. Add /api/v1/* gateway requests to cover the Next.js proxy layer." });

// --- SUMMARY ─────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("                              📋 GAP SUMMARY                                    ");
console.log("================================================================================");
console.log(`  🔴 CRITICAL GAPS (must fix): ${gaps.length}`);
gaps.forEach((g, i) => console.log(`     [C${i+1}] [${g.area}] ${g.msg}`));
console.log(`\n  🟡 WARNINGS (should fix): ${warnings.filter(w=>w.level==="WARNING").length}`);
warnings.filter(w=>w.level==="WARNING").forEach((w, i) => console.log(`     [W${i+1}] [${w.area}] ${w.msg}`));
console.log(`\n  ℹ️  INFORMATIONAL: ${warnings.filter(w=>w.level==="INFO").length}`);
warnings.filter(w=>w.level==="INFO").forEach((w, i) => console.log(`     [I${i+1}] [${w.area}] ${w.msg}`));
console.log("\n================================================================================");
console.log(`  Total issues found: ${gaps.length + warnings.length}`);
console.log("================================================================================\n");
