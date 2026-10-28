// Registry guard for the Block 6–10 services.
//
// Run: npm test   (node --test; Node 24 strips the types from config.ts on import)
//
// Catches the two regressions that already happened once: a client that builds
// its own http://localhost:<port> URL (so gateway mode silently skips it), and a
// GATEWAY_PREFIX that routes a key to the wrong container.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// Container names in docker-compose.services.yml / the backend's gateway routes.
const BLOCK_6_10 = [
  "contract-lifecycle-svc", "clause-template-svc", "obligation-tracking-svc", "board-resolutions-svc",
  "corporate-actions-svc", "counterparty-management-svc", "purchase-request-svc", "purchase-order-svc",
  "spend-controls-svc", "vendor-due-diligence-svc", "procurement-workflow-svc",
  "tax-rules-svc", "tax-determination-svc", "vat-gst-svc", "corporate-tax-svc", "withholding-tax-svc",
  "filing-preparation-svc", "filing-tracker-svc", "compliance-status-svc", "exception-escalation-svc",
  "anomaly-detection-svc", "forecasting-svc", "compliance-risk-scoring-svc", "reconciliation-intelligence-svc",
  "reporting-orchestration-svc", "decision-support-svc", "migration-integrity-svc",
  "mtls-management-svc", "siem-integration-svc", "carta-svc", "key-management-svc",
  "connectivity-api-bridge-svc", "banking-connector-svc", "hris-connector-svc",
  "tax-authority-interface-svc", "esignature-integration-svc", "external-data-feed-svc",
];

/** Registry keys whose DEFAULTS comment names `svc`, read from config.ts source. */
function keysFor(svc) {
  const src = fs.readFileSync(path.join(ROOT, "lib/api/config.ts"), "utf8");
  const defaults = src.slice(src.indexOf("const DEFAULTS"), src.indexOf("} as const"));
  const re = new RegExp(`^\\s+(\\w+):\\s+"[^"]+",\\s*//\\s*${svc}\\b`, "gm");
  return [...defaults.matchAll(re)].map((m) => m[1]);
}

/**
 * Run `fn` against a fresh config.ts instance with `env` applied. The env stays
 * set for the whole callback: ZOIKO_USE_GATEWAY is read at module load, but the
 * gateway URL and per-service overrides are read on every serviceUrl() call.
 */
async function withConfig(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return await fn(await import(`../lib/api/config.ts?${new URLSearchParams(env)}`));
  } finally {
    process.env = saved;
  }
}

test("every Block 6–10 service has a registry key", () => {
  const missing = BLOCK_6_10.filter((svc) => keysFor(svc).length === 0);
  assert.deepEqual(missing, []);
});

test("gateway mode routes every Block 6–10 key to its own container", async () => {
  const gw = "http://gateway.test:8000";
  const wrong = await withConfig({ ZOIKO_USE_GATEWAY: "true", ZOIKO_GATEWAY_URL: gw }, (cfg) => {
    const out = [];
    for (const svc of BLOCK_6_10) {
      for (const key of keysFor(svc)) {
        const url = cfg.serviceUrl(key);
        if (url !== `${gw}/${svc}`) out.push(`${key}: ${url}`);
        if (cfg.serviceLabel(key) !== svc) out.push(`${key}: label ${cfg.serviceLabel(key)}`);
      }
    }
    return out;
  });
  assert.deepEqual(wrong, []);
});

test("per-service env overrides still win in direct mode", async () => {
  const url = await withConfig(
    { ZOIKO_USE_GATEWAY: "false", ZOIKO_TAX_RULES_URL: "http://tax-rules.test:9/" },
    (cfg) => cfg.serviceUrl("taxRules"),
  );
  assert.equal(url, "http://tax-rules.test:9");
});

test("no client or route builds its own URL for a Block 6–10 port", () => {
  // 8100, 8119–8154 and 8183 are the Block 6–10 ports in config.ts.
  const port = /(?:localhost|127\.0\.0\.1):(8100|8119|81[2-4]\d|815[0-4]|8183)\b/;
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, "lib/api"));
  walk(path.join(ROOT, "app/api"));

  const offenders = [];
  for (const f of files) {
    if (f.endsWith(path.join("lib", "api", "config.ts"))) continue;
    fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return; // comments may name ports
      if (port.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
