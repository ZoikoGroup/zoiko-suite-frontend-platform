"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Send, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  Copy, RefreshCw, ExternalLink, ArrowRight, ArrowUpRight, Sparkles,
  Maximize2, Minimize2, Check, Sliders, Server, Play, Square, AlertCircle,
  FileText, BookOpen, Code, Info, Download, ShieldCheck, Database, Calculator, Filter
} from "lucide-react";

export type FieldDoc = {
  field: string;
  type: string;
  required: boolean;
  description: string;
  example: string | number | boolean;
};

export type ServiceDefinition = {
  id: number;
  domain: string;
  name: string;
  port: number;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  presentationText: string;
  fieldDocs: FieldDoc[];
  input: Record<string, unknown> | null;
  queryParams?: Record<string, string>;
};

const DOMAIN_HREFS: Record<string, string> = {
  "Tax Governance": "/admin/tax",
  "AI Governance": "/admin/governance",
  "Legal & Contracts": "/admin/legal",
  "Jurisdictions & Rules": "/admin/jurisdictions",
  "Document Vault": "/admin/documents",
  "Finance": "/admin/finance",
  "Commercial Ops": "/admin/commercial-ops",
  "HR & Workforce": "/admin/hr",
  "Payroll": "/admin/payroll",
  "Compliance & Risk": "/admin/compliance",
  "Audit Event Store": "/admin/audit-events",
};

