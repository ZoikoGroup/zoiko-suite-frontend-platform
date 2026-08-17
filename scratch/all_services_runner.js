/**
 * ZoikoSuite — Full Platform Mock Services Runner (v3 — Zero-Error Aligned)
 * Handles all domain services with exact payload structures required by frontend panels.
 */
const http = require("http");

// ── Seed data ─────────────────────────────────────────────────────────────────
const GL_ENTRIES = [
  { entry_id: "gle-001", posting_date: "2026-07-31", account_code: "1001", account_name: "Cash & Bank", debit: 1500000, credit: 0, currency: "GBP", status: "POSTED", reference: "INV-2026-0891", period: "2026-07" },
  { entry_id: "gle-002", posting_date: "2026-07-31", account_code: "4001", account_name: "Revenue – Software Licensing", debit: 0, credit: 920000, currency: "GBP", status: "POSTED", reference: "INV-2026-0891", period: "2026-07" }
];

const AP_INVOICES = [
  {
    invoice_id: "ap-inv-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    vendor_id: "vnd-acme",
    invoice_number: "INV-2026-0891",
    amount: 75000,
    currency_code: "GBP",
    due_date: "2026-08-30T00:00:00Z",
    status: "APPROVED",
    created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    correlation_id: "corr-ap-001",
    created_at: "2026-08-01T00:00:00Z"
  },
  {
    invoice_id: "ap-inv-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    vendor_id: "vnd-cloud",
    invoice_number: "INV-2026-0892",
    amount: 12400,
    currency_code: "USD",
    due_date: "2026-09-15T00:00:00Z",
    status: "RECEIVED",
    created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    correlation_id: "corr-ap-002",
    created_at: "2026-08-10T00:00:00Z"
  }
];

const AR_INVOICES = [
  { invoice_id: "ar-inv-001", invoice_number: "INV-2026-0891", customer_id: "cust-enterprise-a", amount: 180000, currency_code: "GBP", currency: "GBP", status: "OUTSTANDING", due_date: "2026-09-01", created_at: "2026-08-01T00:00:00Z" },
  { invoice_id: "ar-inv-002", invoice_number: "INV-2026-0892", customer_id: "cust-global-b", amount: 94000, currency_code: "USD", currency: "USD", status: "PAID", due_date: "2026-08-15", paid_at: "2026-08-12T10:00:00Z", created_at: "2026-07-15T00:00:00Z" }
];

const RECONS = [
  { recon_id: "recon-2026-07", period: "2026-07", status: "MATCHED", matched_count: 148, unmatched_count: 2, created_at: "2026-08-01T00:00:00Z" }
];

const CASH_POS = [
  { account_id: "acc-gbp-main", bank_name: "Barclays Commercial UK", currency: "GBP", available_balance: 4250000, balance: 4250000, swept_balance: 5000000, status: "ACTIVE" },
  { account_id: "acc-usd-ops", bank_name: "JPMorgan Chase", currency: "USD", available_balance: 820000, balance: 820000, swept_balance: 1000000, status: "ACTIVE" }
];

const CLOSE_PERIODS = [
  { period_id: "close-2026-07", period: "2026-07", status: "CLOSED", closed_at: "2026-08-05T18:00:00Z", approved_by: "cfo-controller" },
  { period_id: "close-2026-08", period: "2026-08", status: "OPEN", closed_at: null, approved_by: null }
];

const IC_TXS = [
  { tx_id: "ic-001", from_entity: "22222222-2222-2222-2222-222222222222", to_entity: "33333333-3333-3333-3333-333333333333", amount: 250000, currency: "GBP", status: "MATCHED" }
];

const CONSOLIDATIONS = [
  { consolidation_id: "cons-2026-q2", period: "2026-Q2", status: "COMPLETED", entity_count: 3, completed_at: "2026-07-15T00:00:00Z" }
];

const PAYROLL_RUNS = [
  { payroll_run_id: "pr-run-2026-07", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", pay_period_code: "2026-07", period_start_date: "2026-07-01", period_end_date: "2026-07-31", payment_date: "2026-07-31", status: "FINALIZED", total_gross_pay: 1840000, total_net_pay: 1290000, total_tax_deductions: 412000, total_employee_count: 142, created_by: "system", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-31T22:00:00Z" },
  { payroll_run_id: "pr-run-2026-08", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", pay_period_code: "2026-08", period_start_date: "2026-08-01", period_end_date: "2026-08-31", payment_date: "2026-08-31", status: "DRAFT", total_gross_pay: 0, total_net_pay: 0, total_tax_deductions: 0, total_employee_count: 142, created_by: "system", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" }
];

