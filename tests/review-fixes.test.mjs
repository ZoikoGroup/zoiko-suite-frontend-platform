// Guards for the review fixes on the Blocks 6-10 branch.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ROUTE = read("app/api/v1/[...path]/route.ts");

test("Finance entity-scoped reads fail closed without a legal entity (never unfiltered)", () => {
  const set = ROUTE.match(/const ENTITY_SCOPED_FINANCE_READS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(set, "the entity-scoped read set is missing");
  for (const ep of ["journals", "fiscal-periods", "ar-invoices", "ap-invoices", "intercompany/entries"]) {
    assert.ok(set[1].includes(`"${ep}"`), `${ep} is not guarded`);
  }
  const guard = ROUTE.indexOf("ENTITY_SCOPED_FINANCE_READS.has(endpoint) && !identity.legalEntityId");
  assert.ok(guard > 0, "the guard is missing");
  assert.match(ROUTE.slice(guard, guard + 400), /status: 403/);
  // It runs before any of the handlers it protects.
  for (const ep of ["journals", "intercompany/entries", "ar-invoices", "ap-invoices"]) {
    assert.ok(ROUTE.indexOf(`endpoint === "${ep}"`) > guard, `${ep} is handled before the guard`);
  }
});

test("the AI-run list stays a 501 until backend main serves one", () => {
  const at = ROUTE.indexOf(`endpoint === "ai-governance/runs"`);
  assert.match(ROUTE.slice(at, at + 400), /status: 501/);
  assert.doesNotMatch(read("lib/api/ai-governance.ts"), /\/v1\/ai-runs", identity\)|listAIRuns/);
});

test("createAIRun declares the service's own request (run_type, model_id, prompt_version, audit_id)", () => {
  const src = read("lib/api/ai-governance.ts");
  assert.match(src, /export type CreateAIRunBody = \{[\s\S]*?run_type: string;[\s\S]*?model_id: string;[\s\S]*?prompt_version: string;[\s\S]*?audit_id: string;/);
  assert.doesNotMatch(src, /model_provider: string;\s*model_name: string;\s*purpose: string;/);
});

test("lifecycle actions use the shared session check and take dates already in UTC", () => {
  const src = read("app/admin/lifecycle-actions.ts");
  assert.match(src, /import \{ sessionIdentity \} from "@\/app\/admin\/intelligence\/create-support";/);
  assert.doesNotMatch(src, /async function sessionIdentity/, "a weaker local session check is back");
  // The server never reads a bare local time in its own timezone.
  assert.match(src, /ISO_WITH_OFFSET\.test\(raw\)/);
  assert.match(read("components/admin/shared/RowActions.tsx"), /f\.kind === "datetime-local"[\s\S]{0,160}toISOString\(\)/);
});

test("the shared session check requires tenant, principal and legal entity", () => {
  const src = read("app/admin/intelligence/create-support.ts");
  assert.match(src, /if \(!session\?\.email \|\| !session\.tenantId \|\| !session\.principalId \|\| !session\.legalEntityId\) return null;/);
});

test("pick-lists are served by a session-checked GET route over a fixed set of kinds", () => {
  const route = read("app/api/pick-lists/[kind]/route.ts");
  assert.match(route, /if \(!isPickListKind\(kind\)\)[\s\S]*?status: 404/);
  assert.match(route, /if \(!options\)[\s\S]*?status: 401/);
  const lib = read("lib/pick-lists.ts");
  assert.match(lib, /const identity = await sessionIdentity\(\);\s*if \(!identity\) return null;/);
  // The component reads over GET (parallel), not a Server Action.
  const pick = read("components/admin/shared/PickList.tsx");
  assert.match(pick, /fetch\(`\/api\/pick-lists\/\$\{kind\}`/);
  assert.doesNotMatch(pick, /"use server"|loadPickList\(/);
});

test("bridge Configure refuses a provider profile that is not key@version", () => {
  const cat = read("lib/lifecycle/catalog.ts");
  assert.match(cat, /validate: \(\{ provider_profile \}\) =>/);
  assert.match(read("app/admin/lifecycle-actions.ts"), /const invalidReason = spec\.validate\?\.\(body\);\s*if \(invalidReason\) return \{ ok: false/);
});

test("a failed compliance evaluations read does not hide gaps and exceptions", () => {
  const src = read("components/admin/compliance/CompliancePanels.tsx");
  assert.doesNotMatch(src, /if \(!evalRes\.ok\) return /);
  assert.match(src, /!evalRes\.ok \? \(/);
});

test("panels that call the gateway carry the session envelope (toIdentity)", () => {
  assert.match(read("components/admin/commercial-ops/PurchaseRequestPanel.tsx"), /toIdentity\(session\)/);
});
