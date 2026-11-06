// Frontend-to-backend workflows through the console's own API (/api/v1), for
// the Blocks 6-10 services, against a live verification stack. Each test
// writes through the console, then reads back through the console, so it
// proves the client, proxy mapping, identity headers and the service agree.

import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { ID, TAG, TODAY, consoleApi, list, liveOnly, seed, sessionValue } from "./live";

liveOnly();
test.describe.configure({ mode: "serial" });

const OTHER = () => sessionValue(ID.principal, ID.otherTenant, ID.otherEntity);
const ids = (rows: Record<string, unknown>[], key: string) => rows.map((r) => String(r[key]));

/** Write through the console, then find the record in its list as this tenant and not as another. */
async function roundTrip(
  request: Parameters<typeof consoleApi>[0],
  write: string,
  body: unknown,
  read: string,
  key: string,
  idField: string,
) {
  const created = await consoleApi(request, "POST", write, body);
  expect(created.status, JSON.stringify(created.json)).toBeLessThan(300);
  const id = String(created.json?.[idField]);
  expect(id).not.toBe("undefined");
  expect(created.json?.legal_entity_id ?? ID.entity).toBe(ID.entity);

  const mine = await consoleApi(request, "GET", read);
  expect(mine.status).toBe(200);
  expect(ids(list(mine.json, key), idField)).toContain(id);

  const theirs = await consoleApi(request, "GET", read, undefined, OTHER());
  expect(theirs.status).toBe(200);
  expect(ids(list(theirs.json, key), idField)).not.toContain(id);
  return created.json!;
}

// ── Session and route guards ────────────────────────────────────────────────

const READS = [
  "contracts", "clauses", "obligations", "meetings", "corporate-actions", "counterparties", "resolutions",
  "purchase-orders", "purchase-requests", "spend-controls/limits", "vendor-checks",
  "tax-rules", "tax-determinations", "vat-returns", "corporate-tax-returns", "withholding-tax",
  "filing-preparation/drafts", "tax-authority/interfaces", "filing-tracker/requirements",
  "compliance-status", "exception-escalation/exceptions",
  "intelligence/anomalies", "intelligence/forecasts", "intelligence/risk-scores", "intelligence/reconciliations",
  "intelligence/reports", "intelligence/recommendations", "intelligence/migrations",
  "security/certificates", "security/keys", "security/events", "security/assessments",
  "integration/connections", "integration/banking", "integration/hris", "integration/envelopes", "integration/feeds",
];

test("no session or a forged session: every Blocks 6-10 read and write is 401", async ({ request }) => {
  const forged = `${sessionValue().split(".")[0]}.forged`;
  for (const path of READS) {
    expect((await consoleApi(request, "GET", path, undefined, null)).status, path).toBe(401);
    expect((await consoleApi(request, "GET", path, undefined, forged)).status, path).toBe(401);
  }
  for (const path of ["clauses", "contracts", "tax-rules", "filing-tracker/requirements", "security/assessments/evaluate"]) {
    expect((await consoleApi(request, "POST", path, {}, null)).status, path).toBe(401);
  }
});

test("every Blocks 6-10 read answers 200 with its list for a signed-in tenant", async ({ request }) => {
  for (const path of READS) {
    const r = await consoleApi(request, "GET", path);
    expect(r.status, `${path}: ${JSON.stringify(r.json)}`).toBe(200);
    expect(Object.values(r.json ?? {}).some(Array.isArray), path).toBe(true);
  }
});

test("developer dispatch routes refuse anonymous callers and unregistered ports", async ({ request }) => {
  expect((await request.post("/api/backend/dispatch", { data: { port: 8119, path: "/healthz" } })).status()).toBe(401);
  expect((await request.get("/api/backend/ping?port=8119")).status()).toBe(401);
  expect((await request.post("/api/admin/service-inputs/dispatch", { data: { port: 8119, path: "/healthz" } })).status()).toBe(401);
  const signedIn = { headers: { Cookie: `zoiko_session=${sessionValue()}` } };
  expect((await request.post("/api/backend/dispatch", { ...signedIn, data: { port: 22, path: "/" } })).status()).toBe(400);
  expect((await request.get("/api/backend/ping?port=5432", signedIn)).status()).toBe(400);
});

