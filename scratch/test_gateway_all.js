const http = require("http");

const endpoints = [
  // Tax Domain
  "tax-rules",
  "tax-determinations",
  "vat-returns",
  "corporate-tax-returns",
  "withholding-tax",
  "filing-preparation/drafts",
  "tax-authority/interfaces",
  // Legal Domain
  "contracts",
  "clauses",
  "obligations",
  "meetings",
  "corporate-actions",
  "counterparties",
  // Finance Domain
  "journal-entries",
  "cash-positions",
  "finance/summary",
  // Commercial Ops Domain
  "purchase-orders",
  "spend-controls/limits",
  // Payroll Domain
  "payroll-runs",
  "compensation/structures",
  "benefits/plans",
  "payroll-tax/profiles",
  "payroll-exceptions",
  // HR Domain
  "employees",
  "leave/requests",
  "org/departments",
  "compliance/alerts",
  // Compliance Domain
  "filing-tracker/requirements",
  "compliance-status",
  "exception-escalation/exceptions"
];

console.log(`=======================================================`);
console.log(`🚀 API GATEWAY VERIFICATION RUNNER (${endpoints.length} Endpoints)`);
console.log(`=======================================================\n`);

let passed = 0;
let failed = 0;

function testEndpoint(ep) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://localhost:3000/api/v1/${ep}`,
      {
        headers: {
          "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
          "X-Principal-Id": "33333333-3333-3333-3333-333333333333"
        }
      },
      (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`▶ [${res.statusCode} OK] /api/v1/${ep} — PASSED ✅`);
          passed++;
        } else {
          console.log(`❌ [${res.statusCode}] /api/v1/${ep} — FAILED`);
          failed++;
        }
        resolve();
      }
    );

    req.on("error", (err) => {
      console.log(`❌ [ERROR] /api/v1/${ep}: ${err.message}`);
      failed++;
      resolve();
    });
  });
}

async function run() {
  for (const ep of endpoints) {
    await testEndpoint(ep);
  }
  console.log(`\n=======================================================`);
  console.log(`📊 FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${endpoints.length})`);
  console.log(`=======================================================`);
}

run();
