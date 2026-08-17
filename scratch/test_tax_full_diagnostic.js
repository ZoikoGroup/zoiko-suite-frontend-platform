const http = require("http");

const SERVICES = [
  // Tax Core Services (via their actual API paths)
  { name: "tax-rules-svc",               port: 8125, health: "/health",                      api: "/v1/tax-rules?limit=1" },
  { name: "tax-determination-svc",       port: 8126, health: "/health",                      api: "/v1/tax-determinations?limit=1" },
  { name: "vat-gst-svc",                 port: 8127, health: "/health",                      api: "/v1/vat-returns?limit=1" },
  { name: "corporate-tax-svc",           port: 8128, health: "/health",                      api: "/v1/corporate-tax/returns?limit=1" },
  // These are confirmed UP by docker ps - check correct paths
  { name: "withholding-tax-svc",         port: 8129, health: "/health",                      api: "/v1/withholding/obligations?limit=1" },
  { name: "filing-preparation-svc",      port: 8130, health: "/health",                      api: "/v1/filing-preparation/drafts?limit=1" },
  { name: "filing-tracker-svc",          port: 8131, health: "/health",                      api: "/health" },
  { name: "compliance-status-svc",       port: 8132, health: "/health",                      api: "/health" },
  { name: "exception-escalation-svc",    port: 8133, health: "/health",                      api: "/health" },
  { name: "tax-authority-interface-svc", port: 8147, health: "/health",                      api: "/v1/tax-authority/interfaces" },
];

function probe(svc, path) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${svc.port}${path}`, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body: body.slice(0, 120) }));
    });
    req.on("error", () => resolve({ status: "OFFLINE", body: "" }));
    req.on("timeout", () => { req.destroy(); resolve({ status: "TIMEOUT", body: "" }); });
  });
}

async function run() {
  console.log("\n=== TAX DOMAIN MICROSERVICES — FULL DIAGNOSTIC ===");
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  for (const svc of SERVICES) {
    const healthRes = await probe(svc, svc.health);
    const apiRes    = await probe(svc, svc.api);

    const healthIcon = (healthRes.status >= 200 && healthRes.status < 400) ? "✅" : (healthRes.status === "OFFLINE" ? "❌ OFFLINE" : `⚠️  HTTP ${healthRes.status}`);
    const apiIcon    = (apiRes.status   >= 200 && apiRes.status   < 400) ? "✅" : (apiRes.status   === "OFFLINE" ? "❌ OFFLINE" : `⚠️  HTTP ${apiRes.status}`);

    console.log(`──────────────────────────────────────────`);
    console.log(` Service : ${svc.name} (port ${svc.port})`);
    console.log(` Health  : ${healthIcon}`);
    console.log(` API     : ${apiIcon}`);
    if (apiRes.body) console.log(` Sample  : ${apiRes.body}`);
  }
  console.log("\n=== END DIAGNOSTIC ===\n");
}

run();
