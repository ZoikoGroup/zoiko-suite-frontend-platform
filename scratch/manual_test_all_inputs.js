/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Zoiko Suite — Manual Input & E2E Mutation Test Runner
 *  Author: vasudevareddy-zoiko
 *
 *  Tests all services by sending concrete JSON input payloads (POST/write)
 *  and verifying the response status, latency, and returned data.
 *
 *  Run: node scratch/manual_test_all_inputs.js
 * ═══════════════════════════════════════════════════════════════════════
 */

const http = require("http");

const BASE_HOST   = "localhost";
const BASE_PORT   = 3000;
const TENANT_ID   = "11111111-1111-1111-1111-111111111111";
const PRINCIPAL_ID = "33333333-3333-3333-3333-333333333333";
const ENTITY_ID   = "22222222-2222-2222-2222-222222222222";

// ── Test Cases with Concrete Input Payloads for All Services ─────────────

const TEST_CASES = [
  // ── 1. Tax Governance (7 Services) ──────────────────────────────────
  {
    id: 1,
    domain: "Tax Governance",
    name: "Tax Rules Engine",
    method: "POST",
    path: "/api/v1/tax-rules",
    input: {
      jurisdiction_id: "GB",
      rule_code: "UK-VAT-REDUCED-5",
      name: "UK Domestic Energy Reduced Rate 5%",
      category: "VAT",
      tax_rate_percentage: 5.0,
      standard_deductions: 0,
      exemptions_json: '{"domestic_energy": true}',
      status: "ACTIVE",
      version: 1,
      effective_from: "2026-09-01T00:00:00Z",
    },
  },
  {
    id: 2,
    domain: "Tax Governance",
    name: "Tax Determination Service",
    method: "POST",
    path: "/api/v1/tax-determinations",
    input: {
      transaction_id: "tx-inv-2026-8841",
      source_module: "ACCOUNTS_PAYABLE",
      legal_entity_id: ENTITY_ID,
      jurisdiction_id: "GB",
      tax_category: "VAT",
      gross_amount: 150000.0,
      taxable_amount: 150000.0,
      currency: "GBP",
      status: "CALCULATED",
    },
  },
  {
    id: 3,
    domain: "Tax Governance",
    name: "VAT / GST Return Service",
    method: "POST",
    path: "/api/v1/vat-returns",
    input: {
      jurisdiction_id: "GB",
      tax_registration_number: "GB998877665",
      tax_period: "2026-Q3",
      total_sales_amount: 520000.0,
      total_purchase_amount: 210000.0,
      output_tax_amount: 104000.0,
      input_tax_amount: 42000.0,
      net_tax_payable: 62000.0,
      currency: "GBP",
      status: "DRAFT",
    },
  },
  {
    id: 4,
    domain: "Tax Governance",
    name: "Corporate Tax Service",
    method: "POST",
    path: "/api/v1/corporate-tax-returns",
    input: {
      jurisdiction_id: "GB",
      tax_registration_number: "GB-CT-443322",
      fiscal_year: 2026,
      accounting_period_start: "2026-01-01",
      accounting_period_end: "2026-12-31",
      gross_revenue: 3500000.0,
      allowable_deductions: 2100000.0,
      taxable_income: 1400000.0,
      tax_rate_percent: 25.0,
      gross_tax_liability: 350000.0,
      tax_credits: 25000.0,
      net_tax_payable: 325000.0,
      currency: "GBP",
      status: "DRAFT",
    },
  },
  {
    id: 5,
    domain: "Tax Governance",
    name: "Withholding Tax Service",
    method: "POST",
    path: "/api/v1/withholding-tax",
    input: {
      jurisdiction_id: "DE",
      counterparty_id: "cp-acme-gmbh-01",
      payment_reference: "PAY-DE-2026-09",
      payment_type: "ROYALTIES",
      gross_payment_amount: 85000.0,
      taxable_base_amount: 85000.0,
      withholding_rate_percent: 15.0,
      withheld_amount: 12750.0,
      currency: "EUR",
      status: "CALCULATED",
    },
  },
  {
    id: 6,
    domain: "Tax Governance",
    name: "Filing Preparation Service",
    method: "POST",
    path: "/api/v1/filing-preparation/drafts",
    input: {
      return_type: "VAT_RETURN",
      jurisdiction_id: "GB",
      tax_period: "2026-Q3",
      source_return_id: "vr-003",
      form_data_json: JSON.stringify({ box1: 104000, box4: 42000, box5: 62000 }),
      validation_status: "DRAFT",
    },
  },
  {
    id: 7,
    domain: "Tax Governance",
    name: "Tax Authority Interface",
    method: "POST",
    path: "/api/v1/tax-authority/interfaces",
    input: {
      jurisdiction_id: "GB",
      authority_name: "HMRC Making Tax Digital (MTD)",
      protocol: "REST_OAUTH2",
      endpoint_url: "https://api.service.hmrc.gov.uk/organisations/vat",
      auth_scheme: "BEARER_TOKEN",
      status: "ACTIVE",
    },
  },

  // ── 2. AI Governance (1 Service) ──────────────────────────────────
  {
    id: 8,
    domain: "AI Governance",
    name: "AI Governance Engine",
    method: "GET",
    path: "/api/v1/ai-governance",
    input: null,
  },

  // ── 3. Legal & Contracts (6 Services) ──────────────────────────────
  {
    id: 9,
    domain: "Legal Governance",
    name: "Contract Lifecycle Service",
    method: "POST",
    path: "/api/v1/contracts",
    input: {
      title: "Enterprise Master Services Agreement — GlobalCloud Inc",
      contract_type: "MSA",
      counterparty_id: "cp-globalcloud-01",
      counterparty_name: "GlobalCloud Inc",
      currency: "GBP",
      total_value: 320000.0,
      effective_from: "2026-10-01T00:00:00Z",
      status: "DRAFT",
    },
  },
  {
    id: 10,
    domain: "Legal Governance",
    name: "Clause & Template Library",
    method: "POST",
    path: "/api/v1/clauses",
    input: {
      title: "UK GDPR Standard Model Clauses 2026",
      category: "DATA_PROTECTION",
      body: "The Data Processor shall process personal data solely in accordance with the documented instructions of the Data Controller...",
      jurisdiction_id: "GB",
      is_standard: true,
      status: "APPROVED",
    },
  },
  {
    id: 11,
    domain: "Legal Governance",
    name: "Obligation Tracking Service",
    method: "POST",
    path: "/api/v1/obligations",
    input: {
      contract_id: "c-001",
      title: "Annual ISO 27001 SOC-2 Type II Audit Certification",
      description: "Deliver renewed SOC-2 Type II certification report to counterparty legal department",
      due_date: "2026-12-15T00:00:00Z",
      risk_level: "HIGH",
      status: "PENDING",
    },
  },
  {
    id: 12,
    domain: "Legal Governance",
    name: "Board Resolutions Service",
    method: "POST",
    path: "/api/v1/meetings",
    input: {
      meeting_type: "BOARD_OF_DIRECTORS",
      title: "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting",
      scheduled_date: "2026-09-25T14:00:00Z",
      location: "London Headquarters / Virtual Boardroom",
      quorum_required: 3,
      status: "SCHEDULED",
    },
  },
  {
    id: 13,
    domain: "Legal Governance",
    name: "Corporate Actions Service",
    method: "POST",
    path: "/api/v1/corporate-actions",
    input: {
      action_type: "EQUITY_INCENTIVE_GRANT",
      description: "Approve 2026 Employee Stock Option Scheme Allotment",
      authorized_shares: 250000,
      share_class: "ORDINARY_B",
      status: "PROPOSED",
    },
  },
  {
    id: 14,
    domain: "Legal Governance",
    name: "Counterparty Management Svc",
    method: "GET",
    path: "/api/v1/counterparties",
    input: null,
  },

  // ── 4. Finance (3 Services) ─────────────────────────────────────────
  {
    id: 15,
    domain: "Finance",
    name: "General Ledger Engine",
    method: "POST",
    path: "/api/v1/journal-entries",
    input: {
      reference_code: "JE-2026-09-001",
      description: "September Intercompany Management Service Fee Accrual",
      debit_account: "7001-MGMT-FEES",
      credit_account: "2050-INTERCO-PAYABLE",
      amount: 45000.0,
      currency: "GBP",
      status: "POSTED",
    },
  },
  {
    id: 16,
    domain: "Finance",
    name: "Treasury & Cash Engine",
    method: "GET",
    path: "/api/v1/cash-positions",
    input: null,
  },
  {
    id: 17,
    domain: "Finance",
    name: "Financial Reporting Engine",
    method: "GET",
    path: "/api/v1/finance/summary",
    input: null,
  },

  // ── 5. Commercial Ops (3 Services) ──────────────────────────────────
  {
    id: 18,
    domain: "Commercial Ops",
    name: "Purchase Order Management",
    method: "POST",
    path: "/api/v1/purchase-orders",
    input: {
      po_number: "PO-2026-089",
      vendor_name: "CloudVault Ltd",
      description: "Annual Enterprise Multi-Region Cloud Storage Infrastructure",
      amount: 96000.0,
      currency: "GBP",
      status: "APPROVED",
    },
  },
  {
    id: 19,
    domain: "Commercial Ops",
    name: "Spend Controls & Limits",
    method: "POST",
    path: "/api/v1/spend-controls/limits",
    input: {
      category: "Information Technology & Software Infrastructure",
      department: "Engineering",
      annual_limit_amount: 350000.0,
      currency: "GBP",
      approval_threshold: 25000.0,
      period: "2026-FY",
    },
  },
  {
    id: 20,
    domain: "Commercial Ops",
    name: "Vendor Due Diligence Service",
    method: "GET",
    path: "/api/v1/vendors",
    input: null,
  },

  // ── 6. HR & Workforce (5 Services) ──────────────────────────────────
  {
    id: 21,
    domain: "HR & Workforce",
    name: "Employee Master Directory",
    method: "POST",
    path: "/api/v1/employees",
    input: {
      first_name: "Alexander",
      last_name: "Wright",
      email: "alexander.wright@zoikogroup.com",
      job_title: "Principal Infrastructure Engineer",
      worker_type: "FULL_TIME",
      hire_date: "2026-09-01",
      department_id: "dept-001",
      status: "ACTIVE",
    },
  },
  {
    id: 22,
    domain: "HR & Workforce",
    name: "Leave & Attendance Engine",
    method: "POST",
    path: "/api/v1/leave/requests",
    input: {
      employee_id: "emp-001",
      leave_type_id: "ANNUAL_LEAVE",
      start_date: "2026-10-12",
      end_date: "2026-10-16",
      total_hours: 40,
      reason: "Autumn Family Holiday",
      status: "SUBMITTED",
    },
  },
  {
    id: 23,
    domain: "HR & Workforce",
    name: "Org Structure Governance",
    method: "POST",
    path: "/api/v1/org/departments",
    input: {
      code: "CC-SEC",
      name: "Cybersecurity & Governance",
      head: "Alexander Wright",
      budget_gbp: 750000.0,
    },
  },
  {
    id: 24,
    domain: "HR & Workforce",
    name: "Workforce Compliance Alerts",
    method: "POST",
    path: "/api/v1/compliance/alerts",
    input: {
      employee_id: "emp-004",
      alert_type: "VISA_RENEWAL_REQUIRED",
      severity: "HIGH",
      description: "UK Skilled Worker Visa renewal window opens 60 days before expiry",
      status: "OPEN",
    },
  },
  {
    id: 25,
    domain: "HR & Workforce",
    name: "Talent & Review Cycles",
    method: "GET",
    path: "/api/v1/talent",
    input: null,
  },

  // ── 7. Payroll (5 Services) ─────────────────────────────────────────
  {
    id: 26,
    domain: "Payroll",
    name: "Payroll Processing Engine",
    method: "POST",
    path: "/api/v1/payroll-runs",
    input: {
      pay_period_code: "2026-10-M",
      period_start_date: "2026-10-01",
      period_end_date: "2026-10-31",
      payment_date: "2026-10-28",
      total_employee_count: 76,
      total_gross_pay: 428000.0,
      total_net_pay: 299000.0,
      total_tax_deductions: 129000.0,
      status: "CALCULATING",
    },
  },
  {
    id: 27,
    domain: "Payroll",
    name: "Compensation Structures",
    method: "POST",
    path: "/api/v1/compensation/structures",
    input: {
      title: "Staff Security Architect (L5)",
      wage_type: "SALARY",
      base_pay: 125000.0,
      currency: "GBP",
      pay_frequency: "MONTHLY",
    },
  },
  {
    id: 28,
    domain: "Payroll",
    name: "Benefits Engine",
    method: "POST",
    path: "/api/v1/benefits/plans",
    input: {
      name: "Comprehensive Dental & Optical Plan",
      type: "DENTAL",
      provider: "Bupa DentalCare",
      employer_contribution_pct: 100,
      enrolled_count: 65,
    },
  },
  {
    id: 29,
    domain: "Payroll",
    name: "Payroll Tax Compliance",
    method: "GET",
    path: "/api/v1/payroll-tax/profiles",
    input: null,
  },
  {
    id: 30,
    domain: "Payroll",
    name: "Payroll Exception Engine",
    method: "POST",
    path: "/api/v1/payroll-exceptions",
    input: {
      employee_id: "emp-002",
      type: "EXPENSE_REIMBURSEMENT_CAP_BREACH",
      severity: "MEDIUM",
      period: "2026-09",
      description: "Overseas client travel meal expense exceeds policy limit by £84",
      status: "OPEN",
    },
  },

  // ── 8. Compliance & Risk (3 Services) ───────────────────────────────
  {
    id: 31,
    domain: "Compliance & Risk",
    name: "Filing Requirements Tracker",
    method: "POST",
    path: "/api/v1/filing-tracker/requirements",
    input: {
      obligation: "UK Gender Pay Gap Reporting 2026",
      jurisdiction: "GB",
      authority: "Government Equalities Office",
      due_date: "2027-04-04",
      status: "PENDING",
    },
  },
  {
    id: 32,
    domain: "Compliance & Risk",
    name: "Compliance Evaluation Engine",
    method: "GET",
    path: "/api/v1/compliance-status",
    input: null,
  },
  {
    id: 33,
    domain: "Compliance & Risk",
    name: "Exception Escalation Engine",
    method: "POST",
    path: "/api/v1/exception-escalation/exceptions",
    input: {
      domain: "COMMERCIAL_OPS",
      type: "SANCTIONED_ENTITY_SCREENING_FLAG",
      severity: "HIGH",
      assigned_to: "James Okonkwo",
      sla_breach_at: "2026-09-05T17:00:00Z",
      status: "ESCALATED",
    },
  },

  // ── 9. Audit Event Store (4 Services) ───────────────────────────────
  {
    id: 34,
    domain: "Audit Event Store",
    name: "Audit Event Ingestion",
    method: "POST",
    path: "/api/v1/audit/events",
    input: {
      actor: "vasu@zoikogroup.com",
      action: "MANUAL_E2E_SERVICE_TEST_EXECUTION",
      resource: "microservices/all-37",
      outcome: "SUCCESS",
      details: "Dispatched manual input test payloads across all 37 microservices",
    },
  },
  {
    id: 35,
    domain: "Audit Event Store",
    name: "Audit Log Query Engine",
    method: "GET",
    path: "/api/v1/audit/logs",
    input: null,
  },
  {
    id: 36,
    domain: "Audit Event Store",
    name: "Tamper Detection Engine",
    method: "GET",
    path: "/api/v1/tamper/alerts",
    input: null,
  },
  {
    id: 37,
    domain: "Audit Event Store",
    name: "Evidence Verification Engine",
    method: "GET",
    path: "/api/v1/evidence/requirements",
    input: null,
  },
];

