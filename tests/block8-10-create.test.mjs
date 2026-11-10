// Static guards for the Blocks 8-10 create workflows (2026-11-06).
//
// Run: node --test tests/block8-10-create.test.mjs
//
// Each assertion pins a rule of these forms: the mTLS private key is shown
// once and never stored, logged or put in a URL; a SIEM event's stored
// "DELIVERED" status is never shown without saying nothing was delivered; no
// identity, record id, amount or threshold is hardcoded or defaulted; the
// legal entity comes from the session only.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ACTIONS = ["app/admin/intelligence/actions.ts", "app/admin/security/actions.ts", "app/admin/integration/actions.ts"];
const FORMS = [
  "components/admin/intelligence/CreateRecordForm.tsx",
  "components/admin/intelligence/IntelligenceCreateForms.tsx",
  "components/admin/integration/IntegrationCreateForms.tsx",
  "components/admin/security-trust/MtlsIssueDialog.tsx",
  "components/admin/security-trust/SiemIntegrationPanel.tsx",
  "components/admin/security-trust/KeyManagementPanel.tsx",
  "components/admin/tax/FilingPrepAndAuthorityPanel.tsx",
];
const CLIENTS = ["lib/api/intelligence.ts", "lib/api/security-trust.ts", "lib/api/integration.ts", "lib/api/tax-authority.ts"];
const SUPPORT = ["app/admin/intelligence/create-support.ts", "components/admin/intelligence/create-state.ts", "components/admin/security-trust/siem-caveat.ts"];
const ALL = [...ACTIONS, ...FORMS, ...CLIENTS, ...SUPPORT];

test("the mTLS private key is never stored, logged or put in a URL", () => {
  const files = ["components/admin/security-trust/MtlsIssueDialog.tsx", "app/admin/security/actions.ts", "components/admin/security-trust/MtlsManagementPanel.tsx"];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie/, `${f} touches browser storage`);
    assert.doesNotMatch(src, /console\.(log|info|warn|error|debug)/, `${f} logs`);
    assert.doesNotMatch(src, /router\.(push|replace)|searchParams|location\.(href|assign|hash)|history\.(push|replace)State/, `${f} writes a URL`);
  }
  const dialog = read("components/admin/security-trust/MtlsIssueDialog.tsx");
  // Closing clears it from state.
  const close = dialog.slice(dialog.indexOf("const close = () => {"), dialog.indexOf("};", dialog.indexOf("const close = () => {")));
  assert.match(close, /setResult\(null\)/, "closing the dialog does not drop the key");
  assert.match(dialog, /Copy the private key now/, "no copy-now warning");
  // Not sent through useActionState, whose state cannot be cleared.
  assert.doesNotMatch(dialog, /useActionState/);
  // The key is never part of a request the console makes after issuance.
  for (const f of ["lib/api/security-trust.ts", "app/admin/security/actions.ts"]) {
    assert.doesNotMatch(read(f), /(apiPost|apiGet|apiPut|apiPatch|fetch)\([^;]*private_key/, `${f} sends the key onward`);
  }
});

test("a SIEM event's stored DELIVERED status is never shown without the no-delivery caveat", () => {
  const caveat = read("components/admin/security-trust/siem-caveat.ts");
  assert.match(caveat, /recorded by siem-integration-svc — no external delivery is configured/);
  assert.match(caveat, /\$\{SIEM_NO_DELIVERY\} \(stored status: \$\{stored\}\)/);

  const panel = read("components/admin/security-trust/SiemIntegrationPanel.tsx");
  assert.match(panel, /siemStatusText\(e\.status\)/, "the panel renders the stored status without the caveat");
  assert.doesNotMatch(panel, /\{(e|evt|event)\.status\}/, "the panel renders a raw event status");
  assert.doesNotMatch(panel, /events_sent[^;\n]*\b(delivered|sent to)\b/i);

  const actions = read("app/admin/security/actions.ts");
  assert.match(actions, /siemStatusText\(show\(e\.status\)\)/, "the test-event result shows the raw status");
  assert.match(actions, /no external delivery is configured/);

  // No other owned security file mentions DELIVERED except as the caveat explains it.
  for (const f of ["components/admin/security-trust/SecuritySummaryBar.tsx", "components/admin/security-trust/SecurityProcessTimeline.tsx", "components/admin/security-trust/SecurityActionHeader.tsx", "app/admin/security/page.tsx"]) {
    assert.doesNotMatch(read(f), /DELIVERED/, `${f} shows DELIVERED on its own`);
  }
  // Never claimed as delivered anywhere in the SIEM UI.
  assert.doesNotMatch(panel + actions, /(successfully|was) (delivered|sent to (Splunk|the SIEM))/i);
});

test("no hardcoded UUIDs in the create workflows", () => {
  for (const f of ALL) assert.doesNotMatch(read(f), UUID, `${f} has a UUID literal`);
});