const COMP_STRUCTURES = [
  { structure_id: "comp-str-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", title: "Senior Engineer Compensation", wage_type: "SALARY", base_pay: 95000, currency: "GBP", pay_frequency: "MONTHLY", effective_from: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
  { structure_id: "comp-str-002", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", title: "Finance Controller Compensation", wage_type: "SALARY", base_pay: 82000, currency: "GBP", pay_frequency: "MONTHLY", effective_from: "2026-01-01", created_at: "2026-01-01T00:00:00Z" }
];

const BENEFIT_PLANS = [
  { plan_id: "ben-plan-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", name: "Bupa Health Insurance", benefit_type: "HEALTH_INSURANCE", provider_name: "Bupa", employer_contribution_percent: 80, currency: "GBP", status: "ACTIVE", created_at: "2026-01-01T00:00:00Z" },
  { plan_id: "ben-plan-002", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", name: "Nest Pension Scheme", benefit_type: "PENSION", provider_name: "Nest", employer_contribution_percent: 5, currency: "GBP", status: "ACTIVE", created_at: "2026-01-01T00:00:00Z" }
];

const TAX_PROFILES = [
  { profile_id: "ptx-prof-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-uk-gb", tax_identifier: "PAYE-REF-123/AB456", filing_status: "STANDARD", withholding_allowances: 1, additional_withholding_amount: 0, currency: "GBP", status: "ACTIVE", created_at: "2026-01-01T00:00:00Z" }
];

const PAY_EXCEPTIONS = [
  { exception_id: "pex-001", tenant_id: "11111111-1111-1111-1111-111111111111", payroll_run_id: "pr-run-2026-07", employee_id: "emp-9001", exception_type: "OVERTIME_CAP_EXCEEDED", severity: "WARNING", status: "OPEN", description: "Overtime hours exceeded statutory weekly cap by 3h", created_at: "2026-07-31T22:00:00Z" }
];

const EMPLOYEES = [
  { employee_id: "emp-9001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", first_name: "Arjun", last_name: "Mehta", email: "arjun.mehta@zoikogroup.com", employment_type: "PERMANENT", status: "ACTIVE", hire_date: "2022-04-01", created_at: "2022-04-01T00:00:00Z" },
  { employee_id: "emp-9002", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", first_name: "Sophie", last_name: "Laurent", email: "sophie.laurent@zoikogroup.com", employment_type: "PERMANENT", status: "ACTIVE", hire_date: "2021-09-15", created_at: "2021-09-15T00:00:00Z" },
  { employee_id: "emp-9003", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", first_name: "James", last_name: "Okafor", email: "james.okafor@zoikogroup.com", employment_type: "PERMANENT", status: "ACTIVE", hire_date: "2023-01-10", created_at: "2023-01-10T00:00:00Z" }
];

const LEAVE_REQUESTS = [
  { request_id: "lv-001", tenant_id: "11111111-1111-1111-1111-111111111111", employee_id: "emp-9001", leave_type_id: "ANNUAL", start_date: "2026-08-18", end_date: "2026-08-22", days_requested: 5, status: "APPROVED", created_at: "2026-08-01T00:00:00Z" },
  { request_id: "lv-002", tenant_id: "11111111-1111-1111-1111-111111111111", employee_id: "emp-9002", leave_type_id: "SICK", start_date: "2026-08-12", end_date: "2026-08-12", days_requested: 1, status: "APPROVED", created_at: "2026-08-12T00:00:00Z" }
];

const DEPARTMENTS = [
  { department_id: "ou-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", code: "ENGINEERING", name: "Engineering", manager_id: "emp-9001", created_at: "2021-01-01T00:00:00Z" },
  { department_id: "ou-002", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", code: "FINANCE", name: "Finance", manager_id: "emp-9002", created_at: "2021-01-01T00:00:00Z" },
  { department_id: "ou-003", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", code: "LEGAL", name: "Legal", manager_id: "emp-9003", created_at: "2021-01-01T00:00:00Z" }
];

const WF_ALERTS = [
  { alert_id: "wc-alert-001", tenant_id: "11111111-1111-1111-1111-111111111111", employee_id: "emp-9003", alert_type: "RIGHT_TO_WORK_EXPIRY", severity: "WARNING", description: "Right to Work document expires 2027-01-10 (150 days)", status: "OPEN", created_at: "2026-08-01T00:00:00Z" }
];

const CONTRACTS = [
  {
    contract_id: "cnt-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    contract_type: "MSA",
    title: "Global Enterprise Cloud Master Services Agreement",
    description: "Enterprise SaaS Agreement with SLA Tier 1",
    counterparty_id: "cp-acme",
    counterparty_name: "Acme Corp",
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    currency: "GBP",
    total_value: 450000,
    created_by: "emp-9003",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    contract_id: "cnt-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    contract_type: "VENDOR",
    title: "Cloud Infrastructure Hosting Services SLA",
    counterparty_id: "cp-global-software",
    counterparty_name: "Global Software Ltd",
    status: "DRAFT",
    version: 1,
    effective_from: "2026-09-01T00:00:00Z",
    currency: "USD",
    total_value: 120000,
    created_by: "emp-9003",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  }
];

const CLAUSES = [
  { clause_id: "cl-001", tenant_id: "11111111-1111-1111-1111-111111111111", title: "Limitation of Liability – SaaS Standard", name: "Limitation of Liability – SaaS Standard", category: "LIABILITY", jurisdiction_id: "UK", jurisdiction: "UK", status: "ACTIVE", version: 3, is_standard: true, body: "Standard aggregate liability clause.", created_by: "emp-9003", created_at: "2026-01-01T00:00:00Z" },
  { clause_id: "cl-002", tenant_id: "11111111-1111-1111-1111-111111111111", title: "Data Processing Agreement – GDPR", name: "Data Processing Agreement – GDPR", category: "DATA_PRIVACY", jurisdiction_id: "UK/EU", jurisdiction: "UK/EU", status: "ACTIVE", version: 2, is_standard: true, body: "Standard UK/EU GDPR DPA schedule.", created_by: "emp-9003", created_at: "2026-01-01T00:00:00Z" }
];

const OBLIGATIONS = [
  { obligation_id: "obl-001", title: "UK VAT Q3 Filing", obligation_type: "STATUTORY", category: "TAX", due_date: "2026-10-07", jurisdiction: "UK", risk_level: "HIGH", status: "PENDING", priority: "HIGH" },
  { obligation_id: "obl-002", title: "PAYE Monthly Settlement", obligation_type: "STATUTORY", category: "PAYROLL_TAX", due_date: "2026-09-19", jurisdiction: "UK", risk_level: "HIGH", status: "PENDING", priority: "HIGH" },
  { obligation_id: "obl-003", title: "Companies House Annual Return", obligation_type: "REGULATORY", category: "REGULATORY", due_date: "2026-11-30", jurisdiction: "UK", risk_level: "MEDIUM", status: "IN_PROGRESS", priority: "MEDIUM" }
];

const BOARD_RES = [
  { resolution_id: "br-001", title: "Approval of FY2026 Budget", resolution_type: "BUDGET_APPROVAL", status: "PASSED", passed_at: "2026-01-15T14:00:00Z", quorum_met: true }
];

const CORP_ACTIONS = [
  { action_id: "ca-001", action_type: "DIVIDEND_DECLARATION", status: "APPROVED", effective_date: "2026-03-31", amount: 500000, currency: "GBP" }
];

const COUNTERPARTIES = [
  { counterparty_id: "cp-acme", name: "Acme Corp", type: "CUSTOMER", jurisdiction: "UK", kyc_status: "VERIFIED" },
  { counterparty_id: "cp-global-software", name: "Global Software Ltd", type: "VENDOR", jurisdiction: "UK", kyc_status: "VERIFIED" }
];

const PURCHASE_REQUESTS = [
  {
    request_id: "pr-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    requested_by_principal_id: "33333333-3333-3333-3333-333333333333",
    description: "Cloud Compute Capacity Extension Q3",
    amount: 38000,
    currency_code: "USD",
    status: "APPROVED",
    approved_by_principal_id: "33333333-3333-3333-3333-333333333333",
    correlation_id: "corr-pr-001",
    created_at: "2026-08-01T08:00:00Z",
    approved_at: "2026-08-02T10:00:00Z"
  },
  {
    request_id: "pr-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    requested_by_principal_id: "33333333-3333-3333-3333-333333333333",
    description: "Annual Security Audit License Renewal",
    amount: 15000,
    currency_code: "GBP",
    status: "PENDING",
    correlation_id: "corr-pr-002",
    created_at: "2026-08-10T14:00:00Z"
  }
];

const PURCHASE_ORDERS = [
  {
    purchase_order_id: "po-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    purchase_request_id: "pr-2026-001",
    vendor_profile_id: "vnd-cloud-hosting",
    po_number: "PO-2026-0414",
    po_status: "ISSUED",
    total_amount: 38000,
    currency_code: "USD",
    version: 1,
    issued_by_principal_id: "33333333-3333-3333-3333-333333333333",
    correlation_id: "corr-po-001",
    created_at: "2026-08-02T11:00:00Z",
    issued_at: "2026-08-02T11:30:00Z"
  }
];

const FILING_REQUIREMENTS = [
  { requirement_id: "fr-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-uk-gb", filing_name: "UK VAT Q3 Return", authority_name: "HMRC", due_date: "2026-10-07", frequency: "QUARTERLY", status: "PENDING", created_at: "2026-01-01T00:00:00Z" },
  { requirement_id: "fr-002", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-uk-gb", filing_name: "PAYE Monthly Settlement", authority_name: "HMRC", due_date: "2026-09-19", frequency: "MONTHLY", status: "PENDING", created_at: "2026-01-01T00:00:00Z" },
  { requirement_id: "fr-003", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-uk-gb", filing_name: "Companies House Annual Return", authority_name: "Companies House", due_date: "2026-11-30", frequency: "ANNUAL", status: "IN_PROGRESS", created_at: "2026-01-01T00:00:00Z" }
];

const COMPLIANCE_EVALS = [
  { evaluation_id: "eval-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-uk-gb", overall_status: "COMPLIANT", score_percentage: 94, evaluated_at: "2026-08-13T06:00:00Z" },
  { evaluation_id: "eval-002", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-sg-sg", overall_status: "PARTIALLY_COMPLIANT", score_percentage: 78, evaluated_at: "2026-08-13T06:00:00Z" }
];

const ESCALATED_EXCEPTIONS = [
  { exception_id: "esc-001", tenant_id: "11111111-1111-1111-1111-111111111111", title: "PAYE Settlement Overdue Warning", source_service: "payroll-run-svc", severity: "HIGH", escalation_level: 2, status: "OPEN", created_at: "2026-08-10T09:00:00Z" },
  { exception_id: "esc-002", tenant_id: "11111111-1111-1111-1111-111111111111", title: "VAT Return Deadline Approaching", source_service: "tax-authority-interface-svc", severity: "MEDIUM", escalation_level: 1, status: "OPEN", created_at: "2026-08-12T14:00:00Z" }
];

const EVIDENCE_MANIFESTS = [
  { manifest_id: "ev-mf-001", obligation_id: "obl-001", evidence_type: "VAT_RETURN_RECEIPT", status: "SUBMITTED", submitted_at: "2026-07-07T12:00:00Z" }
];

const SPEND_CONTROLS = [
  { control_id: "sc-001", category: "PROFESSIONAL_SERVICES", monthly_limit: 150000, current_spend: 92000, currency: "GBP", status: "WITHIN_LIMIT", period: "2026-08" },
  { control_id: "sc-002", category: "CLOUD_INFRASTRUCTURE", monthly_limit: 50000, current_spend: 38000, currency: "USD", status: "WITHIN_LIMIT", period: "2026-08" }
];

const VENDORS = [
  { vendor_id: "vnd-acme", name: "Acme Corp", country: "UK", risk_level: "LOW", kyc_status: "VERIFIED", onboarded_at: "2024-03-01T00:00:00Z" },
  { vendor_id: "vnd-cloud-hosting", name: "CloudHosting Inc", country: "US", risk_level: "LOW", kyc_status: "VERIFIED", onboarded_at: "2024-06-15T00:00:00Z" }
];

const INVOICES_APPROVAL = [
  { approval_id: "ia-001", invoice_id: "ap-inv-001", approver_id: "cfo-controller", status: "APPROVED", approved_at: "2026-08-05T09:00:00Z" }
];

const AUDIT_EVENTS = [
  {
    id: "ae-2026-001",
    correlation_id: "corr-a1b2c3-contract-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    principal_id: "emp-9003",
    principal_name: "James Okafor (Legal Counsel)",
    action: "CONTRACT_SIGNED",
    domain: "legal",
    resource: "Contract",
    resource_id: "cnt-001",
    status: "COMMITTED",
    timestamp: "2026-08-13T10:00:00Z",
    hash_signature: "sha256-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    previous_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    ip_address: "10.0.4.19",
    metadata: { contract_title: "Enterprise SaaS MSA", jurisdiction: "UK" }
  },
  {
    id: "ae-2026-002",
    correlation_id: "corr-d4e5f6-payroll-run-07",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    principal_id: "system",
    principal_name: "Payroll Automation System",
    action: "PAYROLL_RUN_COMPLETED",
    domain: "payroll",
    resource: "PayrollRun",
    resource_id: "pr-run-2026-07",
    status: "AUTHORIZED",
    timestamp: "2026-07-31T22:05:00Z",
    hash_signature: "sha256-d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5",
    previous_hash: "sha256-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    ip_address: "10.0.1.5",
    metadata: { employee_count: 142, total_gross_pay: 1840000, currency: "GBP" }
  },
  {
    id: "ae-2026-003",
    correlation_id: "corr-g7h8i9-po-auth-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    principal_id: "33333333-3333-3333-3333-333333333333",
    principal_name: "Lingaraj (Platform Administrator)",
    action: "ISSUE_PURCHASE_ORDER",
    domain: "commercial-ops",
    resource: "PurchaseOrder",
    resource_id: "PO-2026-0414",
    status: "COMMITTED",
    timestamp: "2026-08-13T09:30:00Z",
    hash_signature: "sha256-g7h8i9j0k1l2g7h8i9j0k1l2g7h8i9j0k1l2g7h8i9j0k1l2g7h8i9j0k1l2g7h8",
    previous_hash: "sha256-d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5",
    ip_address: "192.168.1.42",
    metadata: { amount: 450000, vendor: "Acme Cloud Infrastructure Inc.", currency: "USD" }
  },
  {
    id: "ae-2026-004",
    correlation_id: "corr-vat-denied-099",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    principal_id: "usr-unauth-099",
    principal_name: "External Service Account (API)",
    action: "MUTATE_FEES_SCHEDULE",
    domain: "finance",
    resource: "FeeSchedule",
    resource_id: "sched-2026-v1",
    status: "DENIED",
    timestamp: "2026-07-31T09:04:11Z",
    hash_signature: "sha256-f9e8d7c6b5a4f9e8d7c6b5a4f9e8d7c6b5a4f9e8d7c6b5a4f9e8d7c6b5a4f9e8",
    previous_hash: "sha256-g7h8i9j0k1l2g7h8i9j0k1l2g7h8i9j0k1l2g7h8i9j0k1l2g7h8i9j0k1l2g7h8",
    ip_address: "203.0.113.88",
    metadata: { refusal_reason: "RBAC principal lacks mutate:finance permission" }
  }
];

// ── Server Factory ─────────────────────────────────────────────────────────────
function serve(port, name, handler) {
  const server = http.createServer((req, res) => {
    const send = (code, data) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      });
      res.end(JSON.stringify(data));
    };

    if (req.method === "OPTIONS") return send(204, {});
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = url.pathname;

    if (path === "/readyz" || path === "/healthz" || path === "/health") {
      return send(200, { status: "READY", service: name, port, timestamp: new Date().toISOString() });
    }

    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      let json = {};
      try {
        json = JSON.parse(body);
      } catch {}
      handler(req.method, path, url.searchParams, json, send);
    });
  });

  server.on("error", e => {
    if (e.code === "EADDRINUSE") {
      console.log(`⚠️  [${name}]:${port} already in use`);
    } else {
      console.error(`❌ [${name}]`, e.message);
    }
  });

  server.listen(port, () => console.log(`✅ [${name}] :${port}`));
}

// ── 1. Finance Domain ─────────────────────────────────────────────────────────
serve(8098, "general-ledger-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { entries: GL_ENTRIES, total: GL_ENTRIES.length, balance_sheet: { assets: 2800000, liabilities: 1100000, equity: 1700000 } });
  return send(201, { entry_id: "gle-" + Date.now(), status: "POSTED", ...b });
});

serve(8099, "accounts-payable-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    if (p === "/v1/invoices") return send(200, AP_INVOICES);
    return send(200, { invoices: AP_INVOICES, total_payable: 87400, total: AP_INVOICES.length });
  }
  return send(201, { invoice_id: "ap-" + Date.now(), status: "RECEIVED", ...b });
});

serve(8101, "accounts-receivable-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    if (p === "/v1/invoices") return send(200, AR_INVOICES);
    return send(200, { invoices: AR_INVOICES, total_receivable: 180000, total: AR_INVOICES.length });
  }
  return send(201, { invoice_id: "ar-" + Date.now(), status: "OUTSTANDING", ...b });
});

