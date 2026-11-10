// Regression guard for the Blocks 6-10 frontend pass of 2026-11-05.
//
// Run: npm test   (backend checks run when ZOIKO_BACKEND_DIR points at a
// fix/blocks-6-10-final checkout)
//
// Each assertion pins a defect that was found in the console and fixed: a
// failure reported as an empty list, an identity the session did not supply,
// a write the service refuses, or a figure nobody recorded.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const ROUTE = read("app/api/v1/[...path]/route.ts");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** The source of one `if (endpoint === "<ep>") { … }` branch of the proxy. */
function branch(ep) {
  const start = ROUTE.indexOf(`endpoint === "${ep}"`);
  assert.ok(start >= 0, `no proxy branch for ${ep}`);
  return ROUTE.slice(start, ROUTE.indexOf("\n  }\n", start));
}

const BLOCK_6_7_LISTS = [
  "tax-rules", "tax-determinations", "vat-returns", "corporate-tax-returns", "withholding-tax",
  "filing-preparation/drafts", "tax-authority/interfaces", "tax/deadlines",
  "contracts", "clauses", "obligations", "meetings", "corporate-actions", "counterparties", "resolutions",
  "purchase-orders", "purchase-requests", "spend-controls/limits", "vendor-checks",
  "filing-tracker/requirements", "compliance-status", "exception-escalation/exceptions",
];