test("no default amounts, thresholds or counts: blank fields are refused or left to the service", () => {
  for (const f of ACTIONS) {
    const src = read(f);
    assert.doesNotMatch(src, /numberOf\([^)]*\)\s*(\?\?|\|\|)\s*-?\d/, `${f} defaults a number`);
    assert.doesNotMatch(src, /Number\([^)]*\)\s*(\?\?|\|\|)\s*-?\d/, `${f} defaults a number`);
    assert.doesNotMatch(src, /(threshold_value|z_score_cutoff|observed_value|expected_value|horizon_periods|rotation_days|_count)\s*:\s*-?\d/, `${f} sends a fixed figure`);
  }
  // Form fields carry no prefilled value except the sender's own name and a hidden row reference.
  for (const f of FORMS) {
    for (const m of read(f).matchAll(/initial:\s*([^,}\n]+)/g)) {
      assert.match(m[1].trim(), /^("zoiko-console"|exporterId)$/, `${f} prefills ${m[1]}`);
    }
    assert.doesNotMatch(read(f), /defaultValue=\{?["']?\d/, `${f} prefills a number`);
  }
  // Every risk-score count is required: the console does not supply the 0.
  const forms = read("components/admin/intelligence/IntelligenceCreateForms.tsx");
  for (const k of ["open_obligations_count", "policy_violations_count", "audit_exceptions_count", "privacy_incidents_count", "tax_penalties_count"]) {
    assert.match(forms, new RegExp(`name: "${k}"[^}]*required: true`), `${k} is not required`);
  }
  // rotation_days is the reader's: the service's own default (90) is never relied on silently.
  assert.match(read("app/admin/security/actions.ts"), /Rotation days is required\./);
});

test("identity is the session's: no form or action takes a tenant, principal or legal entity", () => {
  for (const f of [...ACTIONS, ...FORMS]) {
    const src = read(f);
    assert.doesNotMatch(src, /name:\s*"(legal_entity_id|tenant_id|principal_id|created_by)"/, `${f} has an identity field`);
    assert.doesNotMatch(src, /(text|fd\.get)\((fd, )?"(legal_entity_id|tenant_id|principal_id)"\)/, `${f} reads identity from the form`);
  }
  assert.match(read("app/admin/intelligence/create-support.ts"), /decodeSession\(store\.get\(SESSION_COOKIE\)\?\.value\)/);
  for (const f of CLIENTS) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/legal_entity_id:\s*([^,}\n]+)/g)) {
      if (/^string\b/.test(m[1].trim())) continue; // a type member, not a value
      assert.match(m[1], /identity(\?)?\.legalEntityId/, `${f} sends a legal entity that is not the session's: ${m[1]}`);
    }
  }
});

test("writes carry the purpose context each service requires", () => {
  const sec = read("lib/api/security-trust.ts");
  assert.match(sec, /"\/v1\/mtls\/certificates"[\s\S]{0,200}purposeContext: "security\.mtls\.certificate\.issue"/);
  assert.match(sec, /"\/v1\/keys", payload, \{ identity, purposeContext: "security\.kms\.key\.register" \}/);
  const integ = read("lib/api/integration.ts");
  assert.match(integ, /purposeContext: "integration\.banking\.connection"/);
  assert.match(integ, /"\/v1\/hris\/integrations"[\s\S]{0,200}purposeContext: "integration\.hris\.sync"/);
  assert.match(read("lib/api/tax-authority.ts"), /purposeContext: "tax_compliance"/);
});

test("decision support: the console requests a precedent-engine recommendation and never submits a model proposal", () => {
  const src = read("lib/api/intelligence.ts");
  const fn = src.slice(src.indexOf("export async function requestRecommendation"));
  assert.doesNotMatch(fn, /proposal\s*:/);
  for (const f of ["app/admin/intelligence/actions.ts", "components/admin/intelligence/IntelligenceCreateForms.tsx"]) {
    assert.doesNotMatch(
      read(f),
      /name:\s*"(proposal|model_id|model_version|prompt_version|confidence_score|recommended_action)"|text\(fd, "(model_id|model_version|prompt_version|confidence_score|recommended_action)"\)/,
      `${f} lets a person enter a model output`,
    );
  }
});

test("refusals are shown with the service's status and message, never as success", () => {
  const support = read("app/admin/intelligence/create-support.ts");
  assert.match(support, /httpStatus: res\.error\.status/);
  assert.match(support, /message: describeError\(res\.error\)/);
  const form = read("components/admin/intelligence/CreateRecordForm.tsx");
  assert.match(form, /role="alert"/);
  assert.match(form, /HTTP \{state\.httpStatus\}/);
  assert.match(form, /disabled=\{pending\}/, "the submit button is not disabled while pending");
  // The envelope form says up front that the service refuses it.
  assert.match(read("components/admin/integration/IntegrationCreateForms.tsx"), /refuses the envelope \(503\)/);
  // Key management is labelled as metadata only, not a KMS.
  assert.match(read("components/admin/security-trust/KeyManagementPanel.tsx"), /It is a registry, not a KMS/);
});

test("existing labels the browser tests use are kept", () => {
  assert.match(read("components/admin/security-trust/CartaAssessmentPanel.tsx"), /Evaluate Access/);
  assert.match(read("components/admin/security-trust/CartaAssessmentPanel.tsx"), /Send to carta-svc/);
  assert.match(read("components/admin/security-trust/KeyManagementPanel.tsx"), /\n\s+Rotate\n/);
  assert.match(read("components/admin/integration/HrisConnectorPanel.tsx"), /\n\s+Sync\n/);
  assert.match(read("components/admin/integration/BankingConnectorPanel.tsx"), /\n\s+Sync\n/);
});
