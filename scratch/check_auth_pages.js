/**
 * Authenticated Admin Route Render Check
 * Tests all admin domain pages with an authenticated session cookie
 */
async function checkAuthAdminPages() {
  const BASE = "http://localhost:3000";
  // Encode a mock session cookie for testing
  const mockSession = JSON.stringify({
    principalId: "33333333-3333-3333-3333-333333333333",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
    roles: ["admin", "superadmin", "tax_director"],
    expiresAt: Date.now() + 86400000,
  });
  const cookieHeader = `zoiko_session=${encodeURIComponent(Buffer.from(mockSession).toString("base64"))}`;

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

  console.log("═══ AUTHENTICATED SSR RENDER AUDIT ═══\n");
  const failed = [];

  for (const r of routes) {
    try {
      const res = await fetch(`${BASE}${r}`, {
        headers: { Cookie: cookieHeader },
        redirect: "manual",
      });
      if (res.status === 200) {
        const text = await res.text();
        const hasError = text.includes("Error:") || text.includes("Unhandled Runtime Error");
        if (hasError) {
          console.log(`❌ ${r.padEnd(30)} [HTTP 200 but error string detected in HTML]`);
          failed.push({ route: r, error: "error string in html" });
        } else {
          console.log(`✅ ${r.padEnd(30)} [HTTP 200 OK — SSR Rendered Cleanly (${text.length} bytes)]`);
        }
      } else {
        console.log(`❌ ${r.padEnd(30)} [HTTP ${res.status}]`);
        failed.push({ route: r, status: res.status });
      }
    } catch (e) {
      console.log(`❌ ${r.padEnd(30)} [ERROR: ${e.message}]`);
      failed.push({ route: r, error: e.message });
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`SSR AUDIT COMPLETE: ${failed.length === 0 ? "✅ ALL 22 ADMIN PAGES RENDER CLEANLY" : `⚠️ ${failed.length} PAGES HAD ISSUES`}`);
}

checkAuthAdminPages().catch(console.error);