// ── Test Execution Engine ────────────────────────────────────────────────

const results = [];

function executeTest(test) {
  return new Promise((resolve) => {
    const postData = test.input ? JSON.stringify(test.input) : null;
    const headers = {
      "Accept": "application/json",
      "X-Tenant-Id": TENANT_ID,
      "X-Principal-Id": PRINCIPAL_ID,
      "X-Legal-Entity-Id": ENTITY_ID,
    };

    if (postData) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const opts = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path: test.path,
      method: test.method,
      headers,
    };

    const t0 = Date.now();
    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        const ms = Date.now() - t0;
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) {}
        const passed = res.statusCode >= 200 && res.statusCode < 300;
        results.push({ test, status: res.statusCode, ms, parsed, raw, passed });
        resolve();
      });
    });

    req.on("error", (err) => {
      const ms = Date.now() - t0;
      results.push({ test, status: 0, ms, parsed: null, raw: err.message, passed: false });
      resolve();
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function truncate(str, len = 110) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

async function run() {
  const pad = (s, n) => String(s).padEnd(n);

  console.log("\n\x1b[1m\x1b[36m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m\x1b[36m║   ZOIKO SUITE — MANUAL INPUT & MUTATION TEST RUNNER (ALL 37 SERVICES)       ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m║   Author: vasudevareddy-zoiko | Verifying Input Payloads & Output Responses ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m\n");

  let currentDomain = "";

  for (const test of TEST_CASES) {
    if (test.domain !== currentDomain) {
      currentDomain = test.domain;
      console.log(`\n\x1b[1m\x1b[33m► ${currentDomain.toUpperCase()}\x1b[0m`);
      console.log(`  ${"─".repeat(74)}`);
    }

    process.stdout.write(`  [${pad(test.id, 2)}] ${pad(test.name, 34)} ${pad(test.method, 5)} ${pad(test.path, 32)} `);
    await executeTest(test);

    const r = results[results.length - 1];
    const statusColor = r.passed ? "\x1b[32m" : "\x1b[31m";
    const tick = r.passed ? "✔" : "✘";
    console.log(`${statusColor}${tick} ${r.status}\x1b[0m (${r.ms}ms)`);

    // Print input preview if POST
    if (test.input) {
      console.log(`       \x1b[90m↳ INPUT  :\x1b[0m ${truncate(JSON.stringify(test.input), 120)}`);
    }
    // Print output preview
    const outStr = r.parsed ? JSON.stringify(r.parsed) : r.raw;
    console.log(`       \x1b[90m↳ OUTPUT :\x1b[0m ${truncate(outStr, 120)}`);
  }

  // ── Summary Table ────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const avgMs  = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);

  console.log("\n\x1b[1m\x1b[36m╔════════════════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log(`\x1b[1m\x1b[36m║  MANUAL INPUT TEST RESULTS SUMMARY                                         ║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m╠════════════════════════════════════════════════════════════════════════════╣\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Total Service Tests : \x1b[1m${String(TEST_CASES.length).padEnd(48)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[32mPassed (HTTP 2xx)   : ${String(passed + " / " + TEST_CASES.length).padEnd(48)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[31mFailed              : ${String(failed).padEnd(48)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  Avg Latency         : ${String(avgMs + "ms").padEnd(48)}\x1b[0m\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m╠════════════════════════════════════════════════════════════════════════════╣\x1b[0m`);

  const statusMsg = failed === 0
    ? "\x1b[32m✔  ALL 37 SERVICE INPUTS & MUTATIONS PROCESSED SUCCESSFULLY (100%)\x1b[0m"
    : `\x1b[31m✘  ${failed} TESTS FAILED\x1b[0m`;
  console.log(`\x1b[1m\x1b[36m║\x1b[0m  ${statusMsg.padEnd(82)}\x1b[1m\x1b[36m║\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m╚════════════════════════════════════════════════════════════════════════════╝\x1b[0m\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal error running test:", e);
  process.exit(1);
});
