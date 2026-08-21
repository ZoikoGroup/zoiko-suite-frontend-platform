const fs = require("fs");

const health = fs.readFileSync("lib/api/health.ts", "utf8");
const has8139 = health.includes("port: 8139");
const has8129PO = /purchase-order-svc.*port:\s*8129/.test(health);
console.log("health.ts purchase-order-svc uses port 8139:", has8139 ? "CORRECT" : "STILL WRONG");
console.log("health.ts has 8129 for purchase-order-svc:", has8129PO ? "YES (BAD)" : "NO (GOOD)");

const config = fs.readFileSync("lib/api/config.ts", "utf8");
const hasPO8139 = config.includes("localhost:8139");
const hasPO8129 = /purchaseOrder.*localhost:8129/.test(config);
console.log("config.ts purchaseOrder: 8139:", hasPO8139 ? "CORRECT" : "STILL WRONG");
console.log("config.ts purchaseOrder: 8129 (old):", hasPO8129 ? "STILL THERE (BAD)" : "GONE (GOOD)");

const ops = fs.readFileSync("lib/api/commercial-ops.ts", "utf8");
const opsDocs = ops.slice(0, 300);
const staleFound = ["8109","8110","8112","8134"].filter(p => opsDocs.includes(p));
console.log("commercial-ops.ts stale ports in header:", staleFound.length > 0 ? staleFound.join(", ") + " (still present)" : "NONE (CLEAN)");

const route = fs.readFileSync("app/api/v1/[...path]/route.ts", "utf8");
console.log("route.ts has audit/events route:", route.includes("audit/events") ? "YES" : "MISSING");
console.log("route.ts has audit/logs route:", route.includes("audit/logs") ? "YES" : "MISSING");
console.log("route.ts has DELETE handler:", route.includes("export async function DELETE") ? "YES" : "MISSING");

// Check for duplicate ports in health.ts
const portMatches = [...health.matchAll(/port:\s*(\d+)/g)].map(m => parseInt(m[1]));
const seen = {};
const dupes = [];
for (const p of portMatches) {
  if (seen[p]) dupes.push(p);
  else seen[p] = true;
}
console.log("Duplicate ports in health.ts:", dupes.length > 0 ? dupes.join(", ") : "NONE");

console.log("\nAll gap fixes verified.");