serve(8102, "bank-reconciliation-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { reconciliations: RECONS, total: RECONS.length });
  return send(201, { recon_id: "recon-" + Date.now(), status: "IN_PROGRESS" });
});

serve(8103, "treasury-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { cash_positions: CASH_POS, total_liquidity_gbp: 5100000, total: CASH_POS.length });
  return send(201, { transaction_id: "tx-" + Date.now(), status: "PROCESSED" });
});

serve(8104, "financial-close-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { close_periods: CLOSE_PERIODS, total: CLOSE_PERIODS.length });
  return send(201, { period_id: "close-" + Date.now(), status: "IN_PROGRESS" });
});

serve(8105, "intercompany-accounting-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { transactions: IC_TXS, total: IC_TXS.length });
  return send(201, { tx_id: "ic-" + Date.now(), status: "PENDING_MATCH" });
});

serve(8106, "consolidation-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { consolidations: CONSOLIDATIONS, total: CONSOLIDATIONS.length });
  return send(201, { consolidation_id: "cons-" + Date.now(), status: "RUNNING" });
});

// ── 2. Payroll Domain ─────────────────────────────────────────────────────────
serve(8110, "payroll-run-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { payroll_runs: PAYROLL_RUNS, runs: PAYROLL_RUNS, total: PAYROLL_RUNS.length });
  return send(201, { payroll_run_id: "pr-run-" + Date.now(), status: "INITIATED", ...b });
});

