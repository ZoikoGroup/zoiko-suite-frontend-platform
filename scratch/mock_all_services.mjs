/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Zoiko Suite — Complete Mock Backend Server (All 37 Microservices)
 *  Author: vasudevareddy-zoiko
 *
 *  Starts one HTTP server per unique port, responding with realistic
 *  structured JSON so every FE panel loads with real-looking data.
 *
 *  Run:  node scratch/mock_all_services.mjs
 *  Then: npm run dev   (in a second terminal)
 * ═══════════════════════════════════════════════════════════════════════
 */

import http from "http";

const TENANT  = "11111111-1111-1111-1111-111111111111";
const ENTITY  = "22222222-2222-2222-2222-222222222222";
const NOW     = new Date().toISOString();

// ── Realistic sample data per service ───────────────────────────────────

const DATA = {

  // ── TAX GOVERNANCE ────────────────────────────────────────────────────

  "tax-rules": {
    tax_rules: [
      { rule_id:"tr-001", rule_code:"UK-VAT-STD-20", name:"UK Standard Rate VAT 20%", category:"VAT", tax_rate_percentage:20.0, status:"ACTIVE", jurisdiction_id:"GB", effective_from:"2026-01-01T00:00:00Z" },
      { rule_id:"tr-002", rule_code:"US-CA-SALES-725", name:"California Sales Tax 7.25%", category:"SALES_TAX", tax_rate_percentage:7.25, status:"ACTIVE", jurisdiction_id:"US-CA", effective_from:"2026-01-01T00:00:00Z" },
      { rule_id:"tr-003", rule_code:"UK-CORP-STD-25", name:"UK Corporation Tax Main Rate", category:"CORPORATE_INCOME", tax_rate_percentage:25.0, status:"ACTIVE", jurisdiction_id:"GB", effective_from:"2026-01-01T00:00:00Z" },
      { rule_id:"tr-004", rule_code:"SG-GST-STD-9", name:"Singapore GST 9%", category:"GST", tax_rate_percentage:9.0, status:"ACTIVE", jurisdiction_id:"SG", effective_from:"2024-01-01T00:00:00Z" },
      { rule_id:"tr-005", rule_code:"DE-VAT-STD-19", name:"Germany Standard VAT 19%", category:"VAT", tax_rate_percentage:19.0, status:"ACTIVE", jurisdiction_id:"DE", effective_from:"2026-01-01T00:00:00Z" },
    ]
  },

  "tax-determinations": {
    determinations: [
      { determination_id:"det-101", transaction_id:"tx-po-9842", tax_category:"VAT", rule_applied:"UK-VAT-STD-20", net_amount:50000, tax_amount:10000, jurisdiction_id:"GB", status:"CONFIRMED", determined_at:NOW },
      { determination_id:"det-102", transaction_id:"tx-po-9843", tax_category:"SALES_TAX", rule_applied:"US-CA-SALES-725", net_amount:30000, tax_amount:2175, jurisdiction_id:"US-CA", status:"CONFIRMED", determined_at:NOW },
    ]
  },

  "vat-returns": {
    vat_returns: [
      { return_id:"vr-001", tenant_id:TENANT, legal_entity_id:ENTITY, jurisdiction_id:"GB", tax_registration_number:"GB123456789", tax_period:"2026-Q1", total_sales_amount:241000, total_purchase_amount:112000, output_tax_amount:48200, input_tax_amount:22400, net_tax_payable:25800, currency:"GBP", status:"ACCEPTED", filed_at:NOW, filed_by:"vasu@zoikogroup.com", effective_from:"2026-01-01T00:00:00Z", created_by:"vasu@zoikogroup.com", created_at:NOW, updated_at:NOW },
      { return_id:"vr-002", tenant_id:TENANT, legal_entity_id:ENTITY, jurisdiction_id:"GB", tax_registration_number:"GB123456789", tax_period:"2026-Q2", total_sales_amount:260500, total_purchase_amount:99000, output_tax_amount:52100, input_tax_amount:19800, net_tax_payable:32300, currency:"GBP", status:"FILED", filed_at:NOW, filed_by:"vasu@zoikogroup.com", effective_from:"2026-04-01T00:00:00Z", created_by:"vasu@zoikogroup.com", created_at:NOW, updated_at:NOW },
      { return_id:"vr-003", tenant_id:TENANT, legal_entity_id:ENTITY, jurisdiction_id:"SG", tax_registration_number:"SG201234567M", tax_period:"2026-Q1", total_sales_amount:180000, total_purchase_amount:62000, output_tax_amount:16200, input_tax_amount:5580, net_tax_payable:10620, currency:"SGD", status:"DRAFT", filed_at:null, filed_by:null, effective_from:"2026-01-01T00:00:00Z", created_by:"system", created_at:NOW, updated_at:NOW },
    ]
  },

  "corporate-tax-returns": {
    corporate_tax_returns: [
      { return_id:"ctr-001", tax_year:"2025", jurisdiction_id:"GB", taxable_profit:932000, tax_liability:233000, effective_rate:25.0, status:"SUBMITTED", filed_at:NOW },
      { return_id:"ctr-002", tax_year:"2026", jurisdiction_id:"US-CA", taxable_profit:416000, tax_liability:87360, effective_rate:21.0, status:"DRAFT", filed_at:null },
    ]
  },

  "withholding-tax": {
    withholding_obligations: [
      { obligation_id:"wh-001", payee_entity:"Acme GmbH", jurisdiction_id:"DE", payment_amount:80000, withholding_rate:15.0, withheld_amount:12000, treaty_applied:"UK-DE", status:"SETTLED", settled_at:NOW },
      { obligation_id:"wh-002", payee_entity:"TechCorp SG", jurisdiction_id:"SG", payment_amount:45000, withholding_rate:10.0, withheld_amount:4500, treaty_applied:"UK-SG", status:"PENDING", settled_at:null },
    ]
  },

  "filing-preparation/drafts": {
    filing_drafts: [
      { draft_id:"fd-001", form_type:"VAT-100", period:"2026-Q2", jurisdiction_id:"GB", status:"DRAFT", created_by:"vasu@zoikogroup.com", created_at:NOW },
      { draft_id:"fd-002", form_type:"CT600", tax_year:"2025", jurisdiction_id:"GB", status:"FINALISED", finalized_at:NOW },
    ]
  },

  "tax-authority/interfaces": {
    tax_authority_interfaces: [
      { interface_id:"tai-001", authority:"HMRC", endpoint:"https://api.service.hmrc.gov.uk/organisations/vat", auth_type:"OAUTH2", status:"CONNECTED", last_tested_at:NOW },
      { interface_id:"tai-002", authority:"IRS", endpoint:"https://mef.irs.gov/submit", auth_type:"API_KEY", status:"CONNECTED", last_tested_at:NOW },
    ]
  },

  // ── AI GOVERNANCE ─────────────────────────────────────────────────────

  "ai-runs": {
    ai_runs: [
      { run_id:"air-001", model:"gpt-4o", action:"contract-risk-classification", risk_tier:"TIER_2", outcome:"APPROVED", started_at:NOW },
      { run_id:"air-002", model:"claude-3-sonnet", action:"invoice-anomaly-detection", risk_tier:"TIER_1", outcome:"APPROVED", started_at:NOW },
    ]
  },

  "risk-classifications": {
    classifications: [
      { action:"contract-risk-classification", risk_tier:"TIER_2", requires_human_review:true },
      { action:"invoice-anomaly-detection", risk_tier:"TIER_1", requires_human_review:false },
      { action:"payroll-exception-scoring", risk_tier:"TIER_3", requires_human_review:true },
    ]
  },

  "model-providers": {
    providers: [
      { provider_id:"mp-001", name:"OpenAI GPT-4o", type:"LLM", status:"VERIFIED", registered_at:NOW },
      { provider_id:"mp-002", name:"Anthropic Claude 3", type:"LLM", status:"VERIFIED", registered_at:NOW },
      { provider_id:"mp-003", name:"Google Gemini 1.5 Pro", type:"LLM", status:"PENDING", registered_at:NOW },
    ]
  },

  // ── LEGAL & CONTRACTS ─────────────────────────────────────────────────

  "contracts": {
    contracts: [
      { contract_id:"c-001", tenant_id:TENANT, legal_entity_id:ENTITY, contract_type:"MSA", title:"Master Services Agreement — Acme GmbH", counterparty_id:"cp-001", counterparty_name:"Acme GmbH", status:"ACTIVE", total_value:450000, currency:"GBP", version:3, effective_from:"2025-01-01T00:00:00Z", effective_to:"2027-12-31T00:00:00Z", created_by:"vasu@zoikogroup.com", created_at:NOW, updated_at:NOW },
      { contract_id:"c-002", tenant_id:TENANT, legal_entity_id:ENTITY, contract_type:"VENDOR", title:"SaaS Subscription — CloudVault Ltd", counterparty_id:"cp-002", counterparty_name:"CloudVault Ltd", status:"PENDING_APPROVAL", total_value:72000, currency:"GBP", version:1, effective_from:"2026-06-01T00:00:00Z", effective_to:"2027-06-30T00:00:00Z", created_by:"vasu@zoikogroup.com", created_at:NOW, updated_at:NOW },
      { contract_id:"c-003", tenant_id:TENANT, legal_entity_id:ENTITY, contract_type:"NDA", title:"Mutual Vendor NDA — TechPartner Inc", counterparty_id:"cp-003", counterparty_name:"TechPartner Inc", status:"ACTIVE", total_value:0, currency:"GBP", version:1, effective_from:"2026-01-01T00:00:00Z", effective_to:"2028-01-01T00:00:00Z", created_by:"vasu@zoikogroup.com", created_at:NOW, updated_at:NOW },
    ]
  },

  "clauses": {
    clauses: [
      { clause_id:"cl-001", name:"Standard Limitation of Liability", category:"LIABILITY", jurisdiction:"GB", version:3, status:"APPROVED" },
      { clause_id:"cl-002", name:"GDPR Data Processing Addendum", category:"DATA_PROTECTION", jurisdiction:"EU", version:2, status:"APPROVED" },
      { clause_id:"cl-003", name:"IP Assignment — All Works for Hire", category:"INTELLECTUAL_PROPERTY", jurisdiction:"GB", version:1, status:"APPROVED" },
    ]
  },

  "obligations": {
    obligations: [
      { obligation_id:"ob-001", contract_id:"c-001", description:"Quarterly performance reports", due_date:"2026-10-01T00:00:00Z", status:"PENDING", risk_level:"MEDIUM" },
      { obligation_id:"ob-002", contract_id:"c-001", description:"Annual security audit submission", due_date:"2026-12-31T00:00:00Z", status:"PENDING", risk_level:"HIGH" },
      { obligation_id:"ob-003", contract_id:"c-002", description:"SLA credits reconciliation", due_date:"2026-09-15T00:00:00Z", status:"COMPLETED", risk_level:"LOW" },
    ]
  },

  "meetings": {
    meetings: [
      { meeting_id:"m-001", type:"BOARD", quorum_met:true, resolutions_passed:3, date:"2026-08-15T10:00:00Z", status:"CLOSED" },
      { meeting_id:"m-002", type:"AUDIT_COMMITTEE", quorum_met:true, resolutions_passed:1, date:"2026-09-01T09:00:00Z", status:"CLOSED" },
    ]
  },

  "corporate-actions": {
    corporate_actions: [
      { action_id:"ca-001", type:"SHARE_ISSUANCE", description:"Series B Preferred Share Issuance", status:"COMPLETED", authorized_at:NOW },
      { action_id:"ca-002", type:"DIVIDEND_DECLARATION", description:"FY2025 Interim Dividend", status:"PENDING", authorized_at:null },
    ]
  },

  "counterparties": {
    counterparties: [
      { counterparty_id:"cp-001", name:"Acme GmbH", country:"DE", risk_rating:"LOW", kyc_status:"CLEARED", last_reviewed_at:NOW },
      { counterparty_id:"cp-002", name:"CloudVault Ltd", country:"GB", risk_rating:"MEDIUM", kyc_status:"CLEARED", last_reviewed_at:NOW },
      { counterparty_id:"cp-003", name:"TechPartner Inc", country:"US", risk_rating:"LOW", kyc_status:"PENDING", last_reviewed_at:null },
    ]
  },

  // ── FINANCE ───────────────────────────────────────────────────────────

  "journal-entries": {
    journal_entries: [
      { entry_id:"je-001", ref:"JE-2026-0891", description:"August Revenue Recognition", debit_account:"Revenue", credit_account:"AR Control", amount:182400, currency:"GBP", posted_at:NOW, status:"POSTED" },
      { entry_id:"je-002", ref:"JE-2026-0892", description:"Payroll Accrual — Aug 2026", debit_account:"Payroll Expense", credit_account:"Accruals", amount:94200, currency:"GBP", posted_at:NOW, status:"POSTED" },
      { entry_id:"je-003", ref:"JE-2026-0893", description:"Corporation Tax Provision", debit_account:"Tax Expense", credit_account:"Tax Payable", amount:55750, currency:"GBP", posted_at:NOW, status:"PENDING" },
    ]
  },

  "cash-positions": {
    cash_positions: [
      { position_id:"cp-001", account:"GBP Operating — Barclays", currency:"GBP", balance:2840000, as_of:NOW },
      { position_id:"cp-002", account:"USD Reserve — Citi", currency:"USD", balance:1450000, as_of:NOW },
      { position_id:"cp-003", account:"EUR Payroll — Deutsche Bank", currency:"EUR", balance:380000, as_of:NOW },
    ]
  },

  "finance/summary": {
    summary: {
      total_revenue_gbp: 4820000,
      total_expenses_gbp: 3290000,
      net_profit_gbp: 1530000,
      cash_on_hand_gbp: 2840000,
      accounts_receivable_gbp: 620000,
      accounts_payable_gbp: 210000,
      period: "2026-08",
    }
  },

  // ── COMMERCIAL OPS ────────────────────────────────────────────────────

  "purchase-orders": {
    purchase_orders: [
      { po_id:"po-001", vendor:"CloudVault Ltd", description:"Annual SaaS Licences", amount:72000, currency:"GBP", status:"APPROVED", issued_at:NOW },
      { po_id:"po-002", vendor:"Office Depot", description:"Office Supplies Q3", amount:4500, currency:"GBP", status:"PENDING", issued_at:null },
      { po_id:"po-003", vendor:"Acme GmbH", description:"Engineering Consultancy Aug", amount:38000, currency:"EUR", status:"APPROVED", issued_at:NOW },
    ]
  },

  "spend-controls/limits": {
    spend_limits: [
      { limit_id:"sl-001", category:"Software & SaaS", limit_amount:200000, consumed_amount:127000, currency:"GBP", period:"2026-FY", utilisation_pct:63.5 },
      { limit_id:"sl-002", category:"Professional Services", limit_amount:150000, consumed_amount:88000, currency:"GBP", period:"2026-FY", utilisation_pct:58.7 },
      { limit_id:"sl-003", category:"Office & Facilities", limit_amount:50000, consumed_amount:31200, currency:"GBP", period:"2026-FY", utilisation_pct:62.4 },
    ]
  },

  "vendors": {
    vendors: [
      { vendor_id:"v-001", name:"CloudVault Ltd", tier:"PREFERRED", risk_score:12, sanctions_clear:true, last_due_diligence:NOW },
      { vendor_id:"v-002", name:"Acme GmbH", tier:"APPROVED", risk_score:28, sanctions_clear:true, last_due_diligence:NOW },
      { vendor_id:"v-003", name:"Office Depot UK", tier:"APPROVED", risk_score:8, sanctions_clear:true, last_due_diligence:NOW },
    ]
  },

  // ── HR & WORKFORCE ────────────────────────────────────────────────────

  "employees": {
    employees: [
      { employee_id:"emp-001", name:"Sarah Chen", role:"Senior Engineer", department:"Engineering", status:"ACTIVE", start_date:"2023-03-01" },
      { employee_id:"emp-002", name:"James Okonkwo", role:"Compliance Manager", department:"Legal & Compliance", status:"ACTIVE", start_date:"2022-07-15" },
      { employee_id:"emp-003", name:"Priya Nair", role:"Finance Controller", department:"Finance", status:"ACTIVE", start_date:"2021-11-01" },
      { employee_id:"emp-004", name:"Tom Whitfield", role:"Product Manager", department:"Product", status:"ACTIVE", start_date:"2024-01-08" },
    ]
  },

  "leave/requests": {
    requests: [
      { request_id:"lr-001", employee_id:"emp-001", type:"ANNUAL", start_date:"2026-09-08", end_date:"2026-09-12", days:5, status:"APPROVED" },
      { request_id:"lr-002", employee_id:"emp-004", type:"SICK", start_date:"2026-09-02", end_date:"2026-09-02", days:1, status:"APPROVED" },
      { request_id:"lr-003", employee_id:"emp-003", type:"ANNUAL", start_date:"2026-10-01", end_date:"2026-10-10", days:10, status:"PENDING" },
    ]
  },

  "org/departments": {
    departments: [
      { dept_id:"dept-001", name:"Engineering", head_count:42, head:"Sarah Chen", cost_centre:"CC-ENG", budget_gbp:3200000 },
      { dept_id:"dept-002", name:"Finance", head_count:12, head:"Priya Nair", cost_centre:"CC-FIN", budget_gbp:850000 },
      { dept_id:"dept-003", name:"Legal & Compliance", head_count:8, head:"James Okonkwo", cost_centre:"CC-LEG", budget_gbp:620000 },
      { dept_id:"dept-004", name:"Product", head_count:18, head:"Tom Whitfield", cost_centre:"CC-PRD", budget_gbp:1400000 },
    ]
  },

  "compliance/alerts": {
    alerts: [
      { alert_id:"wa-001", tenant_id:TENANT, employee_id:"emp-002", alert_type:"RIGHT_TO_WORK_EXPIRY", severity:"HIGH", description:"Right to work verification expires in 30 days", status:"OPEN", created_at:NOW },
      { alert_id:"wa-002", tenant_id:TENANT, employee_id:"emp-001", alert_type:"TRAINING_OVERDUE", severity:"MEDIUM", description:"Annual data security compliance training pending", status:"OPEN", created_at:NOW },
    ]
  },

  "talent": {
    reviews: [
      { review_id:"rv-001", employee_id:"emp-001", cycle_id:"cy-001", rating:4.8, comments:"Consistently exceeds architecture and governance goals", status:"COMPLETED", created_at:NOW },
      { review_id:"rv-002", employee_id:"emp-002", cycle_id:"cy-001", rating:4.5, comments:"Delivered rigorous statutory compliance tracking", status:"COMPLETED", created_at:NOW },
    ],
    cycles: [
      { cycle_id:"cy-001", name:"H1 2026 Executive Review Cycle", start_date:"2026-01-01", end_date:"2026-06-30", status:"ACTIVE", created_at:NOW }
    ]
  },

  "onboarding": {
    onboarding: [
      { task_id:"on-001", employee_id:"new-001", task:"Background Check", status:"COMPLETE", completed_at:NOW },
      { task_id:"on-002", employee_id:"new-001", task:"IT Provisioning", status:"IN_PROGRESS", completed_at:null },
      { task_id:"on-003", employee_id:"new-001", task:"Security Induction", status:"PENDING", completed_at:null },
    ]
  },

  // ── PAYROLL ───────────────────────────────────────────────────────────

  "payroll-runs": {
    payroll_runs: [
      { payroll_run_id:"pr-001", tenant_id:TENANT, legal_entity_id:ENTITY, pay_period_code:"2026-08-M", period_start_date:"2026-08-01", period_end_date:"2026-08-31", payment_date:"2026-08-28", status:"FINALIZED", total_gross_pay:412000, total_net_pay:288000, total_tax_deductions:124000, total_employee_count:74, created_by:"system", created_at:NOW, updated_at:NOW },
      { payroll_run_id:"pr-002", tenant_id:TENANT, legal_entity_id:ENTITY, pay_period_code:"2026-09-M", period_start_date:"2026-09-01", period_end_date:"2026-09-30", payment_date:"2026-09-28", status:"CALCULATING", total_gross_pay:415000, total_net_pay:290500, total_tax_deductions:124500, total_employee_count:74, created_by:"system", created_at:NOW, updated_at:NOW },
    ]
  },

  "compensation/structures": {
    structures: [
      { structure_id:"sg-L3", title:"Senior Engineer", wage_type:"SALARY", base_pay:85000, currency:"GBP", pay_frequency:"MONTHLY" },
      { structure_id:"sg-L4", title:"Principal Engineer", wage_type:"SALARY", base_pay:110000, currency:"GBP", pay_frequency:"MONTHLY" },
      { structure_id:"sg-M1", title:"Engineering Manager", wage_type:"SALARY", base_pay:115000, currency:"GBP", pay_frequency:"MONTHLY" },
    ]
  },

  "benefits/plans": {
    plans: [
      { plan_id:"bp-001", name:"Private Medical — Bupa", type:"HEALTH", provider:"Bupa", employer_contribution_pct:80, enrolled_count:71 },
      { plan_id:"bp-002", name:"Group Life 4x Salary", type:"LIFE", provider:"Aviva", employer_contribution_pct:100, enrolled_count:74 },
      { plan_id:"bp-003", name:"Salary Sacrifice Pension 5%", type:"PENSION", provider:"Nest", employer_contribution_pct:5, enrolled_count:68 },
    ]
  },

  "payroll-tax/profiles": {
    profiles: [
      { profile_id:"pt-001", employee_id:"emp-001", tax_code:"1257L", ni_category:"A", paye_ytd_gbp:18200, ni_employee_ytd_gbp:3840 },
      { profile_id:"pt-002", employee_id:"emp-003", tax_code:"1257L", ni_category:"A", paye_ytd_gbp:28600, ni_employee_ytd_gbp:5120 },
    ]
  },

  "payroll-exceptions": {
    exceptions: [
      { exception_id:"pe-001", employee_id:"emp-001", type:"OVERTIME_THRESHOLD_BREACH", severity:"MEDIUM", period:"2026-08", status:"OPEN", raised_at:NOW },
      { exception_id:"pe-002", employee_id:"emp-003", type:"TAX_CODE_MISMATCH", severity:"HIGH", period:"2026-08", status:"RESOLVED", raised_at:NOW },
    ]
  },

  // ── COMPLIANCE & RISK ─────────────────────────────────────────────────

  "filing-tracker/requirements": {
    requirements: [
      { req_id:"ft-001", obligation:"UK VAT Return Q2-2026", jurisdiction:"GB", authority:"HMRC", due_date:"2026-09-07", status:"SUBMITTED", filed_at:NOW },
      { req_id:"ft-002", obligation:"UK CT600 FY2025", jurisdiction:"GB", authority:"HMRC", due_date:"2026-12-31", status:"IN_PREPARATION", filed_at:null },
      { req_id:"ft-003", obligation:"US Federal 1120 FY2025", jurisdiction:"US", authority:"IRS", due_date:"2026-10-15", status:"PENDING", filed_at:null },
    ]
  },

  "compliance-status": {
    evaluations: [
      { eval_id:"ce-001", domain:"TAX", overall_status:"COMPLIANT", score:94, last_evaluated_at:NOW },
      { eval_id:"ce-002", domain:"HR", overall_status:"AT_RISK", score:78, last_evaluated_at:NOW },
      { eval_id:"ce-003", domain:"LEGAL", overall_status:"COMPLIANT", score:89, last_evaluated_at:NOW },
    ]
  },

  "exception-escalation/exceptions": {
    exceptions: [
      { exception_id:"ee-001", domain:"HR", type:"RIGHT_TO_WORK_EXPIRY", severity:"HIGH", sla_breach_at:"2026-10-15T00:00:00Z", status:"ESCALATED", assigned_to:"James Okonkwo" },
      { exception_id:"ee-002", domain:"TAX", type:"FILING_DEADLINE_RISK", severity:"MEDIUM", sla_breach_at:"2026-12-31T00:00:00Z", status:"OPEN", assigned_to:"Priya Nair" },
    ]
  },

  // ── AUDIT EVENT STORE ─────────────────────────────────────────────────

  "audit/events": {
    events: [
      { event_id:"ae-001", actor:"vasu@zoikogroup.com", action:"CREATE_TAX_RULE", resource:"tax-rules/tr-005", outcome:"SUCCESS", hash:"a3f9bc12...", occurred_at:NOW },
      { event_id:"ae-002", actor:"shashi@zoikogroup.com", action:"APPROVE_CONTRACT", resource:"contracts/c-001", outcome:"SUCCESS", hash:"b4d2ef31...", occurred_at:NOW },
      { event_id:"ae-003", actor:"vasu@zoikogroup.com", action:"SUBMIT_VAT_RETURN", resource:"vat-returns/vr-001", outcome:"SUCCESS", hash:"c8e1da44...", occurred_at:NOW },
      { event_id:"ae-004", actor:"priya@zoikogroup.com", action:"POST_JOURNAL_ENTRY", resource:"journal-entries/je-001", outcome:"SUCCESS", hash:"d1f7ab55...", occurred_at:NOW },
      { event_id:"ae-005", actor:"system", action:"PAYROLL_RUN_EXECUTED", resource:"payroll-runs/pr-001", outcome:"SUCCESS", hash:"e9c3bc66...", occurred_at:NOW },
      { event_id:"ae-006", actor:"vasu@zoikogroup.com", action:"REGISTER_MODEL_PROVIDER", resource:"model-providers/mp-001", outcome:"SUCCESS", hash:"f2a8cd77...", occurred_at:NOW },
      { event_id:"ae-007", actor:"james@zoikogroup.com", action:"ESCALATE_EXCEPTION", resource:"exceptions/ee-001", outcome:"SUCCESS", hash:"g3b9de88...", occurred_at:NOW },
    ]
  },

  "audit/logs": {
    logs: [
      { log_id:"al-001", event_id:"ae-001", chain_seq:1, previous_hash:"GENESIS", current_hash:"a3f9bc12...", verified:true, logged_at:NOW },
      { log_id:"al-002", event_id:"ae-002", chain_seq:2, previous_hash:"a3f9bc12...", current_hash:"b4d2ef31...", verified:true, logged_at:NOW },
      { log_id:"al-003", event_id:"ae-003", chain_seq:3, previous_hash:"b4d2ef31...", current_hash:"c8e1da44...", verified:true, logged_at:NOW },
      { log_id:"al-004", event_id:"ae-004", chain_seq:4, previous_hash:"c8e1da44...", current_hash:"d1f7ab55...", verified:true, logged_at:NOW },
      { log_id:"al-005", event_id:"ae-005", chain_seq:5, previous_hash:"d1f7ab55...", current_hash:"e9c3bc66...", verified:true, logged_at:NOW },
      { log_id:"al-006", event_id:"ae-006", chain_seq:6, previous_hash:"e9c3bc66...", current_hash:"f2a8cd77...", verified:true, logged_at:NOW },
      { log_id:"al-007", event_id:"ae-007", chain_seq:7, previous_hash:"f2a8cd77...", current_hash:"g3b9de88...", verified:true, logged_at:NOW },
    ]
  },

  "tamper/alerts": {
    tamper_alerts: [
      { alert_id:"ta-001", type:"SEQUENCE_GAP", chain_seq_expected:8, chain_seq_found:10, severity:"HIGH", detected_at:NOW, status:"INVESTIGATING" },
      { alert_id:"ta-002", type:"HASH_MISMATCH", event_id:"ae-003", severity:"CRITICAL", detected_at:NOW, status:"RESOLVED" },
    ]
  },

  "evidence/requirements": {
    requirements: [
      { req_id:"er-001", obligation:"UK VAT Return Q2-2026", evidence_type:"DIGITAL_SIGNATURE", status:"MET", verified_at:NOW },
      { req_id:"er-002", obligation:"UK CT600 FY2025", evidence_type:"AUDITOR_SIGN_OFF", status:"PENDING", verified_at:null },
    ]
  },

  "evidence/evaluations": {
    evaluations: [
      { eval_id:"ev-001", req_id:"er-001", evaluator:"audit-engine-v2", outcome:"PASS", confidence:0.98, evaluated_at:NOW },
    ]
  },

  // ── ADDITIONAL SERVICES ───────────────────────────────────────────────

  "purchase-requests": {
    purchase_requests: [
      { request_id:"preq-001", description:"MacBook Pro 14\" for new hire", amount:2499, currency:"GBP", status:"APPROVED", requested_by:"emp-004", requested_at:NOW },
      { request_id:"preq-002", description:"Figma Enterprise Licence", amount:1200, currency:"GBP", status:"PENDING", requested_by:"emp-001", requested_at:NOW },
    ]
  },

  "suppliers": {
    suppliers: [
      { supplier_id:"sup-001", name:"CloudVault Ltd", category:"SaaS", risk_tier:"LOW", accredited:true },
      { supplier_id:"sup-002", name:"Acme GmbH", category:"Professional Services", risk_tier:"MEDIUM", accredited:true },
    ]
  },

  "invoices": [
    { invoice_id:"inv-001", invoice_number:"INV-2026-001", tenant_id:TENANT, legal_entity_id:ENTITY, customer_id:"cp-001", amount:45000, currency_code:"GBP", status:"PAID", due_date:"2026-08-31", payment_received_at:NOW, created_at:NOW, updated_at:NOW },
    { invoice_id:"inv-002", invoice_number:"INV-2026-002", tenant_id:TENANT, legal_entity_id:ENTITY, customer_id:"cp-002", amount:18000, currency_code:"GBP", status:"SENT", due_date:"2026-09-15", payment_received_at:null, created_at:NOW, updated_at:NOW },
    { invoice_id:"inv-003", invoice_number:"INV-2026-003", tenant_id:TENANT, legal_entity_id:ENTITY, customer_id:"cp-003", amount:12500, currency_code:"USD", status:"OVERDUE", due_date:"2026-08-15", payment_received_at:null, created_at:NOW, updated_at:NOW },
  ],

  "ap-invoices": {
    invoices: [
      { invoice_id:"apinv-001", vendor:"Office Depot", amount:4500, currency:"GBP", status:"APPROVED", due_date:"2026-09-10", paid_at:null },
    ]
  },
};

