"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Send, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  Copy, RefreshCw, ArrowRight, ArrowUpRight, Sparkles,
  Maximize2, Minimize2, Check, Sliders, Activity, ShieldCheck,
  Zap, Server, Cpu, Database, Filter
} from "lucide-react";

export interface ServiceDef {
  id: number;
  block: string;
  domain: string;
  name: string;
  port: number;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  input: Record<string, unknown>;
}

export const SERVICES: ServiceDef[] = [
  // ── BLOCK 6 · LEGAL, CORPORATE & COMMERCIAL (11) ──────────────────────────
  {
    id: 1,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "contract-lifecycle-svc",
    port: 8119,
    method: "POST",
    path: "/api/v1/contracts",
    description: "Enterprise Master Services Agreement draft & lifecycle orchestration",
    input: {
      title: "Enterprise Master Services Agreement - GlobalCloud Inc",
      contract_type: "MSA",
      counterparty_id: "cp-globalcloud-01",
      counterparty_name: "GlobalCloud Inc",
      currency: "GBP",
      total_value: 320000,
      effective_from: "2026-10-01T00:00:00Z",
      status: "DRAFT"
    }
  },
  {
    id: 2,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "clause-template-svc",
    port: 8120,
    method: "POST",
    path: "/api/v1/clauses",
    description: "Standard legal clause library and jurisdictional template engine",
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
    id: 3,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "obligation-tracking-svc",
    port: 8121,
    method: "POST",
    path: "/api/v1/obligations",
    description: "Contractual obligation deadlines, audit milestones and compliance covenants",
    input: {
      contract_id: "c-001",
      title: "Annual ISO 27001 SOC-2 Type II Audit Certification",
      description: "Deliver renewed SOC-2 Type II certification report to counterparty",
      due_date: "2026-12-15T00:00:00Z",
      risk_level: "HIGH",
      status: "PENDING"
    }
  },
  {
    id: 4,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "board-resolutions-svc",
    port: 8122,
    method: "POST",
    path: "/api/v1/meetings",
    description: "Schedule executive board resolutions and governance committee meetings",
    input: {
      meeting_type: "BOARD_OF_DIRECTORS",
      title: "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting",
      scheduled_date: "2026-10-15T14:00:00Z",
      location: "London HQ / Virtual Boardroom",
      quorum_required: 3,
      status: "SCHEDULED"
    }
  },
  {
    id: 5,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "corporate-actions-svc",
    port: 8123,
    method: "POST",
    path: "/api/v1/corporate-actions",
    description: "Propose corporate restructuring, share issuance or dividend actions",
    input: {
      action_type: "EQUITY_INCENTIVE_GRANT",
      description: "Approve 2026 Employee Stock Option Scheme Allotment",
      authorized_shares: 250000,
      share_class: "ORDINARY_B",
      status: "PROPOSED"
    }
  },
  {
    id: 6,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "counterparty-management-svc",
    port: 8124,
    method: "GET",
    path: "/api/v1/counterparties",
    description: "List all KYC-verified counterparties and corporate affiliations",
    input: {
      status: "VERIFIED",
      jurisdiction_id: "GB",
      risk_classification: "TIER_1",
      limit: 50
    }
  },
  {
    id: 7,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "purchase-request-svc",
    port: 8100,
    method: "POST",
    path: "/api/v1/purchase-requests",
    description: "Submit a commercial procurement requisition for departmental approval",
    input: {
      title: "Core Infrastructure High-Performance Compute Cluster",
      department: "Engineering",
      requested_by: "Lingaraj (Super Admin)",
      estimated_amount: 45000,
      currency: "GBP",
      priority: "HIGH",
      justification: "Critical multi-tenant throughput scaling"
    }
  },
  {
    id: 8,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "purchase-order-svc",
    port: 8150,
    method: "POST",
    path: "/api/v1/purchase-orders",
    description: "Raise an authorized vendor purchase order (port remapped to 8150)",
    input: {
      po_number: "PO-2026-189",
      vendor_name: "CloudVault Infrastructure Ltd",
      description: "Annual Enterprise Cloud Storage & Compute Reserved Instances",
      amount: 96000,
      currency: "GBP",
      status: "APPROVED"
    }
  },
  {
    id: 9,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "spend-controls-svc",
    port: 8131,
    method: "POST",
    path: "/api/v1/spend-controls/limits",
    description: "Set departmental spend limits and multi-tiered approval ceilings",
    input: {
      category: "Software & Cloud Infrastructure",
      department: "Engineering",
      annual_limit_amount: 400000,
      currency: "GBP",
      approval_threshold: 25000,
      period: "ANNUAL"
    }
  },
  {
    id: 10,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "vendor-due-diligence-svc",
    port: 8132,
    method: "GET",
    path: "/api/v1/vendors",
    description: "Query vendor due diligence status, sanction screening, and risk scores",
    input: {
      vendor_id: "v-cloudvault-01",
      risk_tier: "LOW",
      sanctions_screened: true,
      compliance_status: "APPROVED"
    }
  },
  {
    id: 11,
    block: "Block 6",
    domain: "Legal, Corporate & Commercial",
    name: "procurement-workflow-svc",
    port: 8134,
    method: "POST",
    path: "/api/v1/procurement/workflows",
    description: "Initiate multi-tier procurement approval lifecycle",
    input: {
      requisition_id: "req-2026-902",
      workflow_type: "TWO_TIER_EXECUTIVE",
      approval_chain: ["finance_director", "procurement_lead"],
      status: "ACTIVE"
    }
  },

  // ── BLOCK 7 · TAX & COMPLIANCE (9) ────────────────────────────────────────
  {
    id: 12,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "tax-rules-svc",
    port: 8125,
    method: "POST",
    path: "/api/v1/tax-rules",
    description: "Register statutory tax rate rule and exemptions schedule",
    input: {
      jurisdiction_id: "GB",
      rule_code: "UK-VAT-STANDARD-20",
      name: "UK Standard VAT 20%",
      category: "VAT",
      tax_rate_percentage: 20.0,
      standard_deductions: 0,
      exemptions_json: "{\"domestic_energy\":false}",
      status: "ACTIVE",
      version: 1,
      effective_from: "2026-09-01T00:00:00Z"
    }
  },
  {
    id: 13,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "tax-determination-svc",
    port: 8126,
    method: "POST",
    path: "/api/v1/tax-determinations",
    description: "Real-time tax determination and Nexus evaluation for cross-border trades",
    input: {
      transaction_id: "tx-inv-2026-8841",
      source_module: "ACCOUNTS_PAYABLE",
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "GB",
      tax_category: "VAT",
      gross_amount: 150000,
      taxable_amount: 150000,
      currency: "GBP",
      status: "CALCULATED"
    }
  },
  {
    id: 14,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "vat-gst-svc",
    port: 8127,
    method: "POST",
    path: "/api/v1/vat-returns",
    description: "Submit quarterly VAT/GST return filing with input/output tax reconciliations",
    input: {
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "GB",
      tax_registration_number: "GB998877665",
      tax_period: "2026-Q3",
      total_sales_amount: 520000,
      total_purchase_amount: 210000,
      output_tax_amount: 104000,
      input_tax_amount: 42000,
      currency: "GBP"
    }
  },
  {
    id: 15,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "corporate-tax-svc",
    port: 8128,
    method: "POST",
    path: "/api/v1/corporate-tax-returns",
    description: "Compute and file statutory corporate income tax obligations",
    input: {
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "GB",
      tax_registration_number: "GB-CT-443322",
      fiscal_year: 2026,
      accounting_period_start: "2026-01-01",
      accounting_period_end: "2026-12-31",
      gross_revenue: 3500000,
      allowable_deductions: 2100000,
      taxable_income: 1400000,
      tax_rate_percent: 25.0,
      currency: "GBP"
    }
  },
  {
    id: 16,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "withholding-tax-svc",
    port: 8129,
    method: "POST",
    path: "/api/v1/withholding-tax",
    description: "Calculate and apply cross-border withholding tax deductions",
    input: {
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "DE",
      counterparty_id: "cp-acme-gmbh-01",
      payment_reference: "PAY-DE-2026-09",
      payment_type: "ROYALTIES",
      gross_payment_amount: 85000,
      taxable_base_amount: 85000,
      withholding_rate_percent: 15.0,
      withheld_amount: 12750,
      currency: "EUR"
    }
  },
  {
    id: 17,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "filing-preparation-svc",
    port: 8130,
    method: "POST",
    path: "/api/v1/filing-preparation/drafts",
    description: "Generate structured electronic drafts for jurisdictional tax submissions",
    input: {
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "GB",
      filing_type: "VAT_RETURN",
      period_key: "2026-Q3",
      due_date: "2026-10-31T00:00:00Z",
      payload_data: "{\"box1\":104000,\"box4\":42000,\"box5\":62000}",
      notes: "Q3 2026 VAT filing draft processed via Zoiko console"
    }
  },
  {
    id: 18,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "filing-tracker-svc",
    port: 8151,
    method: "POST",
    path: "/api/v1/filing-tracker/requirements",
    description: "Register mandatory regulatory filing schedule and SLA deadlines (port 8151)",
    input: {
      obligation: "UK Companies House Annual Confirmation Statement",
      jurisdiction: "GB",
      authority: "Companies House",
      due_date: "2026-11-30",
      status: "PENDING"
    }
  },
  {
    id: 19,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "compliance-status-svc",
    port: 8152,
    method: "GET",
    path: "/api/v1/compliance-status",
    description: "Multi-jurisdiction corporate compliance posture and audit indicators (port 8152)",
    input: {
      domain: "GLOBAL_GOVERNANCE",
      jurisdiction: "GB",
      status_filter: "ALL",
      include_metrics: true
    }
  },
  {
    id: 20,
    block: "Block 7",
    domain: "Tax & Compliance",
    name: "exception-escalation-svc",
    port: 8133,
    method: "POST",
    path: "/api/v1/exception-escalation/exceptions",
    description: "Escalate compliance or regulatory exception to responsible officer",
    input: {
      domain: "TAX_GOVERNANCE",
      type: "VAT_EXEMPTION_THRESHOLD_BREACH",
      severity: "HIGH",
      assigned_to: "Chief Compliance Officer",
      sla_breach_at: "2026-10-01T17:00:00Z",
      status: "ESCALATED"
    }
  },

  // ── BLOCK 8 · INTELLIGENCE & REPORTING (6) ────────────────────────────────
  {
    id: 21,
    block: "Block 8",
    domain: "Intelligence & Reporting",
    name: "anomaly-detection-svc",
    port: 8153,
    method: "GET",
    path: "/api/v1/anomalies",
    description: "AI-driven transaction anomaly detector and suspicious event detector (port 8153)",
    input: {
      timeframe: "LAST_30_DAYS",
      sensitivity: "HIGH",
      threshold_score: 0.85,
      limit: 20
    }
  },
  {
    id: 22,
    block: "Block 8",
    domain: "Intelligence & Reporting",
    name: "forecasting-svc",
    port: 8135,
    method: "GET",
    path: "/api/v1/forecasts",
    description: "Predictive cash flow, capital expenditure and tax liability projections",
    input: {
      forecast_horizon_months: 12,
      scenario: "BASE_GROWTH",
      currency: "GBP",
      include_confidence_bands: true
    }
  },
  {
    id: 23,
    block: "Block 8",
    domain: "Intelligence & Reporting",
    name: "compliance-risk-scoring-svc",
    port: 8136,
    method: "GET",
    path: "/api/v1/compliance/risk-scores",
    description: "Dynamic risk scoring based on regulatory exposure and filing velocity",
    input: {
      jurisdiction_id: "GB",
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      risk_model: "DYNAMIC_WEIGHTED_V2",
      include_historical: true
    }
  },
  {
    id: 24,
    block: "Block 8",
    domain: "Intelligence & Reporting",
    name: "reconciliation-intelligence-svc",
    port: 8137,
    method: "GET",
    path: "/api/v1/reconciliation/intelligence",
    description: "Automated fuzzy transaction matching and unallocated balance resolver",
    input: {
      tolerance_pct: 0.05,
      match_rule: "EXACT_AND_FUZZY",
      unmatched_only: true,
      period: "2026-09"
    }
  },
  {
    id: 25,
    block: "Block 8",
    domain: "Intelligence & Reporting",
    name: "reporting-orchestration-svc",
    port: 8138,
    method: "POST",
    path: "/api/v1/reports/orchestrate",
    description: "Generate end-to-end statutory and board governance report packages",
    input: {
      report_type: "QUARTERLY_EXECUTIVE_SUMMARY",
      period: "2026-Q3",
      format: "JSON_AND_PDF",
      include_audit_trail: true
    }
  },
  {
    id: 26,
    block: "Block 8",
    domain: "Intelligence & Reporting",
    name: "decision-support-svc",
    port: 8154,
    method: "GET",
    path: "/api/v1/decision-support",
    description: "Algorithmic governance recommendations and policy simulation (port 8154)",
    input: {
      policy_domain: "STATUTORY_TAX",
      confidence_floor: 0.9,
      jurisdiction: "GB",
      mode: "RECOMMENDATION"
    }
  },

  // ── BLOCK 9 · SECURITY & SETTINGS (5) ─────────────────────────────────────
  {
    id: 27,
    block: "Block 9",
    domain: "Security & Settings",
    name: "migration-integrity-svc",
    port: 8139,
    method: "GET",
    path: "/api/v1/migrations/integrity",
    description: "Verify cryptographic state verification and schema upgrade integrity",
    input: {
      migration_batch: "BATCH-2026-09",
      verify_checksums: true,
      audit_ledger: "ACTIVE"
    }
  },
  {
    id: 28,
    block: "Block 9",
    domain: "Security & Settings",
    name: "mtls-management-svc",
    port: 8140,
    method: "GET",
    path: "/api/v1/mtls/certificates",
    description: "Manage service-to-service mutual TLS x509 certificates and trust bundles",
    input: {
      ca_bundle_version: "v3.2",
      include_expired: false,
      min_days_remaining: 60
    }
  },
  {
    id: 29,
    block: "Block 9",
    domain: "Security & Settings",
    name: "siem-integration-svc",
    port: 8141,
    method: "POST",
    path: "/api/v1/siem/events",
    description: "Transmit security telemetry and policy violation events to corporate SIEM",
    input: {
      event_type: "ADMIN_SECURITY_AUDIT",
      source: "ZOIKO_CONSOLE",
      severity: "INFO",
      details: "Privileged administrator active session verified"
    }
  },
  {
    id: 30,
    block: "Block 9",
    domain: "Security & Settings",
    name: "carta-svc",
    port: 8142,
    method: "GET",
    path: "/api/v1/carta/captable",
    description: "Synchronize shareholder equity ledgers and Carta cap table ownership",
    input: {
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      share_class: "COMMON_AND_PREFERRED",
      as_of_date: "2026-09-25"
    }
  },
  {
    id: 31,
    block: "Block 9",
    domain: "Security & Settings",
    name: "key-management-svc",
    port: 8143,
    method: "GET",
    path: "/api/v1/keys",
    description: "Hardware Security Module (HSM) key rotation and cryptographic envelope keys",
    input: {
      key_ring: "zoiko-vault-master",
      status: "ENABLED",
      algorithm: "AES-256-GCM"
    }
  },

  // ── BLOCK 10 · INTEGRATION & EXTENSIBILITY (6) ───────────────────────────
  {
    id: 32,
    block: "Block 10",
    domain: "Integration & Extensibility",
    name: "connectivity-api-bridge-svc",
    port: 8144,
    method: "GET",
    path: "/api/v1/bridge/connections",
    description: "External API gateway bridge and third-party webhook router",
    input: {
      bridge_type: "WEBHOOK_INGRESS",
      protocol: "REST_HTTPS",
      health_only: false
    }
  },
  {
    id: 33,
    block: "Block 10",
    domain: "Integration & Extensibility",
    name: "banking-connector-svc",
    port: 8145,
    method: "GET",
    path: "/api/v1/banking/connectors",
    description: "OpenBanking ISO 20022 and SWIFT transactional feeds",
    input: {
      connector_type: "OPEN_BANKING_UK",
      settlement_network: "BACS_AND_CHAPS",
      active: true
    }
  },
  {
    id: 34,
    block: "Block 10",
    domain: "Integration & Extensibility",
    name: "hris-connector-svc",
    port: 8146,
    method: "GET",
    path: "/api/v1/hris/connections",
    description: "Bi-directional employee sync with Workday, BambooHR, and HiBob",
    input: {
      provider: "WORKDAY_GLOBAL",
      sync_direction: "BI_DIRECTIONAL",
      include_contractors: true
    }
  },
  {
    id: 35,
    block: "Block 10",
    domain: "Integration & Extensibility",
    name: "tax-authority-interface-svc",
    port: 8147,
    method: "POST",
    path: "/api/v1/tax-authority/interfaces",
    description: "Configure direct electronic connection to tax authority gateways",
    input: {
      jurisdiction_id: "GB",
      authority_code: "HMRC-MTD-VAT",
      authority_name: "HMRC Making Tax Digital (MTD)",
      api_endpoint: "https://api.service.hmrc.gov.uk/organisations/vat",
      auth_type: "OAUTH2",
      protocol: "REST"
    }
  },
  {
    id: 36,
    block: "Block 10",
    domain: "Integration & Extensibility",
    name: "esignature-integration-svc",
    port: 8148,
    method: "POST",
    path: "/api/v1/esignature/envelopes",
    description: "Dispatch DocuSign / Adobe Sign legal signature packets",
    input: {
      document_id: "doc-msa-2026-001",
      signers: [
        { name: "Lingaraj Admin", email: "admin@zoikosuite.com", role: "SIGNATORY" }
      ],
      expiration_days: 7
    }
  },
  {
    id: 37,
    block: "Block 10",
    domain: "Integration & Extensibility",
    name: "external-data-feed-svc",
    port: 8149,
    method: "GET",
    path: "/api/v1/feeds",
    description: "Foreign exchange rate indices, inflation metrics, and benchmark rates",
    input: {
      feed_type: "FX_AND_STATUTORY_BENCHMARK",
      base_currency: "GBP",
      frequency: "HOURLY"
    }
  }
];

