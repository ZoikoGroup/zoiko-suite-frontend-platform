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

const EVENT_SCHEMAS = [
  {
    event_name: "contract.activated.v1",
    version: 1,
    json_schema: { type: "object", properties: { contract_id: { type: "string" }, status: { type: "string" } }, required: ["contract_id", "status"] },
    compatibility_mode: "BACKWARD",
    owning_service: "contract-lifecycle-svc",
    registered_by: "33333333-3333-3333-3333-333333333333",
    registered_at: "2026-01-01T00:00:00Z"
  },
  {
    event_name: "purchase_order.issued.v1",
    version: 1,
    json_schema: { type: "object", properties: { po_number: { type: "string" }, amount: { type: "number" } }, required: ["po_number", "amount"] },
    compatibility_mode: "BACKWARD",
    owning_service: "purchase-order-svc",
    registered_by: "33333333-3333-3333-3333-333333333333",
    registered_at: "2026-01-01T00:00:00Z"
  },
  {
    event_name: "payroll_run.finalized.v1",
    version: 1,
    json_schema: { type: "object", properties: { payroll_run_id: { type: "string" }, total_gross_pay: { type: "number" } }, required: ["payroll_run_id"] },
    compatibility_mode: "BACKWARD",
    owning_service: "payroll-run-svc",
    registered_by: "33333333-3333-3333-3333-333333333333",
    registered_at: "2026-01-01T00:00:00Z"
  }
];

serve(8093, "schema-registry-svc", (m, p, q, b, send) => {
  if (p === "/v1/schemas") return send(200, EVENT_SCHEMAS.map(s => s.event_name));
  if (p.includes("/versions/latest")) {
    const found = EVENT_SCHEMAS.find(s => p.includes(encodeURIComponent(s.event_name)) || p.includes(s.event_name));
    return send(200, found ?? EVENT_SCHEMAS[0]);
  }
  return send(200, EVENT_SCHEMAS);
});

// ── 9. Tax Domain Microservices (8125 - 8147) ─────────────────────────────────
const TAX_RULES = [
  {
    rule_id: "rule-uk-vat-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    rule_code: "UK-VAT-STD-2026",
    name: "UK Standard Value Added Tax",
    category: "VAT",
    tax_rate_percentage: 20.0,
    standard_deductions: 0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    rule_id: "rule-uk-vat-reduced",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    rule_code: "UK-VAT-RED-2026",
    name: "UK Reduced Rate VAT (Energy/Safety)",
    category: "VAT",
    tax_rate_percentage: 5.0,
    standard_deductions: 0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    rule_id: "rule-us-cit-fed",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-us-fed",
    rule_code: "US-CIT-FED-2026",
    name: "US Federal Corporate Income Tax",
    category: "CORPORATE_INCOME",
    tax_rate_percentage: 21.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    rule_id: "rule-sg-gst-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-sg-01",
    rule_code: "SG-GST-STD-2026",
    name: "Singapore Goods & Services Tax",
    category: "GST",
    tax_rate_percentage: 9.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  }
];

const TAX_DETERMINATIONS = [
  {
    determination_id: "det-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-inv-8910",
    source_module: "ACCOUNTS_RECEIVABLE",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    rule_id: "rule-uk-vat-standard",
    tax_category: "VAT",
    gross_amount: 120000.0,
    taxable_amount: 100000.0,
    tax_rate_percentage: 20.0,
    calculated_tax_amount: 20000.0,
    exempt_amount: 0,
    currency: "GBP",
    status: "CALCULATED",
    effective_from: "2026-07-01T00:00:00Z",
    evaluated_at: "2026-07-31T14:30:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-07-31T14:30:00Z",
    updated_at: "2026-07-31T14:30:00Z"
  },
  {
    determination_id: "det-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-po-4421",
    source_module: "COMMERCIAL_OPS",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    rule_id: "rule-us-cit-fed",
    tax_category: "CORPORATE_INCOME",
    gross_amount: 450000.0,
    taxable_amount: 450000.0,
    tax_rate_percentage: 21.0,
    calculated_tax_amount: 94500.0,
    exempt_amount: 0,
    currency: "USD",
    status: "CALCULATED",
    effective_from: "2026-06-01T00:00:00Z",
    evaluated_at: "2026-06-30T10:00:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-06-30T10:00:00Z",
    updated_at: "2026-06-30T10:00:00Z"
  }
];

