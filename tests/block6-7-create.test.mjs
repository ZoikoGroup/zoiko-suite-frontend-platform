// Static guards for the Block 6-7 create workflows and the jurisdiction fix
// (2026-11-06).
//
// Run: node --test tests/block6-7-create.test.mjs
//
// Each assertion pins a defect that was fixed: a free-text or hardcoded
// jurisdiction that no validating service recognised, a jurisdiction matched
// by substring, an actor or entity the session did not supply, and create
// inputs carrying fields the services compute themselves.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The source of one exported function, up to the next top-level declaration. */
function fn(src, name) {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `no export ${name}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(export |async function |function |const |type |\/\*\*|\/\/ ─)/);
  return src.slice(start, next < 0 ? undefined : start + 1 + next);
}

/** The body of one exported type. */
function typeBody(src, name) {
  const start = src.indexOf(`export type ${name} = {`);
  assert.ok(start >= 0, `no type ${name}`);
  return src.slice(start, src.indexOf("\n};", start));
}

const FORMS = [
  "components/admin/tax/TaxRuleForms.tsx",
  "components/admin/tax/CorporateAndWithholdingForms.tsx",
  "components/admin/legal/LegalCreateForms.tsx",
  "components/admin/compliance/CreateExceptionForm.tsx",
];
const TAX_UI = [
  "components/admin/tax/TaxActionHeader.tsx",
  "components/admin/tax/TaxRulesAndDeterminationPanel.tsx",
  "components/admin/tax/TaxJurisdictionPanel.tsx",
  "components/admin/tax/CorporateAndWithholdingTaxPanel.tsx",
  "components/admin/tax/JurisdictionSelect.tsx",
  ...FORMS,
];

test("rule and determination forms have no free-text jurisdiction", () => {
  for (const f of FORMS) {
    const src = read(f);
    assert.doesNotMatch(src, /<input[^>]*name="(supply_)?jurisdiction_id"/, `${f} takes a jurisdiction as free text`);
    assert.doesNotMatch(src, /<input[^>]*name=\{?["'`]?(supply_)?jurisdiction_id/, `${f} takes a jurisdiction as free text`);
  }
  const forms = read("components/admin/tax/TaxRuleForms.tsx");
  // The old wizard rendered these as text fields from a list.
  assert.doesNotMatch(forms, /\["(supply_)?jurisdiction_id",/, "a jurisdiction field is rendered as text");
  assert.match(forms, /<JurisdictionSelect id="det-jurisdiction_id" name="jurisdiction_id"/);
  assert.match(forms, /<JurisdictionSelect id="det-supply_jurisdiction_id" name="supply_jurisdiction_id"/);
  assert.match(forms, /<JurisdictionSelect\s+id="rule-jurisdiction"\s+name="jurisdiction_id"/);
  // No fallback: the select has no text input to degrade to.
  const select = read("components/admin/tax/JurisdictionSelect.tsx");
  assert.doesNotMatch(select, /<input/, "JurisdictionSelect falls back to free text");
  assert.match(select, /if \(!options\.ok\)/);
  // Submit is disabled when the register cannot be read.
  for (const f of FORMS.filter((f) => !f.endsWith("LegalCreateForms.tsx"))) {
    assert.match(read(f), /disabled=\{pending \|\| !usable\}/, `${f} submits without a jurisdiction register`);
  }
  assert.match(read("components/admin/legal/LegalCreateForms.tsx"), /disabled=\{pending \|\| !usable\}/);
});

test("jurisdictions come from jurisdiction-rules-svc, by UUID", () => {
  const loader = read("components/admin/tax/jurisdiction-options.ts");
  assert.match(loader, /import \{ listJurisdictions \} from "@\/lib\/api\/jurisdictions"/);
  assert.match(loader, /id: j\.jurisdiction_id/, "option value is not the jurisdiction UUID");
  assert.match(loader, /if \(!res\.ok\) return \{ ok: false, error: res\.error\.message \}/, "a failed read is replaced");
  const page = read("app/admin/tax/page.tsx");
  assert.match(page, /const jurisdictions = await loadJurisdictionOptions\(\)/);
  assert.match(page, /<TaxActionHeader jurisdictions=\{jurisdictions\} \/>/);
  assert.match(read("components/admin/tax/TaxJurisdictionPanel.tsx"), /listJurisdictions\(\)/);
  assert.match(read("components/admin/tax/TaxRulesAndDeterminationPanel.tsx"), /listJurisdictions\(\)/);
  assert.match(read("components/admin/compliance/ExceptionAndAnomalyPanels.tsx"), /loadJurisdictionOptions\(\)/);
  assert.match(read("components/admin/legal/CorporateActionsAndCounterpartiesPanel.tsx"), /loadJurisdictionOptions\(\)/);
  // Server Actions refuse anything that is not a register id.
  for (const f of ["app/admin/tax/tax-actions.ts", "app/admin/compliance/exception-actions.ts", "app/admin/legal/register-actions.ts"]) {
    assert.match(read(f), /UUID_RE\.test\(jurisdictionId\)/, `${f} accepts a jurisdiction code`);
  }
  assert.match(read("app/admin/tax/tax-actions.ts"), /UUID_RE\.test\(f\.supply_jurisdiction_id\)/);
});