serve(8111, "compensation-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { structures: COMP_STRUCTURES, compensations: COMP_STRUCTURES, total: COMP_STRUCTURES.length });
  return send(201, { structure_id: "comp-" + Date.now(), status: "ACTIVE", ...b });
});

serve(8112, "benefits-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { plans: BENEFIT_PLANS, benefits: BENEFIT_PLANS, total: BENEFIT_PLANS.length });
  return send(201, { plan_id: "ben-" + Date.now(), status: "ENROLLED" });
});

serve(8113, "payroll-tax-svc", (m, p, q, b, send) => {
  const summaries = [{ summary_id: "ptx-2026-07", period: "2026-07", paye_total: 412000, ni_employee: 184000, ni_employer: 196000, currency: "GBP", status: "SUBMITTED" }];
  if (m === "GET") return send(200, { profiles: TAX_PROFILES, tax_summaries: summaries, total: TAX_PROFILES.length });
  return send(201, { profile_id: "ptx-" + Date.now(), status: "ACTIVE" });
});

serve(8114, "payroll-exceptions-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { exceptions: PAY_EXCEPTIONS, total: PAY_EXCEPTIONS.length });
  return send(201, { exception_id: "pex-" + Date.now(), status: "OPEN" });
});

// ── 3. HR Domain ──────────────────────────────────────────────────────────────
serve(8108, "employee-master-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { employees: EMPLOYEES, total: EMPLOYEES.length, active_count: EMPLOYEES.length });
  return send(201, { employee_id: "emp-" + Date.now(), status: "ACTIVE", ...b });
});

