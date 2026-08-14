const http = require("http");

const TAX_SERVICES = [
  { name: "tax-rules-svc", port: 8125, path: "/v1/tax-rules" },
  { name: "tax-determination-svc", port: 8126, path: "/v1/tax-determinations" },
  { name: "vat-gst-svc", port: 8127, path: "/v1/vat-returns" },
  { name: "corporate-tax-svc", port: 8128, path: "/v1/corporate-tax/returns" },
  { name: "withholding-tax-svc", port: 8129, path: "/v1/withholding/obligations" },
  { name: "filing-preparation-svc", port: 8130, path: "/v1/filing-preparation/drafts" },
  { name: "filing-tracker-svc", port: 8131, path: "/health" },
  { name: "compliance-status-svc", port: 8132, path: "/health" },
  { name: "exception-escalation-svc", port: 8133, path: "/health" },
  { name: "tax-authority-interface-svc", port: 8147, path: "/v1/tax-authority/interfaces" }
];

function checkService(svc) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${svc.port}${svc.path}`, { timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        resolve({
          name: svc.name,
          port: svc.port,
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 400,
          responseSnippet: body.slice(0, 100)
        });
      });
    });

    req.on("error", (err) => {
      resolve({
        name: svc.name,
        port: svc.port,
        status: "OFFLINE",
        ok: false,
        error: err.message
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        name: svc.name,
        port: svc.port,
        status: "TIMEOUT",
        ok: false
      });
    });
  });
}

async function run() {
  console.log("=== CHECKING ALL TAX DOMAIN MICROSERVICES ===");
  const results = await Promise.all(TAX_SERVICES.map(checkService));
  console.table(results);
}

run();