test("no hardcoded jurisdiction aliases, authorities or substring matching", () => {
  const ALIASES = /uk-gov-01|us-fed-01|sg-iras-01|de-bzst-01|jur-uk-gb|jur-us-fed|jur-sg-|jur-de-fed|"HMRC"|"IRS"|"IRAS"|"BZSt"|🇬🇧|🇺🇸|🇸🇬|🇩🇪/;
  for (const f of TAX_UI) {
    const src = read(f);
    assert.doesNotMatch(src, ALIASES, `${f} has a hardcoded jurisdiction alias or authority`);
    assert.doesNotMatch(src, UUID, `${f} has a hardcoded UUID`);
  }
  const panel = read("components/admin/tax/TaxJurisdictionPanel.tsx");
  assert.doesNotMatch(panel, /const JURISDICTIONS|aliases|\.includes\(a\.toLowerCase\(\)\)|lower\.includes/, "jurisdictions are matched loosely");
  assert.match(panel, /r\.jurisdiction_id === id/);
  assert.match(panel, /jurisdictionsRes\.data\.map\(/, "cards are not the register's rows");
  const rules = read("components/admin/tax/TaxRulesAndDeterminationPanel.tsx");
  assert.doesNotMatch(rules, /JURISDICTION_LABEL|key\?\.includes/);
  assert.match(rules, /register\.get\(jurisdictionId\)/);
  const header = read("components/admin/tax/TaxActionHeader.tsx");
  assert.doesNotMatch(header, /JUR_MAP|AUTH_MAP/);
  // Rule creation and determination go through Server Actions, not the proxy.
  assert.doesNotMatch(header, /fetch\("\/api\/v1\/tax-determinations"|method: "POST",\s*headers[^}]*\}\s*,\s*body: JSON\.stringify\(\{\s*jurisdiction_id/);
});

test("actor and entity fields come from the session", () => {
  const legal = read("lib/api/legal.ts");
  for (const t of ["CreateObligationInput", "CreateCounterpartyInput"]) {
    assert.doesNotMatch(typeBody(legal, t), /created_by|legal_entity_id/, `${t} lets the caller set an actor or entity`);
  }
  for (const name of ["createObligation", "createCounterparty"]) {
    assert.match(fn(legal, name), /legal_entity_id: identity\.legalEntityId, created_by: identity\.principalId/, `${name} does not set the session's actor`);
  }
  assert.match(typeBody(legal, "CreateObligationInput"), /obligation_type: "CONTRACTUAL"/);
  assert.doesNotMatch(typeBody(legal, "CreateObligationInput"), /contract_id|status\?/);

  const tax = read("lib/api/tax.ts");
  assert.match(fn(tax, "updateTaxRule"), /updated_by: identity\?\.principalId/);
  for (const name of ["createCorporateTaxReturn", "createWithholdingObligation"]) {
    const src = fn(tax, name);
    assert.match(src, /legal_entity_id: identity\?\.legalEntityId/, `${name}: entity is not the session's`);
    assert.match(src, /created_by: identity\?\.principalId/, `${name}: author is not the session's`);
    assert.doesNotMatch(src, /\.\.\.input/, `${name} spreads caller input into the body`);
  }
  assert.doesNotMatch(typeBody(tax, "CreateCorporateTaxInput"), /taxable_income|legal_entity_id/, "corporate tax input carries computed or session fields");
  assert.doesNotMatch(typeBody(tax, "CreateWithholdingInput"), /withheld_amount|legal_entity_id/, "withholding input carries computed or session fields");

  const ACTOR_FIELD = /name="(created_by|updated_by|evaluated_by|legal_entity_id|closed_by)"/;
  for (const f of FORMS) assert.doesNotMatch(read(f), ACTOR_FIELD, `${f} asks the reader for an actor or entity`);
  for (const f of ["app/admin/tax/tax-actions.ts", "app/admin/legal/register-actions.ts", "app/admin/compliance/exception-actions.ts"]) {
    const src = read(f);
    assert.match(src, /^"use server";/, `${f} is not a Server Action module`);
    assert.match(src, /decodeSession\(store\.get\(SESSION_COOKIE\)\?\.value\)/, `${f} does not read the session`);
    assert.doesNotMatch(src, /get\(["'](created_by|updated_by|evaluated_by|legal_entity_id|tenant_id|principal_id)["']\)/, `${f} reads an actor from the form`);
  }
  assert.ok(!exists("app/admin/tax/actions.ts"), "the fake-success tax actions are back");
});

test("no invented defaults in the create path", () => {
  const DEFAULTS = /\?\? "(GBP|USD|EUR)"|\|\| "(GBP|USD|EUR)"|defaultValue="(GBP|USD|EUR|20|GB)"|defaultValue=\{?\d|currency: currency \|\| /;
  for (const f of [...TAX_UI, "app/admin/tax/tax-actions.ts", "app/admin/legal/register-actions.ts", "app/admin/compliance/exception-actions.ts"]) {
    assert.doesNotMatch(read(f), DEFAULTS, `${f} invents a currency, rate or jurisdiction`);
  }
  // Fabricated success text that no service response backs.
  for (const f of FORMS) {
    assert.doesNotMatch(read(f), /successfully|pending activation|registered with tax-rules-svc/, `${f} has fixed success text`);
  }
});
