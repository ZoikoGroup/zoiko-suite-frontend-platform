"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Send, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  Copy, RefreshCw, ExternalLink, ArrowRight, ArrowUpRight, Sparkles,
  Maximize2, Minimize2, Check, Sliders
} from "lucide-react";

const DOMAIN_HREFS: Record<string, string> = {
  "Tax Governance": "/admin/tax",
  "AI Governance": "/admin/governance",
  "Legal & Contracts": "/admin/legal",
  "Finance": "/admin/finance",
  "Commercial Ops": "/admin/commercial-ops",
  "HR & Workforce": "/admin/hr",
  "Payroll": "/admin/payroll",
  "Compliance & Risk": "/admin/compliance",
  "Audit Event Store": "/admin/audit-events",
};

export const SERVICES = [
  // TAX GOVERNANCE (7)
  { id: 1, domain: "Tax Governance", name: "Tax Rules Engine", port: 8125, method: "POST", path: "/api/v1/tax-rules", description: "Register a new tax rate rule for a jurisdiction", input: { jurisdiction_id: "GB", rule_code: "UK-VAT-REDUCED-5", name: "UK Domestic Energy Reduced Rate 5%", category: "VAT", tax_rate_percentage: 5.0, standard_deductions: 0, exemptions_json: '{"domestic_energy":true}', status: "ACTIVE", version: 1, effective_from: "2026-09-01T00:00:00Z" } },
  { id: 2, domain: "Tax Governance", name: "Tax Determination Engine", port: 8126, method: "POST", path: "/api/v1/tax-determinations", description: "Evaluate applicable tax on a transaction", input: { transaction_id: "tx-inv-2026-8841", source_module: "ACCOUNTS_PAYABLE", legal_entity_id: "22222222-2222-2222-2222-222222222222", jurisdiction_id: "GB", tax_category: "VAT", gross_amount: 150000, taxable_amount: 150000, currency: "GBP", status: "CALCULATED" } },
  { id: 3, domain: "Tax Governance", name: "VAT / GST Returns", port: 8127, method: "POST", path: "/api/v1/vat-returns", description: "Submit a VAT/GST return filing for a tax period", input: { jurisdiction_id: "GB", tax_registration_number: "GB998877665", tax_period: "2026-Q3", total_sales_amount: 520000, total_purchase_amount: 210000, output_tax_amount: 104000, input_tax_amount: 42000, net_tax_payable: 62000, currency: "GBP", status: "DRAFT" } },
  { id: 4, domain: "Tax Governance", name: "Corporate Tax Service", port: 8128, method: "POST", path: "/api/v1/corporate-tax-returns", description: "Submit a corporate income tax return", input: { jurisdiction_id: "GB", tax_registration_number: "GB-CT-443322", fiscal_year: 2026, accounting_period_start: "2026-01-01", accounting_period_end: "2026-12-31", gross_revenue: 3500000, allowable_deductions: 2100000, taxable_income: 1400000, tax_rate_percent: 25.0, gross_tax_liability: 350000, tax_credits: 25000, net_tax_payable: 325000, currency: "GBP", status: "DRAFT" } },
  { id: 5, domain: "Tax Governance", name: "Withholding Tax Service", port: 8129, method: "POST", path: "/api/v1/withholding-tax", description: "Create a withholding tax obligation on a cross-border payment", input: { jurisdiction_id: "DE", counterparty_id: "cp-acme-gmbh-01", payment_reference: "PAY-DE-2026-09", payment_type: "ROYALTIES", gross_payment_amount: 85000, taxable_base_amount: 85000, withholding_rate_percent: 15.0, withheld_amount: 12750, currency: "EUR", status: "CALCULATED" } },
  { id: 6, domain: "Tax Governance", name: "Filing Preparation Service", port: 8130, method: "POST", path: "/api/v1/filing-preparation/drafts", description: "Create a structured draft for an upcoming regulatory filing", input: { return_type: "VAT_RETURN", jurisdiction_id: "GB", tax_period: "2026-Q3", source_return_id: "vr-003", form_data_json: '{"box1":104000,"box4":42000,"box5":62000}', validation_status: "DRAFT" } },
  { id: 7, domain: "Tax Governance", name: "Tax Authority Interface", port: 8147, method: "POST", path: "/api/v1/tax-authority/interfaces", description: "Register an e-filing API connection to a tax authority", input: { jurisdiction_id: "GB", authority_name: "HMRC Making Tax Digital (MTD)", protocol: "REST_OAUTH2", endpoint_url: "https://api.service.hmrc.gov.uk/organisations/vat", auth_scheme: "BEARER_TOKEN", status: "ACTIVE" } },
  // AI GOVERNANCE (1)
  { id: 8, domain: "AI Governance", name: "AI Governance Engine", port: 8146, method: "GET", path: "/api/v1/ai-governance", description: "List all registered AI models, risk tiers and kill-switch states", input: null },
  // LEGAL & CONTRACTS (6)
  { id: 9, domain: "Legal & Contracts", name: "Contract Lifecycle Service", port: 8119, method: "POST", path: "/api/v1/contracts", description: "Draft a new contract in the lifecycle management system", input: { title: "Enterprise Master Services Agreement - GlobalCloud Inc", contract_type: "MSA", counterparty_id: "cp-globalcloud-01", counterparty_name: "GlobalCloud Inc", currency: "GBP", total_value: 320000, effective_from: "2026-10-01T00:00:00Z", status: "DRAFT" } },
  { id: 10, domain: "Legal & Contracts", name: "Clause & Template Library", port: 8120, method: "POST", path: "/api/v1/clauses", description: "Register a new standard legal clause template", input: { title: "UK GDPR Standard Model Clauses 2026", category: "DATA_PROTECTION", body: "The Data Processor shall process personal data solely in accordance with documented instructions of the Data Controller.", jurisdiction_id: "GB", is_standard: true, status: "APPROVED" } },
  { id: 11, domain: "Legal & Contracts", name: "Obligation Tracking Service", port: 8088, method: "POST", path: "/api/v1/obligations", description: "Track a contractual obligation with a due date and risk level", input: { contract_id: "c-001", title: "Annual ISO 27001 SOC-2 Type II Audit Certification", description: "Deliver renewed SOC-2 Type II certification report", due_date: "2026-12-15T00:00:00Z", risk_level: "HIGH", status: "PENDING" } },
  { id: 12, domain: "Legal & Contracts", name: "Board Resolutions Service", port: 8122, method: "POST", path: "/api/v1/meetings", description: "Schedule a board or audit committee meeting", input: { meeting_type: "BOARD_OF_DIRECTORS", title: "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting", scheduled_date: "2026-09-25T14:00:00Z", location: "London HQ / Virtual Boardroom", quorum_required: 3, status: "SCHEDULED" } },
  { id: 13, domain: "Legal & Contracts", name: "Corporate Actions Service", port: 8123, method: "POST", path: "/api/v1/corporate-actions", description: "Propose a corporate action such as share issuance or dividend", input: { action_type: "EQUITY_INCENTIVE_GRANT", description: "Approve 2026 Employee Stock Option Scheme Allotment", authorized_shares: 250000, share_class: "ORDINARY_B", status: "PROPOSED" } },
  { id: 14, domain: "Legal & Contracts", name: "Counterparty Management", port: 8124, method: "GET", path: "/api/v1/counterparties", description: "List all KYC-verified counterparties", input: null },
  // FINANCE (3)
  { id: 15, domain: "Finance", name: "General Ledger Engine", port: 8098, method: "POST", path: "/api/v1/journal-entries", description: "Post a double-entry journal to the general ledger", input: { reference_code: "JE-2026-09-001", description: "September Intercompany Management Service Fee Accrual", debit_account: "7001-MGMT-FEES", credit_account: "2050-INTERCO-PAYABLE", amount: 45000, currency: "GBP", status: "POSTED" } },
  { id: 16, domain: "Finance", name: "Treasury & Cash Engine", port: 8103, method: "GET", path: "/api/v1/cash-positions", description: "Retrieve all multi-currency cash positions", input: null },
  { id: 17, domain: "Finance", name: "Financial Reporting Engine", port: 8104, method: "GET", path: "/api/v1/finance/summary", description: "Fetch consolidated financial summary statistics", input: null },
  // COMMERCIAL OPS (3)
  { id: 18, domain: "Commercial Ops", name: "Purchase Order Management", port: 8100, method: "POST", path: "/api/v1/purchase-orders", description: "Raise an approved purchase order for a vendor", input: { po_number: "PO-2026-089", vendor_name: "CloudVault Ltd", description: "Annual Enterprise Multi-Region Cloud Storage Infrastructure", amount: 96000, currency: "GBP", status: "APPROVED" } },
  { id: 19, domain: "Commercial Ops", name: "Spend Controls Service", port: 8131, method: "POST", path: "/api/v1/spend-controls/limits", description: "Set a departmental spend limit for a fiscal period", input: { category: "Information Technology & Software Infrastructure", department: "Engineering", annual_limit_amount: 350000, currency: "GBP", approval_threshold: 25000, period: "2026-FY" } },
  { id: 20, domain: "Commercial Ops", name: "Vendor Due Diligence", port: 8135, method: "GET", path: "/api/v1/vendors", description: "List all vendors with due diligence status", input: null },
  // HR & WORKFORCE (5)
  { id: 21, domain: "HR & Workforce", name: "Employee Master Directory", port: 8108, method: "POST", path: "/api/v1/employees", description: "Onboard a new employee into the master record system", input: { first_name: "Alexander", last_name: "Wright", email: "alexander.wright@zoikogroup.com", job_title: "Principal Infrastructure Engineer", worker_type: "FULL_TIME", hire_date: "2026-09-01", department_id: "dept-001", status: "ACTIVE" } },
  { id: 22, domain: "HR & Workforce", name: "Leave & Attendance Engine", port: 8115, method: "POST", path: "/api/v1/leave/requests", description: "Submit an employee leave request for approval", input: { employee_id: "emp-001", leave_type_id: "ANNUAL_LEAVE", start_date: "2026-10-12", end_date: "2026-10-16", total_hours: 40, reason: "Autumn Family Holiday", status: "SUBMITTED" } },
  { id: 23, domain: "HR & Workforce", name: "Org Structure Governance", port: 8116, method: "POST", path: "/api/v1/org/departments", description: "Create a new department in the organisational hierarchy", input: { code: "CC-SEC", name: "Cybersecurity & Governance", head: "Alexander Wright", budget_gbp: 750000 } },
  { id: 24, domain: "HR & Workforce", name: "Workforce Compliance Alerts", port: 8118, method: "POST", path: "/api/v1/compliance/alerts", description: "Raise a workforce compliance alert for an employee", input: { employee_id: "emp-004", alert_type: "VISA_RENEWAL_REQUIRED", severity: "HIGH", description: "UK Skilled Worker Visa renewal window opens 60 days before expiry", status: "OPEN" } },
  { id: 25, domain: "HR & Workforce", name: "Talent & Review Cycles", port: 8139, method: "GET", path: "/api/v1/talent", description: "Fetch all active performance reviews and review cycles", input: null },
  // PAYROLL (5)
  { id: 26, domain: "Payroll", name: "Payroll Processing Engine", port: 8110, method: "POST", path: "/api/v1/payroll-runs", description: "Initiate a payroll calculation run for a pay period", input: { pay_period_code: "2026-10-M", period_start_date: "2026-10-01", period_end_date: "2026-10-31", payment_date: "2026-10-28", total_employee_count: 76, total_gross_pay: 428000, total_net_pay: 299000, total_tax_deductions: 129000, status: "CALCULATING" } },
  { id: 27, domain: "Payroll", name: "Compensation Structures", port: 8111, method: "POST", path: "/api/v1/compensation/structures", description: "Define a salary band or compensation grade", input: { title: "Staff Security Architect (L5)", wage_type: "SALARY", base_pay: 125000, currency: "GBP", pay_frequency: "MONTHLY" } },
  { id: 28, domain: "Payroll", name: "Benefits Engine", port: 8112, method: "POST", path: "/api/v1/benefits/plans", description: "Register a new employee benefit plan", input: { name: "Comprehensive Dental & Optical Plan", type: "DENTAL", provider: "Bupa DentalCare", employer_contribution_pct: 100, enrolled_count: 65 } },
  { id: 29, domain: "Payroll", name: "Payroll Tax Compliance", port: 8113, method: "GET", path: "/api/v1/payroll-tax/profiles", description: "Retrieve all employee PAYE and NI tax profiles", input: null },
  { id: 30, domain: "Payroll", name: "Payroll Exception Engine", port: 8114, method: "POST", path: "/api/v1/payroll-exceptions", description: "Raise a payroll exception for manual investigation", input: { employee_id: "emp-002", type: "EXPENSE_REIMBURSEMENT_CAP_BREACH", severity: "MEDIUM", period: "2026-09", description: "Overseas client travel meal expense exceeds policy limit by GBP 84", status: "OPEN" } },
  // COMPLIANCE & RISK (3)
  { id: 31, domain: "Compliance & Risk", name: "Filing Requirements Tracker", port: 8141, method: "POST", path: "/api/v1/filing-tracker/requirements", description: "Register a statutory filing requirement with its deadline", input: { obligation: "UK Gender Pay Gap Reporting 2026", jurisdiction: "GB", authority: "Government Equalities Office", due_date: "2027-04-04", status: "PENDING" } },
  { id: 32, domain: "Compliance & Risk", name: "Compliance Evaluation Engine", port: 8132, method: "GET", path: "/api/v1/compliance-status", description: "Get current compliance evaluation across all domains", input: null },
  { id: 33, domain: "Compliance & Risk", name: "Exception Escalation Engine", port: 8133, method: "POST", path: "/api/v1/exception-escalation/exceptions", description: "Escalate a compliance exception to a responsible owner", input: { domain: "COMMERCIAL_OPS", type: "SANCTIONED_ENTITY_SCREENING_FLAG", severity: "HIGH", assigned_to: "James Okonkwo", sla_breach_at: "2026-09-05T17:00:00Z", status: "ESCALATED" } },
  // AUDIT EVENT STORE (4)
  { id: 34, domain: "Audit Event Store", name: "Audit Event Ingestion", port: 8084, method: "POST", path: "/api/v1/audit/events", description: "Ingest a cryptographically-hashed audit event", input: { event_type: "MANUAL_E2E_SERVICE_TEST_EXECUTION", source_module: "ADMIN_CONSOLE", actor: "vasu@zoikogroup.com", action: "MANUAL_E2E_SERVICE_TEST_EXECUTION", resource: "microservices/all-37", outcome: "SUCCESS", details: "Dispatched manual input test payloads across all 37 microservices" } },
  { id: 35, domain: "Audit Event Store", name: "Audit Log Query Engine", port: 8084, method: "GET", path: "/api/v1/audit/logs", description: "Query the immutable audit log chain", input: null },
  { id: 36, domain: "Audit Event Store", name: "Tamper Detection Engine", port: 8081, method: "GET", path: "/api/v1/tamper/alerts", description: "Retrieve tamper alerts and hash-chain anomalies", input: null },
  { id: 37, domain: "Audit Event Store", name: "Evidence Verification Engine", port: 8082, method: "GET", path: "/api/v1/evidence/requirements", description: "Verify evidence requirements for compliance obligations", input: null },
];