// ── Block 6: legal ──────────────────────────────────────────────────────────

test("clause-template: draft a clause; the author and entity are the session's", async ({ request }) => {
  const clause = await roundTrip(request, "clauses", {
    title: `e2e clause ${TAG}`, category: "CONFIDENTIALITY", body: "Each party keeps the other's information confidential.",
    jurisdiction_id: "GB", effective_from: TODAY, created_by: crypto.randomUUID(), legal_entity_id: ID.otherEntity,
  }, "clauses", "clauses", "clause_id");
  expect(clause.status).toBe("DRAFT");
  expect(clause.created_by).toBe(ID.principal);
  const missing = await consoleApi(request, "POST", "clauses", { title: "x" });
  expect(missing.status).toBe(400);
  expect(missing.json?.fields).toEqual(expect.arrayContaining(["category", "body", "jurisdiction_id", "effective_from"]));
});

test("contract-lifecycle: draft a contract through the console", async ({ request }) => {
  const contract = await roundTrip(request, "contracts", {
    title: `e2e contract ${TAG}`, contract_type: "MSA", counterparty_id: crypto.randomUUID(),
    effective_from: TODAY, currency: "GBP", total_value: 1000,
  }, "contracts", "contracts", "contract_id");
  expect(contract.status).toBe("DRAFT");
});

test("corporate-actions: record an action; created_by is pinned to the principal", async ({ request }) => {
  const action = await roundTrip(request, "corporate-actions", {
    title: `e2e action ${TAG}`, action_type: "DIVIDEND", effective_date: TODAY,
  }, "corporate-actions", "corporate_actions", "action_id");
  expect(action.created_by).toBe(ID.principal);
});

// ── Block 6: procurement ────────────────────────────────────────────────────