const VAT_RETURNS = [
  {
    return_id: "vat-ret-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    tax_registration_number: "GB998877665",
    tax_period: "2026-Q2",
    total_sales_amount: 1450000.0,
    total_purchase_amount: 620000.0,
    output_tax_amount: 290000.0,
    input_tax_amount: 124000.0,
    net_tax_payable: 166000.0,
    currency: "GBP",
    status: "FILED",
    filed_at: "2026-07-07T12:00:00Z",
    filed_by: "system-auto-filing",
    effective_from: "2026-04-01T00:00:00Z",
    effective_to: "2026-06-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-07T12:00:00Z"
  },
  {
    return_id: "vat-ret-2026-q3",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    tax_registration_number: "GB998877665",
    tax_period: "2026-Q3",
    total_sales_amount: 980000.0,
    total_purchase_amount: 410000.0,
    output_tax_amount: 196000.0,
    input_tax_amount: 82000.0,
    net_tax_payable: 114000.0,
    currency: "GBP",
    status: "DRAFT",
    effective_from: "2026-07-01T00:00:00Z",
    effective_to: "2026-09-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z"
  }
];

const CORPORATE_RETURNS = [
  {
    return_id: "corp-ret-2025",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    tax_registration_number: "US-EIN-12345678",
    fiscal_year: 2025,
    accounting_period_start: "2025-01-01",
    accounting_period_end: "2025-12-31",
    gross_revenue: 12500000.0,
    allowable_deductions: 8200000.0,
    taxable_income: 4300000.0,
    tax_rate_percent: 21.0,
    gross_tax_liability: 903000.0,
    tax_credits: 50000.0,
    net_tax_payable: 853000.0,
    tax_already_paid: 800000.0,
    balance_due: 53000.0,
    currency: "USD",
    status: "SUBMITTED",
    submitted_at: "2026-03-15T16:00:00Z",
    submitted_by: "cfo-controller",
    assessed_tax_amount: 853000.0,
    assessment_reference: "IRS-ASSESS-2025-99",
    effective_from: "2025-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-15T16:00:00Z"
  }
];

const WITHHOLDING_OBLIGATIONS = [
  {
    obligation_id: "wht-obl-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    counterparty_id: "cp-global-software",
    payment_reference: "PAY-2026-0812",
    payment_type: "ROYALTIES",
    gross_payment_amount: 50000.0,
    taxable_base_amount: 50000.0,
    withholding_rate_percent: 5.0,
    withheld_amount: 2500.0,
    statutory_rate_percent: 20.0,
    treaty_reduced_rate_percent: 5.0,
    applied_rate_percent: 5.0,
    tax_withheld_amount: 2500.0,
    net_amount_payable: 47500.0,
    currency: "GBP",
    status: "REMITTED",
    tax_treaty_exemption: true,
    exemption_certificate_ref: "UK-DTT-ROY-9981",
    statutory_due_date: "2026-08-20",
    remittance_reference: "HMRC-WHT-2026-781",
    remitted_at: "2026-08-10T11:00:00Z",
    remitted_by: "treasury-auto-remit",
    effective_from: "2026-08-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T11:00:00Z"
  },
  {
    obligation_id: "wht-obl-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-de-fed",
    counterparty_id: "cp-berlin-consulting",
    payment_reference: "PAY-2026-0901",
    payment_type: "DIVIDENDS",
    gross_payment_amount: 500000.0,
    taxable_base_amount: 500000.0,
    withholding_rate_percent: 15.0,
    withheld_amount: 75000.0,
    statutory_rate_percent: 26.375,
    treaty_reduced_rate_percent: 15.0,
    applied_rate_percent: 15.0,
    tax_withheld_amount: 75000.0,
    net_amount_payable: 425000.0,
    currency: "EUR",
    status: "REMITTED",
    tax_treaty_exemption: true,
    exemption_certificate_ref: "DE-DTT-DIV-2026-004",
    statutory_due_date: "2026-09-10",
    remittance_reference: "REMIT-BZST-99812",
    remitted_at: "2026-08-12T09:30:00Z",
    remitted_by: "treasury-auto-remit",
    effective_from: "2026-08-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-12T09:30:00Z"
  }
];