const DOMAIN_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Tax Governance":    { color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-200 dark:border-violet-500/30", dot: "bg-violet-500" },
  "AI Governance":     { color: "text-fuchsia-700 dark:text-fuchsia-300", bg: "bg-fuchsia-50 dark:bg-fuchsia-900/20", border: "border-fuchsia-200 dark:border-fuchsia-500/30", dot: "bg-fuchsia-500" },
  "Legal & Contracts": { color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-500/30", dot: "bg-blue-500" },
  "Finance":           { color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-500/30", dot: "bg-emerald-500" },
  "Commercial Ops":    { color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-500/30", dot: "bg-amber-500" },
  "HR & Workforce":    { color: "text-cyan-700 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-900/20", border: "border-cyan-200 dark:border-cyan-500/30", dot: "bg-cyan-500" },
  "Payroll":           { color: "text-teal-700 dark:text-teal-300", bg: "bg-teal-50 dark:bg-teal-900/20", border: "border-teal-200 dark:border-teal-500/30", dot: "bg-teal-500" },
  "Compliance & Risk": { color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-500/30", dot: "bg-orange-500" },
  "Audit Event Store": { color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-800/50", border: "border-slate-200 dark:border-slate-600/30", dot: "bg-slate-500" },
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

function getTargetLink(svc: typeof SERVICES[0], data: unknown): { href: string; label: string } {
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
  if (svc.domain === "Tax Governance") {
    return { href: `/admin/tax`, label: `Open Tax Governance Console` };
  }
  if (svc.domain === "Payroll") {
    return { href: `/admin/payroll`, label: `Open Payroll Console` };
  }
  if (svc.domain === "HR & Workforce") {
    return { href: `/admin/hr`, label: `Open HR & Workforce Directory` };
  }
  if (svc.domain === "Finance") {
    return { href: `/admin/finance`, label: `Open Finance & General Ledger` };
  }
  return { href: baseHref, label: `Open in ${svc.domain} Console` };
}

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
  svc: typeof SERVICES[0];
  payload: string;
  onPayloadChange: (val: string) => void;
  result: Result | null;
  loading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onFire: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const meta = DOMAIN_META[svc.domain] ?? DOMAIN_META["Audit Event Store"];
  const domainHref = DOMAIN_HREFS[svc.domain] ?? "/admin";
  const targetLink = result?.ok ? getTargetLink(svc, result.data) : null;

  function copyPayload() {
    navigator.clipboard.writeText(payload).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetPayload() {
    onPayloadChange(svc.input ? JSON.stringify(svc.input, null, 2) : "");
  }

  return (
    <div className={`rounded-xl border ${meta.border} bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md`}>
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
              <span className="font-mono text-[11px] text-slate-400 truncate max-w-[240px]">{svc.path}</span>
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

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-4 space-y-4 bg-slate-50/40 dark:bg-slate-900/50">
          {svc.input !== null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-indigo-500" />
                  Service Input Payload (Editable JSON)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={copyPayload}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Copy payload"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    onClick={resetPayload}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Reset to default payload"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
              <textarea
                value={payload}
                onChange={(e) => onPayloadChange(e.target.value)}
                rows={Math.max(6, Math.min(22, (payload.match(/\n/g) || []).length + 2))}
                spellCheck={false}
                className="w-full rounded-lg bg-gray-950 text-emerald-400 font-mono text-xs p-3.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed shadow-inner"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-sky-500" />
                Service Query Configuration
              </span>
              <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 p-3 text-xs text-sky-900 dark:text-sky-200 space-y-1">
                <p>This is an authenticated <strong>GET query endpoint</strong>. Standard platform identity context is automatically forwarded:</p>
                <div className="font-mono text-[11px] opacity-80 pt-1 space-y-0.5">
                  <div>X-Tenant-Id: 11111111-1111-1111-1111-111111111111</div>
                  <div>X-Legal-Entity-Id: 22222222-2222-2222-2222-222222222222</div>
                  <div>X-Principal-Id: 33333333-3333-3333-3333-333333333333</div>
                </div>
              </div>
            </div>
          )}

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
                  <span>Send Request to Microservice</span>
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

          {result && (
            <div className={`rounded-xl border p-4 space-y-3 animate-in fade-in duration-200 ${result.ok ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-900/10"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="h-5 w-5 text-red-500" />}
                  <span className={`text-sm font-bold ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    HTTP {result.status} {result.ok ? "— Success (Processed & Committed)" : "— Failed"}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{result.ms}ms response</span>
                </div>

                {targetLink && (
                  <Link
                    href={targetLink.href}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:scale-105 active:scale-95"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{targetLink.label}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>

              {result.error && (
                <p className="text-xs font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2.5 rounded border border-red-200 dark:border-red-800">
                  {result.error}
                </p>
              )}

              <div>
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Response Body (Updated Live Data)
                </div>
                <pre className="text-[11px] font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all overflow-auto max-h-60 bg-white dark:bg-slate-950 rounded-lg p-3.5 border border-slate-200 dark:border-slate-800 leading-relaxed shadow-sm">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ServiceInputsPage() {
  const [search, setSearch] = useState("");
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  
  // Per-service state map
  const [payloads, setPayloads] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const s of SERVICES) {
      init[s.id] = s.input ? JSON.stringify(s.input, null, 2) : "";
    }
    return init;
  });

  const [results, setResults] = useState<Record<number, Result>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  const allExpanded = SERVICES.every((s) => expandedCards[s.id]);

  function toggleExpandAll() {
    const nextState = !allExpanded;
    const nextMap: Record<number, boolean> = {};
    for (const s of SERVICES) {
      nextMap[s.id] = nextState;
    }
    setExpandedCards(nextMap);
  }

  function resetAllPayloads() {
    const init: Record<number, string> = {};
    for (const s of SERVICES) {
      init[s.id] = s.input ? JSON.stringify(s.input, null, 2) : "";
    }
    setPayloads(init);
    setResults({});
  }

  async function fireService(svc: typeof SERVICES[0]) {
    setLoadingMap((prev) => ({ ...prev, [svc.id]: true }));
    const currentPayload = payloads[svc.id] ?? (svc.input ? JSON.stringify(svc.input, null, 2) : "");
    const t0 = Date.now();
    try {
      let body: BodyInit | undefined;
      if (svc.method !== "GET" && currentPayload.trim()) {
        try {
          JSON.parse(currentPayload);
        } catch (e) {
          setResults((prev) => ({
            ...prev,
            [svc.id]: { ok: false, status: 0, ms: 0, data: null, error: "Invalid JSON: " + String(e) },
          }));
          setLoadingMap((prev) => ({ ...prev, [svc.id]: false }));
          setExpandedCards((prev) => ({ ...prev, [svc.id]: true }));
          return;
        }
        body = currentPayload;
      }

      const res = await fetch(svc.path, {
        method: svc.method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
          "X-Principal-Id": "33333333-3333-3333-3333-333333333333",
          "X-Legal-Entity-Id": "22222222-2222-2222-2222-222222222222",
        },
        body,
      });
      const ms = Date.now() - t0;
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      setResults((prev) => ({
        ...prev,
        [svc.id]: { ok: res.ok, status: res.status, ms, data },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [svc.id]: { ok: false, status: 0, ms: Date.now() - t0, data: null, error: String(e) },
      }));
    }
    setLoadingMap((prev) => ({ ...prev, [svc.id]: false }));
    setExpandedCards((prev) => ({ ...prev, [svc.id]: true }));
  }

  async function runAll() {
    setRunningAll(true);
    // Expand all cards so user sees all live responses!
    const expandMap: Record<number, boolean> = {};
    for (const s of SERVICES) {
      expandMap[s.id] = true;
    }
    setExpandedCards(expandMap);

    for (const svc of SERVICES) {
      const currentPayload = payloads[svc.id] ?? (svc.input ? JSON.stringify(svc.input, null, 2) : "");
      const t0 = Date.now();
      try {
        let body: BodyInit | undefined;
        if (svc.method !== "GET" && currentPayload.trim()) {
          body = currentPayload;
        }

        const res = await fetch(svc.path, {
          method: svc.method,
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
            "X-Principal-Id": "33333333-3333-3333-3333-333333333333",
            "X-Legal-Entity-Id": "22222222-2222-2222-2222-222222222222",
          },
          body,
        });
        const ms = Date.now() - t0;
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        setResults((prev) => ({
          ...prev,
          [svc.id]: { ok: res.ok, status: res.status, ms, data },
        }));
      } catch (e) {
        setResults((prev) => ({
          ...prev,
          [svc.id]: { ok: false, status: 0, ms: Date.now() - t0, data: null, error: String(e) },
        }));
      }
    }
    setRunningAll(false);
  }

  const resultsList = Object.values(results);
  const passed = resultsList.filter((r) => r.ok).length;
  const failed = resultsList.filter((r) => !r.ok).length;
  const avgMs = resultsList.length > 0 ? Math.round(resultsList.reduce((s, r) => s + r.ms, 0) / resultsList.length) : 0;

  const filteredDomains = Object.entries(DOMAINS_GROUPED).filter(([domain, svcs]) => {
    if (activeDomain && domain !== activeDomain) return false;
    if (!search) return true;
    return svcs.some(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.path.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 space-y-3">
          {/* Title + Global Actions */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="h-5 w-5 text-indigo-500" />
                  Service Input Dashboard
                </h1>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Live Multi-Service Console
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Editable JSON inputs and live queries for all{" "}
                <span className="font-bold text-indigo-600 dark:text-indigo-400">37 microservices</span>
                {" "}— configure payloads, dispatch live writes, and open updated data across all domains.
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleExpandAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700"
                title={allExpanded ? "Collapse all cards" : "Expand all cards to show all inputs"}
              >
                {allExpanded ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Collapse All</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Expand All Inputs</span>
                  </>
                )}
              </button>

              <button
                onClick={resetAllPayloads}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700"
                title="Reset all payloads to defaults"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset Defaults</span>
              </button>

              <button
                onClick={runAll}
                disabled={runningAll}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-60"
              >
                {runningAll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Running all 37…</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Run All 37 Services</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results summary */}
          {resultsList.length > 0 && (
            <div className="flex items-center gap-4 flex-wrap text-sm pt-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">{resultsList.length}/37 executed</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">✔ {passed} passed</span>
              {failed > 0 && <span className="font-semibold text-red-500">✘ {failed} failed</span>}
              {avgMs > 0 && <span className="text-slate-400">~{avgMs}ms avg</span>}
              {resultsList.length === 37 && failed === 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-700">
                  100% All healthy ✔
                </span>
              )}
              <div className="flex gap-1 flex-wrap">
                {SERVICES.map((s) => {
                  const r = results[s.id];
                  return (
                    <div
                      key={s.id}
                      title={`${s.id}. ${s.name}: ${r ? (r.ok ? `✔ HTTP ${r.status}` : `✘ HTTP ${r.status}`) : "not tested"}`}
                      className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${!r ? "bg-slate-200 dark:bg-slate-700" : r.ok ? "bg-emerald-500" : "bg-red-500"}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Search + domain filters */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search microservices, endpoints, descriptions…"
              className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs placeholder:text-slate-400 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setActiveDomain(null)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${!activeDomain ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400"}`}
              >
                All
              </button>
              {Object.keys(DOMAINS_GROUPED).map((d) => {
                const meta = DOMAIN_META[d] ?? DOMAIN_META["Audit Event Store"];
                return (
                  <button
                    key={d}
                    onClick={() => setActiveDomain(activeDomain === d ? null : d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${activeDomain === d ? `${meta.bg} ${meta.color} ${meta.border}` : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
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
                  s.description.toLowerCase().includes(search.toLowerCase())
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
