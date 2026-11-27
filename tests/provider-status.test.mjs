// Guard for lib/provider-status.ts: every Blocks 9-10 provider service shows
// its "not connected" note, and the backend source still has no client for an
// outside provider.
//
// Run: npm test. The backend checks read ZOIKO_BACKEND_DIR (the Blocks 6-10
// backend the verification stack runs) and ZOIKO_BACKEND_MAIN_DIR (backend
// main); each is skipped, not passed, when its checkout is absent.
//
// If a backend check fails because a service gained an outbound client, the
// service may now talk to its provider: verify that against the provider,
// then update lib/provider-status.ts and the allowlist below together.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const PANELS = {
  "tax-authority-interface-svc": "components/admin/tax/FilingPrepAndAuthorityPanel.tsx",
  "siem-integration-svc": "components/admin/security-trust/SiemIntegrationPanel.tsx",
  "carta-svc": "components/admin/security-trust/CartaAssessmentPanel.tsx",
  "key-management-svc": "components/admin/security-trust/KeyManagementPanel.tsx",
  "banking-connector-svc": "components/admin/integration/BankingConnectorPanel.tsx",
  "hris-connector-svc": "components/admin/integration/HrisConnectorPanel.tsx",
  "esignature-integration-svc": "components/admin/integration/EsignaturePanel.tsx",
  "external-data-feed-svc": "components/admin/integration/ExternalDataFeedPanel.tsx",
};

/**
 * The only files in each service that make outbound HTTP calls today. Every
 * one calls another ZoikoSuite service (authorization, envelope resolution,
 * mTLS bootstrap, vault, treasury, tokenization, siem) or the container's own
 * health check, never an outside provider.
 */
const PLATFORM_CLIENTS = new Set([
  "cmd/healthcheck/main.go",
  "internal/authz/client.go",
  "internal/envelope/resolver.go",
  "internal/mtls/mtls.go",
  "internal/siem/client.go",
  "internal/clients/bankaccount.go",
  "internal/clients/vault.go",
  // banking-connector-svc keeps a statement's raw file in document-vault-svc
  // (DOCUMENT_VAULT_SERVICE_URL, default http://document-vault-svc:8094): a
  // platform service, not a bank.
  "internal/documentvault/client.go",
  "internal/tokenization/client.go",
]);
const OUTBOUND = /http\.NewRequest|NewRequestWithContext|http\.(Get|Post)\(|\.Do\(req/;

test("every provider service's panel shows its provider status", () => {
  const status = read("lib/provider-status.ts");
  for (const [svc, panel] of Object.entries(PANELS)) {
    assert.match(status, new RegExp(`"${svc}": \\{\\s*provider: "[^"]+",\\s*connected: false,`), `${svc} has a status`);
    const src = read(panel);
    assert.match(src, new RegExp(`<ProviderStatusNote service="${svc}" />`), `${panel} shows ${svc}'s provider status`);
  }
  // The note never claims a connection.
  assert.doesNotMatch(status, /connected: true/);
  assert.match(read("components/admin/shared/ProviderStatusNote.tsx"), /not connected\./);
});

function goFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".go") && !e.name.endsWith("_test.go")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

for (const [label, envKey, fallback] of [
  ["Blocks 6-10 backend", "ZOIKO_BACKEND_DIR", path.join(ROOT, "..", "zoiko-suite-backend")],
  ["backend main", "ZOIKO_BACKEND_MAIN_DIR", path.join(ROOT, "..", "zoiko-be-latest")],
]) {
  const backend = path.resolve(process.env[envKey] ?? fallback);
  const present = fs.existsSync(path.join(backend, "services", "hris-connector-svc"));

  test(`${label}: no provider service calls an outside provider`, { skip: present ? false : `no checkout at ${backend}` }, () => {
    for (const svc of Object.keys(PANELS)) {
      const dir = path.join(backend, "services", svc);
      assert.ok(fs.existsSync(dir), `${svc} not found in ${backend}`);
      const callers = goFiles(dir)
        .filter((f) => OUTBOUND.test(fs.readFileSync(f, "utf8")))
        .map((f) => path.relative(dir, f).split(path.sep).join("/"));
      const unknown = callers.filter((f) => !PLATFORM_CLIENTS.has(f));
      assert.deepEqual(unknown, [], `${svc} has new outbound callers; check them, then update lib/provider-status.ts`);
    }
  });

  test(`${label}: the tax-authority adapter is off unless enabled, and no HMRC connector exists`, { skip: present ? false : `no checkout at ${backend}` }, () => {
    const dir = path.join(backend, "services", "tax-authority-interface-svc");
    const config = fs.readFileSync(path.join(dir, "internal", "config", "config.go"), "utf8");
    assert.match(config, /Enabled:\s+os\.Getenv\("AUTHORITY_ADAPTER_ENABLED"\) == "true"/);
    for (const f of goFiles(dir)) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /hmrc/i, `${f} mentions HMRC`);
  });
}