export const SERVICES: ServiceDefinition[] = [
  // ── 1. TAX GOVERNANCE (7 Services) ──────────────────────────────────────────
  {
    id: 1,
    domain: "Tax Governance",
    name: "Tax Rules Engine",
    port: 8125,
    method: "POST",
    path: "/api/v1/tax-rules",
    description: "Register a new statutory tax rate rule for a jurisdiction",
    presentationText: "Registers an authoritative statutory tax rate rule for an official tax jurisdiction (e.g. HMRC UK, IRS US, IRAS SG). Inputs configure the tax classification category, percentage rate, exemptions in structured JSON, standard deductions, and legal in-force validity dates.",
    fieldDocs: [
      { field: "jurisdiction_id", type: "string (ISO-3166)", required: true, description: "Official sovereign jurisdiction code", example: "GB" },
      { field: "rule_code", type: "string", required: true, description: "Unique regulatory rule identifier", example: "UK-VAT-REDUCED-5" },
      { field: "name", type: "string", required: true, description: "Official statutory tax rule name", example: "UK Domestic Energy Reduced Rate 5%" },
      { field: "category", type: "enum", required: true, description: "Tax category (VAT | GST | SALES_TAX | CORPORATE_INCOME)", example: "VAT" },
      { field: "tax_rate_percentage", type: "number (float)", required: true, description: "Statutory percentage tax rate to apply", example: 5.0 },
      { field: "standard_deductions", type: "number", required: false, description: "Statutory base deduction before tax computation", example: 0 },
      { field: "exemptions_json", type: "string (JSON)", required: false, description: "Conditional exemption criteria in JSON format", example: '{"domestic_energy":true}' },
      { field: "status", type: "enum", required: true, description: "Regulatory rule state (ACTIVE | DRAFT | DEPRECATED)", example: "ACTIVE" },
      { field: "version", type: "number", required: true, description: "Monotonically increasing rule version number", example: 1 },
      { field: "effective_from", type: "string (ISO-8601)", required: true, description: "UTC timestamp from which this tax rule is in effect", example: "2026-09-01T00:00:00Z" },
    ],
    input: {
      jurisdiction_id: "GB",
      rule_code: "UK-VAT-REDUCED-5",
      name: "UK Domestic Energy Reduced Rate 5%",
      category: "VAT",
      tax_rate_percentage: 5.0,
      standard_deductions: 0,
      exemptions_json: '{"domestic_energy":true}',
      status: "ACTIVE",
      version: 1,
      effective_from: "2026-09-01T00:00:00Z"
    }
  },
  {
    id: 2,
    domain: "Tax Governance",
    name: "Tax Determination Engine",
    port: 8126,
    method: "POST",
    path: "/api/v1/tax-determinations",
    description: "Evaluate applicable tax and calculate liabilities on a transaction",
    presentationText: "Evaluates an accounts payable invoice, sales receipt, or purchase order against active jurisdiction tax rules. Computes net taxable base, applicable tax liability, and line-item tax breakdown.",
    fieldDocs: [
      { field: "transaction_id", type: "string", required: true, description: "Upstream commercial transaction reference identifier", example: "tx-inv-2026-8841" },
      { field: "source_module", type: "enum", required: true, description: "Originating ERP module (ACCOUNTS_PAYABLE | SALES | GL)", example: "ACCOUNTS_PAYABLE" },
      { field: "legal_entity_id", type: "string (UUID)", required: true, description: "UUID of the reporting legal entity", example: "22222222-2222-2222-2222-222222222222" },
      { field: "jurisdiction_id", type: "string", required: true, description: "Jurisdiction code where tax nexus applies", example: "GB" },
      { field: "tax_category", type: "enum", required: true, description: "Target tax category to evaluate against", example: "VAT" },
      { field: "gross_amount", type: "number (float)", required: true, description: "Total invoice gross commercial value", example: 150000.0 },
      { field: "taxable_amount", type: "number (float)", required: true, description: "Portion of gross amount subject to tax", example: 150000.0 },
      { field: "currency", type: "string (ISO-4217)", required: true, description: "Three-letter settlement currency code", example: "GBP" },
      { field: "status", type: "enum", required: true, description: "Determination state (CALCULATED | COMMITTED)", example: "CALCULATED" },
    ],
    input: {
      transaction_id: "tx-inv-2026-8841",
      source_module: "ACCOUNTS_PAYABLE",
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "GB",
      tax_category: "VAT",
      gross_amount: 150000.0,
      taxable_amount: 150000.0,
      currency: "GBP",
      status: "CALCULATED"
    }
  },
  {
    id: 3,
    domain: "Tax Governance",
    name: "VAT / GST Return Service (vat-gst-svc)",
    port: 8127,
    method: "POST",
    path: "/api/v1/vat-returns",
    description: "Submit a VAT/GST statutory periodic return filing",
    presentationText: "Prepares and submits statutory periodic VAT/GST filings (e.g. HMRC VAT 100 quarterly return). Aggregates gross sales, allowable purchases, output tax collected, and input tax paid to compute net payable/reclaimable tax.",
    fieldDocs: [
      { field: "jurisdiction_id", type: "string", required: true, description: "Filing jurisdiction country code", example: "GB" },
      { field: "tax_registration_number", type: "string", required: true, description: "Corporate VAT/GST identification number", example: "GB998877665" },
      { field: "tax_period", type: "string", required: true, description: "Filing accounting quarter or month", example: "2026-Q3" },
      { field: "total_sales_amount", type: "number", required: true, description: "Total taxable sales during period (Box 6)", example: 520000.0 },
      { field: "total_purchase_amount", type: "number", required: true, description: "Total purchases excluding VAT (Box 7)", example: 210000.0 },
      { field: "output_tax_amount", type: "number", required: true, description: "VAT charged on sales (Box 1)", example: 104000.0 },
      { field: "input_tax_amount", type: "number", required: true, description: "VAT reclaimed on purchases (Box 4)", example: 42000.0 },
      { field: "net_tax_payable", type: "number", required: true, description: "Net VAT to be paid or reclaimed (Box 5)", example: 62000.0 },
      { field: "currency", type: "string", required: true, description: "Settlement currency of tax authority", example: "GBP" },
      { field: "status", type: "enum", required: true, description: "Filing status (DRAFT | SUBMITTED | ACCEPTED)", example: "DRAFT" },
    ],
    input: {
      jurisdiction_id: "GB",
      tax_registration_number: "GB998877665",
      tax_period: "2026-Q3",
      total_sales_amount: 520000.0,
      total_purchase_amount: 210000.0,
      output_tax_amount: 104000.0,
      input_tax_amount: 42000.0,
      net_tax_payable: 62000.0,
      currency: "GBP",
      status: "DRAFT"
    }
  },
  {
    id: 4,
    domain: "Tax Governance",
    name: "Corporate Tax Service",
    port: 8128,
    method: "POST",
    path: "/api/v1/corporate-tax-returns",
    description: "Submit annual corporate income tax computations and return",
    presentationText: "Submits annual corporate income tax calculations (e.g. UK CT600, US Form 1120). Reconciles annual revenues, allowable business expenses, taxable corporate profits, tax credits, and statutory liabilities.",
    fieldDocs: [
      { field: "jurisdiction_id", type: "string", required: true, description: "Incorporation tax jurisdiction", example: "GB" },
      { field: "tax_registration_number", type: "string", required: true, description: "Unique Taxpayer Reference (UTR)", example: "GB-CT-443322" },
      { field: "fiscal_year", type: "number", required: true, description: "Tax accounting fiscal year", example: 2026 },
      { field: "accounting_period_start", type: "string (YYYY-MM-DD)", required: true, description: "Start of corporate accounting period", example: "2026-01-01" },
      { field: "accounting_period_end", type: "string (YYYY-MM-DD)", required: true, description: "End of corporate accounting period", example: "2026-12-31" },
      { field: "gross_revenue", type: "number", required: true, description: "Consolidated gross turnover", example: 3500000.0 },
      { field: "allowable_deductions", type: "number", required: true, description: "Statutory allowable operating expenses", example: 2100000.0 },
      { field: "taxable_income", type: "number", required: true, description: "Taxable trading profit", example: 1400000.0 },
      { field: "tax_rate_percent", type: "number", required: true, description: "Statutory main corporate tax rate", example: 25.0 },
      { field: "gross_tax_liability", type: "number", required: true, description: "Calculated tax before relief/credits", example: 350000.0 },
      { field: "tax_credits", type: "number", required: true, description: "R&D tax credits and relief deductions", example: 25000.0 },
      { field: "net_tax_payable", type: "number", required: true, description: "Final payable corporate income tax", example: 325000.0 },
      { field: "currency", type: "string", required: true, description: "Corporate reporting currency", example: "GBP" },
      { field: "status", type: "enum", required: true, description: "Submission status (DRAFT | REVIEWED | FILED)", example: "DRAFT" },
    ],
    input: {
      jurisdiction_id: "GB",
      tax_registration_number: "GB-CT-443322",
      fiscal_year: 2026,
      accounting_period_start: "2026-01-01",
      accounting_period_end: "2026-12-31",
      gross_revenue: 3500000.0,
      allowable_deductions: 2100000.0,
      taxable_income: 1400000.0,
      tax_rate_percent: 25.0,
      gross_tax_liability: 350000.0,
      tax_credits: 25000.0,
      net_tax_payable: 325000.0,
      currency: "GBP",
      status: "DRAFT"
    }
  },
  {
    id: 5,
    domain: "Tax Governance",
    name: "Withholding Tax Service",
    port: 8129,
    method: "POST",
    path: "/api/v1/withholding-tax",
    description: "Create a withholding tax obligation on a cross-border payment",
    presentationText: "Computes and creates withholding tax (WHT) obligations on cross-border payments (royalties, software licenses, consulting, dividends) according to bilateral double-taxation relief treaties.",
    fieldDocs: [
      { field: "jurisdiction_id", type: "string", required: true, description: "Recipient counterparty tax residency country", example: "DE" },
      { field: "counterparty_id", type: "string", required: true, description: "Payee entity KYC reference", example: "cp-acme-gmbh-01" },
      { field: "payment_reference", type: "string", required: true, description: "Downstream accounts payable disbursement ref", example: "PAY-DE-2026-09" },
      { field: "payment_type", type: "enum", required: true, description: "Nature of payment (ROYALTIES | DIVIDENDS | SERVICES)", example: "ROYALTIES" },
      { field: "gross_payment_amount", type: "number", required: true, description: "Full payment amount before withholding", example: 85000.0 },
      { field: "taxable_base_amount", type: "number", required: true, description: "Treaty-adjusted taxable base amount", example: 85000.0 },
      { field: "withholding_rate_percent", type: "number", required: true, description: "Applicable bilateral treaty tax rate", example: 15.0 },
      { field: "withheld_amount", type: "number", required: true, description: "Amount retained to remit to local revenue service", example: 12750.0 },
      { field: "currency", type: "string", required: true, description: "Settlement currency", example: "EUR" },
      { field: "status", type: "enum", required: true, description: "Obligation status (CALCULATED | SETTLED)", example: "CALCULATED" },
    ],
    input: {
      jurisdiction_id: "DE",
      counterparty_id: "cp-acme-gmbh-01",
      payment_reference: "PAY-DE-2026-09",
      payment_type: "ROYALTIES",
      gross_payment_amount: 85000.0,
      taxable_base_amount: 85000.0,
      withholding_rate_percent: 15.0,
      withheld_amount: 12750.0,
      currency: "EUR",
      status: "CALCULATED"
    }
  },
  {
    id: 6,
    domain: "Tax Governance",
    name: "Filing Preparation Service",
    port: 8130,
    method: "POST",
    path: "/api/v1/filing-preparation/drafts",
    description: "Create a structured draft for an upcoming regulatory filing",
    presentationText: "Assembles regulatory filing payloads into structured schema-validated draft objects for electronic submission to national revenue authorities.",
    fieldDocs: [
      { field: "return_type", type: "enum", required: true, description: "Statutory filing return type", example: "VAT_RETURN" },
      { field: "jurisdiction_id", type: "string", required: true, description: "Filing country jurisdiction", example: "GB" },
      { field: "tax_period", type: "string", required: true, description: "Filing period code", example: "2026-Q3" },
      { field: "source_return_id", type: "string", required: true, description: "Underlying VAT or Corporate Tax Return ID", example: "vr-003" },
      { field: "form_data_json", type: "string (JSON)", required: true, description: "Schema-validated form boxes in JSON", example: '{"box1":104000,"box4":42000,"box5":62000}' },
      { field: "validation_status", type: "enum", required: true, description: "Draft validation state (DRAFT | VALIDATED)", example: "DRAFT" },
    ],
    input: {
      return_type: "VAT_RETURN",
      jurisdiction_id: "GB",
      tax_period: "2026-Q3",
      source_return_id: "vr-003",
      form_data_json: '{"box1":104000,"box4":42000,"box5":62000}',
      validation_status: "DRAFT"
    }
  },
  {
    id: 7,
    domain: "Tax Governance",
    name: "Tax Authority Interface",
    port: 8147,
    method: "POST",
    path: "/api/v1/tax-authority/interfaces",
    description: "Register an e-filing API connection to a tax authority gateway",
    presentationText: "Registers an authenticated, encrypted electronic gateway connection to a government tax authority API (such as HMRC Making Tax Digital or Singapore IRAS).",
    fieldDocs: [
      { field: "jurisdiction_id", type: "string", required: true, description: "Target sovereign jurisdiction", example: "GB" },
      { field: "authority_name", type: "string", required: true, description: "Official tax authority gateway name", example: "HMRC Making Tax Digital (MTD)" },
      { field: "protocol", type: "enum", required: true, description: "API communication protocol (REST_OAUTH2 | AS4 | SFTP)", example: "REST_OAUTH2" },
      { field: "endpoint_url", type: "string (URL)", required: true, description: "Production / Sandbox e-filing API endpoint", example: "https://api.service.hmrc.gov.uk/organisations/vat" },
      { field: "auth_scheme", type: "enum", required: true, description: "Authentication scheme (BEARER_TOKEN | MTLS | API_KEY)", example: "BEARER_TOKEN" },
      { field: "status", type: "enum", required: true, description: "Interface connectivity status", example: "ACTIVE" },
    ],
    input: {
      jurisdiction_id: "GB",
      authority_name: "HMRC Making Tax Digital (MTD)",
      protocol: "REST_OAUTH2",
      endpoint_url: "https://api.service.hmrc.gov.uk/organisations/vat",
      auth_scheme: "BEARER_TOKEN",
      status: "ACTIVE"
    }
  },

  // ── 2. AI GOVERNANCE (1 Service) ────────────────────────────────────────────
  {
    id: 8,
    domain: "AI Governance",
    name: "AI Governance Engine",
    port: 8146,
    method: "GET",
    path: "/api/v1/ai-governance",
    description: "Audit registered AI model providers, risk tiers, and kill-switch states",
    presentationText: "Queries verified enterprise LLM/AI model providers, EU AI Act risk tier classifications, verification statuses, and automated model safety gates.",
    fieldDocs: [
      { field: "status", type: "string (query)", required: false, description: "Filter by verification status (VERIFIED | PENDING)", example: "VERIFIED" },
      { field: "risk_tier", type: "string (query)", required: false, description: "Filter by EU AI Act risk tier (TIER_1 | TIER_2 | TIER_3)", example: "TIER_2" },
      { field: "limit", type: "number (query)", required: false, description: "Maximum model audit entries to return", example: 50 },
    ],
    input: null,
    queryParams: { status: "VERIFIED", limit: "50" }
  },

  // ── 3. LEGAL & CONTRACTS (6 Services) ───────────────────────────────────────
  {
    id: 9,
    domain: "Legal & Contracts",
    name: "Contract Lifecycle Service",
    port: 8119,
    method: "POST",
    path: "/api/v1/contracts",
    description: "Draft a new binding commercial agreement in the lifecycle system",
    presentationText: "Initiates a formal contract record in the digital contract management pipeline. Inputs establish contract title, commercial agreement type, counterparty entity details, total committed value, and validity window.",
    fieldDocs: [
      { field: "title", type: "string", required: true, description: "Official commercial title of the agreement", example: "Enterprise Master Services Agreement — GlobalCloud Inc" },
      { field: "contract_type", type: "enum", required: true, description: "Contract classification (MSA | SLA | NDA | VENDOR)", example: "MSA" },
      { field: "counterparty_id", type: "string", required: true, description: "KYC-verified counterparty identity code", example: "cp-globalcloud-01" },
      { field: "counterparty_name", type: "string", required: true, description: "Legal entity name of counterparty", example: "GlobalCloud Inc" },
      { field: "currency", type: "string", required: true, description: "Contract financial valuation currency", example: "GBP" },
      { field: "total_value", type: "number", required: true, description: "Total committed commercial value of contract", example: 320000.0 },
      { field: "effective_from", type: "string (ISO-8601)", required: true, description: "Date when contract terms become legally binding", example: "2026-10-01T00:00:00Z" },
      { field: "status", type: "enum", required: true, description: "Lifecycle stage (DRAFT | PENDING_APPROVAL | ACTIVE)", example: "DRAFT" },
    ],
    input: {
      title: "Enterprise Master Services Agreement — GlobalCloud Inc",
      contract_type: "MSA",
      counterparty_id: "cp-globalcloud-01",
      counterparty_name: "GlobalCloud Inc",
      currency: "GBP",
      total_value: 320000.0,
      effective_from: "2026-10-01T00:00:00Z",
      status: "DRAFT"
    }
  },
  {
    id: 10,
    domain: "Legal & Contracts",
    name: "Clause & Template Library",
    port: 8120,
    method: "POST",
    path: "/api/v1/clauses",
    description: "Register a new approved standard legal clause template",
    presentationText: "Registers an approved standard boilerplate legal clause template (e.g. GDPR Data Processing, Indemnity, Force Majeure, IP Ownership) for automated contract authoring.",
    fieldDocs: [
      { field: "title", type: "string", required: true, description: "Descriptive name of standard clause", example: "UK GDPR Standard Model Clauses 2026" },
      { field: "category", type: "enum", required: true, description: "Legal area (DATA_PROTECTION | LIABILITY | CONFIDENTIALITY)", example: "DATA_PROTECTION" },
      { field: "body", type: "string", required: true, description: "Full authoritative legal clause text", example: "The Data Processor shall process personal data solely in accordance with documented instructions..." },
      { field: "jurisdiction_id", type: "string", required: true, description: "Governing legal jurisdiction", example: "GB" },
      { field: "is_standard", type: "boolean", required: true, description: "Whether this clause is an approved company standard", example: true },
      { field: "status", type: "enum", required: true, description: "Governance approval status (APPROVED | PENDING)", example: "APPROVED" },
    ],
    input: {
      title: "UK GDPR Standard Model Clauses 2026",
      category: "DATA_PROTECTION",
      body: "The Data Processor shall process personal data solely in accordance with documented instructions of the Data Controller.",
      jurisdiction_id: "GB",
      is_standard: true,
      status: "APPROVED"
    }
  },
  {
    id: 11,
    domain: "Legal & Contracts",
    name: "Obligation Tracking Service",
    port: 8121,
    method: "POST",
    path: "/api/v1/obligations",
    description: "Track a binding contractual obligation with deadline and risk level",
    presentationText: "Registers and tracks compliance with binding contractual deliverables, audit deliverables, insurance renewals, and service level agreements (SLAs).",
    fieldDocs: [
      { field: "contract_id", type: "string", required: true, description: "Associated contract reference ID", example: "c-001" },
      { field: "title", type: "string", required: true, description: "Milestone or obligation summary", example: "Annual ISO 27001 SOC-2 Type II Audit Certification" },
      { field: "description", type: "string", required: false, description: "Detailed fulfillment instructions and criteria", example: "Deliver renewed SOC-2 Type II certification report" },
      { field: "due_date", type: "string (ISO-8601)", required: true, description: "Contractual delivery deadline", example: "2026-12-15T00:00:00Z" },
      { field: "risk_level", type: "enum", required: true, description: "Breach impact severity (HIGH | MEDIUM | LOW)", example: "HIGH" },
      { field: "status", type: "enum", required: true, description: "Fulfillment state (PENDING | MET | BREACHED)", example: "PENDING" },
    ],
    input: {
      contract_id: "c-001",
      title: "Annual ISO 27001 SOC-2 Type II Audit Certification",
      description: "Deliver renewed SOC-2 Type II certification report to counterparty legal department",
      due_date: "2026-12-15T00:00:00Z",
      risk_level: "HIGH",
      status: "PENDING"
    }
  },
  {
    id: 12,
    domain: "Legal & Contracts",
    name: "Board Governance & Resolutions Service",
    port: 8121,
    method: "POST",
    path: "/api/v1/meetings",
    description: "Schedule a board meeting or audit committee assembly",
    presentationText: "Registers and schedules formal corporate governance meetings of the Board of Directors or Audit Committee, configuring quorum requirements, agenda topics, and location.",
    fieldDocs: [
      { field: "meeting_type", type: "enum", required: true, description: "Meeting category (BOARD_OF_DIRECTORS | AUDIT_COMMITTEE | AGM)", example: "BOARD_OF_DIRECTORS" },
      { field: "title", type: "string", required: true, description: "Official meeting agenda title", example: "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting" },
      { field: "scheduled_date", type: "string (ISO-8601)", required: true, description: "Scheduled meeting start time", example: "2026-09-25T14:00:00Z" },
      { field: "location", type: "string", required: false, description: "Physical room or encrypted video assembly link", example: "London HQ / Virtual Boardroom" },
      { field: "quorum_required", type: "number", required: true, description: "Minimum number of voting directors needed", example: 3 },
      { field: "status", type: "enum", required: true, description: "Meeting status (SCHEDULED | ADJOURNED)", example: "SCHEDULED" },
    ],
    input: {
      meeting_type: "BOARD_OF_DIRECTORS",
      title: "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting",
      scheduled_date: "2026-09-25T14:00:00Z",
      location: "London HQ / Virtual Boardroom",
      quorum_required: 3,
      status: "SCHEDULED"
    }
  },
  {
    id: 13,
    domain: "Legal & Contracts",
    name: "Corporate Actions Service",
    port: 8123,
    method: "POST",
    path: "/api/v1/corporate-actions",
    description: "Propose a corporate action such as share issuance or dividend grant",
    presentationText: "Proposes and logs statutory corporate transactions, capital allotments, stock option pool expansions, or executive share grants requiring board governance approval.",
    fieldDocs: [
      { field: "action_type", type: "enum", required: true, description: "Corporate action type (EQUITY_INCENTIVE_GRANT | DIVIDEND)", example: "EQUITY_INCENTIVE_GRANT" },
      { field: "description", type: "string", required: true, description: "Business purpose and legal summary of action", example: "Approve 2026 Employee Stock Option Scheme Allotment" },
      { field: "authorized_shares", type: "number", required: false, description: "Quantity of shares authorized or issued", example: 250000 },
      { field: "share_class", type: "string", required: false, description: "Share capital class (ORDINARY_A | ORDINARY_B | PREFERRED)", example: "ORDINARY_B" },
      { field: "status", type: "enum", required: true, description: "Action workflow status (PROPOSED | APPROVED | EXECUTED)", example: "PROPOSED" },
    ],
    input: {
      action_type: "EQUITY_INCENTIVE_GRANT",
      description: "Approve 2026 Employee Stock Option Scheme Allotment",
      authorized_shares: 250000,
      share_class: "ORDINARY_B",
      status: "PROPOSED"
    }
  },
  {
    id: 14,
    domain: "Legal & Contracts",
    name: "Counterparty Management",
    port: 8124,
    method: "GET",
    path: "/api/v1/counterparties",
    description: "List all KYC-verified corporate counterparties and suppliers",
    presentationText: "Queries verified institutional counterparties, validating corporate registration, jurisdiction residency, anti-money laundering checks, and sanctions screening status.",
    fieldDocs: [
      { field: "kyc_status", type: "string (query)", required: false, description: "Filter by KYC state (VERIFIED | PENDING)", example: "VERIFIED" },
      { field: "limit", type: "number (query)", required: false, description: "Page limit of records", example: 50 },
    ],
    input: null,
    queryParams: { kyc_status: "VERIFIED", limit: "50" }
  },

  // ── 4. FINANCE (3 Services) ─────────────────────────────────────────────────
  {
    id: 15,
    domain: "Finance",
    name: "General Ledger Engine",
    port: 8098,
    method: "POST",
    path: "/api/v1/journal-entries",
    description: "Post a balanced double-entry accounting journal to the general ledger",
    presentationText: "Posts balanced double-entry journal transactions into the immutable financial ledger. Validates debit and credit equality, chart of accounts codes, and currency denomination.",
    fieldDocs: [
      { field: "reference_code", type: "string", required: true, description: "Unique general ledger journal entry reference code", example: "JE-2026-09-001" },
      { field: "description", type: "string", required: true, description: "Commercial narrative describing the accounting posting", example: "September Intercompany Management Service Fee Accrual" },
      { field: "debit_account", type: "string", required: true, description: "Debit chart-of-accounts code", example: "7001-MGMT-FEES" },
      { field: "credit_account", type: "string", required: true, description: "Credit chart-of-accounts code", example: "2050-INTERCO-PAYABLE" },
      { field: "amount", type: "number", required: true, description: "Transaction value (debit equals credit)", example: 45000.0 },
      { field: "currency", type: "string", required: true, description: "ISO-4217 financial currency", example: "GBP" },
      { field: "status", type: "enum", required: true, description: "Posting state (POSTED | DRAFT)", example: "POSTED" },
    ],
    input: {
      reference_code: "JE-2026-09-001",
      description: "September Intercompany Management Service Fee Accrual",
      debit_account: "7001-MGMT-FEES",
      credit_account: "2050-INTERCO-PAYABLE",
      amount: 45000.0,
      currency: "GBP",
      status: "POSTED"
    }
  },
  {
    id: 16,
    domain: "Finance",
    name: "Treasury & Cash Engine",
    port: 8103,
    method: "GET",
    path: "/api/v1/cash-positions",
    description: "Retrieve multi-currency liquidity and real-time cash balances",
    presentationText: "Retrieves consolidated multi-currency treasury positions across tier-1 banking institutions, calculating liquid reserves, working capital, and FX exposure.",
    fieldDocs: [
      { field: "currency", type: "string (query)", required: false, description: "Filter by reporting currency (GBP | EUR | USD)", example: "GBP" },
    ],
    input: null,
    queryParams: { currency: "GBP" }
  },
  {
    id: 17,
    domain: "Finance",
    name: "Financial Reporting Engine",
    port: 8104,
    method: "GET",
    path: "/api/v1/finance/summary",
    description: "Fetch consolidated financial summary statistics and balance figures",
    presentationText: "Queries consolidated corporate financial metrics including monthly turnover, gross margin, operating EBITDA, accounts receivable aged debt, and close status.",
    fieldDocs: [
      { field: "period", type: "string (query)", required: false, description: "Financial fiscal period code", example: "2026-Q3" },
    ],
    input: null,
    queryParams: { period: "2026-Q3" }
  },

  // ── 5. COMMERCIAL OPS (3 Services) ──────────────────────────────────────────
  {
    id: 18,
    domain: "Commercial Ops",
    name: "Purchase Order Management",
    port: 8139,
    method: "POST",
    path: "/api/v1/purchase-orders",
    description: "Raise an approved purchase order for an enterprise supplier",
    presentationText: "Generates an authorized binding purchase order (PO) issued to a validated supplier, locking spend against allocated budgets and triggering invoice 3-way matching.",
    fieldDocs: [
      { field: "po_number", type: "string", required: true, description: "Unique purchase order identifier", example: "PO-2026-089" },
      { field: "vendor_name", type: "string", required: true, description: "Accredited supplier business name", example: "CloudVault Ltd" },
      { field: "description", type: "string", required: true, description: "Procurement line description of goods/services", example: "Annual Enterprise Multi-Region Cloud Storage Infrastructure" },
      { field: "amount", type: "number", required: true, description: "Contractual purchase order value", example: 96000.0 },
      { field: "currency", type: "string", required: true, description: "Purchase order currency", example: "GBP" },
      { field: "status", type: "enum", required: true, description: "PO authorization status (APPROVED | ISSUED)", example: "APPROVED" },
    ],
    input: {
      po_number: "PO-2026-089",
      vendor_name: "CloudVault Ltd",
      description: "Annual Enterprise Multi-Region Cloud Storage Infrastructure",
      amount: 96000.0,
      currency: "GBP",
      status: "APPROVED"
    }
  },
  {
    id: 19,
    domain: "Commercial Ops",
    name: "Spend Controls Service",
    port: 8131,
    method: "POST",
    path: "/api/v1/spend-controls/limits",
    description: "Set a departmental annual spend limit and approval threshold",
    presentationText: "Establishes governed expenditure ceilings per department or cost category, requiring secondary VP approval for any purchase requisition exceeding the threshold.",
    fieldDocs: [
      { field: "category", type: "string", required: true, description: "Spend classification category", example: "Information Technology & Software Infrastructure" },
      { field: "department", type: "string", required: true, description: "Target organizational department", example: "Engineering" },
      { field: "annual_limit_amount", type: "number", required: true, description: "Maximum allowable annual budget", example: 350000.0 },
      { field: "currency", type: "string", required: true, description: "Budget currency", example: "GBP" },
      { field: "approval_threshold", type: "number", required: true, description: "Amount above which executive escalation is required", example: 25000.0 },
      { field: "period", type: "string", required: true, description: "Budget fiscal period identifier", example: "2026-FY" },
    ],
    input: {
      category: "Information Technology & Software Infrastructure",
      department: "Engineering",
      annual_limit_amount: 350000.0,
      currency: "GBP",
      approval_threshold: 25000.0,
      period: "2026-FY"
    }
  },
  {
    id: 20,
    domain: "Commercial Ops",
    name: "Vendor Due Diligence",
    port: 8135,
    method: "GET",
    path: "/api/v1/vendors",
    description: "List all approved vendors with risk tier and accreditation status",
    presentationText: "Queries verified third-party suppliers, inspecting ESG compliance, security certifications (ISO 27001), credit risk ratings, and compliance audit history.",
    fieldDocs: [
      { field: "risk_tier", type: "string (query)", required: false, description: "Filter by risk classification (LOW | MEDIUM | HIGH)", example: "LOW" },
    ],
    input: null,
    queryParams: { risk_tier: "LOW" }
  },

  // ── 6. HR & WORKFORCE (5 Services) ──────────────────────────────────────────
  {
    id: 21,
    domain: "HR & Workforce",
    name: "Employee Master Directory",
    port: 8108,
    method: "POST",
    path: "/api/v1/employees",
    description: "Onboard a new employee into the master workforce identity system",
    presentationText: "Registers an employee identity record in the central HR master directory, provisioning department assignments, job roles, worker classification, and start dates.",
    fieldDocs: [
      { field: "first_name", type: "string", required: true, description: "Legal first name", example: "Alexander" },
      { field: "last_name", type: "string", required: true, description: "Legal family name", example: "Wright" },
      { field: "email", type: "string (email)", required: true, description: "Corporate corporate email address", example: "alexander.wright@zoikogroup.com" },
      { field: "job_title", type: "string", required: true, description: "Official employment position title", example: "Principal Infrastructure Engineer" },
      { field: "worker_type", type: "enum", required: true, description: "Employment relationship (FULL_TIME | CONTRACTOR | PART_TIME)", example: "FULL_TIME" },
      { field: "hire_date", type: "string (YYYY-MM-DD)", required: true, description: "Contractual employment start date", example: "2026-09-01" },
      { field: "department_id", type: "string", required: true, description: "Assigned departmental cost-center ID", example: "dept-001" },
      { field: "status", type: "enum", required: true, description: "Workforce status (ACTIVE | ONBOARDING)", example: "ACTIVE" },
    ],
    input: {
      first_name: "Alexander",
      last_name: "Wright",
      email: "alexander.wright@zoikogroup.com",
      job_title: "Principal Infrastructure Engineer",
      worker_type: "FULL_TIME",
      hire_date: "2026-09-01",
      department_id: "dept-001",
      status: "ACTIVE"
    }
  },
  {
    id: 22,
    domain: "HR & Workforce",
    name: "Leave & Attendance Engine",
    port: 8115,
    method: "POST",
    path: "/api/v1/leave/requests",
    description: "Submit an employee paid or statutory leave request for approval",
    presentationText: "Submits formal employee leave requests (annual holiday, sickness, parental) checking remaining allowances, public holidays, and triggering team manager sign-off.",
    fieldDocs: [
      { field: "employee_id", type: "string", required: true, description: "Applicant employee identifier", example: "emp-001" },
      { field: "leave_type_id", type: "enum", required: true, description: "Category of absence (ANNUAL_LEAVE | SICK_LEAVE | PARENTAL)", example: "ANNUAL_LEAVE" },
      { field: "start_date", type: "string (YYYY-MM-DD)", required: true, description: "First day of absence", example: "2026-10-12" },
      { field: "end_date", type: "string (YYYY-MM-DD)", required: true, description: "Final day of absence", example: "2026-10-16" },
      { field: "total_hours", type: "number", required: true, description: "Total working hours requested off", example: 40 },
      { field: "reason", type: "string", required: false, description: "Optional narrative justification", example: "Autumn Family Holiday" },
      { field: "status", type: "enum", required: true, description: "Approval workflow state", example: "SUBMITTED" },
    ],
    input: {
      employee_id: "emp-001",
      leave_type_id: "ANNUAL_LEAVE",
      start_date: "2026-10-12",
      end_date: "2026-10-16",
      total_hours: 40,
      reason: "Autumn Family Holiday",
      status: "SUBMITTED"
    }
  },
  {
    id: 23,
    domain: "HR & Workforce",
    name: "Org Structure Governance",
    port: 8116,
    method: "POST",
    path: "/api/v1/org/departments",
    description: "Create a new department in the corporate organizational hierarchy",
    presentationText: "Establishes a new organizational business unit or department, defining budget allocations, leadership responsibility, and organizational cost-center codes.",
    fieldDocs: [
      { field: "code", type: "string", required: true, description: "Short department cost center code", example: "CC-SEC" },
      { field: "name", type: "string", required: true, description: "Full department name", example: "Cybersecurity & Governance" },
      { field: "head", type: "string", required: true, description: "Department head leader name", example: "Alexander Wright" },
      { field: "budget_gbp", type: "number", required: true, description: "Annual operational budget allocated in GBP", example: 750000.0 },
    ],
    input: {
      code: "CC-SEC",
      name: "Cybersecurity & Governance",
      head: "Alexander Wright",
      budget_gbp: 750000.0
    }
  },
  {
    id: 24,
    domain: "HR & Workforce",
    name: "Workforce Compliance Alerts",
    port: 8118,
    method: "POST",
    path: "/api/v1/compliance/alerts",
    description: "Raise a workforce statutory compliance alert for an employee",
    presentationText: "Raises critical statutory workforce alerts regarding right-to-work visa expirations, mandatory safety certifications, or working-time limit breaches.",
    fieldDocs: [
      { field: "employee_id", type: "string", required: true, description: "Affected employee reference ID", example: "emp-004" },
      { field: "alert_type", type: "enum", required: true, description: "Type of compliance alert (VISA_RENEWAL | TRAINING_LAPSE)", example: "VISA_RENEWAL_REQUIRED" },
      { field: "severity", type: "enum", required: true, description: "Risk urgency (HIGH | MEDIUM | LOW)", example: "HIGH" },
      { field: "description", type: "string", required: true, description: "Actionable alert explanation", example: "UK Skilled Worker Visa renewal window opens 60 days before expiry" },
      { field: "status", type: "enum", required: true, description: "Resolution state (OPEN | RESOLVED)", example: "OPEN" },
    ],
    input: {
      employee_id: "emp-004",
      alert_type: "VISA_RENEWAL_REQUIRED",
      severity: "HIGH",
      description: "UK Skilled Worker Visa renewal window opens 60 days before expiry",
      status: "OPEN"
    }
  },
  {
    id: 25,
    domain: "HR & Workforce",
    name: "Talent & Review Cycles",
    port: 8139,
    method: "GET",
    path: "/api/v1/talent",
    description: "Fetch performance reviews and active annual review cycles",
    presentationText: "Queries active employee performance review cycles, 360-degree feedback reviews, and competency evaluations across all business units.",
    fieldDocs: [
      { field: "cycle_code", type: "string (query)", required: false, description: "Filter by review cycle code", example: "2026-H2" },
    ],
    input: null,
    queryParams: { cycle_code: "2026-H2" }
  },

  // ── 7. PAYROLL (5 Services) ─────────────────────────────────────────────────
  {
    id: 26,
    domain: "Payroll",
    name: "Payroll Processing Engine",
    port: 8110,
    method: "POST",
    path: "/api/v1/payroll-runs",
    description: "Initiate a monthly gross-to-net payroll computation run",
    presentationText: "Executes periodic gross-to-net payroll calculations for all active personnel in an entity, reconciling gross wages, tax withholdings, pension deductions, and net disbursements.",
    fieldDocs: [
      { field: "pay_period_code", type: "string", required: true, description: "Monthly pay period code", example: "2026-10-M" },
      { field: "period_start_date", type: "string (YYYY-MM-DD)", required: true, description: "Start date of pay cycle", example: "2026-10-01" },
      { field: "period_end_date", type: "string (YYYY-MM-DD)", required: true, description: "End date of pay cycle", example: "2026-10-31" },
      { field: "payment_date", type: "string (YYYY-MM-DD)", required: true, description: "Direct deposit / BACS disbursement date", example: "2026-10-28" },
      { field: "total_employee_count", type: "number", required: true, description: "Total workforce count included in run", example: 76 },
      { field: "total_gross_pay", type: "number", required: true, description: "Aggregated gross salaries", example: 428000.0 },
      { field: "total_net_pay", type: "number", required: true, description: "Aggregated net pay to transfer", example: 299000.0 },
      { field: "total_tax_deductions", type: "number", required: true, description: "Total PAYE and National Insurance deductions", example: 129000.0 },
      { field: "status", type: "enum", required: true, description: "Execution status (CALCULATING | FINALIZED)", example: "CALCULATING" },
    ],
    input: {
      pay_period_code: "2026-10-M",
      period_start_date: "2026-10-01",
      period_end_date: "2026-10-31",
      payment_date: "2026-10-28",
      total_employee_count: 76,
      total_gross_pay: 428000.0,
      total_net_pay: 299000.0,
      total_tax_deductions: 129000.0,
      status: "CALCULATING"
    }
  },
  {
    id: 27,
    domain: "Payroll",
    name: "Compensation Structures",
    port: 8111,
    method: "POST",
    path: "/api/v1/compensation/structures",
    description: "Define an official compensation grade, salary band, or wage benchmark",
    presentationText: "Defines standardized salary structures, compensation bands, and base wage levels corresponding to professional job levels and regional benchmark brackets.",
    fieldDocs: [
      { field: "title", type: "string", required: true, description: "Job title and career level tier", example: "Staff Security Architect (L5)" },
      { field: "wage_type", type: "enum", required: true, description: "Remuneration type (SALARY | HOURLY)", example: "SALARY" },
      { field: "base_pay", type: "number", required: true, description: "Benchmark annual base salary", example: 125000.0 },
      { field: "currency", type: "string", required: true, description: "Compensation currency", example: "GBP" },
      { field: "pay_frequency", type: "enum", required: true, description: "Frequency of payment (MONTHLY | BIWEEKLY)", example: "MONTHLY" },
    ],
    input: {
      title: "Staff Security Architect (L5)",
      wage_type: "SALARY",
      base_pay: 125000.0,
      currency: "GBP",
      pay_frequency: "MONTHLY"
    }
  },
  {
    id: 28,
    domain: "Payroll",
    name: "Benefits Engine",
    port: 8112,
    method: "POST",
    path: "/api/v1/benefits/plans",
    description: "Register a new corporate employee benefit or insurance plan",
    presentationText: "Registers corporate employee benefit schemes (private healthcare, dental, pension sacrifice, life cover), tracking employer contribution rates and enrollment counts.",
    fieldDocs: [
      { field: "name", type: "string", required: true, description: "Benefit program scheme name", example: "Comprehensive Dental & Optical Plan" },
      { field: "type", type: "enum", required: true, description: "Benefit category (DENTAL | HEALTH | PENSION | LIFE)", example: "DENTAL" },
      { field: "provider", type: "string", required: true, description: "Commercial benefit underwriting provider", example: "Bupa DentalCare" },
      { field: "employer_contribution_pct", type: "number", required: true, description: "Percentage subsidized by the enterprise", example: 100 },
      { field: "enrolled_count", type: "number", required: true, description: "Current count of active enrolled employees", example: 65 },
    ],
    input: {
      name: "Comprehensive Dental & Optical Plan",
      type: "DENTAL",
      provider: "Bupa DentalCare",
      employer_contribution_pct: 100,
      enrolled_count: 65
    }
  },
  {
    id: 29,
    domain: "Payroll",
    name: "Payroll Tax Compliance",
    port: 8113,
    method: "GET",
    path: "/api/v1/payroll-tax/profiles",
    description: "Retrieve all employee PAYE, NI, and statutory tax profiles",
    presentationText: "Audits individual employee tax code configurations (e.g. 1257L), National Insurance categories (Category A), year-to-date tax paid, and student loan deductions.",
    fieldDocs: [
      { field: "tax_code", type: "string (query)", required: false, description: "Filter by HMRC statutory tax code", example: "1257L" },
    ],
    input: null,
    queryParams: { tax_code: "1257L" }
  },
  {
    id: 30,
    domain: "Payroll",
    name: "Payroll Exception Engine",
    port: 8114,
    method: "POST",
    path: "/api/v1/payroll-exceptions",
    description: "Raise a payroll calculation exception for manual payroll officer review",
    presentationText: "Logs payroll anomalies such as expense cap violations, negative net pay projections, or unexpected tax code changes that halt automated disbursements.",
    fieldDocs: [
      { field: "employee_id", type: "string", required: true, description: "Subject employee identifier", example: "emp-002" },
      { field: "type", type: "enum", required: true, description: "Discrepancy category", example: "EXPENSE_REIMBURSEMENT_CAP_BREACH" },
      { field: "severity", type: "enum", required: true, description: "Urgency (HIGH | MEDIUM | LOW)", example: "MEDIUM" },
      { field: "period", type: "string", required: true, description: "Pay period affected", example: "2026-09" },
      { field: "description", type: "string", required: true, description: "Factual explanation of why payroll was blocked", example: "Overseas client travel meal expense exceeds policy limit by £84" },
      { field: "status", type: "enum", required: true, description: "Investigation status (OPEN | RESOLVED)", example: "OPEN" },
    ],
    input: {
      employee_id: "emp-002",
      type: "EXPENSE_REIMBURSEMENT_CAP_BREACH",
      severity: "MEDIUM",
      period: "2026-09",
      description: "Overseas client travel meal expense exceeds policy limit by GBP 84",
      status: "OPEN"
    }
  },

  // ── 8. COMPLIANCE & RISK (3 Services) ───────────────────────────────────────
  {
    id: 31,
    domain: "Compliance & Risk",
    name: "Filing Requirements Tracker",
    port: 8136,
    method: "POST",
    path: "/api/v1/filing-tracker/requirements",
    description: "Register a statutory filing requirement and regulatory deadline",
    presentationText: "Registers mandatory statutory filings (e.g. Gender Pay Gap Reporting, Modern Slavery Statement, Annual Accounts) tracking statutory deadlines and authority bodies.",
    fieldDocs: [
      { field: "obligation", type: "string", required: true, description: "Statutory filing requirement title", example: "UK Gender Pay Gap Reporting 2026" },
      { field: "jurisdiction", type: "string", required: true, description: "Enforcing sovereign jurisdiction", example: "GB" },
      { field: "authority", type: "string", required: true, description: "Government regulatory authority", example: "Government Equalities Office" },
      { field: "due_date", type: "string (YYYY-MM-DD)", required: true, description: "Statutory filing cutoff date", example: "2027-04-04" },
      { field: "status", type: "enum", required: true, description: "Tracking status (PENDING | FILED)", example: "PENDING" },
    ],
    input: {
      obligation: "UK Gender Pay Gap Reporting 2026",
      jurisdiction: "GB",
      authority: "Government Equalities Office",
      due_date: "2027-04-04",
      status: "PENDING"
    }
  },
  {
    id: 32,
    domain: "Compliance & Risk",
    name: "Compliance Evaluation Engine",
    port: 8137,
    method: "GET",
    path: "/api/v1/compliance-status",
    description: "Get real-time compliance evaluation scores across all business domains",
    presentationText: "Evaluates automated compliance scores across Tax, Finance, HR, Legal, and IT, surfacing domain compliance percentages and high-risk gaps.",
    fieldDocs: [
      { field: "domain", type: "string (query)", required: false, description: "Filter by target operational domain", example: "TAX" },
    ],
    input: null,
    queryParams: { domain: "TAX" }
  },
  {
    id: 33,
    domain: "Compliance & Risk",
    name: "Exception Escalation Engine",
    port: 8138,
    method: "POST",
    path: "/api/v1/exception-escalation/exceptions",
    description: "Escalate a compliance violation or sanctions match to an owner",
    presentationText: "Escalates compliance violations, sanctioned entity screening hits, or statutory SLA breaches to designated compliance officers with binding resolution deadlines.",
    fieldDocs: [
      { field: "domain", type: "enum", required: true, description: "Breach domain (COMMERCIAL_OPS | TAX | HR)", example: "COMMERCIAL_OPS" },
      { field: "type", type: "string", required: true, description: "Violation classification type", example: "SANCTIONED_ENTITY_SCREENING_FLAG" },
      { field: "severity", type: "enum", required: true, description: "Urgency level (CRITICAL | HIGH | MEDIUM)", example: "HIGH" },
      { field: "assigned_to", type: "string", required: true, description: "Designated executive compliance owner", example: "James Okonkwo" },
      { field: "sla_breach_at", type: "string (ISO-8601)", required: true, description: "Mandatory SLA resolution cutoff", example: "2026-09-05T17:00:00Z" },
      { field: "status", type: "enum", required: true, description: "Escalation state (ESCALATED | RESOLVED)", example: "ESCALATED" },
    ],
    input: {
      domain: "COMMERCIAL_OPS",
      type: "SANCTIONED_ENTITY_SCREENING_FLAG",
      severity: "HIGH",
      assigned_to: "James Okonkwo",
      sla_breach_at: "2026-09-05T17:00:00Z",
      status: "ESCALATED"
    }
  },

  // ── 9. AUDIT EVENT STORE (4 Services) ───────────────────────────────────────
  {
    id: 34,
    domain: "Audit Event Store",
    name: "Audit Event Ingestion",
    port: 8084,
    method: "POST",
    path: "/api/v1/audit/events",
    description: "Ingest an immutable, cryptographically signed audit trail event",
    presentationText: "Ingests an append-only audit event into the tamper-evident cryptographic chain, calculating a SHA-256 block hash for non-repudiation and compliance reporting.",
    fieldDocs: [
      { field: "actor", type: "string (email)", required: true, description: "User or automated service executing the event", example: "vasu@zoikogroup.com" },
      { field: "action", type: "string", required: true, description: "Machine-readable action identifier", example: "MANUAL_E2E_SERVICE_TEST_EXECUTION" },
      { field: "resource", type: "string", required: true, description: "Target resource URI or component", example: "microservices/all-37" },
      { field: "outcome", type: "enum", required: true, description: "Action outcome (SUCCESS | DENIED | ESCALATED)", example: "SUCCESS" },
      { field: "details", type: "string", required: false, description: "Human-readable context narrative", example: "Dispatched manual input test payloads across all 37 microservices" },
    ],
    input: {
      actor: "vasu@zoikogroup.com",
      action: "MANUAL_E2E_SERVICE_TEST_EXECUTION",
      resource: "microservices/all-37",
      outcome: "SUCCESS",
      details: "Dispatched manual input test payloads across all 37 microservices"
    }
  },
  {
    id: 35,
    domain: "Audit Event Store",
    name: "Audit Log Query Engine",
    port: 8084,
    method: "GET",
    path: "/api/v1/audit/logs",
    description: "Query the verified immutable audit log ledger and block chain",
    presentationText: "Queries the immutable append-only audit log, verifying SHA-256 block sequences, cryptographic parent hash links, and actor authorization timestamps.",
    fieldDocs: [
      { field: "limit", type: "number (query)", required: false, description: "Maximum audit log entries to return", example: 50 },
    ],
    input: null,
    queryParams: { limit: "50" }
  },
  {
    id: 36,
    domain: "Audit Event Store",
    name: "Tamper Detection Engine",
    port: 8085,
    method: "GET",
    path: "/api/v1/tamper/alerts",
    description: "Retrieve tamper alerts, hash-chain anomalies, and sequence gaps",
    presentationText: "Scans the cryptographic audit chain for hash mismatches, sequence skips, unauthorized write attempts, or block tampering.",
    fieldDocs: [
      { field: "severity", type: "string (query)", required: false, description: "Alert severity filter (CRITICAL | HIGH)", example: "HIGH" },
    ],
    input: null,
    queryParams: { severity: "HIGH" }
  },
  {
    id: 37,
    domain: "Audit Event Store",
    name: "Evidence Verification Engine",
    port: 8095,
    method: "GET",
    path: "/api/v1/evidence/requirements",
    description: "Verify digital signature evidence and audit manifests",
    presentationText: "Inspects evidentiary documents, cryptographic proof manifests, and auditor digital signatures validating fulfillment of statutory governance obligations.",
    fieldDocs: [
      { field: "status", type: "string (query)", required: false, description: "Evidence requirement status (MET | PENDING)", example: "MET" },
    ],
    input: null,
    queryParams: { status: "MET" }
  },

  // ── 10. JURISDICTIONS & RULES (3 Services) ──────────────────────────────────
  {
    id: 38,
    domain: "Jurisdictions & Rules",
    name: "Jurisdiction Registration Service",
    port: 8082,
    method: "POST",
    path: "/api/v1/admin/jurisdictions",
    description: "Register a sovereign or sub-sovereign legal tax jurisdiction",
    presentationText: "Registers an official sovereign legal jurisdiction (e.g. GB, DE, SG, US) in the master governance engine. Sets authoritative tax bodies, legal jurisdiction code, classification type, and effective dates.",
    fieldDocs: [
      { field: "jurisdiction_code", type: "string (ISO-3166)", required: true, description: "Two-letter ISO country code or regional identifier", example: "GB" },
      { field: "jurisdiction_name", type: "string", required: true, description: "Official sovereign territory or state name", example: "United Kingdom" },
      { field: "jurisdiction_type", type: "enum", required: true, description: "Jurisdiction tier (SOVEREIGN | SUB_SOVEREIGN | ECONOMIC_ZONE)", example: "SOVEREIGN" },
      { field: "authority_type", type: "string", required: true, description: "Primary statutory revenue/governance authority", example: "HMRC" },
      { field: "effective_from", type: "string (ISO-8601)", required: true, description: "Date when jurisdiction governance takes effect", example: "2026-01-01T00:00:00Z" },
    ],
    input: {
      jurisdiction_code: "GB",
      jurisdiction_name: "United Kingdom",
      jurisdiction_type: "SOVEREIGN",
      authority_type: "HMRC",
      effective_from: "2026-01-01T00:00:00Z"
    }
  },
  {
    id: 39,
    domain: "Jurisdictions & Rules",
    name: "Statutory Rule Creation Engine",
    port: 8082,
    method: "POST",
    path: "/api/v1/admin/jurisdictions/rules",
    description: "Create an authoritative statutory rule against a jurisdiction",
    presentationText: "Binds an in-force legal rule or statutory rate parameter to a sovereign jurisdiction. Configures rule domains (TAX, PAYROLL, EMPLOYMENT, FILING), rule code, and effective dates.",
    fieldDocs: [
      { field: "jurisdiction_id", type: "string", required: true, description: "Target jurisdiction ISO code or UUID", example: "GB" },
      { field: "rule_domain", type: "enum", required: true, description: "Regulatory domain (TAX | PAYROLL | EMPLOYMENT | FILING)", example: "TAX" },
      { field: "rule_code", type: "string", required: true, description: "Unique regulatory rule identifier", example: "GB-VAT-STD-2026" },
      { field: "rule_name", type: "string", required: true, description: "Official statutory rule name", example: "UK Standard Value Added Tax 20%" },
      { field: "effective_from", type: "string (ISO-8601)", required: true, description: "UTC timestamp rule becomes active", example: "2026-01-01T00:00:00Z" },
      { field: "rule_status", type: "enum", required: true, description: "Rule state (ACTIVE | DRAFT)", example: "ACTIVE" },
    ],
    input: {
      jurisdiction_id: "GB",
      rule_domain: "TAX",
      rule_code: "GB-VAT-STD-2026",
      rule_name: "UK Standard Value Added Tax 20%",
      effective_from: "2026-01-01T00:00:00Z",
      rule_status: "ACTIVE"
    }
  },
  {
    id: 40,
    domain: "Jurisdictions & Rules",
    name: "Jurisdiction & Rule Pack Query",
    port: 8082,
    method: "GET",
    path: "/api/v1/jurisdictions",
    description: "Query sovereign jurisdictions and resolve active statutory rule packs",
    presentationText: "Queries all active and historical jurisdictions, evaluating applicable rule sets, regulatory drift detections, and authority links across the platform.",
    fieldDocs: [
      { field: "active_only", type: "string (query)", required: false, description: "Filter by active status (true | false)", example: "true" },
      { field: "domain", type: "string (query)", required: false, description: "Filter rules by domain (TAX | PAYROLL | FILING)", example: "TAX" },
    ],
    input: null,
    queryParams: { active_only: "true", domain: "TAX" }
  },

  // ── 11. DOCUMENT VAULT (2 Services) ─────────────────────────────────────────
  {
    id: 41,
    domain: "Document Vault",
    name: "Document Vault Filing Engine",
    port: 8094,
    method: "POST",
    path: "/api/v1/documents",
    description: "File an immutable governed document with inline base64 content and SHA-256 verification",
    presentationText: "Stores evidentiary documents in the immutable append-only Document Vault. Calculates SHA-256 checksum on write, sets classification, and enforces data retention policies.",
    fieldDocs: [
      { field: "legal_entity_id", type: "string (UUID)", required: true, description: "Owning corporate legal entity ID", example: "22222222-2222-2222-2222-222222222222" },
      { field: "title", type: "string", required: true, description: "Document title and descriptive metadata", example: "Q3 2026 Statutory VAT Return Verification Evidence" },
      { field: "classification", type: "enum", required: true, description: "Security classification (PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED)", example: "CONFIDENTIAL" },
      { field: "content_type", type: "string (MIME)", required: true, description: "MIME content type format", example: "application/pdf" },
      { field: "retention_policy", type: "string", required: true, description: "Enforced compliance retention duration", example: "7_YEAR_STATUTORY" },
      { field: "residency_region_code", type: "string", required: false, description: "Data sovereignty residency region", example: "eu-west-2" },
      { field: "content_base64", type: "string (Base64)", required: true, description: "Inline Base64 encoded payload of the file", example: "SGVsbG8gWm9pa28gRG9jdW1lbnQgVmF1bHQgQXVkaXQgRXZpZGVuY2U=" },
    ],
    input: {
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      title: "Q3 2026 Statutory VAT Return Verification Evidence",
      classification: "CONFIDENTIAL",
      content_type: "application/pdf",
      retention_policy: "7_YEAR_STATUTORY",
      residency_region_code: "eu-west-2",
      content_base64: "SGVsbG8gWm9pa28gRG9jdW1lbnQgVmF1bHQgQXVkaXQgRXZpZGVuY2U="
    }
  },
  {
    id: 42,
    domain: "Document Vault",
    name: "Document Register & Access Log Query",
    port: 8094,
    method: "GET",
    path: "/api/v1/documents",
    description: "Query filed documents and verified SHA-256 access audit trails",
    presentationText: "Queries registered corporate documents and their immutable cryptographic access audit trail, ensuring full traceability of every read, download, or version bump.",
    fieldDocs: [
      { field: "legal_entity_id", type: "string (query)", required: true, description: "Legal entity filter for document scope", example: "22222222-2222-2222-2222-222222222222" },
      { field: "limit", type: "number (query)", required: false, description: "Maximum document records to retrieve", example: 50 },
    ],
    input: null,
    queryParams: { legal_entity_id: "22222222-2222-2222-2222-222222222222", limit: "50" }
  },
];

