/**
 * ALL 11 GOVERNANCE SERVICES GATEWAY & DIRECT TEST SUITE
 * 
 * Traefik Gateway Port: 8000
 * Direct Ports: 8081, 8083, 8085, 8086, 8087, 8088, 8093, 8100, 8112, 8119, 8130
 * 
 * Identity Headers Injected on ALL Requests (Reads + Writes):
 *   X-Principal-Id: 33333333-3333-3333-3333-333333333333
 *   X-Tenant-Id: 11111111-1111-1111-1111-111111111111
 *   X-Legal-Entity-Id: 22222222-2222-2222-2222-222222222222
 *   X-Correlation-ID: test-correlation-...
 */

const http = require("http");

const HEADERS = {
  "Content-Type": "application/json",
  "X-Principal-Id": "33333333-3333-3333-3333-333333333333",
  "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
  "X-Legal-Entity-Id": "22222222-2222-2222-2222-222222222222",
  "X-Correlation-ID": "test-corr-" + Date.now()
};

function req(options, postData) {
  return new Promise((resolve) => {
    const r = http.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        let parsed = body;
        try { parsed = JSON.parse(body); } catch {}
        resolve({ statusCode: res.statusCode, data: parsed });
      });
    });
    r.on("error", (err) => resolve({ statusCode: 0, error: err.message }));
    r.setTimeout(3000, () => {
      r.destroy();
      resolve({ statusCode: 0, error: "TIMEOUT" });
    });
    if (postData) {
      r.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    r.end();
  });
}

const services = [
  { id: 1, name: "governance-decision-log-svc", port: 8083, gatewayPath: "/governance-decision-log/v1/governance-decisions", directPath: "/v1/governance-decisions" },
  { id: 2, name: "policy-svc", port: 8085, gatewayPath: "/policy/v1/policies", directPath: "/v1/policies" },
  { id: 3, name: "configuration-feature-flag-svc", port: 8086, gatewayPath: "/configuration-feature-flag/v1/feature-flags", directPath: "/v1/feature-flags" },
  { id: 4, name: "secret-vault-integration-svc", port: 8087, gatewayPath: "/secret-vault-integration/v1/secrets/audit-trail", directPath: "/v1/secrets/audit-trail" },
  { id: 5, name: "obligations-svc", port: 8088, gatewayPath: "/obligations/v1/obligations", directPath: "/v1/obligations" },
  { id: 6, name: "tenant-entity-registry-svc", port: 8081, gatewayPath: "/tenant-entity-registry/v1/tenants", directPath: "/v1/tenants" },
  { id: 7, name: "schema-registry-svc", port: 8093, gatewayPath: "/schema-registry/v1/schemas", directPath: "/v1/schemas" },
  { id: 8, name: "purchase-request-svc", port: 8100, gatewayPath: "/purchase-request/v1/purchase-requests", directPath: "/v1/purchase-requests" },
  { id: 9, name: "purchase-order-svc", port: 8112, gatewayPath: "/purchase-order/v1/purchase-orders", directPath: "/v1/purchase-orders" },
  { id: 10, name: "contract-lifecycle-svc", port: 8119, gatewayPath: "/contract-lifecycle/v1/contracts", directPath: "/v1/contracts" },
  { id: 11, name: "evidence-requirements-svc", port: 8130, gatewayPath: "/evidence-requirements/v1/evidence-requirements", directPath: "/v1/evidence-requirements" }
];

async function testAll() {
  console.log("=======================================================================");
  console.log("  ALL 11 GOVERNANCE SERVICES: GATEWAY (8000) & DIRECT PORT TEST SUITE  ");
  console.log("  Injected Headers: X-Principal-Id, X-Tenant-Id, X-Legal-Entity-Id   ");
  console.log("=======================================================================\n");

  for (const s of services) {
    console.log(`--- [${s.id}/11] ${s.name} ---`);

    // 1. Direct Port Read (with Identity Headers)
    const resDirect = await req({
      host: "localhost",
      port: s.port,
      path: s.directPath,
      method: "GET",
      headers: HEADERS
    });

    const directStatus = resDirect.statusCode === 0 ? "OFFLINE 🔌" : `HTTP ${resDirect.statusCode} ✅`;
    console.log(`  Direct Port (${s.port}${s.directPath}): ${directStatus}`);

    // 2. Gateway Read (with Identity Headers)
    const resGateway = await req({
      host: "localhost",
      port: 8000,
      path: s.gatewayPath,
      method: "GET",
      headers: HEADERS
    });

    const gatewayStatus = resGateway.statusCode === 0 ? "OFFLINE 🔌" : `HTTP ${resGateway.statusCode} ✅`;
    console.log(`  Traefik Gateway (8000${s.gatewayPath}): ${gatewayStatus}\n`);
  }

  console.log("=======================================================================");
  console.log("  SUMMARY: All 11 Services Tested with Full Identity Header Injection  ");
  console.log("=======================================================================");
}

testAll();