serve(8109, "employment-contracts-svc", (m, p, q, b, send) => {
  const contracts = [{ contract_id: "ec-001", employee_id: "emp-9001", type: "PERMANENT", start_date: "2022-04-01", status: "ACTIVE" }];
  if (m === "GET") return send(200, { contracts, total: contracts.length });
  return send(201, { contract_id: "ec-" + Date.now(), status: "DRAFT" });
});

serve(8115, "leave-absence-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { requests: LEAVE_REQUESTS, leave_records: LEAVE_REQUESTS, total: LEAVE_REQUESTS.length });
  return send(201, { request_id: "lv-" + Date.now(), status: "PENDING", ...b });
});

serve(8116, "org-structure-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { departments: DEPARTMENTS, units: DEPARTMENTS, total: DEPARTMENTS.length, total_headcount: 56 });
  return send(201, { department_id: "ou-" + Date.now(), status: "ACTIVE" });
});

serve(8117, "offboarding-severance-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { offboardings: [], total: 0, in_progress: 0 });
  return send(201, { offboarding_id: "ob-" + Date.now(), status: "INITIATED" });
});

serve(8118, "workforce-compliance-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { alerts: WF_ALERTS, compliance_items: WF_ALERTS, total: WF_ALERTS.length });
  return send(201, { alert_id: "wc-" + Date.now(), status: "OPEN" });
});

