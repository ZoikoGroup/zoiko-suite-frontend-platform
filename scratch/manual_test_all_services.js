const http = require("http");

const services = [
  // Tax Domain (7)
  { id: 1, domain: "Tax Governance", name: "Tax Rules Service", port: 8125, path: "tax-rules", field: "tax_rules" },
  { id: 2, domain: "Tax Governance", name: "Tax Determination Service", port: 8126, path: "tax-determinations", field: "determinations" },
  { id: 3, domain: "Tax Governance", name: "VAT / GST Return Service", port: 8127, path: "vat-returns", field: "vat_returns" },
  { id: 4, domain: "Tax Governance", name: "Corporate Tax Service", port: 8128, path: "corporate-tax-returns", field: "corporate_returns" },
  { id: 5, domain: "Tax Governance", name: "Withholding Tax Service", port: 8129, path: "withholding-tax", field: "withholding_obligations" },
  { id: 6, domain: "Tax Governance", name: "Filing Preparation Service", port: 8130, path: "filing-preparation/drafts", field: "drafts" },
  { id: 7, domain: "Tax Governance", name: "Tax Authority Interface", port: 8147, path: "tax-authority/interfaces", field: "interfaces" },

  // Legal Domain (7)
  { id: 8, domain: "Legal Governance", name: "Contract Lifecycle Service", port: 8118, path: "contracts", field: "contracts" },
  { id: 9, domain: "Legal Governance", name: "Clause & Template Library", port: 8119, path: "clauses", field: "clauses" },
  { id: 10, domain: "Legal Governance", name: "Obligation Tracking Service", port: 8120, path: "obligations", field: "obligations" },
  { id: 11, domain: "Legal Governance", name: "Board Resolutions Service", port: 8121, path: "meetings", field: "meetings" },
  { id: 12, domain: "Legal Governance", name: "Corporate Actions Service", port: 8122, path: "corporate-actions", field: "corporate_actions" },
  { id: 13, domain: "Legal Governance", name: "Legal Approvals Service", port: 8123, path: "legal-approvals", field: "approvals" },
  { id: 14, domain: "Legal Governance", name: "Counterparty Intelligence", port: 8124, path: "counterparties", field: "counterparties" },

  // Finance Domain (9)
  { id: 15, domain: "Finance Governance", name: "General Ledger Engine", port: 8100, path: "journal-entries", field: "entries" },
  { id: 16, domain: "Finance Governance", name: "Accounts Receivable Engine", port: 8101, path: "ar-invoices", field: "invoices" },
  { id: 17, domain: "Finance Governance", name: "Accounts Payable Engine", port: 8102, path: "ap-invoices", field: "invoices" },
  { id: 18, domain: "Finance Governance", name: "Fixed Asset Management", port: 8103, path: "fixed-assets", field: "assets" },
  { id: 19, domain: "Finance Governance", name: "Financial Close Engine", port: 8104, path: "financial-close", field: "close_status" },
  { id: 20, domain: "Finance Governance", name: "Financial Reporting Engine", port: 8105, path: "finance/summary", field: "summary" },
  { id: 21, domain: "Finance Governance", name: "Revenue Recognition Engine", port: 8106, path: "rev-rec", field: "schedules" },
  { id: 22, domain: "Finance Governance", name: "Intercompany Settlement", port: 8107, path: "intercompany", field: "settlements" },
  { id: 23, domain: "Finance Governance", name: "Treasury & Cash Engine", port: 8108, path: "cash-positions", field: "positions" },

  // Commercial Ops Domain (6)
  { id: 24, domain: "Commercial Ops", name: "Purchase Order Management", port: 8112, path: "purchase-orders", field: "purchase_orders" },
  { id: 25, domain: "Commercial Ops", name: "Spend Controls & Limits", port: 8113, path: "spend-controls/limits", field: "spend_limits" },
  { id: 26, domain: "Commercial Ops", name: "Supplier Intelligence", port: 8114, path: "suppliers", field: "suppliers" },
  { id: 27, domain: "Commercial Ops", name: "Catalog Governance", port: 8115, path: "catalogs", field: "catalogs" },
  { id: 28, domain: "Commercial Ops", name: "Requisition Engine", port: 8116, path: "requisitions", field: "requisitions" },
  { id: 29, domain: "Commercial Ops", name: "Contract Match Engine", port: 8117, path: "contract-matches", field: "matches" },

  // Payroll Domain (8)
  { id: 30, domain: "Payroll Governance", name: "Payroll Processing Engine", port: 8090, path: "payroll-runs", field: "payroll_runs" },
  { id: 31, domain: "Payroll Governance", name: "Compensation Structures", port: 8091, path: "compensation/structures", field: "structures" },
  { id: 32, domain: "Payroll Governance", name: "Benefits Engine", port: 8092, path: "benefits/plans", field: "benefit_plans" },
  { id: 33, domain: "Payroll Governance", name: "Payroll Tax Compliance", port: 8093, path: "payroll-tax/profiles", field: "tax_profiles" },
  { id: 34, domain: "Payroll Governance", name: "Payroll Exception Escalation", port: 8094, path: "payroll-exceptions", field: "payroll_exceptions" },
  { id: 35, domain: "Payroll Governance", name: "Wage Garnishment Engine", port: 8095, path: "garnishments", field: "garnishments" },
  { id: 36, domain: "Payroll Governance", name: "Direct Deposit Engine", port: 8096, path: "direct-deposit", field: "accounts" },
  { id: 37, domain: "Payroll Governance", name: "Year-End Filing Engine", port: 8097, path: "year-end-filings", field: "filings" },

  // HR Domain (6)
  { id: 38, domain: "Human Resources", name: "Employee Registry", port: 8109, path: "employees", field: "employees" },
  { id: 39, domain: "Human Resources", name: "Leave & Attendance Engine", port: 8110, path: "leave/requests", field: "leave_requests" },
  { id: 40, domain: "Human Resources", name: "Org Structure Governance", port: 8111, path: "org/departments", field: "departments" },
  { id: 41, domain: "Human Resources", name: "Workforce Alerts Engine", port: 8131, path: "compliance/alerts", field: "alerts" },
  { id: 42, domain: "Human Resources", name: "Talent Management Engine", port: 8132, path: "talent", field: "talent" },
  { id: 43, domain: "Human Resources", name: "Onboarding Engine", port: 8133, path: "onboarding", field: "onboarding" },

  // Compliance Domain (3)
  { id: 44, domain: "Compliance Engine", name: "Filing Requirements Tracker", port: 8087, path: "filing-tracker/requirements", field: "requirements" },
  { id: 45, domain: "Compliance Engine", name: "Compliance Evaluation Engine", port: 8088, path: "compliance-status", field: "evaluations" },
  { id: 46, domain: "Compliance Engine", name: "Escalation Management", port: 8089, path: "exception-escalation/exceptions", field: "exceptions" },

  // Audit Event Store (4)
  { id: 47, domain: "Audit Event Store", name: "Audit Event Ingestion Engine", port: 8081, path: "audit/events", field: "events" },
  { id: 48, domain: "Audit Event Store", name: "Audit Log Query Engine", port: 8082, path: "audit/logs", field: "logs" },
  { id: 49, domain: "Audit Event Store", name: "Evidence Verification Engine", port: 8084, path: "evidence/verification", field: "verifications" },
  { id: 50, domain: "Audit Event Store", name: "Tamper Detection Engine", port: 8085, path: "tamper/alerts", field: "tamper_alerts" },
];

