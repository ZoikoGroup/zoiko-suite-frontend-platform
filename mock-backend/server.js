#!/usr/bin/env node
// Lightweight mock backend server for Zoiko Suite microservices.
// One instance per service container — SERVICE_NAME and SERVICE_PORT from env.
// Accepts any GET / POST / PATCH request and returns realistic JSON.

const http = require("http");

const SERVICE_NAME = process.env.SERVICE_NAME || "unknown-svc";
const PORT = parseInt(process.env.SERVICE_PORT || process.env.PORT || "8080", 10);
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ENTITY_ID = "22222222-2222-2222-2222-222222222222";

function uid() {
  return `${SERVICE_NAME.slice(0, 4)}-${Math.random().toString(36).slice(2, 10)}`;
}

function now() { return new Date().toISOString(); }

// ── Domain-aware response builder ──────────────────────────────────────────────
function buildResponse(method, pathname, body) {
  const id = uid();
  const svc = SERVICE_NAME;

  if (svc.includes("tax-rules")) return method === "GET"
    ? { rules: [], total: 0 }
    : { rule: { rule_id: id, tenant_id: TENANT_ID, jurisdiction_id: body.jurisdiction_id || "GB", rule_code: body.rule_code || "MOCK", name: body.name || "Mock Rule", category: body.category || "VAT", tax_rate_percentage: body.tax_rate_percentage || 0, status: "ACTIVE", version: 1, effective_from: body.effective_from || now(), created_by: "system", created_at: now(), updated_at: now() } };

  if (svc.includes("tax-determination")) return method === "GET"
    ? { determinations: [], total: 0 }
    : { determination: { determination_id: id, tenant_id: TENANT_ID, transaction_id: body.transaction_id || id, jurisdiction_id: body.jurisdiction_id || "GB", tax_category: body.tax_category || "VAT", gross_amount: body.gross_amount || 0, taxable_amount: body.taxable_amount || 0, tax_amount: (body.taxable_amount || 0) * 0.2, currency: body.currency || "GBP", status: "CALCULATED", created_at: now() } };

  if (svc.includes("vat-gst")) return method === "GET"
    ? { vat_returns: [], total: 0 }
    : { vat_return: { return_id: id, tenant_id: TENANT_ID, jurisdiction_id: body.jurisdiction_id || "GB", tax_period: body.tax_period || "2026-Q3", net_tax_payable: body.net_tax_payable || 0, currency: body.currency || "GBP", status: "DRAFT", created_at: now() } };

  if (svc.includes("corporate-tax")) return method === "GET"
    ? { corporate_tax_returns: [], total: 0 }
    : { corporate_tax_return: { return_id: id, tenant_id: TENANT_ID, jurisdiction_id: body.jurisdiction_id || "GB", fiscal_year: body.fiscal_year || 2026, net_tax_payable: body.net_tax_payable || 0, currency: body.currency || "GBP", status: "DRAFT", created_at: now() } };

  if (svc.includes("withholding-tax")) return method === "GET"
    ? { withholding_obligations: [], total: 0 }
    : { withholding_obligation: { obligation_id: id, tenant_id: TENANT_ID, jurisdiction_id: body.jurisdiction_id || "DE", withheld_amount: body.withheld_amount || 0, currency: body.currency || "EUR", status: "CALCULATED", created_at: now() } };

  if (svc.includes("filing-prep") || svc.includes("filing-preparation")) return method === "GET"
    ? { filing_drafts: [], total: 0 }
    : { filing_draft: { draft_id: id, tenant_id: TENANT_ID, return_type: body.return_type || "VAT_RETURN", jurisdiction_id: body.jurisdiction_id || "GB", tax_period: body.tax_period || "2026-Q3", validation_status: "DRAFT", created_at: now() } };

  if (svc.includes("tax-authority")) return method === "GET"
    ? { tax_authority_interfaces: [], total: 0 }
    : { tax_authority_interface: { interface_id: id, tenant_id: TENANT_ID, jurisdiction_id: body.jurisdiction_id || "GB", authority_name: body.authority_name || "Mock Authority", protocol: body.protocol || "REST_OAUTH2", status: "ACTIVE", created_at: now() } };

  if (svc.includes("ai-governance")) return { ai_runs: [], models: [], total: 0 };

  if (svc.includes("contract-lifecycle")) return method === "GET"
    ? { contracts: [], total: 0 }
    : { contract: { contract_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, title: body.title || "Mock Contract", contract_type: body.contract_type || "MSA", counterparty_id: body.counterparty_id || "cp-001", counterparty_name: body.counterparty_name || "Mock Counterparty", currency: body.currency || "GBP", total_value: body.total_value || 0, status: "DRAFT", version: 1, effective_from: body.effective_from || now(), created_by: "system", created_at: now(), updated_at: now() } };

  if (svc.includes("clause-template")) return method === "GET"
    ? { clauses: [], total: 0 }
    : { clause: { clause_id: id, tenant_id: TENANT_ID, title: body.title || "Mock Clause", category: body.category || "GENERAL", body: body.body || "Mock clause body text.", jurisdiction_id: body.jurisdiction_id || "GB", is_standard: body.is_standard !== undefined ? body.is_standard : true, status: "APPROVED", created_by: "system", created_at: now() } };

  if (svc.includes("obligation-tracking")) return method === "GET"
    ? { obligations: [], total: 0 }
    : { obligation: { obligation_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, title: body.title || "Mock Obligation", risk_level: body.risk_level || "MEDIUM", status: "PENDING", due_date: body.due_date || now(), source_type: body.source_type || "CONTRACTUAL", effective_from: now(), created_by: "system", created_at: now(), updated_at: now() } };

  if (svc.includes("board-resolutions")) return method === "GET"
    ? { meetings: [], resolutions: [], total: 0 }
    : { meeting_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, title: body.title || "Mock Meeting", scheduled_at: body.scheduled_date || now(), status: "SCHEDULED", effective_from: now(), created_by: "system", created_at: now(), updated_at: now() };

  if (svc.includes("corporate-actions")) return method === "GET"
    ? { actions: [], total: 0 }
    : { action: { action_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, action_type: body.action_type || "EQUITY_GRANT", description: body.description || "Mock Action", status: "PROPOSED", effective_date: now(), created_by: "system", created_at: now() } };

  if (svc.includes("counterparty")) return { counterparties: [], total: 0 };

  if (svc.includes("general-ledger")) return method === "GET"
    ? { journals: [], total: 0 }
    : { journal: { journal_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, fiscal_period: "2026-09", status: "PENDING", journal_type: "STANDARD", transaction_date: now().slice(0, 10), posting_date: now().slice(0, 10), currency_code: body.currency_code || "GBP", description: body.description || "Mock journal", correlation_id: uid(), created_at: now(), lines: [] } };

  if (svc.includes("treasury")) return { cash_positions: [], total: 0 };
  if (svc.includes("financial-close")) return { summary: { status: "OPEN", period: "2026-09" } };

  if (svc.includes("purchase-order")) return method === "GET"
    ? { purchase_orders: [], total: 0 }
    : { purchase_order: { purchase_order_id: id, tenant_id: TENANT_ID, po_number: body.po_number || `PO-${id}`, vendor_profile_id: body.vendor_name || "mock-vendor", total_amount: body.amount || 0, currency_code: body.currency || "GBP", po_status: "ISSUED", issued_by_principal_id: "system", issued_at: now() } };

  if (svc.includes("spend-controls")) return method === "GET"
    ? { spend_policies: [], total: 0 }
    : { spend_limit: { limit_id: id, category: body.category || "IT", department: body.department || "Engineering", annual_limit_amount: body.annual_limit_amount || 0, currency: body.currency || "GBP", status: "WITHIN_BUDGET", created_at: now() } };

  if (svc.includes("vendor-due-diligence")) return { vendors: [], total: 0 };

  if (svc.includes("employee-master")) return method === "GET"
    ? { employees: [], total: 0 }
    : { employee: { employee_id: id, tenant_id: TENANT_ID, first_name: body.first_name || "Mock", last_name: body.last_name || "Employee", email: body.email || `mock-${id}@example.com`, worker_type: body.worker_type || "FULL_TIME", status: "ACTIVE", hire_date: body.hire_date || now().slice(0, 10), job_title: body.job_title, department_id: body.department_id, created_at: now() } };

  if (svc.includes("leave-absence")) return method === "GET"
    ? { requests: [], total: 0 }
    : { request: { request_id: id, tenant_id: TENANT_ID, employee_id: body.employee_id || "emp-001", leave_type_id: body.leave_type_id || "ANNUAL_LEAVE", start_date: body.start_date || now().slice(0, 10), end_date: body.end_date || now().slice(0, 10), total_hours: body.total_hours || 8, status: "SUBMITTED", created_at: now() } };

  if (svc.includes("org-structure")) return method === "GET"
    ? { departments: [], total: 0 }
    : { department: { department_id: id, tenant_id: TENANT_ID, code: body.code || "DEPT", name: body.name || "Mock Department", created_at: now() } };

  if (svc.includes("workforce-compliance")) return method === "GET"
    ? { alerts: [], total: 0 }
    : { alert: { alert_id: id, tenant_id: TENANT_ID, employee_id: body.employee_id || "emp-001", alert_type: body.alert_type || "GENERAL", severity: body.severity || "MEDIUM", description: body.description || "Mock alert", status: "OPEN", created_at: now() } };

  if (svc.includes("performance-review")) return { reviews: [], cycles: [], total: 0 };

  if (svc.includes("payroll-run")) return method === "GET"
    ? { payroll_runs: [], total: 0 }
    : { payroll_run: { payroll_run_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, pay_period_code: body.pay_period_code || "2026-10", period_start_date: body.period_start_date || now().slice(0, 10), period_end_date: body.period_end_date || now().slice(0, 10), payment_date: body.payment_date || now().slice(0, 10), status: "CALCULATING", total_gross_pay: body.total_gross_pay || 0, total_net_pay: body.total_net_pay || 0, total_tax_deductions: body.total_tax_deductions || 0, total_employee_count: body.total_employee_count || 0, created_by: "system", created_at: now(), updated_at: now() } };

  if (svc.includes("compensation")) return method === "GET"
    ? { structures: [], total: 0 }
    : { structure: { structure_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, title: body.title || "Mock Structure", wage_type: body.wage_type || "SALARY", base_pay: body.base_pay || 0, currency: body.currency || "GBP", pay_frequency: body.pay_frequency || "MONTHLY", effective_from: now(), created_at: now() } };

  if (svc.includes("benefits")) return method === "GET"
    ? { plans: [], total: 0 }
    : { plan: { plan_id: id, tenant_id: TENANT_ID, legal_entity_id: ENTITY_ID, name: body.name || "Mock Plan", benefit_type: body.type || "HEALTH", provider_name: body.provider || "Mock Provider", employer_contribution_percent: body.employer_contribution_pct || 100, currency: "GBP", status: "ACTIVE", created_at: now() } };

  if (svc.includes("payroll-tax")) return { profiles: [], total: 0 };

  if (svc.includes("payroll-exceptions")) return method === "GET"
    ? { exceptions: [], total: 0 }
    : { exception: { exception_id: id, tenant_id: TENANT_ID, employee_id: body.employee_id || "emp-001", exception_type: body.type || "GENERAL", severity: body.severity || "MEDIUM", status: "OPEN", description: body.description || "Mock exception", created_at: now() } };

  if (svc.includes("filing-tracker")) return method === "GET"
    ? { requirements: [], total: 0 }
    : { requirement: { requirement_id: id, tenant_id: TENANT_ID, filing_name: body.obligation || "Mock Filing", authority_name: body.authority || "Mock Authority", due_date: body.due_date || now(), status: "PENDING", created_at: now() } };

  if (svc.includes("compliance-status")) return { evaluations: [], total: 0 };

  if (svc.includes("exception-escalation")) return method === "GET"
    ? { exceptions: [], total: 0 }
    : { exception: { exception_id: id, tenant_id: TENANT_ID, title: body.domain || "Mock Exception", source_service: body.domain || "UNKNOWN", severity: body.severity || "HIGH", escalation_level: 1, status: "ESCALATED", created_at: now() } };

  if (svc.includes("audit-event-store")) {
    if (pathname && pathname.includes("verify")) {
      return { verified: true, checkedEvents: 7, hash_chain_valid: true, timestamp: now() };
    }
    return method === "GET"
      ? { events: [], total: 0, hash_chain_valid: true }
      : { event_id: id, status: "INGESTED", created_at: now() };
  }

  if (svc.includes("tenant-entity-registry")) return { entities: [], total: 0 };
  if (svc.includes("schema-registry")) return { event_names: [], total: 0 };
  if (svc.includes("governance")) return { decisions: [], total: 0 };
  if (svc.includes("policy")) return { policies: [], total: 0 };
  if (svc.includes("configuration") || svc.includes("config")) return { feature_flags: [], config_entries: [], total: 0 };
  if (svc.includes("secret-vault")) return { leases: [], total: 0 };
  if (svc.includes("identity") || svc.includes("identity-context")) {
    const demoJwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJ0ZW5hbnRfaWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJsZWdhbF9lbnRpdHlfaWQiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJyb2xlcyI6WyJQbGF0Zm9ybUFkbWluaXN0cmF0b3IiXSwic2Vzc2lvbl90cnVzdF9wb3N0dXJlIjp7InNlc3Npb25fY29udGV4dF9pZCI6InNlc3MtY3R4LTIwMjYtMDAxIn0sImlhdCI6MTc4ODk1NjAwMCwiZXhwIjoxNzg4OTY2MDAwfQ.mock_signature";
    if (pathname.includes("resolve") || pathname.includes("session")) {
      return { envelope_jwt: demoJwt, status: "RESOLVED", session_context_id: "sess-ctx-2026-001" };
    }
    if (pathname.includes("roles")) {
      return [
        { assignment_id: "role-asg-001", principal_id: "33333333-3333-3333-3333-333333333333", role_id: "ROLE_SUPER_ADMIN", legal_entity_id: "22222222-2222-2222-2222-222222222222", effective_from: "2026-01-01T00:00:00Z", effective_to: "2027-01-01T00:00:00Z", assigned_by: "system" }
      ];
    }
    if (pathname.includes("delegations")) {
      return [
        { delegated_authority_id: "del-auth-001", delegator_principal_id: "33333333-3333-3333-3333-333333333333", delegate_principal_id: "44444444-4444-4444-4444-444444444444", scope_type: "GLOBAL", legal_entity_id: null, authority_limit_type: "FINANCIAL_MAX", authority_limit_value: 5000000, effective_from: "2026-01-01T00:00:00Z", effective_to: "2026-12-31T23:59:59Z", revocation_status: "ACTIVE" }
      ];
    }
    if (pathname.includes("principals")) {
      return {
        principal_id: "33333333-3333-3333-3333-333333333333",
        tenant_id: TENANT_ID,
        principal_type: "HUMAN",
        identity_provider_subject: "usr-admin-001",
        email: "admin@zoikosuite.com",
        display_name: "Lingaraj (Super Admin)",
        status: "ACTIVE",
        created_at: "2026-01-01T00:00:00Z",
        data_classification: "RESTRICTED"
      };
    }
    return { status: "ok", service: svc, envelope_jwt: demoJwt };
  }
  if (svc.includes("authorization") || svc.includes("access-control")) return { status: "ok", service: svc };
  if (svc.includes("retention")) return { decisions: [], total: 0 };
  if (svc.includes("jurisdiction")) return { jurisdictions: [], total: 0 };
  if (svc.includes("evidence")) return { requirements: [], total: 0 };
  if (svc.includes("document-vault")) return { documents: [], total: 0 };
  if (svc.includes("delegat")) return { delegations: [], total: 0 };
  if (svc.includes("notification")) return { notifications: [], total: 0 };
  if (svc.includes("bank-reconciliation")) return { reconciliations: [], total: 0 };
  if (svc.includes("accounts-payable") || svc.includes("accounts-receivable")) return { records: [], total: 0 };

  return { service: svc, status: "ok", data: [], total: 0, timestamp: now() };
}

// ── HTTP Server ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let rawBody = "";
  req.on("data", chunk => { rawBody += chunk.toString(); });
  req.on("end", () => {
    let body = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch {}

    const responseData = buildResponse(req.method, req.url, body);
    const statusCode = req.method === "POST" ? 201 : 200;

    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "X-Service": SERVICE_NAME,
      "X-Mock": "true",
    });
    res.end(JSON.stringify(responseData));
    console.log(`[${SERVICE_NAME}] ${req.method} ${req.url} -> ${statusCode}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[${SERVICE_NAME}] Mock backend listening on :${PORT}`);
});