// ── 4. Legal Domain ───────────────────────────────────────────────────────────
serve(8119, "contract-lifecycle-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    if (p === "/v1/contracts") return send(200, { contracts: CONTRACTS, total: CONTRACTS.length });
    return send(200, { contracts: CONTRACTS, total: CONTRACTS.length });
  }
  return send(201, { contract_id: "cnt-" + Date.now(), status: "DRAFT", ...b });
});

serve(8120, "clause-template-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { clauses: CLAUSES, total: CLAUSES.length });
  return send(201, { clause_id: "cl-" + Date.now(), status: "DRAFT" });
});

serve(8121, "obligation-tracking-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { obligations: OBLIGATIONS, total: OBLIGATIONS.length });
  return send(201, { obligation_id: "obl-" + Date.now(), status: "PENDING" });
});

serve(8122, "board-resolutions-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { resolutions: BOARD_RES, total: BOARD_RES.length });
  return send(201, { resolution_id: "br-" + Date.now(), status: "DRAFT" });
});

serve(8123, "corporate-actions-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { actions: CORP_ACTIONS, total: CORP_ACTIONS.length });
  return send(201, { action_id: "ca-" + Date.now(), status: "PENDING_APPROVAL" });
});

serve(8124, "counterparty-management-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { counterparties: COUNTERPARTIES, total: COUNTERPARTIES.length });
  return send(201, { counterparty_id: "cp-" + Date.now(), kyc_status: "PENDING" });
});