test("Blocks 6-7 proxy reads report the upstream failure, not 200 with an empty list", () => {
  const GET = ROUTE.slice(ROUTE.indexOf("export async function GET"), ROUTE.indexOf("export async function POST"));
  for (const ep of BLOCK_6_7_LISTS) {
    const start = GET.indexOf(`endpoint === "${ep}"`);
    assert.ok(start >= 0, `no GET branch for ${ep}`);
    const b = GET.slice(start, GET.indexOf("\n  }\n", start));
    assert.doesNotMatch(b, /res\.ok \? res\.data/, `${ep} turns a failure into an empty list`);
    assert.match(b, /listResponse\(/, `${ep} does not use listResponse`);
    assert.doesNotMatch(b, UUID, `${ep} has a hardcoded id`);
  }
});

test("Blocks 6-7 proxy writes take identity from the session and invent no values", () => {
  for (const ep of ["contracts", "clauses", "corporate-actions", "meetings", "purchase-orders", "spend-controls/policies",
    "filing-tracker/requirements", "exception-escalation/exceptions", "compliance-status/evaluate"]) {
    const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    const start = POST.indexOf(`endpoint === "${ep}"`);
    assert.ok(start >= 0, `no POST branch for ${ep}`);
    const b = POST.slice(start, POST.indexOf("\n  }\n", start));
    assert.doesNotMatch(b, UUID, `${ep}: hardcoded identity`);
    assert.doesNotMatch(b, /\?\? "(GBP|USD|PROCUREMENT|MONTHLY)"|\?\? 0\b|new Date\(\)\.toISOString/, `${ep}: an invented default`);
  }
  // The contract body is mapped field by field, not spread into a camelCase input.
  assert.doesNotMatch(branch("contracts").split("draftContract(")[1] ?? "", /\.\.\.body/);
});

test("developer dispatch routes need a session, use its identity and only registered ports", () => {
  for (const f of ["app/api/backend/dispatch/route.ts", "app/api/admin/service-inputs/dispatch/route.ts", "app/api/backend/ping/route.ts"]) {
    const src = read(f);
    assert.match(src, /dispatchIdentity\(req\)/, `${f} does not require a session`);
    assert.match(src, /dispatchPort\(/, `${f} accepts any port`);
    assert.doesNotMatch(src, UUID, `${f} has a hardcoded identity`);
  }
  const guard = read("lib/dev-dispatch.ts");
  assert.match(guard, /IDENTITY_HEADERS = \["x-tenant-id", "x-principal-id", "x-legal-entity-id", "authorization"\]/);
});

test("Block 6 legal writes go through the shared client (full envelope, upstream detail)", () => {
  const src = read("lib/api/legal.ts");
  assert.doesNotMatch(src, /await fetch\(/, "legal.ts still fetches on its own");
  assert.match(src, /counterparty: "legal\.counterparty\.maintenance"/, "counterparty writes need X-Purpose-Context");
  // Clause and corporate-action authorship is the session's.
  assert.match(src, /created_by: identity\.principalId/);
});

test("vendor due diligence sends the purpose context its envelope requires", () => {
  assert.match(read("lib/api/vendor-due-diligence.ts"), /purposeContext: "procurement\.vendor\.due_diligence"/);
});

test("tax client reads the services' own keys and invents nothing", () => {
  const src = read("lib/api/tax.ts");
  assert.match(src, /d\.corporate_tax_returns \?\? \[\]/);
  assert.match(src, /d\.withholding_tax_obligations \?\? \[\]/);
  for (const fake of ['"https://api.tax.gov"', '"jur-uk-gb"', '"HEALTHY"', '"tax-determination-engine"', '"FINALIZED"', "33333333-"]) {
    assert.ok(!src.includes(fake), `tax.ts still contains ${fake}`);
  }
  assert.doesNotMatch(src, /\/interfaces\/\$\{interfaceId\}\/test/, "the non-existent /test route");
  assert.match(src, /\/v1\/tax-authority\/health/);
  assert.match(src, /\/validate`/, "finalize needs a validate first");
  assert.match(src, /evaluated_by: identity\?\.principalId/);
  assert.ok(!exists("app/admin/tax/actions.ts"), "the fake-success tax actions are back");
});

test("VAT filing: entity and filer are the session's, evidence goes in X-Evidence-Refs", () => {
  const actions = read("app/admin/tax/vat-actions.ts");
  assert.match(actions, /const legalEntityId = identity\.legalEntityId;/);
  assert.doesNotMatch(actions, /Lingaraj|GB-987654321/);
  assert.match(read("lib/api/tax.ts"), /evidenceRefs: input\.evidence_refs/);
  assert.doesNotMatch(read("components/admin/tax/VatGstWorkbench.tsx"), /defaultValue="(11111111|GB-987654321|Lingaraj|500000|200000)/);
});

test("migration-integrity acts only as the session", () => {
  const client = read("lib/api/migration-integrity.ts");
  assert.doesNotMatch(client, /DEFAULT_(TENANT|PRINCIPAL|ENTITY)|11111111-|33333333-/);
  const actions = read("app/admin/migrations/actions.ts");
  assert.doesNotMatch(actions, /opts\?: HeaderOptions|runMigrationQASuiteAction|99999999-/);
  assert.match(actions, /sessionHeaders\(\)/);
  const wb = read("components/admin/migrations/MigrationIntegrityWorkbench.tsx");
  assert.doesNotMatch(wb, /tenantScope|PRIMARY_TENANT|SECONDARY_TENANT/);
  assert.match(client, /remediation_evidence_ref/);
  assert.match(client, /control_totals/);
});

test("no fake actions, random subjects or invented figures on the Blocks 6-10 pages", () => {
  for (const f of ["components/admin/security-trust/SecurityActionHeader.tsx", "components/admin/integration/IntegrationActionHeader.tsx"]) {
    assert.doesNotMatch(read(f), /alert\(/, `${f} has a button that only alerts`);
  }
  assert.doesNotMatch(read("components/admin/security-trust/CartaAssessmentPanel.tsx"), /Math\.random|randomUUID|10\.244\./);
  for (const f of ["legal/LegalProcessTimeline", "compliance/ComplianceProcessTimeline", "tax/TaxProcessTimeline", "commercial-ops/CommercialOpsProcessTimeline"]) {
    const src = read(`components/admin/${f}.tsx`);
    assert.doesNotMatch(src, /\?\? \d+|examples:|port: "/, `${f} shows invented counts, samples or ports`);
  }
  for (const f of ["legal/LegalSummaryBar", "compliance/ComplianceSummaryBar"]) {
    assert.match(read(`components/admin/${f}.tsx`), /fetchPanelListOrNull/, `${f} shows a failed read as 0`);
  }
  for (const f of ["legal/LegalActionHeader", "compliance/ComplianceActionHeader"]) {
    const src = read(`components/admin/${f}.tsx`);
    assert.doesNotMatch(src, /All nominal|services in compose|uk-gov-01|22222222-/, `${f} has static status or hardcoded ids`);
  }
  for (const f of ["legal", "compliance", "tax", "commercial-ops", "intelligence", "integration"]) {
    assert.doesNotMatch(read(`app/admin/${f}/page.tsx`), /ports="/, `/admin/${f} shows hardcoded ports`);
  }
  // Redirected in next.config, before render (a render-time redirect() raised React #310).
  assert.ok(!exists("app/admin/integrations/page.tsx"), "the /admin/integrations page is back");
  assert.match(read("next.config.ts"), /source: "\/admin\/integrations", destination: "\/admin\/integration"/);
  assert.doesNotMatch(read("lib/constants.ts"), /Cap Table|cap table/);
});

test("panels report every failed read, not only an unreachable service", () => {
  const files = [
    "legal/BoardResolutionsPanel", "legal/ClausesAndTemplatesPanel", "legal/ContractLifecyclePanel",
    "legal/CorporateActionsAndCounterpartiesPanel", "legal/ObligationTrackingPanel",
    "tax/CorporateAndWithholdingTaxPanel", "tax/TaxRulesAndDeterminationPanel", "tax/VatGstReturnsPanel",
    "tax/FilingPrepAndAuthorityPanel", "compliance/CompliancePanels", "commercial-ops/PurchaseOrdersAndSpendPanel",
  ];
  for (const f of files) {
    assert.doesNotMatch(read(`components/admin/${f}.tsx`), /error\.kind === "unreachable"/, `${f} hides non-network failures`);
  }
  const exc = read("components/admin/compliance/ExceptionAndAnomalyPanels.tsx");
  assert.match(exc, /listEscalatedExceptions\(identity\)/, "exceptions are read without an identity");
  assert.doesNotMatch(exc, /All statutory audit readiness controls verified/);
});

test("status models match the services", () => {
  assert.match(read("lib/api/legal.ts"), /"CANDIDATE" \| "PLANNED" \| "ACTIVE" \| "DUE" \| "IN_PROGRESS"/);
  assert.match(read("lib/api/purchase-orders.ts"), /"DRAFT" \| "PENDING_APPROVAL" \| "APPROVED" \| "ISSUED" \| "ON_HOLD" \| "CANCELLED" \| "CLOSED"/);
  assert.match(read("lib/api/tax.ts"), /"DRAFT" \| "VALIDATING" \| "PREPARED" \| "BLOCKED" \| "READY_FOR_SUBMISSION"/);
  assert.match(read("components/admin/commercial-ops/OrderRow.tsx"), /const isClosed = order\.po_status !== "ISSUED";/);
});

// ── Against the backend source, when a checkout is available ─────────────────

const BACKEND = process.env.ZOIKO_BACKEND_DIR ?? path.resolve(ROOT, "..", "zoiko-suite-backend");
const svc = (name, rel) => path.join(BACKEND, "services", name, "internal", rel);
const HAS_BACKEND = fs.existsSync(svc("tax-authority-interface-svc", "handler/authority.go"));
const backend = (name, rel) => fs.readFileSync(svc(name, rel), "utf8");
const skipBackend = HAS_BACKEND ? false : `no Blocks 6-10 backend checkout at ${BACKEND}`;

test("backend: the routes and fields the fixed clients rely on exist", { skip: skipBackend }, () => {
  assert.match(backend("tax-authority-interface-svc", "handler/authority.go"), /r\.Get\("\/health"/);
  assert.match(backend("filing-preparation-svc", "domain/types.go"), /ValidatedBy\s+string\s+`json:"validated_by"`/);
  assert.match(backend("filing-preparation-svc", "domain/types.go"), /FinalizedBy string `json:"finalized_by"`/);
  assert.match(backend("corporate-tax-svc", "handler/handler.go"), /"corporate_tax_returns"/);
  assert.match(backend("withholding-tax-svc", "handler/handler.go"), /"withholding_tax_obligations"/);
  assert.match(backend("vendor-due-diligence-svc", "envelope/contract.go"), /PurposeContext:\s+RequiredOnWrite/);
  assert.match(backend("counterparty-management-svc", "envelope/contract.go"), /PurposeContext:\s+RequiredOnWrite/);
  assert.match(backend("migration-integrity-svc", "domain/requests.go"), /remediation_evidence_ref is required/);
  assert.match(backend("tax-determination-svc", "handler/handler.go"), /seller_party_id is required/);
});

test("an expired or tampered session cannot loop between /login and /admin", () => {
  for (const f of ["app/login/page.tsx", "app/page.tsx"]) {
    assert.match(read(f), /decodeSession\(cookieStore\.get\(SESSION_COOKIE\)\?\.value\)/, `${f} trusts a cookie it did not verify`);
  }
  assert.match(read("proxy.ts"), /res\.cookies\.delete\(SESSION_COOKIE\)/);
});

test("compliance.ts has no dead reads against routes or shapes the services do not have", () => {
  const src = read("lib/api/compliance.ts");
  // /v1/scores does not exist (compliance-risk-scoring-svc serves /v1/risk-scores); anomalies and
  // recommendations are read through lib/api/intelligence.ts with the services' real shapes.
  assert.doesNotMatch(src, /"\/v1\/scores"|getRiskScoringSummary|getDecisionSupportChecklist|export async function listAnomalies/);
});

test("the session's legal entity always wins over a request body", () => {
  // `{ legal_entity_id: session, ...body }` lets a body field override the
  // session's entity; the session value must come after any spread.
  for (const f of ["lib/api/integration.ts", "lib/api/security-trust.ts", "lib/api/intelligence.ts", "lib/api/tax-authority.ts", "lib/api/legal.ts", "lib/api/tax.ts"]) {
    assert.doesNotMatch(read(f), /legal_entity_id: identity\??\.legalEntityId,\s*\.\.\./, `${f}: a spread after the session's legal entity`);
  }
});

test("a session never inherits the demo identity", () => {
  const auth = read("lib/auth.ts");
  const decode = auth.slice(auth.indexOf("export function decodeSession"), auth.indexOf("export function isPlatformAdmin"));
  assert.doesNotMatch(decode, /DEMO_IDENTITY/, "decodeSession fills missing identity from DEMO_IDENTITY");
});
