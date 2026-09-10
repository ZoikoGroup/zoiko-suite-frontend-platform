/**
 * ═══════════════════════════════════════════════════════════════
 *  Zoiko Suite — Manual E2E Test Runner (37 Microservices)
 *  Author: vasudevareddy-zoiko
 *  Run:  node scratch/run_e2e_manual_test.js
 *  Pre:  npm run dev must be running on localhost:3000
 * ═══════════════════════════════════════════════════════════════
 */

const http = require("http");

const TENANT_ID   = "11111111-1111-1111-1111-111111111111";
const PRINCIPAL_ID = "33333333-3333-3333-3333-333333333333";
const ENTITY_ID   = "22222222-2222-2222-2222-222222222222";
const BASE_PORT   = 3000;

// ─── All 37 completed E2E services ─────────────────────────────
const SERVICES = [
  // ── Tax Governance (7) ─────────────────────────────────────
  { id:  1, domain: "Tax Governance",    name: "Tax Rules Engine",              port: 8125, gateway: "tax-rules",                     field: "tax_rules" },
  { id:  2, domain: "Tax Governance",    name: "Tax Determination Service",     port: 8126, gateway: "tax-determinations",            field: "determinations" },
  { id:  3, domain: "Tax Governance",    name: "VAT / GST Return Service",      port: 8127, gateway: "vat-returns",                   field: "vat_returns" },
  { id:  4, domain: "Tax Governance",    name: "Corporate Tax Service",         port: 8128, gateway: "corporate-tax-returns",         field: "corporate_tax_returns" },
  { id:  5, domain: "Tax Governance",    name: "Withholding Tax Service",       port: 8129, gateway: "withholding-tax",               field: "withholding_obligations" },
  { id:  6, domain: "Tax Governance",    name: "Filing Preparation Service",    port: 8130, gateway: "filing-preparation/drafts",     field: "filing_drafts" },
  { id:  7, domain: "Tax Governance",    name: "Tax Authority Interface",       port: 8147, gateway: "tax-authority/interfaces",      field: "tax_authority_interfaces" },

  // ── AI Governance (1) ───────────────────────────────────────
  { id:  8, domain: "AI Governance",     name: "AI Governance Engine",          port: 8146, gateway: "ai-governance",                field: null },

  // ── Legal & Contracts (6) ──────────────────────────────────
  { id:  9, domain: "Legal Governance",  name: "Contract Lifecycle Service",    port: 8119, gateway: "contracts",                    field: "contracts" },
  { id: 10, domain: "Legal Governance",  name: "Clause & Template Library",     port: 8120, gateway: "clauses",                     field: "clauses" },
  { id: 11, domain: "Legal Governance",  name: "Obligation Tracking Service",   port: 8088, gateway: "obligations",                  field: "obligations" },
  { id: 12, domain: "Legal Governance",  name: "Board Resolutions Service",     port: 8122, gateway: "meetings",                    field: "meetings" },
  { id: 13, domain: "Legal Governance",  name: "Corporate Actions Service",     port: 8123, gateway: "corporate-actions",            field: "corporate_actions" },
  { id: 14, domain: "Legal Governance",  name: "Counterparty Management Svc",   port: 8124, gateway: "counterparties",               field: "counterparties" },

  // ── Finance (3) ─────────────────────────────────────────────
  { id: 15, domain: "Finance",           name: "General Ledger Engine",         port: 8098, gateway: "journal-entries",              field: "journal_entries" },
  { id: 16, domain: "Finance",           name: "Treasury & Cash Engine",        port: 8103, gateway: "cash-positions",               field: "cash_positions" },
  { id: 17, domain: "Finance",           name: "Financial Reporting Engine",    port: 8104, gateway: "finance/summary",              field: "summary" },

  // ── Commercial Ops (3) ──────────────────────────────────────
  { id: 18, domain: "Commercial Ops",    name: "Purchase Order Management",     port: 8129, gateway: "purchase-orders",              field: "purchase_orders" },
  { id: 19, domain: "Commercial Ops",    name: "Spend Controls & Limits",       port: 8131, gateway: "spend-controls/limits",        field: "spend_limits" },
  { id: 20, domain: "Commercial Ops",    name: "Vendor Due Diligence Service",  port: 8135, gateway: "vendors",                     field: "vendors" },

  // ── HR & Workforce (5) ──────────────────────────────────────
  { id: 21, domain: "HR & Workforce",    name: "Employee Master Directory",     port: 8108, gateway: "employees",                   field: "employees" },
  { id: 22, domain: "HR & Workforce",    name: "Leave & Attendance Engine",     port: 8115, gateway: "leave/requests",              field: "requests" },
  { id: 23, domain: "HR & Workforce",    name: "Org Structure Governance",      port: 8116, gateway: "org/departments",             field: "departments" },
  { id: 24, domain: "HR & Workforce",    name: "Workforce Compliance Alerts",   port: 8118, gateway: "compliance/alerts",           field: "alerts" },
  { id: 25, domain: "HR & Workforce",    name: "Talent & Review Cycles",        port: 8139, gateway: "talent",                     field: "reviews" },

  // ── Payroll (5) ─────────────────────────────────────────────
  { id: 26, domain: "Payroll",           name: "Payroll Processing Engine",     port: 8110, gateway: "payroll-runs",                field: "payroll_runs" },
  { id: 27, domain: "Payroll",           name: "Compensation Structures",       port: 8111, gateway: "compensation/structures",     field: "structures" },
  { id: 28, domain: "Payroll",           name: "Benefits Engine",               port: 8112, gateway: "benefits/plans",              field: "plans" },
  { id: 29, domain: "Payroll",           name: "Payroll Tax Compliance",        port: 8113, gateway: "payroll-tax/profiles",        field: "profiles" },
  { id: 30, domain: "Payroll",           name: "Payroll Exception Engine",      port: 8114, gateway: "payroll-exceptions",          field: "exceptions" },

  // ── Compliance & Risk (3) ───────────────────────────────────
  { id: 31, domain: "Compliance & Risk", name: "Filing Requirements Tracker",   port: 8141, gateway: "filing-tracker/requirements", field: "requirements" },
  { id: 32, domain: "Compliance & Risk", name: "Compliance Evaluation Engine",  port: 8132, gateway: "compliance-status",           field: "evaluations" },
  { id: 33, domain: "Compliance & Risk", name: "Exception Escalation Engine",   port: 8133, gateway: "exception-escalation/exceptions", field: "exceptions" },

  // ── Audit Event Store (4) ───────────────────────────────────
  { id: 34, domain: "Audit Event Store", name: "Audit Event Ingestion",         port: 8084, gateway: "audit/events",                field: "events" },
  { id: 35, domain: "Audit Event Store", name: "Audit Log Query Engine",        port: 8084, gateway: "audit/logs",                  field: "logs" },
  { id: 36, domain: "Audit Event Store", name: "Tamper Detection Engine",       port: 8084, gateway: "tamper/alerts",               field: "tamper_alerts" },
  { id: 37, domain: "Audit Event Store", name: "Evidence Verification Engine",  port: 8130, gateway: "evidence/requirements",       field: "requirements" },
];