const DOMAIN_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Tax Governance":       { color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-200 dark:border-violet-500/30", dot: "bg-violet-500" },
  "AI Governance":        { color: "text-fuchsia-700 dark:text-fuchsia-300", bg: "bg-fuchsia-50 dark:bg-fuchsia-900/20", border: "border-fuchsia-200 dark:border-fuchsia-500/30", dot: "bg-fuchsia-500" },
  "Legal & Contracts":    { color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-500/30", dot: "bg-blue-500" },
  "Jurisdictions & Rules": { color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-900/20", border: "border-indigo-200 dark:border-indigo-500/30", dot: "bg-indigo-500" },
  "Document Vault":       { color: "text-teal-700 dark:text-teal-300", bg: "bg-teal-50 dark:bg-teal-900/20", border: "border-teal-200 dark:border-teal-500/30", dot: "bg-teal-500" },
  "Finance":              { color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-500/30", dot: "bg-emerald-500" },
  "Commercial Ops":       { color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-500/30", dot: "bg-amber-500" },
  "HR & Workforce":       { color: "text-cyan-700 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-900/20", border: "border-cyan-200 dark:border-cyan-500/30", dot: "bg-cyan-500" },
  "Payroll":              { color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-900/20", border: "border-rose-200 dark:border-rose-500/30", dot: "bg-rose-500" },
  "Compliance & Risk":    { color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-500/30", dot: "bg-orange-500" },
  "Audit Event Store":    { color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-800/50", border: "border-slate-200 dark:border-slate-600/30", dot: "bg-slate-500" },
};

const METHOD_BADGE: Record<string, string> = {
  GET:    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  POST:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  PATCH:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const DOMAINS_GROUPED = SERVICES.reduce((acc, s) => {
  if (!acc[s.domain]) acc[s.domain] = [];
  acc[s.domain].push(s);
  return acc;
}, {} as Record<string, typeof SERVICES>);

export type Result = { ok: boolean; status: number; ms: number; data: unknown; error?: string };

function getTargetLink(svc: ServiceDefinition, data: unknown): { href: string; label: string } {
  const baseHref = DOMAIN_HREFS[svc.domain] ?? "/admin";
  if (!data || typeof data !== "object") {
    return { href: baseHref, label: `Open in ${svc.domain} Console` };
  }
  const obj = data as Record<string, unknown>;
  const record = (obj.contract ?? obj.data ?? obj.record ?? obj) as Record<string, unknown>;
  const contractId = (record.contract_id ?? record.id) as string | undefined;
  if (svc.id === 9 && contractId && typeof contractId === "string") {
    return { href: `/admin/legal/${encodeURIComponent(contractId)}`, label: `View Contract ${contractId} in Legal` };
  }
  if (svc.id === 11) {
    return { href: `/admin/obligations`, label: `View in Obligations Register` };
  }
  if (svc.id === 18) {
    const poNum = (record.po_number ?? record.poNumber) as string | undefined;
    return {
      href: poNum ? `/admin/commercial-ops?po=${encodeURIComponent(poNum)}` : `/admin/commercial-ops`,
      label: `View Purchase Order in Commercial Ops`,
    };
  }
  if (svc.id === 34 || svc.id === 35 || svc.id === 36) {
    return { href: `/admin/audit-events`, label: `View in Audit Event Store` };
  }
  if (svc.id === 37) {
    return { href: `/admin/evidence`, label: `View in Evidence Registry` };
  }
  if (svc.domain === "Jurisdictions & Rules" || svc.id === 38 || svc.id === 39 || svc.id === 40) {
    return { href: `/admin/jurisdictions`, label: `Open Jurisdictions & Rules Console` };
  }
  if (svc.domain === "Document Vault" || svc.id === 41 || svc.id === 42) {
    return { href: `/admin/documents`, label: `Open Document Vault Store of Record` };
  }
  if (svc.domain === "Tax Governance") return { href: `/admin/tax`, label: `Open Tax Governance Console` };
  if (svc.domain === "Payroll") return { href: `/admin/payroll`, label: `Open Payroll Console` };
  if (svc.domain === "HR & Workforce") return { href: `/admin/hr`, label: `Open HR & Workforce Directory` };
  if (svc.domain === "Finance") return { href: `/admin/finance`, label: `Open Finance & General Ledger` };
  return { href: baseHref, label: `Open in ${svc.domain} Console` };
}

// ─── Scenario Presets ─────────────────────────────────────────────────────────
export type PresetScenario = {
  label: string;
  badge?: string;
  description?: string;
  payload: Record<string, unknown>;
};

export const SERVICE_PRESETS: Record<number, PresetScenario[]> = {
  1: [
    {
      label: "🇬🇧 UK Domestic Energy (5%)",
      badge: "UK Reduced",
      description: "HMRC 5% statutory reduced rate for domestic residential energy in the UK",
      payload: {
        jurisdiction_id: "GB",
        rule_code: "UK-VAT-REDUCED-5",
        name: "UK Domestic Energy Reduced Rate 5%",
        category: "VAT",
        tax_rate_percentage: 5.0,
        standard_deductions: 0,
        exemptions_json: '{"domestic_energy":true}',
        status: "ACTIVE",
        version: 1,
        effective_from: "2026-09-01T00:00:00Z"
      }
    },
    {
      label: "🇩🇪 Germany Standard (19%)",
      badge: "DE Standard",
      description: "Federal Republic of Germany 19% standard VAT rate (Umsatzsteuer)",
      payload: {
        jurisdiction_id: "DE",
        rule_code: "DE-VAT-STD-19",
        name: "Germany Standard VAT Rate 19%",
        category: "VAT",
        tax_rate_percentage: 19.0,
        standard_deductions: 0,
        exemptions_json: '{"medical_exempt":false}',
        status: "ACTIVE",
        version: 1,
        effective_from: "2026-01-01T00:00:00Z"
      }
    },
    {
      label: "🇸🇬 Singapore GST (9%)",
      badge: "SG GST",
      description: "Inland Revenue Authority of Singapore 9% Goods and Services Tax",
      payload: {
        jurisdiction_id: "SG",
        rule_code: "SG-GST-STD-9",
        name: "Singapore Standard GST Rate 9%",
        category: "GST",
        tax_rate_percentage: 9.0,
        standard_deductions: 0,
        exemptions_json: '{"financial_services":true}',
        status: "ACTIVE",
        version: 1,
        effective_from: "2026-01-01T00:00:00Z"
      }
    }
  ],
  2: [
    {
      label: "🇬🇧 AP Invoice (£150,000)",
      badge: "UK AP",
      description: "Calculates £30,000 standard 20% VAT on corporate supplier invoice",
      payload: {
        transaction_id: "tx-inv-2026-8841",
        source_module: "ACCOUNTS_PAYABLE",
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        jurisdiction_id: "GB",
        tax_category: "VAT",
        gross_amount: 150000.0,
        taxable_amount: 150000.0,
        currency: "GBP",
        status: "CALCULATED"
      }
    },
    {
      label: "🇩🇪 Cross-Border Royalty (€85,000)",
      badge: "DE Royalty",
      description: "Evaluates cross-border IP licensing payment to German counterparty",
      payload: {
        transaction_id: "tx-lic-de-2026-01",
        source_module: "ACCOUNTS_PAYABLE",
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        jurisdiction_id: "DE",
        tax_category: "VAT",
        gross_amount: 85000.0,
        taxable_amount: 85000.0,
        currency: "EUR",
        status: "CALCULATED"
      }
    },
    {
      label: "🇺🇸 High-Volume Sales Order ($500,000)",
      badge: "US Sales Tax",
      description: "Direct sales order nexus determination for corporate enterprise client",
      payload: {
        transaction_id: "tx-so-us-9912",
        source_module: "SALES",
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        jurisdiction_id: "US",
        tax_category: "SALES_TAX",
        gross_amount: 500000.0,
        taxable_amount: 500000.0,
        currency: "USD",
        status: "CALCULATED"
      }
    }
  ],
  3: [
    {
      label: "🇬🇧 UK HMRC VAT 100 (£60k Net Payable)",
      badge: "UK Q2 2026",
      description: "Sales: £500,000, Purchases: £200,000, Output Tax: £100,000, Input Tax: £40,000 -> Net Payable: £60,000 GBP",
      payload: {
        jurisdiction_id: "GB",
        tax_registration_number: "GB998877665",
        tax_period: "2026-Q2",
        total_sales_amount: 500000.0,
        total_purchase_amount: 200000.0,
        output_tax_amount: 100000.0,
        input_tax_amount: 40000.0,
        net_tax_payable: 60000.0,
        currency: "GBP",
        status: "DRAFT"
      }
    },
    {
      label: "🇩🇪 Germany Elster Q3 (€38k Net Payable)",
      badge: "DE Q3 2026",
      description: "Sales: €850,000, Purchases: €650,000, Output: €161,500, Input: €123,500 -> Net Payable: €38,000 EUR",
      payload: {
        jurisdiction_id: "DE",
        tax_registration_number: "DE-123456789",
        tax_period: "2026-Q3",
        total_sales_amount: 850000.0,
        total_purchase_amount: 650000.0,
        output_tax_amount: 161500.0,
        input_tax_amount: 123500.0,
        net_tax_payable: 38000.0,
        currency: "EUR",
        status: "DRAFT"
      }
    },
    {
      label: "🇦🇪 UAE FTA 201 (-$9,000 Refund Reclaim)",
      badge: "UAE Q1 Refund",
      description: "Output Tax ($21.5k) < Input Tax ($30.5k) -> Eligible for $9,000 corporate refund from tax authority",
      payload: {
        jurisdiction_id: "AE",
        tax_registration_number: "AE-100200300",
        tax_period: "2026-Q1",
        total_sales_amount: 430000.0,
        total_purchase_amount: 610000.0,
        output_tax_amount: 21500.0,
        input_tax_amount: 30500.0,
        net_tax_payable: -9000.0,
        currency: "USD",
        status: "DRAFT"
      }
    }
  ],
  4: [
    {
      label: "🇬🇧 UK CT600 Annual (25% Main Rate)",
      badge: "UK CT600",
      description: "Revenue: £3.5M, Allowable Deductions: £2.1M, Taxable Profit: £1.4M, Net tax: £325,000",
      payload: {
        jurisdiction_id: "GB",
        tax_registration_number: "GB-CT-443322",
        fiscal_year: 2026,
        accounting_period_start: "2026-01-01",
        accounting_period_end: "2026-12-31",
        gross_revenue: 3500000.0,
        allowable_deductions: 2100000.0,
        taxable_income: 1400000.0,
        tax_rate_percent: 25.0,
        gross_tax_liability: 350000.0,
        tax_credits: 25000.0,
        net_tax_payable: 325000.0,
        currency: "GBP",
        status: "DRAFT"
      }
    },
    {
      label: "🇺🇸 US Form 1120 (21% Federal Corp Tax)",
      badge: "US Form 1120",
      description: "Gross Revenue: $5.2M, Deductions: $3.1M, Taxable: $2.1M, Net payable: $441,000",
      payload: {
        jurisdiction_id: "US",
        tax_registration_number: "US-EIN-987654321",
        fiscal_year: 2026,
        accounting_period_start: "2026-01-01",
        accounting_period_end: "2026-12-31",
        gross_revenue: 5200000.0,
        allowable_deductions: 3100000.0,
        taxable_income: 2100000.0,
        tax_rate_percent: 21.0,
        gross_tax_liability: 441000.0,
        tax_credits: 0.0,
        net_tax_payable: 441000.0,
        currency: "USD",
        status: "DRAFT"
      }
    }
  ],
  9: [
    {
      label: "GlobalCloud Enterprise MSA (£320,000)",
      badge: "MSA",
      description: "Binding Master Services Agreement for multi-region cloud infrastructure",
      payload: {
        title: "Enterprise Master Services Agreement — GlobalCloud Inc",
        contract_type: "MSA",
        counterparty_id: "cp-globalcloud-01",
        counterparty_name: "GlobalCloud Inc",
        currency: "GBP",
        total_value: 320000.0,
        effective_from: "2026-10-01T00:00:00Z",
        status: "DRAFT"
      }
    },
    {
      label: "Apex Networks 99.99% SLA (€180,000)",
      badge: "SLA",
      description: "Service Level Agreement covering 24/7 dedicated network transit",
      payload: {
        title: "Mission-Critical Tier-4 SLA — Apex Networks GmbH",
        contract_type: "SLA",
        counterparty_id: "cp-apex-01",
        counterparty_name: "Apex Networks GmbH",
        currency: "EUR",
        total_value: 180000.0,
        effective_from: "2026-11-01T00:00:00Z",
        status: "ACTIVE"
      }
    }
  ],
  38: [
    {
      label: "🇬🇧 United Kingdom (HMRC Sovereign)",
      badge: "GB Sovereign",
      description: "Registers United Kingdom sovereign jurisdiction with HMRC authority",
      payload: {
        jurisdiction_code: "GB",
        jurisdiction_name: "United Kingdom",
        jurisdiction_type: "SOVEREIGN",
        authority_type: "HMRC",
        effective_from: "2026-01-01T00:00:00Z"
      }
    },
    {
      label: "🇩🇪 Federal Republic of Germany",
      badge: "DE Sovereign",
      description: "Registers Federal Republic of Germany with BZSt revenue authority",
      payload: {
        jurisdiction_code: "DE",
        jurisdiction_name: "Federal Republic of Germany",
        jurisdiction_type: "SOVEREIGN",
        authority_type: "BZSt",
        effective_from: "2026-01-01T00:00:00Z"
      }
    },
    {
      label: "🇸🇬 Republic of Singapore",
      badge: "SG Sovereign",
      description: "Registers Republic of Singapore with IRAS revenue authority",
      payload: {
        jurisdiction_code: "SG",
        jurisdiction_name: "Republic of Singapore",
        jurisdiction_type: "SOVEREIGN",
        authority_type: "IRAS",
        effective_from: "2026-01-01T00:00:00Z"
      }
    }
  ],
  41: [
    {
      label: "Confidential VAT Audit Proof (PDF)",
      badge: "VAT Proof",
      description: "Files statutory VAT calculation proof with 7-year statutory retention",
      payload: {
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        title: "Q3 2026 Statutory VAT Return Verification Evidence",
        classification: "CONFIDENTIAL",
        content_type: "application/pdf",
        retention_policy: "7_YEAR_STATUTORY",
        residency_region_code: "eu-west-2",
        content_base64: "SGVsbG8gWm9pa28gRG9jdW1lbnQgVmF1bHQgQXVkaXQgRXZpZGVuY2U="
      }
    },
    {
      label: "Restricted Board Resolution Package",
      badge: "Board Minutes",
      description: "Files immutable board director strategic authorization minutes",
      payload: {
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        title: "Board Resolution — Q3 Strategic Capital Authorization",
        classification: "RESTRICTED",
        content_type: "application/pdf",
        retention_policy: "PERMANENT",
        residency_region_code: "eu-west-2",
        content_base64: "Qm9hcmQgUmVzb2x1dGlvbiBBdXRob3JpemF0aW9uIDIwMjY="
      }
    }
  ]
};

// ─── Field-level input helpers ────────────────────────────────────────────────
function getSuggestions(key: string): string[] {
  const k = key.toLowerCase();
  if (k === "status" || k === "rule_status") return ["DRAFT", "ACTIVE", "SUBMITTED", "POSTED", "CALCULATED", "COMMITTED", "OPEN", "RESOLVED", "PENDING", "ACCEPTED"];
  if (k === "currency") return ["GBP", "EUR", "USD", "SGD", "AED", "CHF", "JPY"];
  if (k === "category" || k === "tax_category") return ["VAT", "GST", "SALES_TAX", "CORPORATE_INCOME"];
  if (k === "contract_type") return ["MSA", "SLA", "NDA", "VENDOR", "EMPLOYMENT"];
  if (k === "risk_level" || k === "risk_tier" || k === "severity") return ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  if (k === "worker_type") return ["FULL_TIME", "CONTRACTOR", "PART_TIME"];
  if (k === "classification") return ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
  if (k === "source_module") return ["ACCOUNTS_PAYABLE", "SALES", "GENERAL_LEDGER", "TREASURY"];
  if (k === "jurisdiction_id" || k === "jurisdiction" || k === "jurisdiction_code") return ["GB", "DE", "US", "SG", "AE", "FR", "NL"];
  if (k === "rule_domain") return ["TAX", "PAYROLL", "EMPLOYMENT", "FILING", "RETENTION", "BENEFITS"];
  if (k === "jurisdiction_type") return ["SOVEREIGN", "SUB_SOVEREIGN", "ECONOMIC_ZONE"];
  if (k === "payment_type") return ["ROYALTIES", "DIVIDENDS", "SERVICES", "LICENSE_FEES"];
  if (k === "action_type") return ["EQUITY_INCENTIVE_GRANT", "DIVIDEND", "CAPITAL_INCREASE", "DIRECTOR_APPOINTMENT"];
  if (k === "protocol") return ["REST_OAUTH2", "AS4", "SFTP"];
  if (k === "auth_scheme") return ["BEARER_TOKEN", "MTLS", "API_KEY"];
  if (k === "kyc_status") return ["VERIFIED", "PENDING", "REJECTED"];
  if (k === "active_only") return ["true", "false"];
  return [];
}

function fieldType(key: string, value: unknown): "number" | "date" | "datetime-local" | "textarea" | "text" {
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    if (/(_at|_from|_to|_date|_start|_end|scheduledAt|effectiveFrom)$/i.test(key) && value.includes("T"))
      return "datetime-local";
    if (/(_date|fiscal_year_start|fiscal_year_end|due_date|hire_date|start_date|end_date|payment_date|period_start|period_end)$/i.test(key))
      return "date";
    if (value.length > 60 || key.toLowerCase().includes("description") || key.toLowerCase().includes("body") || key.toLowerCase().includes("json"))
      return "textarea";
  }
  return "text";
}

function toLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isEditable(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

// ─── FieldForm: Dedicated Interactive Input Boxes ────────────────────────────
function FieldForm({
  svc,
  fields,
  onChange,
  meta,
}: {
  svc: ServiceDefinition;
  fields: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
  meta: { border: string; color: string; bg: string; dot?: string };
}) {
  const presets = SERVICE_PRESETS[svc.id] || [];

  function update(key: string, raw: unknown) {
    const original = fields[key];
    let coerced: unknown = raw;
    if (typeof original === "number" && typeof raw === "string") {
      const n = Number(raw);
      coerced = isNaN(n) ? raw : n;
    }
    onChange({ ...fields, [key]: coerced });
  }

  // Calculate net tax if this is a tax filing
  const hasTaxCalc = "output_tax_amount" in fields && "input_tax_amount" in fields;
  const outputTax = Number(fields.output_tax_amount || 0);
  const inputTax = Number(fields.input_tax_amount || 0);
  const calculatedNet = outputTax - inputTax;
  const currencyCode = String(fields.currency || "GBP");

  function syncNetPayable() {
    onChange({ ...fields, net_tax_payable: calculatedNet });
  }

  function applyPreset(payload: Record<string, unknown>) {
    onChange(payload);
  }

  function resetToDefault() {
    onChange(svc.input ? { ...svc.input } : (svc.queryParams ? { ...svc.queryParams } : {}));
  }

  function clearFields() {
    const cleared: Record<string, unknown> = {};
    Object.keys(fields).forEach((k) => {
      cleared[k] = typeof fields[k] === "number" ? 0 : "";
    });
    onChange(cleared);
  }

  const fieldKeys = useMemo(() => {
    const fromFields = Object.keys(fields);
    const fromDocs = svc.fieldDocs.map((d) => d.field);
    const combined = Array.from(new Set([...fromFields, ...fromDocs]));
    return combined;
  }, [fields, svc.fieldDocs]);

  return (
    <div className="space-y-4">
      {/* Quick Scenario Presets Bar */}
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Quick Test Scenarios:
          </span>
          {presets.length > 0 ? (
            presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(p.payload)}
                title={p.description || p.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs hover:shadow-xs"
              >
                <span>{p.label}</span>
                {p.badge && (
                  <span className="px-1 py-0.2 rounded text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500">
                    {p.badge}
                  </span>
                )}
              </button>
            ))
          ) : (
            <span className="text-[11px] text-slate-400 italic">
              Configurable {svc.method} input parameter boxes
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetToDefault}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Reset input boxes to service default"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Default</span>
          </button>
          <button
            type="button"
            onClick={clearFields}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Clear all input fields"
          >
            <Square className="h-3 w-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Live Tax Calculation Helper (if applicable) */}
      {hasTaxCalc && (
        <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-slate-50 dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-slate-900/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
              <Calculator className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Real-Time Tax Liability Computation</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    calculatedNet >= 0
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  }`}
                >
                  {calculatedNet >= 0 ? "PAYABLE TO REVENUE" : "REFUND / RECLAIM DUE"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Output Tax ({outputTax.toLocaleString()} {currencyCode}) − Input Tax ({inputTax.toLocaleString()}{" "}
                {currencyCode}) ={" "}
                <strong
                  className={`font-mono text-xs ${
                    calculatedNet >= 0 ? "text-indigo-700 dark:text-indigo-300" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {calculatedNet >= 0 ? "" : "-"}
                  {Math.abs(calculatedNet).toLocaleString()} {currencyCode}
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={syncNetPayable}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all"
            title="Auto-fill the net_tax_payable box with this calculated value"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Apply to Net Payable Box</span>
          </button>
        </div>
      )}

      {/* Dedicated Interactive Input Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {fieldKeys.map((key) => {
          const value = fields[key];
          const doc = svc.fieldDocs.find((d) => d.field === key);
          const type = fieldType(key, value);
          const suggestions = getSuggestions(key);
          const listId = `suggestions-${svc.id}-${key}`;
          const isRequired = doc ? doc.required : true;

          const displayVal =
            type === "datetime-local" && typeof value === "string"
              ? value.slice(0, 16)
              : value !== undefined && value !== null
              ? String(value)
              : "";

          return (
            <div
              key={key}
              className={`rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 p-3 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ${
                type === "textarea" ? "md:col-span-2" : ""
              }`}
            >
              {/* Box Top Metadata Header */}
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {toLabel(key)}
                  </label>
                  <code className="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                    {key}
                  </code>
                </div>

                <div className="flex items-center gap-1">
                  {doc?.type && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                      {doc.type}
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                      isRequired
                        ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {isRequired ? "REQUIRED" : "OPTIONAL"}
                  </span>
                </div>
              </div>

              {/* The Input Box Control */}
              {typeof value === "boolean" ? (
                <div className="flex items-center gap-3 py-1">
                  <button
                    type="button"
                    onClick={() => update(key, !value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      value
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {value ? "TRUE / ENABLED" : "FALSE / DISABLED"}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    Click to toggle boolean state
                  </span>
                </div>
              ) : type === "textarea" ? (
                <textarea
                  value={displayVal}
                  onChange={(e) => update(key, e.target.value)}
                  rows={3}
                  placeholder={doc?.example ? String(doc.example) : `Enter ${toLabel(key)}…`}
                  spellCheck={false}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-mono p-2.5 focus:bg-white dark:focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                />
              ) : (
                <div className="relative">
                  <input
                    type={type}
                    list={suggestions.length > 0 ? listId : undefined}
                    value={displayVal}
                    onChange={(e) => update(key, e.target.value)}
                    step={type === "number" ? "any" : undefined}
                    placeholder={doc?.example ? `e.g. ${doc.example}` : `Enter ${toLabel(key)}…`}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs px-3 py-2 focus:bg-white dark:focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                  {suggestions.length > 0 && (
                    <datalist id={listId}>
                      {suggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  )}
                </div>
              )}

              {/* Box Bottom Helper / Tooltip */}
              {doc && (
                <div className="mt-1.5 flex items-start justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <p className="line-clamp-2 leading-relaxed">{doc.description}</p>
                  {doc.example !== undefined && (
                    <span className="shrink-0 font-mono text-slate-400">
                      Sample: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{String(doc.example)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── InputPresentationGuide ───────────────────────────────────────────────────
function InputPresentationGuide({
  svc,
  meta,
}: {
  svc: ServiceDefinition;
  meta: { border: string; color: string; bg: string };
}) {
  const [copiedDoc, setCopiedDoc] = useState(false);

  const formattedDocText = useMemo(() => {
    let out = `# ${svc.id}. ${svc.name} (${svc.method} ${svc.path})\n`;
    out += `Domain: ${svc.domain} | Port: :${svc.port}\n\n`;
    out += `## Overview\n${svc.presentationText}\n\n`;
    out += `## Input Specification & Fields\n`;
    svc.fieldDocs.forEach((f) => {
      out += `- **${f.field}** (${f.type}, ${f.required ? "Required" : "Optional"}): ${f.description} (e.g. \`${f.example}\`)\n`;
    });
    if (svc.input) {
      out += `\n## Exact Payload (JSON)\n\`\`\`json\n${JSON.stringify(svc.input, null, 2)}\n\`\`\`\n`;
    }
    return out;
  }, [svc]);

  function copyDocText() {
    navigator.clipboard.writeText(formattedDocText).catch(() => {});
    setCopiedDoc(true);
    setTimeout(() => setCopiedDoc(false), 2000);
  }

  return (
    <div className={`rounded-xl border ${meta.border} bg-white dark:bg-slate-800/80 p-4 space-y-4 shadow-sm`}>
      {/* Header with copy */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-500" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Input Specification & Business Presentation Text
          </h4>
        </div>
        <button
          onClick={copyDocText}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
          title="Copy full markdown text presentation of inputs"
        >
          {copiedDoc ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          <span>{copiedDoc ? "Copied Text!" : "Copy Input Text"}</span>
        </button>
      </div>

      {/* Presentation Summary */}
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
        <p className="font-medium">{svc.presentationText}</p>
      </div>

      {/* Field table */}
      <div>
        <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          Field-by-Field Input Breakdown ({svc.fieldDocs.length} fields)
        </h5>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 px-3 font-semibold">Field Name</th>
                <th className="py-2 px-3 font-semibold">Type</th>
                <th className="py-2 px-3 font-semibold">Required</th>
                <th className="py-2 px-3 font-semibold">Description & Validation Purpose</th>
                <th className="py-2 px-3 font-semibold">Example Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {svc.fieldDocs.map((f) => (
                <tr key={f.field} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 text-[11px]">
                    {f.field}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{f.type}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        f.required
                          ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                      }`}
                    >
                      {f.required ? "REQUIRED" : "OPTIONAL"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{f.description}</td>
                  <td className="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400 text-[11px]">
                    {String(f.example)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ServiceCard ──────────────────────────────────────────────────────────────
function ServiceCard({
  svc,
  payload,
  onPayloadChange,
  result,
  loading,
  expanded,
  onToggleExpand,
  onFire,
}: {
  svc: ServiceDefinition;
  payload: string;
  onPayloadChange: (val: string) => void;
  result: Result | null;
  loading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onFire: () => void;
}) {
  // DEFAULT TAB IS NOW "fields" (Dedicated Input Boxes)!
  const [tabMode, setTabMode] = useState<"fields" | "json" | "guide">("fields");
  const [copied, setCopied] = useState(false);
  const meta = DOMAIN_META[svc.domain] ?? DOMAIN_META["Audit Event Store"];
  const domainHref = DOMAIN_HREFS[svc.domain] ?? "/admin";
  const targetLink = result?.ok ? getTargetLink(svc, result.data) : null;

  let parsedFields: Record<string, unknown> = {};
  try {
    parsedFields = payload ? JSON.parse(payload) : {};
  } catch {
    parsedFields = svc.input ?? svc.queryParams ?? {};
  }

  // Ensure initial empty values default to input or queryParams
  if (Object.keys(parsedFields).length === 0) {
    parsedFields = svc.input ?? svc.queryParams ?? {};
  }

  function handleFieldChange(updated: Record<string, unknown>) {
    onPayloadChange(JSON.stringify(updated, null, 2));
  }

  function copyPayload() {
    navigator.clipboard.writeText(payload || JSON.stringify(parsedFields, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetPayload() {
    onPayloadChange(
      svc.input
        ? JSON.stringify(svc.input, null, 2)
        : svc.queryParams
        ? JSON.stringify(svc.queryParams, null, 2)
        : "{}"
    );
  }

  // Dynamic preview URL for GET
  const dynamicGetUrl = useMemo(() => {
    if (svc.method !== "GET") return svc.path;
    try {
      const q = new URLSearchParams(
        Object.entries(parsedFields)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString();
      return q ? `${svc.path}?${q}` : svc.path;
    } catch {
      return svc.path;
    }
  }, [svc.method, svc.path, parsedFields]);

  return (
    <div className={`rounded-xl border ${meta.border} bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md`}>
      {/* Card Header */}
      <div className="flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-500">
            {svc.id}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{svc.name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${METHOD_BADGE[svc.method]}`}>{svc.method}</span>
              <span className="font-mono text-[11px] text-slate-400 truncate max-w-[240px]">
                {svc.method === "GET" ? dynamicGetUrl : svc.path}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color} border ${meta.border}`}>
                :{svc.port}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{svc.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pr-2">
            {result && (
              result.ok ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>HTTP {result.status}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                  <XCircle className="h-3.5 w-3.5" />
                  <span>HTTP {result.status || "ERR"}</span>
                </span>
              )
            )}
            {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </div>
        </button>

        <div className="px-3 border-l border-slate-100 dark:border-slate-800 shrink-0">
          <Link
            href={domainHref}
            title={`Open ${svc.domain} domain page`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="hidden sm:inline">Open domain</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-4 space-y-4 bg-slate-50/40 dark:bg-slate-900/50">
          {/* Tabs bar */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTabMode("fields")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tabMode === "fields"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Interactive Input Boxes</span>
              </button>

              <button
                onClick={() => setTabMode("json")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tabMode === "json"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span>{svc.method === "GET" ? "Query Parameters / Headers" : "{ } JSON Payload"}</span>
              </button>

              <button
                onClick={() => setTabMode("guide")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tabMode === "guide"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Field Documentation Guide</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={copyPayload}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
                title="Copy current input values"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? "Copied" : "Copy Values"}</span>
              </button>
              <button
                onClick={resetPayload}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
                title="Reset input boxes to default"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Tab content */}
          {tabMode === "fields" && (
            <div className={`rounded-xl border ${meta.border} bg-white dark:bg-slate-900/90 p-4`}>
              <FieldForm
                svc={svc}
                fields={parsedFields}
                onChange={handleFieldChange}
                meta={meta}
              />
            </div>
          )}

          {tabMode === "guide" && (
            <InputPresentationGuide svc={svc} meta={meta} />
          )}

          {tabMode === "json" && (
            svc.method !== "GET" ? (
              <textarea
                value={payload}
                onChange={(e) => onPayloadChange(e.target.value)}
                rows={Math.max(6, Math.min(22, (payload.match(/\n/g) || []).length + 2))}
                spellCheck={false}
                className="w-full rounded-lg bg-gray-950 text-emerald-400 font-mono text-xs p-3.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed shadow-inner"
              />
            ) : (
              <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 p-3 text-xs text-sky-900 dark:text-sky-200 space-y-2">
                <p>This is an authenticated <strong>GET query endpoint</strong> with standard identity forwarding:</p>
                <div className="font-mono text-[11px] opacity-80 pt-1 space-y-0.5 bg-black/5 dark:bg-black/40 p-2 rounded">
                  <div>X-Tenant-Id: 11111111-1111-1111-1111-111111111111</div>
                  <div>X-Legal-Entity-Id: 22222222-2222-2222-2222-222222222222</div>
                  <div>X-Principal-Id: 33333333-3333-3333-3333-333333333333</div>
                </div>
                <div>
                  <span className="font-semibold text-[11px]">Constructed Request URL:</span>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 break-all">
                    GET {dynamicGetUrl}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-[11px]">Raw Query Parameters Object:</span>
                  <pre className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 bg-black/10 dark:bg-black/30 p-2 rounded">
                    {JSON.stringify(parsedFields, null, 2)}
                  </pre>
                </div>
              </div>
            )
          )}

          {/* Send Action */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={onFire}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Executing Request…</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Send Request to Microservice (:{svc.port})</span>
                </>
              )}
            </button>
            <Link
              href={domainHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Go to {svc.domain}</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {/* Result panel */}
          {result && (
            <div className={`rounded-xl border p-4 space-y-3 animate-in fade-in duration-200 ${result.ok ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-900/10"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="h-5 w-5 text-red-500" />}
                  <span className={`text-sm font-bold ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    HTTP {result.status} {result.ok ? "— Success (Committed)" : "— Failed"}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{result.ms}ms response</span>
                </div>

                {targetLink && (
                  <Link
                    href={targetLink.href}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors shadow-xs"
                  >
                    <span>{targetLink.label}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>

              {result.error && (
                <div className="p-3 rounded-lg bg-red-100/70 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200 font-mono">
                  {result.error}
                </div>
              )}

              <pre className="p-3 rounded-lg bg-gray-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-56 leading-relaxed shadow-inner">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ServiceInputsPage() {
  const [payloads, setPayloads] = useState<Record<number, string>>(() =>
    SERVICES.reduce((acc, s) => {
      acc[s.id] = s.input
        ? JSON.stringify(s.input, null, 2)
        : s.queryParams
        ? JSON.stringify(s.queryParams, null, 2)
        : "{}";
      return acc;
    }, {} as Record<number, string>)
  );
  const [results, setResults] = useState<Record<number, Result>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [activeDomain, setActiveDomain] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const isAnyExpanded = Object.values(expandedCards).some(Boolean);
  const toggleExpandAll = () => {
    if (isAnyExpanded) {
      setExpandedCards({});
    } else {
      const all: Record<number, boolean> = {};
      SERVICES.forEach((s) => {
        all[s.id] = true;
      });
      setExpandedCards(all);
    }
  };

  const fireService = useCallback(async (svc: ServiceDefinition) => {
    setLoadingMap((prev) => ({ ...prev, [svc.id]: true }));
    const t0 = Date.now();
    try {
      const payloadStr =
        payloads[svc.id] ??
        (svc.input
          ? JSON.stringify(svc.input)
          : svc.queryParams
          ? JSON.stringify(svc.queryParams)
          : "{}");

      let parsedBody = undefined;
      if (svc.method === "POST" || svc.method === "PATCH") {
        try {
          parsedBody = payloadStr ? JSON.parse(payloadStr) : undefined;
        } catch {
          parsedBody = svc.input;
        }
      }

      let fetchUrl = svc.path;
      if (svc.method === "GET") {
        try {
          const qObj = payloadStr ? JSON.parse(payloadStr) : svc.queryParams;
          if (qObj && typeof qObj === "object") {
            const cleanEntries = Object.entries(qObj).filter(([, v]) => v !== undefined && v !== "");
            if (cleanEntries.length > 0) {
              const q = new URLSearchParams(cleanEntries.map(([k, v]) => [k, String(v)])).toString();
              fetchUrl = `${svc.path}?${q}`;
            }
          }
        } catch {
          if (svc.queryParams) {
            const q = new URLSearchParams(svc.queryParams).toString();
            fetchUrl = `${svc.path}?${q}`;
          }
        }
      }

      const res = await fetch(fetchUrl, {
        method: svc.method,
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
          "X-Principal-Id": "33333333-3333-3333-3333-333333333333",
          "X-Legal-Entity-Id": "22222222-2222-2222-2222-222222222222",
        },
        body: parsedBody ? JSON.stringify(parsedBody) : undefined,
      });

      const ms = Date.now() - t0;
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      const result: Result = {
        ok: res.ok,
        status: res.status,
        ms,
        data,
        error: !res.ok ? (data as { error?: string })?.error ?? `HTTP ${res.status}` : undefined,
      };

      setResults((prev) => ({ ...prev, [svc.id]: result }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [svc.id]: {
          ok: false,
          status: 0,
          ms: Date.now() - t0,
          data: null,
          error: e instanceof Error ? e.message : "Network error",
        },
      }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [svc.id]: false }));
    }
  }, [payloads]);

  const fireAll = async () => {
    setRunningAll(true);
    for (const svc of SERVICES) {
      await fireService(svc);
    }
    setRunningAll(false);
  };

  const copyAllPresentations = () => {
    let doc = `# Zoiko Suite — All ${SERVICES.length} Microservices Input Guide & Presentation Text\n\n`;
    SERVICES.forEach((s) => {
      doc += `## [${s.id}] ${s.name} (${s.method} ${s.path})\n`;
      doc += `- **Domain**: ${s.domain} | **Port**: :${s.port}\n`;
      doc += `- **Overview**: ${s.presentationText}\n`;
      doc += `- **Field Documentation**:\n`;
      s.fieldDocs.forEach((f) => {
        doc += `  - \`${f.field}\` (${f.type}, ${f.required ? "Required" : "Optional"}): ${f.description} (Example: \`${f.example}\`)\n`;
      });
      if (s.input) {
        doc += `- **Sample Payload**:\n\`\`\`json\n${JSON.stringify(s.input, null, 2)}\n\`\`\`\n\n`;
      } else {
        doc += `- **Sample Query Params**: \`${JSON.stringify(s.queryParams ?? {})}\`\n\n`;
      }
    });
    navigator.clipboard.writeText(doc).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const totalExecuted = Object.keys(results).length;
  const totalPassed = Object.values(results).filter((r) => r.ok).length;
  const totalFailed = totalExecuted - totalPassed;

  const domains = useMemo(() => ["ALL", ...Object.keys(DOMAINS_GROUPED)], []);

  const filteredDomains = useMemo(() => {
    return Object.entries(DOMAINS_GROUPED).filter(([d]) =>
      activeDomain === "ALL" || d === activeDomain
    );
  }, [activeDomain]);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-24">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Database className="h-5 w-5 text-indigo-600" />
              <h1 className="text-xl font-bold tracking-tight">
                Service Inputs & Comprehensive Specification Cockpit
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                All {SERVICES.length} Microservices
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Interactive input boxes, field-by-field validation documentation, one-click realistic test scenarios, and live execution runner.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleExpandAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
              title="Expand or collapse input boxes for all microservices"
            >
              {isAnyExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span>{isAnyExpanded ? "Collapse All Boxes" : "Expand All Input Boxes"}</span>
            </button>

            <button
              onClick={copyAllPresentations}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
              title="Copy markdown reference text for all service inputs"
            >
              {copiedAll ? <Check className="h-4 w-4 text-emerald-500" /> : <BookOpen className="h-4 w-4 text-indigo-500" />}
              <span>{copiedAll ? "Copied All Text!" : "Copy All Input Docs"}</span>
            </button>

            <button
              onClick={fireAll}
              disabled={runningAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all disabled:opacity-60 shadow-sm"
            >
              {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>{runningAll ? `Executing All ${SERVICES.length} Services…` : `Execute All ${SERVICES.length}`}</span>
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800/80 text-xs flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-slate-500">
              Tested: <strong className="text-slate-700 dark:text-slate-200">{totalExecuted}/{SERVICES.length}</strong>
            </span>
            {totalExecuted > 0 && (
              <>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {totalPassed} Passed
                </span>
                {totalFailed > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                    <XCircle className="h-3.5 w-3.5" />
                    {totalFailed} Failed
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by name, path, or field name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64"
            />
          </div>
        </div>

        {/* Domain Filter Pills */}
        <div className="max-w-6xl mx-auto px-6 py-2 overflow-x-auto border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5 min-w-max">
            {domains.map((d) => {
              const meta = DOMAIN_META[d] ?? { color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-300" };
              const isAll = d === "ALL";
              const count = isAll ? SERVICES.length : DOMAINS_GROUPED[d]?.length ?? 0;
              return (
                <button
                  key={d}
                  onClick={() => setActiveDomain(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border flex items-center gap-1.5 ${
                    activeDomain === d
                      ? isAll
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent"
                        : `${meta.bg} ${meta.color} ${meta.border}`
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                  }`}
                >
                  <span>{d}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {filteredDomains.length === 0 && (
          <div className="text-center py-24 text-slate-400 dark:text-slate-600 text-sm">
            No microservices match &ldquo;{search}&rdquo;
          </div>
        )}

        {filteredDomains.map(([domain, svcs]) => {
          const meta = DOMAIN_META[domain] ?? DOMAIN_META["Audit Event Store"];
          const domainResults = Object.entries(results).filter(([id]) => svcs.some((s) => s.id === Number(id)));
          const domainPassed = domainResults.filter(([, r]) => r.ok).length;
          const domainHref = DOMAIN_HREFS[domain] ?? "/admin";
          const filteredSvcs = search
            ? svcs.filter(
                (s) =>
                  s.name.toLowerCase().includes(search.toLowerCase()) ||
                  s.path.toLowerCase().includes(search.toLowerCase()) ||
                  s.description.toLowerCase().includes(search.toLowerCase()) ||
                  s.domain.toLowerCase().includes(search.toLowerCase()) ||
                  s.fieldDocs.some((f) => f.field.toLowerCase().includes(search.toLowerCase()))
              )
            : svcs;

          return (
            <section key={domain} id={`domain-${domain.replace(/\s+/g, "-").toLowerCase()}`}>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${meta.bg} ${meta.color} ${meta.border}`}>
                  {domain}
                </span>
                <span className="text-xs text-slate-400">{svcs.length} service{svcs.length !== 1 ? "s" : ""}</span>
                {domainResults.length > 0 && (
                  <span className={`text-xs font-bold ${domainPassed === svcs.length ? "text-emerald-500" : "text-amber-500"}`}>
                    {domainPassed}/{svcs.length} ✔
                  </span>
                )}
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800 min-w-[20px]" />
                <Link
                  href={domainHref}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
                >
                  <span>Open {domain} Dashboard</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="space-y-3">
                {filteredSvcs.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    svc={svc}
                    payload={payloads[svc.id] ?? (svc.input ? JSON.stringify(svc.input, null, 2) : "")}
                    onPayloadChange={(val) => setPayloads((prev) => ({ ...prev, [svc.id]: val }))}
                    result={results[svc.id] ?? null}
                    loading={loadingMap[svc.id] ?? false}
                    expanded={expandedCards[svc.id] ?? false}
                    onToggleExpand={() =>
                      setExpandedCards((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))
                    }
                    onFire={() => fireService(svc)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