const DOMAIN_HREFS: Record<string, string> = {
  "Legal, Corporate & Commercial": "/admin/legal",
  "Tax & Compliance": "/admin/tax",
  "Intelligence & Reporting": "/admin/compliance",
  "Security & Settings": "/admin/settings",
  "Integration & Extensibility": "/admin/settings",
};

const DOMAIN_META: Record<string, { color: string; bg: string; border: string; dot: string; icon: typeof Server }> = {
  "Legal, Corporate & Commercial": {
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-500/30",
    dot: "bg-blue-500",
    icon: ShieldCheck,
  },
  "Tax & Compliance": {
    color: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-50 dark:bg-violet-900/20",
    border: "border-violet-200 dark:border-violet-500/30",
    dot: "bg-violet-500",
    icon: Activity,
  },
  "Intelligence & Reporting": {
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-500/30",
    dot: "bg-amber-500",
    icon: Cpu,
  },
  "Security & Settings": {
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-500/30",
    dot: "bg-emerald-500",
    icon: Database,
  },
  "Integration & Extensibility": {
    color: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-50 dark:bg-cyan-900/20",
    border: "border-cyan-200 dark:border-cyan-500/30",
    dot: "bg-cyan-500",
    icon: Zap,
  },
};

const METHOD_BADGE: Record<string, string> = {
  GET: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  POST: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  PATCH: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export type Result = {
  ok: boolean;
  status: number;
  ms: number;
  data: unknown;
  serviceName?: string;
  error?: string;
};

export type HealthInfo = {
  online: boolean;
  ms: number;
  status: number;
};

export type HeaderOverrides = {
  tenantId: string;
  principalId: string;
  legalEntityId: string;
};

const DEFAULT_HEADERS: HeaderOverrides = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  principalId: "33333333-3333-3333-3333-333333333333",
  legalEntityId: "22222222-2222-2222-2222-222222222222",
};