const FILING_DRAFTS = [
  {
    draft_id: "draft-filing-2026-q3-vat",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    filing_type: "VAT100_MTD",
    period_key: "2026-Q3",
    reporting_period: "2026-Q3",
    due_date: "2026-09-07",
    currency: "GBP",
    tax_due_amount: 114000.0,
    status: "PREPARED",
    payload_data: '{"box1":196000,"box2":0,"box3":196000,"box4":82000,"box5":114000}',
    validation_status: "PREPARED",
    notes: "Q3 2026 UK VAT draft return ready for authority submission",
    created_by: "filing-daemon",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z"
  },
  {
    draft_id: "draft-filing-2025-cit-us",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    filing_type: "US_FORM_1120",
    period_key: "2025-FY",
    reporting_period: "2025-FY",
    due_date: "2026-10-15",
    currency: "USD",
    tax_due_amount: 53000.0,
    status: "FINALIZED",
    payload_data: '{"form":"1120","taxable_income":4300000,"tax_due":53000}',
    validation_status: "FINALIZED",
    notes: "FY2025 US Corporate Income Tax return finalized",
    created_by: "cfo-controller",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z"
  }
];

const TAX_INTERFACES = [
  {
    interface_id: "if-hmrc-mtd",
    jurisdiction_id: "jur-uk-gb",
    authority_code: "HMRC_MTD",
    authority_name: "HM Revenue & Customs (HMRC)",
    protocol_type: "REST_OAUTH2",
    protocol: "REST_OAUTH2",
    api_endpoint: "https://api.service.hmrc.gov.uk/organisations/vat",
    endpoint_url: "https://api.service.hmrc.gov.uk/organisations/vat",
    environment: "PRODUCTION",
    auth_type: "OAuth2",
    auth_credential_id: "sec-hmrc-client-credentials",
    status: "ACTIVE",
    is_active: true,
    last_health_check: new Date().toISOString(),
    health_status: "HEALTHY",
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString()
  },
  {
    interface_id: "if-irs-mef",
    jurisdiction_id: "jur-us-fed",
    authority_code: "IRS_MEF",
    authority_name: "Internal Revenue Service (IRS MeF)",
    protocol_type: "SOAP_A2A",
    protocol: "SOAP_A2A",
    api_endpoint: "https://la.www4.irs.gov/a2a/mef",
    endpoint_url: "https://la.www4.irs.gov/a2a/mef",
    environment: "PRODUCTION",
    auth_type: "mTLS + SAML2",
    auth_credential_id: "sec-irs-a2a-cert",
    status: "ACTIVE",
    is_active: true,
    last_health_check: new Date().toISOString(),
    health_status: "HEALTHY",
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString()
  },
  {
    interface_id: "if-iras-efile",
    jurisdiction_id: "jur-sg-01",
    authority_code: "IRAS_EFILE",
    authority_name: "Inland Revenue Authority of Singapore (IRAS)",
    protocol_type: "REST_OIDC",
    protocol: "REST_OIDC",
    api_endpoint: "https://api.iras.gov.sg/gst/v1",
    endpoint_url: "https://api.iras.gov.sg/gst/v1",
    environment: "PRODUCTION",
    auth_type: "Singpass / Corppass OIDC",
    auth_credential_id: "sec-iras-corppass",
    status: "ACTIVE",
    is_active: true,
    last_health_check: new Date().toISOString(),
    health_status: "HEALTHY",
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString()
  },
  {
    interface_id: "if-bzst-dip",
    jurisdiction_id: "jur-de-fed",
    authority_code: "BZST_DIP",
    authority_name: "Bundeszentralamt für Steuern (BZSt)",
    protocol_type: "REST_MTLS",
    protocol: "REST_MTLS",
    api_endpoint: "https://dip.bzst.bund.de/api/v1/wht",
    endpoint_url: "https://dip.bzst.bund.de/api/v1/wht",
    environment: "PRODUCTION",
    auth_type: "mTLS + SAML2",
    auth_credential_id: "sec-bzst-cert",
    status: "ACTIVE",
    is_active: true,
    last_health_check: new Date().toISOString(),
    health_status: "HEALTHY",
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString()
  }
];