// ── 5. Commercial-Ops Domain ──────────────────────────────────────────────────
serve(8100, "purchase-request-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    if (p === "/v1/purchase-requests") return send(200, PURCHASE_REQUESTS);
    return send(200, { requests: PURCHASE_REQUESTS, total: PURCHASE_REQUESTS.length });
  }
  return send(201, { request_id: "pr-" + Date.now(), status: "PENDING", ...b });
});

serve(8139, "purchase-order-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    if (p === "/v1/purchase-orders") return send(200, PURCHASE_ORDERS);
    return send(200, { orders: PURCHASE_ORDERS, total: PURCHASE_ORDERS.length });
  }
  return send(201, { purchase_order_id: "po-" + Date.now(), po_status: "ISSUED", ...b });
});

serve(8107, "invoice-approval-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { approvals: INVOICES_APPROVAL, total: INVOICES_APPROVAL.length });
  return send(201, { approval_id: "ia-" + Date.now(), status: "PENDING" });
});

serve(8131, "spend-controls-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { controls: SPEND_CONTROLS, total: SPEND_CONTROLS.length });
  return send(201, { control_id: "sc-" + Date.now(), status: "ACTIVE" });
});

serve(8135, "vendor-due-diligence-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { vendors: VENDORS, total: VENDORS.length });
  return send(201, { vendor_id: "vnd-" + Date.now(), kyc_status: "PENDING" });
});

// ── 6. Compliance Domain ──────────────────────────────────────────────────────
serve(8136, "filing-tracker-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { requirements: FILING_REQUIREMENTS, total: FILING_REQUIREMENTS.length });
  return send(201, { requirement_id: "fr-" + Date.now(), status: "PENDING", ...b });
});

serve(8137, "compliance-status-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { evaluations: COMPLIANCE_EVALS, total: COMPLIANCE_EVALS.length });
  return send(201, { evaluation_id: "eval-" + Date.now(), overall_status: "COMPLIANT" });
});

serve(8138, "exception-escalation-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { exceptions: ESCALATED_EXCEPTIONS, total: ESCALATED_EXCEPTIONS.length });
  return send(201, { exception_id: "esc-" + Date.now(), status: "OPEN", ...b });
});

serve(8095, "evidence-manifest-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { manifests: EVIDENCE_MANIFESTS, total: EVIDENCE_MANIFESTS.length });
  return send(201, { manifest_id: "ev-mf-" + Date.now(), status: "SUBMITTED" });
});

// ── 7. Audit Events Domain ────────────────────────────────────────────────────
serve(8084, "audit-event-store-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { events: AUDIT_EVENTS, total: AUDIT_EVENTS.length, hash_chain_valid: true });
  if (m === "POST") {
    const ev = {
      id: "ae-" + Date.now(),
      correlation_id: "corr-" + Date.now(),
      tenant_id: "11111111-1111-1111-1111-111111111111",
      principal_id: "33333333-3333-3333-3333-333333333333",
      principal_name: "Lingaraj (Platform Administrator)",
      action: "AUDIT_LOG_ENTRY",
      domain: "compliance",
      resource: "AuditRecord",
      resource_id: "rec-" + Date.now(),
      status: "COMMITTED",
      timestamp: new Date().toISOString(),
      hash_signature: "sha256-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      previous_hash: AUDIT_EVENTS[0]?.hash_signature ?? "0000000000",
      ip_address: "127.0.0.1",
      metadata: {},
      ...b
    };
    AUDIT_EVENTS.unshift(ev);
    return send(201, ev);
  }
});

// ── 8. Governance, Registry & Supporting Services ───────────────────────────────
const TENANT_DATA = {
  tenant_id: "11111111-1111-1111-1111-111111111111",
  tenant_code: "ZOIKO-GLOBAL",
  legal_name: "Zoiko Group Holdings Ltd",
  trading_name: "Zoiko Suite",
  status: "ACTIVE",
  default_currency_code: "GBP",
  primary_timezone: "Europe/London",
  primary_locale: "en-GB",
  default_data_residency_policy_id: "pol-dr-001",
  lifecycle_state: "ACTIVE",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  created_by_principal_id: "33333333-3333-3333-3333-333333333333",
  updated_by_principal_id: "33333333-3333-3333-3333-333333333333"
};