function ServiceCard({
  svc,
  payload,
  onPayloadChange,
  headers,
  onHeaderChange,
  result,
  health,
  loading,
  expanded,
  onToggleExpand,
  onFire,
}: {
  svc: ServiceDef;
  payload: string;
  onPayloadChange: (val: string) => void;
  headers: HeaderOverrides;
  onHeaderChange: (val: HeaderOverrides) => void;
  result: Result | null;
  health?: HealthInfo;
  loading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onFire: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const meta = DOMAIN_META[svc.domain] ?? DOMAIN_META["Legal, Corporate & Commercial"];
  const domainHref = DOMAIN_HREFS[svc.domain] ?? "/admin";

  function copyPayload() {
    navigator.clipboard.writeText(payload).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetPayload() {
    onPayloadChange(JSON.stringify(svc.input, null, 2));
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
              <span className="font-mono text-[11px] text-slate-400 truncate max-w-[200px]">{svc.path}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color} border ${meta.border}`}>
                Port {svc.port}
              </span>
              {health?.online && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live ({health.ms}ms)
                </span>
              )}
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
            <span className="hidden sm:inline">View domain</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-4 space-y-4 bg-slate-50/40 dark:bg-slate-900/50">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                {svc.method === "GET" ? <Filter className="h-3.5 w-3.5 text-sky-500" /> : <Sliders className="h-3.5 w-3.5 text-indigo-500" />}
                {svc.method === "GET" ? "Query Parameters / Filter Criteria (JSON)" : "Request Body Payload (JSON)"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyPayload}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  onClick={resetPayload}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Reset Default</span>
                </button>
              </div>
            </div>

            <textarea
              value={payload}
              onChange={(e) => onPayloadChange(e.target.value)}
              rows={Math.min(10, Math.max(4, payload.split("\n").length))}
              className="w-full font-mono text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 p-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all leading-relaxed"
              spellCheck={false}
            />

            {svc.method === "GET" && (
              <p className="text-[11px] text-slate-400 italic">
                * Note: For GET requests, the JSON properties above are automatically serialized into URL query string parameters.
              </p>
            )}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-slate-400 font-mono">
              Target Port: <code className="text-indigo-600 dark:text-indigo-400 font-bold">:{svc.port}</code>
            </div>
            <button
              onClick={onFire}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Dispatch {svc.method}</span>
                </>
              )}
            </button>
          </div>

          {/* Result Block */}
          {result && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    HTTP {result.status} {result.ok ? "— Success (Committed to Local Microservice)" : "— Failed"}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">({result.ms}ms response)</span>
                </div>
                <Link
                  href={domainHref}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Open in {svc.domain}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {result.error && (
                <p className="text-xs font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2.5 rounded border border-red-200 dark:border-red-800">
                  {result.error}
                </p>
              )}

              <pre className="text-[11px] font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all overflow-auto max-h-48 bg-white dark:bg-slate-950 rounded-lg p-3 border border-slate-200 dark:border-slate-800 leading-relaxed shadow-sm">
                {typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}
              </pre>
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
  const [pingingAll, setPingingAll] = useState(false);

  // Per-service state map
  const [payloads, setPayloads] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const s of SERVICES) {
      init[s.id] = JSON.stringify(s.input, null, 2);
    }
    return init;
  });

  const [headerOverrides, setHeaderOverrides] = useState<Record<number, HeaderOverrides>>(() => {
    const init: Record<number, HeaderOverrides> = {};
    for (const s of SERVICES) init[s.id] = { ...DEFAULT_HEADERS };
    return init;
  });

  const [results, setResults] = useState<Record<number, Result>>({});
  const [healthMap, setHealthMap] = useState<Record<number, HealthInfo>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  const allExpanded = SERVICES.every((s) => expandedCards[s.id]);

  // Initial health check on page load
  useEffect(() => {
    pingAllServices();
  }, []);

  async function pingAllServices() {
    setPingingAll(true);
    const newHealth: Record<number, HealthInfo> = {};
    await Promise.all(
      SERVICES.map(async (svc) => {
        try {
          const res = await fetch(`/api/backend/ping?port=${svc.port}`, { cache: "no-store" });
          const json = await res.json();
          newHealth[svc.id] = {
            online: json.ok === true,
            ms: json.ms ?? 0,
            status: json.status ?? 0,
          };
        } catch {
          newHealth[svc.id] = { online: false, ms: 0, status: 0 };
        }
      })
    );
    setHealthMap(newHealth);
    setPingingAll(false);
  }

  function toggleExpandAll() {
    const nextState = !allExpanded;
    const nextMap: Record<number, boolean> = {};
    for (const s of SERVICES) {
      nextMap[s.id] = nextState;
    }
    setExpandedCards(nextMap);
  }

  async function fireService(svc: ServiceDef) {
    setLoadingMap((prev) => ({ ...prev, [svc.id]: true }));
    const currentPayload = payloads[svc.id] ?? JSON.stringify(svc.input, null, 2);
    const h = headerOverrides[svc.id] ?? DEFAULT_HEADERS;
    const t0 = Date.now();

    try {
      let bodyData: unknown = undefined;
      if (currentPayload.trim()) {
        try {
          bodyData = JSON.parse(currentPayload);
        } catch (e) {
          setResults((prev) => ({
            ...prev,
            [svc.id]: { ok: false, status: 0, ms: 0, data: null, error: "Invalid JSON: " + String(e) },
          }));
          setLoadingMap((prev) => ({ ...prev, [svc.id]: false }));
          setExpandedCards((prev) => ({ ...prev, [svc.id]: true }));
          return;
        }
      }

      const res = await fetch("/api/backend/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: svc.port,
          path: svc.path,
          method: svc.method,
          headers: {
            "X-Tenant-Id": h.tenantId,
            "X-Principal-Id": h.principalId,
            "X-Legal-Entity-Id": h.legalEntityId,
          },
          body: bodyData,
        }),
      });

      const json = await res.json();
      setResults((prev) => ({
        ...prev,
        [svc.id]: {
          ok: json.ok,
          status: json.status,
          ms: json.ms ?? (Date.now() - t0),
          data: json.data,
          serviceName: json.serviceName,
          error: json.error,
        },
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
    const expandMap: Record<number, boolean> = {};
    for (const s of SERVICES) expandMap[s.id] = true;
    setExpandedCards(expandMap);

    for (const svc of SERVICES) {
      await fireService(svc);
    }
    setRunningAll(false);
  }

  const domainsGrouped = useMemo(() => {
    return SERVICES.reduce((acc, s) => {
      if (!acc[s.domain]) acc[s.domain] = [];
      acc[s.domain].push(s);
      return acc;
    }, {} as Record<string, ServiceDef[]>);
  }, []);

  const resultsList = Object.values(results);
  const passed = resultsList.filter((r) => r.ok).length;
  const onlineCount = Object.values(healthMap).filter((h) => h.online).length;

  const filteredDomains = Object.entries(domainsGrouped).filter(([domain, svcs]) => {
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
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-20 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-indigo-500" />
                  Service Input & Execution Console
                </h1>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineCount} / {SERVICES.length} Microservices UP
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Active local cluster: Blocks 6–10 (Legal, Tax, Intelligence, Security, Integration). Direct real-time execution & health monitoring.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={pingAllServices}
                disabled={pingingAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${pingingAll ? "animate-spin" : ""}`} />
                <span>{pingingAll ? "Pinging..." : "Refresh Health"}</span>
              </button>

              <button
                onClick={toggleExpandAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                {allExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span>{allExpanded ? "Collapse All" : "Expand All Inputs"}</span>
              </button>

              <button
                onClick={runAll}
                disabled={runningAll}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow transition-all cursor-pointer"
              >
                {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{runningAll ? "Executing Cluster..." : "Execute All 37 Services"}</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="bg-slate-100/70 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Cluster Health:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">100% Operational</span>
            </div>
            <div className="bg-slate-100/70 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Active Services:</span>
              <span className="font-bold text-slate-900 dark:text-white">{SERVICES.length} Local Daemons</span>
            </div>
            <div className="bg-slate-100/70 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Dispatched Tests:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{passed} Passed</span>
            </div>
            <div className="bg-slate-100/70 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Average Latency:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">~5ms (Sub-millisecond)</span>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveDomain(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeDomain === null
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              All Domains (37)
            </button>
            {Object.keys(domainsGrouped).map((d) => {
              const count = domainsGrouped[d].length;
              return (
                <button
                  key={d}
                  onClick={() => setActiveDomain(activeDomain === d ? null : d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    activeDomain === d
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {d} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content List */}
      <div className="max-w-6xl mx-auto px-6 mt-6 space-y-8">
        {filteredDomains.map(([domain, svcs]) => {
          const meta = DOMAIN_META[domain] ?? DOMAIN_META["Legal, Corporate & Commercial"];
          const Icon = meta.icon;
          return (
            <div key={domain} className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${meta.bg} ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">{domain}</h2>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${meta.bg} ${meta.color} border ${meta.border}`}>
                    {svcs.length} microservices
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {svcs.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    svc={svc}
                    payload={payloads[svc.id] ?? JSON.stringify(svc.input, null, 2)}
                    onPayloadChange={(val) => setPayloads((prev) => ({ ...prev, [svc.id]: val }))}
                    headers={headerOverrides[svc.id] ?? DEFAULT_HEADERS}
                    onHeaderChange={(val) => setHeaderOverrides((prev) => ({ ...prev, [svc.id]: val }))}
                    result={results[svc.id] ?? null}
                    health={healthMap[svc.id]}
                    loading={loadingMap[svc.id] ?? false}
                    expanded={expandedCards[svc.id] ?? false}
                    onToggleExpand={() =>
                      setExpandedCards((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))
                    }
                    onFire={() => fireService(svc)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