console.log(`=======================================================`);
console.log(`🔍 MANUAL FRONTEND DATA INSPECTION (All 50 Microservices)`);
console.log(`=======================================================\n`);

let inspectCount = 0;

function fetchServiceData(svc) {
  return new Promise((resolve) => {
    const reqOpts = {
      hostname: "localhost",
      port: 3000,
      path: `/api/v1/${svc.path}`,
      method: "GET",
      headers: {
        "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
        "X-Principal-Id": "33333333-3333-3333-3333-333333333333"
      }
    };

    const startTime = Date.now();
    const req = http.request(reqOpts, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        const duration = Date.now() - startTime;
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch(e) {}

        const sample = parsed ? JSON.stringify(parsed).slice(0, 120) + "..." : body.slice(0, 80);

        console.log(`[#${svc.id}] ${svc.domain} | ${svc.name} (: ${svc.port})`);
        console.log(`    Endpoint: GET /api/v1/${svc.path}`);
        console.log(`    Status: ${res.statusCode} ${res.statusMessage} (${duration}ms)`);
        console.log(`    Data Preview: ${sample}\n`);
        inspectCount++;
        resolve();
      });
    });

    req.on("error", (err) => {
      console.log(`[#${svc.id}] ❌ ERROR ${svc.name}: ${err.message}\n`);
      resolve();
    });

    req.end();
  });
}

async function runManualInspection() {
  for (const svc of services) {
    await fetchServiceData(svc);
  }
  console.log(`=======================================================`);
  console.log(`🎉 MANUAL INSPECTION COMPLETE: ${inspectCount}/50 Services Verified`);
  console.log(`=======================================================`);
}

runManualInspection();