// ── Route handler ────────────────────────────────────────────────────────

function matchData(pathname) {
  const path = pathname.replace(/^\/v1\//, "").replace(/^\//, "");
  if (DATA[path]) return DATA[path];

  // fallback: partial match
  for (const key of Object.keys(DATA)) {
    if (path.startsWith(key) || key.startsWith(path)) {
      return DATA[key];
    }
  }

  // generic 200 for any unknown sub-path
  return { status: "OK", path, timestamp: new Date().toISOString() };
}

function handler(req, res) {
  const body = JSON.stringify(matchData(req.url));
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Mock-Server": "zoiko-mock-backend",
  });
  res.end(body);
}

// ── Unique ports to start ─────────────────────────────────────────────────

const PORTS = [
  // Tax
  8125, 8126, 8127, 8128, 8129, 8130, 8147,
  // AI Governance
  8146,
  // Legal
  8119, 8120, 8088, 8122, 8123, 8124,
  // Finance
  8098, 8099, 8101, 8102, 8103, 8104, 8105, 8106, 8107,
  // Commercial Ops
  8100, 8131, 8135, 8140,
  // HR
  8108, 8109, 8110, 8111, 8112, 8113, 8114, 8115, 8116, 8117, 8118, 8139,
  // Compliance
  8132, 8133, 8134, 8136, 8137, 8138, 8141,
  // Audit
  8081, 8082, 8083, 8084, 8085,
  // Misc
  8086, 8087, 8089, 8093, 8094,
];