test("spend-controls: set a limit; a write without amount or currency is refused, not defaulted", async ({ request }) => {
  const created = await consoleApi(request, "POST", "spend-controls/policies", {
    category: `E2E-${TAG}`, period: "MONTHLY", threshold_amount: 500, currency_code: "GBP",
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  // The list maps spend_policy_id to limit_id.
  const id = String(created.json?.spend_policy_id);
  const mine = await consoleApi(request, "GET", "spend-controls/limits");
  expect(ids(list(mine.json, "spend_limits"), "limit_id")).toContain(id);
  const theirs = await consoleApi(request, "GET", "spend-controls/limits", undefined, OTHER());
  expect(ids(list(theirs.json, "spend_limits"), "limit_id")).not.toContain(id);

  const missing = await consoleApi(request, "POST", "spend-controls/policies", { category: "X" });
  expect(missing.status).toBe(400);
  const po = await consoleApi(request, "POST", "purchase-orders", {});
  expect(po.status).toBe(400);
  expect(po.json?.fields).toEqual(["total_amount", "currency_code"]);
});

// ── Block 7: tax ────────────────────────────────────────────────────────────

test("tax-rules: create a rule", async ({ request }) => {
  const rule = await roundTrip(request, "tax-rules", {
    jurisdiction_id: "GB", rule_code: `E2E-${TAG}`, name: `e2e rule ${TAG}`, category: "VAT",
    tax_rate_percentage: 20, effective_from: TODAY,
  }, "tax-rules", "tax_rules", "rule_id");
  expect(rule.created_by).toBe(ID.principal);
});

test("tax-determination: the TAX-03 inputs reach the service and the evaluator is the session's", async ({ request }) => {
  const res = await consoleApi(request, "POST", "tax-determinations", {
    transaction_id: `tx-${TAG}`, jurisdiction_id: "GB", tax_category: "VAT", gross_amount: 100, currency: "GBP",
    seller_party_id: crypto.randomUUID(), buyer_party_id: crypto.randomUUID(), supply_jurisdiction_id: "GB",
    supply_date: TODAY, product_classification: "STANDARD", supply_kind: "SERVICES", supply_type: "B2C",
    evaluated_by: "someone-else",
  });
  // The zv stack's jurisdiction-rules-svc has no seeded GB jurisdiction for a
  // fresh tenant, so the service may refuse the jurisdiction (an environment
  // gap, see the 2026-11-04 report). Anything but a TAX-03 "is required"
  // refusal proves the console sends a complete request.
  expect(String(res.json?.error ?? "")).not.toMatch(/is required/);
  if (res.status < 300) expect(res.json?.evaluated_by).toBe(ID.principal);
});

test("filing-preparation: create, validate, then finalize only when validated", async ({ request }) => {
  const draft = await consoleApi(request, "POST", "filing-preparation/drafts", {
    jurisdiction_id: "GB", filing_type: "VAT100", period_key: "2026-Q3", due_date: "2026-12-07", payload_data: '{"box1":10}',
  });
  expect(draft.status, JSON.stringify(draft.json)).toBeLessThan(300);
  const id = String(draft.json?.draft_id);
  expect(draft.json?.created_by).toBe(ID.principal);
  const validated = await consoleApi(request, "POST", `filing-preparation/drafts/${id}/validate`, {});
  expect(validated.status, JSON.stringify(validated.json)).toBeLessThan(300);
  expect(["PREPARED", "BLOCKED"]).toContain(validated.json?.validation_status);
  const finalized = await consoleApi(request, "POST", `filing-preparation/drafts/${id}/finalize`, {});
  if (validated.json?.validation_status === "PREPARED") {
    expect(finalized.status).toBeLessThan(300);
    expect(finalized.json?.validation_status).toBe("READY_FOR_SUBMISSION");
  } else {
    expect(finalized.status).toBe(422); // a BLOCKED draft cannot be finalized
  }
  const deadlines = await consoleApi(request, "GET", "tax/deadlines");
  expect(ids(list(deadlines.json, "deadlines"), "id")).toContain(id);
});

test("tax-authority-interface: registered interfaces read back; health passes the adapter refusal through", async ({ request }) => {
  const created = await seed(request, "tax-authority-interface-svc", "/v1/tax-authority/interfaces", {
    legal_entity_id: ID.entity, jurisdiction: "GB", authority_name: `HMRC-${TAG}`,
  }, "tax_compliance");
  expect(created.status).toBe(201);
  const mine = await consoleApi(request, "GET", "tax-authority/interfaces");
  const row = list(mine.json, "tax_authority_interfaces").find((r) => r.interface_id === created.json?.interface_id);
  expect(row?.jurisdiction).toBe("GB");
  expect(row?.authority_name).toBe(`HMRC-${TAG}`);
  const health = await consoleApi(request, "GET", "tax-authority/health?provider_key=hmrc-mtd");
  expect([200, 503]).toContain(health.status); // 503 while AUTHORITY_ADAPTER_ENABLED is off
});

// ── Block 7: compliance ─────────────────────────────────────────────────────

test("filing-tracker: create a requirement", async ({ request }) => {
  await roundTrip(request, "filing-tracker/requirements", {
    jurisdiction_id: "GB", filing_authority: "HMRC", filing_type: "VAT100", period_key: `2026-Q${TAG.slice(0, 2)}`, due_date: "2026-12-07",
  }, "filing-tracker/requirements", "requirements", "filing_id");
});

test("compliance-status: evaluate; the counts are the caller's, never defaulted", async ({ request }) => {
  await roundTrip(request, "compliance-status/evaluate", {
    jurisdiction_id: "GB", domain_name: "TAX", total_obligations: 4, fulfilled_obligations: 2,
    pending_obligations: 1, overdue_obligations: 1, open_exceptions: 0, effective_from: TODAY,
  }, "compliance-status", "evaluations", "status_id");
  const missing = await consoleApi(request, "POST", "compliance-status/evaluate", { jurisdiction_id: "GB" });
  expect(missing.status).toBe(400);
});

test("exception-escalation: raise an exception", async ({ request }) => {
  await roundTrip(request, "exception-escalation/exceptions", {
    jurisdiction_id: "GB", exception_type: "LATE_FILING", severity_level: "HIGH",
    linked_object_type: "FILING", linked_object_id: crypto.randomUUID(), description: `e2e ${TAG}`,
  }, "exception-escalation/exceptions", "exceptions", "exception_case_id");
});

// ── Blocks 8-10: seeded through the gateway, read and acted on through the console ──

const SEEDS: [string, string, Record<string, unknown>, string, string, string, string?][] = [
  ["anomaly-detection-svc", "/v1/anomalies/detect", { domain_name: "FINANCE", source_entity_id: `src-${TAG}`, metric_type: "AMOUNT", observed_value: 9000, expected_value: 1000, std_deviation: 100, description: `e2e ${TAG}` }, "intelligence/anomalies", "anomalies", "anomaly_id"],
  ["forecasting-svc", "/v1/forecasts/generate", { legal_entity_id: ID.entity, model_name: `cash-${TAG}`, domain: "CASH_FLOW", historical_data: [100, 110, 125, 130, 142, 150], historical_start_date: "2026-01-01" }, "intelligence/forecasts", "forecasts", "id"],
  ["compliance-risk-scoring-svc", "/v1/risk-scores/calculate", { legal_entity_id: ID.entity, assessment_name: `q3-${TAG}`, subject_type: "LEGAL_ENTITY", subject_id: ID.entity, open_obligations_count: 2, policy_violations_count: 0, audit_exceptions_count: 1, privacy_incidents_count: 0, tax_penalties_count: 0 }, "intelligence/risk-scores", "scores", "id"],
  ["reconciliation-intelligence-svc", "/v1/reconciliations/analyze", { legal_entity_id: ID.entity, job_name: `recon-${TAG}`, bank_reconciliation_run_id: crypto.randomUUID() }, "intelligence/reconciliations", "reconciliations", "id"],
  ["reporting-orchestration-svc", "/v1/reports/definitions", { legal_entity_id: ID.entity, report_name: `rpt-${TAG}`, report_type: "FINANCIAL_SUMMARY", output_format: "CSV", data_sources: ["general-ledger-svc"] }, "intelligence/reports", "reports", "id"],
  ["decision-support-svc", "/v1/recommendations", { legal_entity_id: ID.entity, subject_type: "JOURNAL", subject_reference: `jr-${TAG}`, action_type: "REVIEW", oversight_class: "O1", evidence_refs: ["ev-1"], proposal: { recommended_action: "APPROVE", confidence_score: 0.8, rationale: "within tolerance", model_id: "m-1", model_version: "1.0", prompt_version: "p1" } }, "intelligence/recommendations", "recommendations", "recommendation_id"],
  ["migration-integrity-svc", "/v1/migrations/validate", { legal_entity_id: ID.entity, migration_name: `mig-${TAG}`, source_system: "LEGACY_ERP", target_service: "general-ledger-svc", exception_owner_id: ID.principal2, control_totals: { amount_field: "amount", record_count: 1, amount_total: "10.00" }, required_fields: ["account", "amount"], records: [{ ref: "r1", fields: { account: "1000", amount: "10.00" } }] }, "intelligence/migrations", "jobs", "id"],
  ["siem-integration-svc", "/v1/siem/exporters", { legal_entity_id: ID.entity, name: `exp-${TAG}`, platform: "SPLUNK", endpoint_url: "https://splunk.example.com:8088" }, "security/events", "events", "id", "exporter"],
  ["key-management-svc", "/v1/keys", { legal_entity_id: ID.entity, key_alias: `alias-${TAG}`, key_model: "BYOK", key_provider: "AWS_KMS", external_key_arn: `arn:aws:kms:eu-west-2:111122223333:key/${crypto.randomUUID()}` }, "security/keys", "keys", "id"],
  ["connectivity-api-bridge-svc", "/v1/bridges", { legal_entity_id: ID.entity, bridge_name: `br-${TAG}`, provider_name: "Acme", protocol: "REST", endpoint_url: "https://api.example.com", auth_type: "OAUTH2" }, "integration/connections", "connections", "bridge_id"],
  ["banking-connector-svc", "/v1/banking/connections", { legal_entity_id: ID.entity, bank_name: `Bank-${TAG}`, bic: "BARCGB22", account_number: "12345678", iban: "GB33BUKB20201555555555", currency: "GBP", account_type: "CURRENT" }, "integration/banking", "connections", "connection_id"],
  ["hris-connector-svc", "/v1/hris/integrations", { legal_entity_id: ID.entity, provider_name: `HR-${TAG}`, sync_type: "EMPLOYEES", direction: "INBOUND", api_endpoint: "https://hr.example.com/api" }, "integration/hris", "connections", "integration_id"],
  ["external-data-feed-svc", "/v1/external-data-feeds/subscriptions", { legal_entity_id: ID.entity, provider: "ECB", feed_type: "FX_RATE", symbol: `EUR${TAG.slice(0, 3).toUpperCase()}` }, "integration/feeds", "subscriptions", "feed_id"],
];

const seeded: Record<string, Record<string, unknown>> = {};

for (const [service, path, body, read, key, idField, kind] of SEEDS) {
  test(`${service}: a record written to the service is listed by the console for this tenant only`, async ({ request }) => {
    const created = await seed(request, service, path, body, service === "hris-connector-svc" ? "integration.hris.sync" : service === "key-management-svc" ? "security.kms.key.register" : "verification");
    expect(created.status, JSON.stringify(created.json)).toBeLessThan(300);
    seeded[service] = created.json!;
    if (kind === "exporter") return; // events are per exporter; an exporter has none yet
    const id = String(created.json?.[idField]);
    const mine = await consoleApi(request, "GET", read);
    expect(mine.status).toBe(200);
    expect(ids(list(mine.json, key), idField)).toContain(id);
    const theirs = await consoleApi(request, "GET", read, undefined, OTHER());
    expect(ids(list(theirs.json, key), idField)).not.toContain(id);
  });
}

test("mtls-management: an issued certificate is listed for this tenant only", async ({ request }) => {
  const created = await seed(request, "mtls-management-svc", "/v1/mtls/certificates", {
    legal_entity_id: ID.entity, service_name: `svc-${TAG}`, common_name: "svc.zoiko.local", rotation_days: 30, auto_rotate: true,
  }, "security.mtls.certificate.issue");
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const id = String((created.json?.certificate as Record<string, unknown>)?.id);
  const mine = await consoleApi(request, "GET", "security/certificates");
  expect(ids(list(mine.json, "certificates"), "id")).toContain(id);
  const theirs = await consoleApi(request, "GET", "security/certificates", undefined, OTHER());
  expect(ids(list(theirs.json, "certificates"), "id")).not.toContain(id);
});

test("key-management: rotate a key through the console; another tenant gets 404", async ({ request }) => {
  const key = seeded["key-management-svc"];
  test.skip(!key, "no key was seeded");
  const before = Number(key.key_version ?? 1);
  const rotated = await consoleApi(request, "POST", `security/keys/${key.id}/rotate`, {});
  expect(rotated.status, JSON.stringify(rotated.json)).toBeLessThan(300);
  expect(Number(rotated.json?.key_version)).toBeGreaterThan(before);
  const other = await consoleApi(request, "POST", `security/keys/${key.id}/rotate`, {}, OTHER());
  expect(other.status).toBe(404);
});

test("hris-connector: a sync is refused with the service's 503, not reported as started", async ({ request }) => {
  const hris = seeded["hris-connector-svc"];
  test.skip(!hris, "no integration was seeded");
  const res = await consoleApi(request, "POST", `integration/hris/${hris.integration_id}/sync`, {});
  expect(res.status).toBe(503);
  expect(String(res.json?.error)).toMatch(/provider_not_configured|not configured/);
});

test("carta: an evaluation is scored for the session's legal entity, whatever the body says", async ({ request }) => {
  const res = await consoleApi(request, "POST", "security/assessments/evaluate", {
    legal_entity_id: ID.otherEntity,
    context: { subject_id: crypto.randomUUID(), subject_type: "USER", device_trust_level: 80, ip_address: "10.0.0.1", is_known_location: true, resource_sensitivity: "HIGH", action_requested: "READ", time_of_day_hour: 10 },
  });
  expect(res.status).toBe(201);
  expect(res.json?.legal_entity_id).toBe(ID.entity);
  const mine = await consoleApi(request, "GET", "security/assessments");
  expect(ids(list(mine.json, "assessments"), "id")).toContain(String(res.json?.id));
});
