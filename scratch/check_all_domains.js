/**
 * Comprehensive Platform Domain Check
 * Tests all admin domain routes and API endpoints for gaps or HTTP errors
 */
async function checkAllDomains() {
  const BASE = "http://localhost:3000";
  const routes = [
    "/admin",
    "/admin/tax",
    "/admin/ai-governance",
    "/admin/finance",
    "/admin/payroll",
    "/admin/hr",
    "/admin/legal",
    "/admin/commercial-ops",
    "/admin/compliance",
    "/admin/jurisdictions",
    "/admin/delegations",
    "/admin/documents",
    "/admin/evidence",
    "/admin/audit-events",
    "/admin/policies",
    "/admin/purchase-requests",
    "/admin/schemas",
    "/admin/secrets",
    "/admin/settings",
    "/admin/tenants",
    "/admin/notifications",
    "/admin/obligations",
  ];

  console.log("═══ SCANNING ALL 22 ADMIN DOMAIN ROUTES ═══\n");
  const failed = [];

  for (const r of routes) {
    try {
      const res = await fetch(`${BASE}${r}`, { redirect: "manual" });
      if (res.status === 200) {
        console.log(`✅ ${r.padEnd(30)} [HTTP 200 OK]`);
      } else if (res.status === 307 || res.status === 302) {
        console.log(`➡️ ${r.padEnd(30)} [HTTP ${res.status} Redirect to ${res.headers.get("location")}]`);
      } else {
        console.log(`❌ ${r.padEnd(30)} [HTTP ${res.status}]`);
        failed.push({ route: r, status: res.status });
      }
    } catch (e) {
      console.log(`❌ ${r.padEnd(30)} [ERROR: ${e.message}]`);
      failed.push({ route: r, error: e.message });
    }
  }

  console.log("\n═══ SCANNING API GATEWAY DOMAINS ═══\n");
  const apiEndpoints = [
    "/api/v1/tax-rules",
    "/api/v1/tax-determinations",
    "/api/v1/vat-returns",
    "/api/v1/corporate-tax-returns",
    "/api/v1/withholding-tax",
    "/api/v1/filing-preparation/drafts",
    "/api/v1/tax-authority/interfaces",
    "/api/v1/tax/summary",
    "/api/v1/tax/deadlines",
    "/api/v1/contracts",
    "/api/v1/clauses",
    "/api/v1/obligations",
    "/api/v1/journal-entries",
    "/api/v1/cash-positions",
    "/api/v1/finance/summary",
    "/api/v1/purchase-orders",
    "/api/v1/spend-controls/limits",
    "/api/v1/payroll-runs",
    "/api/v1/compensation/structures",
    "/api/v1/employees",
    "/api/v1/filing-tracker/requirements",
    "/api/backend/tax-health",
  ];

  for (const ep of apiEndpoints) {
    try {
      const res = await fetch(`${BASE}${ep}`);
      if (res.status === 200) {
        const json = await res.json();
        const keys = Object.keys(json);
        console.log(`✅ ${ep.padEnd(40)} [HTTP 200 OK] (keys: ${keys.join(", ")})`);
      } else {
        console.log(`❌ ${ep.padEnd(40)} [HTTP ${res.status}]`);
        failed.push({ route: ep, status: res.status });
      }
    } catch (e) {
      console.log(`❌ ${ep.padEnd(40)} [ERROR: ${e.message}]`);
      failed.push({ route: ep, error: e.message });
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`AUDIT COMPLETE: ${failed.length === 0 ? "✅ ZERO GAPS FOUND" : `⚠️ ${failed.length} GAPS FOUND`}`);
}

checkAllDomains().catch(console.error);