const LEGAL_ENTITIES_DATA = [
  {
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    entity_code: "ZOIKO-UK",
    legal_name: "Zoiko UK Operating Ltd",
    trading_name: "Zoiko UK",
    registration_number: "UK-12948102",
    tax_identity_bundle_id: "tib-uk-001",
    entity_type: "OPERATING",
    incorporation_date: "2021-04-01T00:00:00Z",
    default_currency_code: "GBP",
    fiscal_calendar_id: "fisc-uk-std",
    parent_legal_entity_id: null,
    entity_status: "ACTIVE",
    primary_jurisdiction_id: "jur-uk-gb",
    data_residency_policy_id: "pol-dr-001",
    created_at: "2021-04-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    updated_by_principal_id: "33333333-3333-3333-3333-333333333333"
  },
  {
    legal_entity_id: "33333333-2222-2222-2222-222222222222",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    entity_code: "ZOIKO-US",
    legal_name: "Zoiko Americas Inc",
    trading_name: "Zoiko US",
    registration_number: "DE-7788192",
    tax_identity_bundle_id: "tib-us-001",
    entity_type: "SUBSIDIARY",
    incorporation_date: "2022-06-15T00:00:00Z",
    default_currency_code: "USD",
    fiscal_calendar_id: "fisc-us-std",
    parent_legal_entity_id: "22222222-2222-2222-2222-222222222222",
    entity_status: "ACTIVE",
    primary_jurisdiction_id: "jur-us-fed",
    data_residency_policy_id: "pol-dr-002",
    created_at: "2022-06-15T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    updated_by_principal_id: "33333333-3333-3333-3333-333333333333"
  }
];

const RESIDENCY_REGIONS_DATA = [
  { residency_region_id: "reg-uk", region_code: "UK-SOUTH", display_name: "UK South (London)", jurisdiction_id: "jur-uk-gb", is_active: true },
  { residency_region_id: "reg-eu", region_code: "EU-WEST", display_name: "EU West (Frankfurt)", jurisdiction_id: "jur-de-fed", is_active: true },
  { residency_region_id: "reg-us", region_code: "US-EAST", display_name: "US East (N. Virginia)", jurisdiction_id: "jur-us-fed", is_active: true }
];

serve(8081, "tenant-entity-registry-svc", (m, p, q, b, send) => {
  if (p === "/v1/residency-regions") return send(200, RESIDENCY_REGIONS_DATA);
  if (p.includes("/entities")) return send(200, LEGAL_ENTITIES_DATA);
  if (p.includes("/residency-region")) return send(200, { tenant_id: "11111111-1111-1111-1111-111111111111", residency_region_id: "reg-uk", region_code: "UK-SOUTH", display_name: "UK South (London)" });
  if (p.includes("/status")) return send(200, { entity_id: "22222222-2222-2222-2222-222222222222", status: "ACTIVE", can_transact: true });
  if (p.includes("/jurisdictions")) return send(200, [{ assignment_id: "asg-001", tenant_id: "11111111-1111-1111-1111-111111111111", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "jur-uk-gb", assignment_type: "PRIMARY", effective_from: "2021-04-01T00:00:00Z", effective_to: null, source_basis: "INCORPORATION", created_at: "2021-04-01T00:00:00Z", created_by_principal_id: "33333333-3333-3333-3333-333333333333" }]);
  if (p.startsWith("/v1/tenants/")) return send(200, TENANT_DATA);
  if (p.startsWith("/v1/entities/")) return send(200, LEGAL_ENTITIES_DATA[0]);
  return send(200, { tenants: [TENANT_DATA], entities: LEGAL_ENTITIES_DATA });
});

serve(8082, "jurisdiction-rules-svc", (m, p, q, b, send) => {
  return send(200, { jurisdictions: [{ jurisdiction_id: "jur-uk-gb", code: "UK", name: "United Kingdom" }] });
});

serve(8083, "governance-decision-log-svc", (m, p, q, b, send) => {
  return send(200, { decisions: [] });
});

serve(8085, "policy-svc", (m, p, q, b, send) => {
  return send(200, { policies: [] });
});

serve(8086, "configuration-feature-flag-svc", (m, p, q, b, send) => {
  return send(200, { flags: { enable_ai_audit: true, enable_tax_auto_filing: true } });
});

serve(8087, "secret-vault-integration-svc", (m, p, q, b, send) => {
  return send(200, { status: "HEALTHY", vault_connected: true });
});

serve(8088, "obligations-svc", (m, p, q, b, send) => {
  return send(200, { obligations: OBLIGATIONS });
});

serve(8093, "schema-registry-svc", (m, p, q, b, send) => {
  return send(200, { schemas: [] });
});

console.log("\n🚀 ZoikoSuite — All domain services ONLINE with zero errors!");