const results = [];
let domainBanner = "";

function colorStatus(code) {
  if (code >= 200 && code < 300) return `\x1b[32m${code} OK\x1b[0m`;
  if (code >= 300 && code < 400) return `\x1b[33m${code} REDIRECT\x1b[0m`;
  if (code === 401 || code === 403) return `\x1b[35m${code} AUTH\x1b[0m`;
  if (code === 404) return `\x1b[31m${code} NOT FOUND\x1b[0m`;
  return `\x1b[31m${code} ERROR\x1b[0m`;
}

function truncate(str, len = 130) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function fetchService(svc) {
  return new Promise((resolve) => {
    const path = `/api/v1/${svc.gateway}`;
    const opts = {
      hostname: "localhost",
      port: BASE_PORT,
      path,
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Tenant-Id": TENANT_ID,
        "X-Principal-Id": PRINCIPAL_ID,
        "X-Legal-Entity-Id": ENTITY_ID,
      },
    };

    const t0 = Date.now();
    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        const ms = Date.now() - t0;
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) {}

        let dataInfo = "—";
        let fieldCount = 0;
        if (parsed) {
          if (svc.field && Array.isArray(parsed[svc.field])) {
            fieldCount = parsed[svc.field].length;
            dataInfo = `${fieldCount} record(s) in "${svc.field}"`;
          } else if (typeof parsed === "object") {
            const keys = Object.keys(parsed);
            dataInfo = `keys: [${keys.join(", ")}]`;
          }
        }

        const sample = parsed
          ? truncate(JSON.stringify(parsed))
          : truncate(raw || "(empty body)");

        const passed = res.statusCode >= 200 && res.statusCode < 300;

        results.push({ svc, status: res.statusCode, ms, dataInfo, sample, passed });
        resolve();
      });
    });

    req.on("error", (err) => {
      const ms = Date.now() - t0;
      results.push({ svc, status: 0, ms, dataInfo: "CONNECTION ERROR", sample: err.message, passed: false });
      resolve();
    });

    req.setTimeout(5000, () => {
      results.push({ svc, status: 408, ms: 5000, dataInfo: "TIMEOUT", sample: "Request timed out after 5s", passed: false });
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function runAll() {
  const pad = (s, n) => String(s).padEnd(n);

  console.log("\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m\x1b[36m║      ZOIKO SUITE — MANUAL E2E SERVICE TEST RUNNER               ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m║      37 Microservices | Author: vasudevareddy-zoiko              ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════╝\x1b[0m\n");

  for (const svc of SERVICES) {
    // Print domain banner when domain changes
    if (svc.domain !== domainBanner) {
      domainBanner = svc.domain;
      console.log(`\x1b[1m\x1b[33m\n  ▸ ${domainBanner.toUpperCase()}\x1b[0m`);
      console.log(`  ${"─".repeat(68)}`);
    }

    process.stdout.write(`  [${pad(svc.id, 2)}] ${pad(svc.name, 38)} testing... `);
    await fetchService(svc);

    const r = results[results.length - 1];
    const statusStr = colorStatus(r.status);
    const timeStr = `${r.ms}ms`.padStart(6);
    const tick = r.passed ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m";

    // Overwrite the "testing..." with the result
    process.stdout.write(`\r  [${pad(svc.id, 2)}] ${pad(svc.name, 38)} ${tick} ${statusStr.padEnd(14)} ${timeStr}   ${r.dataInfo}\n`);
    console.log(`       └─ GET /api/v1/${svc.gateway}`);
    if (!r.passed || r.dataInfo === "—") {
      console.log(`       └─ Sample: ${truncate(r.sample, 100)}`);
    }
  }

  // ── Summary Table ──────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgMs  = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);

  console.log("\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║  RESULTS SUMMARY                                                 ║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m╠══════════════════════════════════════════════════════════════════╣\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Total Services Tested : \x1b[1m${String(SERVICES.length).padEnd(40)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[32mPassed (HTTP 2xx)     : ${String(passed).padEnd(40)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[31mFailed / Unreachable  : ${String(failed).padEnd(40)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Avg Response Time      : ${String(avgMs + "ms").padEnd(40)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m╠══════════════════════════════════════════════════════════════════╣\x1b[0m`);

  if (failed > 0) {
    console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m\x1b[31mFAILED SERVICES:\x1b[0m${" ".repeat(49)}\x1b[1m\x1b[36m║\x1b[0m`);
    results.filter(r => !r.passed).forEach(r => {
      const line = `  #${r.svc.id} ${r.svc.name} — ${r.dataInfo} (${r.status})`;
      console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[31m${line.padEnd(64)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
    });
    console.log(`\x1b[1m\x1b[36m╠══════════════════════════════════════════════════════════════════╣\x1b[0m`);
  }

  const overallStatus = failed === 0
    ? "\x1b[32m✔  ALL 37 SERVICES PASSED — FULL E2E VERIFIED\x1b[0m"
    : `\x1b[31m✘  ${failed} SERVICE(S) FAILED — CHECK FAILED LIST\x1b[0m`;
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  ${overallStatus.padEnd(74)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════╝\x1b[0m\n`);

  // ── Per-domain breakdown ───────────────────────────────────────
  console.log("\x1b[1mDomain Breakdown:\x1b[0m");
  const domains = [...new Set(SERVICES.map(s => s.domain))];
  for (const d of domains) {
    const dResults = results.filter(r => r.svc.domain === d);
    const dPass = dResults.filter(r => r.passed).length;
    const dTotal = dResults.length;
    const bar = "█".repeat(dPass) + "░".repeat(dTotal - dPass);
    const color = dPass === dTotal ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}${d.padEnd(22)}\x1b[0m  ${bar}  ${dPass}/${dTotal}`);
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