const UNIQUE_PORTS = [...new Set(PORTS)].sort((a, b) => a - b);

let started = 0;
const servers = [];

console.log("\n\x1b[36m╔════════════════════════════════════════════════════════════╗");
console.log("║  Zoiko Suite — Complete Mock Backend (All Services)        ║");
console.log("╚════════════════════════════════════════════════════════════╝\x1b[0m\n");

for (const port of UNIQUE_PORTS) {
  const server = http.createServer(handler);
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.log(`\x1b[33m  ⚠ Port ${port} already in use — skipping (real service may be running)\x1b[0m`);
    } else {
      console.error(`  ✘ Port ${port}: ${e.message}`);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    started++;
    console.log(`  \x1b[32m✔\x1b[0m Mock service started on \x1b[33mlocalhost:${port}\x1b[0m`);
  });
  servers.push(server);
}

// ── Keep-alive status summary ─────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n\x1b[1m\x1b[32m  ✔ ${started} mock services running across ${UNIQUE_PORTS.length} ports\x1b[0m`);
  console.log(`\x1b[36m  ► Now open http://localhost:3000/admin in your browser\x1b[0m`);
  console.log(`\x1b[90m  (Press Ctrl+C to stop all mock services)\x1b[0m\n`);
}, 500);

process.on("SIGINT", () => {
  console.log("\n\x1b[33m  Shutting down all mock services...\x1b[0m");
  servers.forEach(s => s.close());
  process.exit(0);
});