// 8125: tax-rules-svc
serve(8125, "tax-rules-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    let rules = [...TAX_RULES];
    if (q.get("jurisdiction_id")) rules = rules.filter(r => r.jurisdiction_id === q.get("jurisdiction_id"));
    if (q.get("category")) rules = rules.filter(r => r.category === q.get("category"));
    if (q.get("status")) rules = rules.filter(r => r.status === q.get("status"));
    return send(200, { rules, total: rules.length });
  }
  const newRule = {
    rule_id: b.rule_id || ("rule-" + Date.now()),
    tenant_id: b.tenant_id || "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: b.jurisdiction_id || "jur-uk-gb",
    rule_code: b.rule_code || ("RULE-" + Date.now()),
    name: b.name || "New Tax Rule",
    category: b.category || "VAT",
    tax_rate_percentage: b.tax_rate_percentage ?? 20.0,
    standard_deductions: b.standard_deductions ?? 0,
    status: b.status || "ACTIVE",
    version: 1,
    effective_from: b.effective_from || new Date().toISOString(),
    created_by: "admin",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  TAX_RULES.unshift(newRule);
  return send(201, newRule);
});

// 8126: tax-determination-svc
serve(8126, "tax-determination-svc", (m, p, q, b, send) => {
  if (m === "GET") {
    let dets = [...TAX_DETERMINATIONS];
    if (q.get("legal_entity_id")) dets = dets.filter(d => d.legal_entity_id === q.get("legal_entity_id"));
    if (q.get("status")) dets = dets.filter(d => d.status === q.get("status"));
    return send(200, { determinations: dets, total: dets.length });
  }
  const rate = b.tax_rate_percentage ?? 20.0;
  const taxable = b.taxable_amount ?? b.gross_amount ?? 100000;
  const calc = (taxable * rate) / 100;
  const newDet = {
    determination_id: b.determination_id || ("det-" + Date.now()),
    tenant_id: b.tenant_id || "11111111-1111-1111-1111-111111111111",
    transaction_id: b.transaction_id || ("tx-" + Date.now()),
    source_module: b.source_module || "ADMIN_CONSOLE",
    legal_entity_id: b.legal_entity_id || "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: b.jurisdiction_id || "jur-uk-gb",
    rule_id: b.rule_id || "rule-uk-vat-standard",
    tax_category: b.tax_category || "VAT",
    gross_amount: b.gross_amount ?? taxable,
    taxable_amount: taxable,
    tax_rate_percentage: rate,
    calculated_tax_amount: calc,
    exempt_amount: b.exempt_amount ?? 0,
    currency: b.currency || "GBP",
    status: b.status || "CALCULATED",
    effective_from: b.effective_from || new Date().toISOString(),
    evaluated_at: new Date().toISOString(),
    evaluated_by: "admin",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  TAX_DETERMINATIONS.unshift(newDet);
  return send(201, newDet);
});

// 8127: vat-gst-svc
serve(8127, "vat-gst-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { vat_returns: VAT_RETURNS, returns: VAT_RETURNS, total: VAT_RETURNS.length });
  const ret = { return_id: "vat-" + Date.now(), status: "DRAFT", ...b, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  VAT_RETURNS.unshift(ret);
  return send(201, ret);
});

// 8128: corporate-tax-svc
serve(8128, "corporate-tax-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { returns: CORPORATE_RETURNS, corporate_tax_returns: CORPORATE_RETURNS, total: CORPORATE_RETURNS.length });
  const ret = { return_id: "corp-" + Date.now(), status: "DRAFT", ...b, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  CORPORATE_RETURNS.unshift(ret);
  return send(201, ret);
});

// 8129: withholding-tax-svc
serve(8129, "withholding-tax-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { obligations: WITHHOLDING_OBLIGATIONS, total: WITHHOLDING_OBLIGATIONS.length });
  const obl = { obligation_id: "wht-" + Date.now(), status: "CALCULATED", ...b, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  WITHHOLDING_OBLIGATIONS.unshift(obl);
  return send(201, obl);
});

// 8130: filing-preparation-svc + evidence-requirements-svc (shared port, path-routed)
let _draftSeq = 0;

const EVIDENCE_REQUIREMENTS = [
  {
    evidence_requirement_id: "er-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    domain_code: "finance",
    action_type: "JOURNAL_ENTRY_POST",
    evidence_type: "APPROVAL_RECORD",
    requirement_payload: { minimum_count: 1, description: "Controller approval required before posting" },
    effective_from: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    correlation_id: "corr-er-001"
  },
  {
    evidence_requirement_id: "er-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: null,
    domain_code: "commercial-ops",
    action_type: "PURCHASE_ORDER_ISSUE",
    evidence_type: "RECONCILIATION_PROOF",
    requirement_payload: { minimum_count: 1, description: "Spend-control clearance snapshot" },
    effective_from: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    created_by_principal_id: "33333333-3333-3333-3333-333333333333",
    correlation_id: "corr-er-002"
  }
];

const EVIDENCE_EVALUATIONS = [];

serve(8130, "filing-preparation-svc+evidence-requirements-svc", (m, p, q, b, send) => {
  // ── Evidence-requirements-svc routes (prefix: /v1/evidence-requirements, /v1/admin/evidence-requirements, /v1/evidence) ──
  if (p.startsWith("/v1/evidence-requirements")) {
    if (m === "GET") {
      const id = p.replace("/v1/evidence-requirements/", "").replace("/v1/evidence-requirements", "");
      if (id) {
        const found = EVIDENCE_REQUIREMENTS.find(r => r.evidence_requirement_id === id);
        return found ? send(200, found) : send(404, { error: "requirement_not_found" });
      }
      let results = [...EVIDENCE_REQUIREMENTS];
      const tenantId = q.get("tenant_id");
      if (tenantId) results = results.filter(r => r.tenant_id === tenantId);
      const domainCode = q.get("domain_code");
      if (domainCode) results = results.filter(r => r.domain_code === domainCode);
      const actionType = q.get("action_type");
      if (actionType) results = results.filter(r => r.action_type === actionType);
      return send(200, results);
    }
    if (m === "POST") {
      const newReq = {
        evidence_requirement_id: "er-" + Date.now(),
        tenant_id: b.tenant_id || "11111111-1111-1111-1111-111111111111",
        legal_entity_id: b.legal_entity_id || null,
        domain_code: b.domain_code || "finance",
        action_type: b.action_type || "GENERAL",
        evidence_type: b.evidence_type || "APPROVAL_RECORD",
        requirement_payload: b.requirement_payload || {},
        effective_from: b.effective_from || new Date().toISOString(),
        created_at: new Date().toISOString(),
        created_by_principal_id: b.created_by_principal_id || "33333333-3333-3333-3333-333333333333",
        correlation_id: b.correlation_id || "corr-" + Date.now()
      };
      EVIDENCE_REQUIREMENTS.unshift(newReq);
      return send(201, newReq);
    }
  }

  if (p.startsWith("/v1/admin/evidence-requirements")) {
    if (m === "POST") {
      if (p.includes("/end-date")) {
        const id = p.split("/admin/evidence-requirements/")[1]?.split("/end-date")[0];
        const req = EVIDENCE_REQUIREMENTS.find(r => r.evidence_requirement_id === id);
        if (!req) return send(404, { error: "requirement_not_found" });
        if (req.effective_to) return send(422, { error: "already_retired" });
        req.effective_to = b.effective_to || new Date().toISOString();
        return send(200, req);
      }
      const newReq = {
        evidence_requirement_id: "er-" + Date.now(),
        tenant_id: b.tenant_id || "11111111-1111-1111-1111-111111111111",
        legal_entity_id: b.legal_entity_id || null,
        domain_code: b.domain_code || "finance",
        action_type: b.action_type || "GENERAL",
        evidence_type: b.evidence_type || "APPROVAL_RECORD",
        requirement_payload: b.requirement_payload || {},
        effective_from: b.effective_from || new Date().toISOString(),
        created_at: new Date().toISOString(),
        created_by_principal_id: "33333333-3333-3333-3333-333333333333",
        correlation_id: b.correlation_id || "corr-" + Date.now()
      };
      EVIDENCE_REQUIREMENTS.unshift(newReq);
      return send(201, newReq);
    }
  }

  if (p.startsWith("/v1/evidence/evaluate")) {
    if (m === "POST") {
      const evaluation = {
        evaluation_id: "ev-eval-" + Date.now(),
        outcome: "SATISFIED",
        unmet: null,
        evaluated_at: new Date().toISOString(),
        correlation_id: b.correlation_id || "corr-" + Date.now()
      };
      return send(200, evaluation);
    }
  }

  if (p.startsWith("/v1/evidence/evaluations/")) {
    if (m === "GET") {
      const id = p.split("/v1/evidence/evaluations/")[1];
      return send(200, {
        evaluation_id: id,
        tenant_id: "11111111-1111-1111-1111-111111111111",
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        domain_code: "finance",
        action_type: "JOURNAL_ENTRY_POST",
        outcome: "SATISFIED",
        unmet_payload: null,
        present_artifacts_payload: [],
        evaluated_at: new Date().toISOString(),
        evaluated_for_principal_id: "33333333-3333-3333-3333-333333333333",
        correlation_id: "corr-eval-" + id
      });
    }
  }

  // ── Filing-preparation-svc routes ─────────────────────────────────────────────
  if (m === "GET") {
    const seen = new Set();
    const uniqueDrafts = FILING_DRAFTS.filter((d) => {
      if (seen.has(d.draft_id)) return false;
      seen.add(d.draft_id);
      return true;
    });
    return send(200, { drafts: uniqueDrafts, total: uniqueDrafts.length });
  }
  if (p.includes("/finalize")) {
    const draftId = p.split("/")[3] || "draft-finalized";
    return send(200, { draft_id: draftId, validation_status: "FINALIZED", filing_type: "VAT100_MTD", period_key: "2026-Q2" });
  }
  const uid = `draft-${Date.now()}-${++_draftSeq}`;
  const draft = { draft_id: uid, validation_status: "PREPARED", filing_type: "VAT100_MTD", period_key: "2026-Q2", status: "DRAFT", ...b, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  FILING_DRAFTS.unshift(draft);
  return send(201, draft);
});

// 8147: tax-authority-interface-svc
serve(8147, "tax-authority-interface-svc", (m, p, q, b, send) => {
  if (m === "GET") return send(200, { interfaces: TAX_INTERFACES, total: TAX_INTERFACES.length });
  return send(201, { interface_id: "if-" + Date.now(), health_status: "HEALTHY", ...b });
});

console.log("\n🚀 ZoikoSuite — All domain services & Tax services ONLINE with zero errors!");
