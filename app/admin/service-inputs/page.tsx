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
  "Legal, Corporate & Commercial": "/admin/commercial-ops",
  "Tax & Compliance": "/admin/tax",
  "Intelligence & Reporting": "/admin/governance",
  "Security & Trust": "/admin/audit-events",
  "Integration & Extensibility": "/admin/settings"
};

export const SERVICES: ServiceDefinition[] = [
  {
    "id": 1,
    "domain": "Legal, Corporate & Commercial",
    "name": "contract-lifecycle-svc",
    "port": 8119,
    "method": "POST",
    "path": "/api/v1/contracts",
    "description": "Draft a new binding commercial contract in the lifecycle system",
    "presentationText": "Initiates a formal contract record in the digital contract management pipeline. Inputs establish contract title, commercial agreement type, counterparty entity details, total committed value, and validity window.",
    "fieldDocs": [
      {
        "field": "title",
        "type": "string",
        "required": true,
        "description": "Official commercial title of the agreement",
        "example": "Enterprise Master Services Agreement — GlobalCloud Inc"
      },
      {
        "field": "contract_type",
        "type": "enum",
        "required": true,
        "description": "Contract classification (MSA | SLA | NDA | VENDOR)",
        "example": "MSA"
      },
      {
        "field": "counterparty_id",
        "type": "string",
        "required": true,
        "description": "KYC-verified counterparty identity code",
        "example": "cp-globalcloud-01"
      },
      {
        "field": "counterparty_name",
        "type": "string",
        "required": true,
        "description": "Legal entity name of counterparty",
        "example": "GlobalCloud Inc"
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Contract financial valuation currency",
        "example": "GBP"
      },
      {
        "field": "total_value",
        "type": "number",
        "required": true,
        "description": "Total committed commercial value of contract",
        "example": 320000
      },
      {
        "field": "effective_from",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Date when contract terms become legally binding",
        "example": "2026-10-01T00:00:00Z"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Lifecycle stage (DRAFT | PENDING_APPROVAL | ACTIVE)",
        "example": "DRAFT"
      }
    ],
    "input": {
      "title": "Enterprise Master Services Agreement — GlobalCloud Inc",
      "contract_type": "MSA",
      "counterparty_id": "cp-globalcloud-01",
      "counterparty_name": "GlobalCloud Inc",
      "currency": "GBP",
      "total_value": 320000,
      "effective_from": "2026-10-01T00:00:00Z",
      "status": "DRAFT"
    }
  },
  {
    "id": 2,
    "domain": "Legal, Corporate & Commercial",
    "name": "clause-template-svc",
    "port": 8120,
    "method": "POST",
    "path": "/api/v1/clauses",
    "description": "Register a new approved standard legal clause template",
    "presentationText": "Registers an approved standard boilerplate legal clause template (e.g. GDPR Data Processing, Indemnity, Force Majeure, IP Ownership) for automated contract authoring.",
    "fieldDocs": [
      {
        "field": "title",
        "type": "string",
        "required": true,
        "description": "Descriptive name of standard clause",
        "example": "UK GDPR Standard Model Clauses 2026"
      },
      {
        "field": "category",
        "type": "enum",
        "required": true,
        "description": "Legal area (DATA_PROTECTION | LIABILITY | CONFIDENTIALITY)",
        "example": "DATA_PROTECTION"
      },
      {
        "field": "body",
        "type": "string",
        "required": true,
        "description": "Full authoritative legal clause text",
        "example": "The Data Processor shall process personal data solely in accordance with documented instructions..."
      },
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Governing legal jurisdiction",
        "example": "GB"
      },
      {
        "field": "is_standard",
        "type": "boolean",
        "required": true,
        "description": "Whether this clause is an approved company standard",
        "example": true
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Governance approval status (APPROVED | PENDING)",
        "example": "APPROVED"
      }
    ],
    "input": {
      "title": "UK GDPR Standard Model Clauses 2026",
      "category": "DATA_PROTECTION",
      "body": "The Data Processor shall process personal data solely in accordance with documented instructions of the Data Controller.",
      "jurisdiction_id": "GB",
      "is_standard": true,
      "status": "APPROVED"
    }
  },
  {
    "id": 3,
    "domain": "Legal, Corporate & Commercial",
    "name": "obligation-tracking-svc",
    "port": 8121,
    "method": "POST",
    "path": "/api/v1/obligations",
    "description": "Track a binding contractual obligation with deadline and risk level",
    "presentationText": "Registers and tracks compliance with binding contractual deliverables, audit deliverables, insurance renewals, and service level agreements (SLAs).",
    "fieldDocs": [
      {
        "field": "contract_id",
        "type": "string",
        "required": true,
        "description": "Associated contract reference ID",
        "example": "c-001"
      },
      {
        "field": "title",
        "type": "string",
        "required": true,
        "description": "Milestone or obligation summary",
        "example": "Annual ISO 27001 SOC-2 Type II Audit Certification"
      },
      {
        "field": "description",
        "type": "string",
        "required": false,
        "description": "Detailed fulfillment instructions and criteria",
        "example": "Deliver renewed SOC-2 Type II certification report"
      },
      {
        "field": "due_date",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Contractual delivery deadline",
        "example": "2026-12-15T00:00:00Z"
      },
      {
        "field": "risk_level",
        "type": "enum",
        "required": true,
        "description": "Breach impact severity (HIGH | MEDIUM | LOW)",
        "example": "HIGH"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Fulfillment state (PENDING | MET | BREACHED)",
        "example": "PENDING"
      }
    ],
    "input": {
      "contract_id": "c-001",
      "title": "Annual ISO 27001 SOC-2 Type II Audit Certification",
      "description": "Deliver renewed SOC-2 Type II certification report to counterparty legal department",
      "due_date": "2026-12-15T00:00:00Z",
      "risk_level": "HIGH",
      "status": "PENDING"
    }
  },
  {
    "id": 4,
    "domain": "Legal, Corporate & Commercial",
    "name": "board-resolutions-svc",
    "port": 8122,
    "method": "POST",
    "path": "/api/v1/meetings",
    "description": "Schedule a board meeting or audit committee assembly",
    "presentationText": "Registers and schedules formal corporate governance meetings of the Board of Directors or Audit Committee, configuring quorum requirements, agenda topics, and location.",
    "fieldDocs": [
      {
        "field": "meeting_type",
        "type": "enum",
        "required": true,
        "description": "Meeting category (BOARD_OF_DIRECTORS | AUDIT_COMMITTEE | AGM)",
        "example": "BOARD_OF_DIRECTORS"
      },
      {
        "field": "title",
        "type": "string",
        "required": true,
        "description": "Official meeting agenda title",
        "example": "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting"
      },
      {
        "field": "scheduled_date",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Scheduled meeting start time",
        "example": "2026-09-25T14:00:00Z"
      },
      {
        "field": "location",
        "type": "string",
        "required": false,
        "description": "Physical room or encrypted video assembly link",
        "example": "London HQ / Virtual Boardroom"
      },
      {
        "field": "quorum_required",
        "type": "number",
        "required": true,
        "description": "Minimum number of voting directors needed",
        "example": 3
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Meeting status (SCHEDULED | ADJOURNED)",
        "example": "SCHEDULED"
      }
    ],
    "input": {
      "meeting_type": "BOARD_OF_DIRECTORS",
      "title": "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting",
      "scheduled_date": "2026-09-25T14:00:00Z",
      "location": "London HQ / Virtual Boardroom",
      "quorum_required": 3,
      "status": "SCHEDULED"
    }
  },
  {
    "id": 5,
    "domain": "Legal, Corporate & Commercial",
    "name": "corporate-actions-svc",
    "port": 8123,
    "method": "POST",
    "path": "/api/v1/corporate-actions",
    "description": "Execute a statutory corporate action (dividend, share grant, restructuring)",
    "presentationText": "Records authorized corporate governance capital allocations, dividend disbursements, director appointments, or statutory filings requiring formal minute references.",
    "fieldDocs": [
      {
        "field": "action_type",
        "type": "enum",
        "required": true,
        "description": "Corporate action category (DIVIDEND | EQUITY_INCENTIVE_GRANT | CAPITAL_INCREASE)",
        "example": "EQUITY_INCENTIVE_GRANT"
      },
      {
        "field": "description",
        "type": "string",
        "required": true,
        "description": "Summary of transaction and corporate purpose",
        "example": "Series-B Executive Long-Term Equity Incentive Plan Allocation"
      },
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Governing jurisdiction",
        "example": "GB"
      },
      {
        "field": "effective_date",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Statutory effective execution date",
        "example": "2026-10-01T00:00:00Z"
      },
      {
        "field": "requires_board_approval",
        "type": "boolean",
        "required": true,
        "description": "Whether explicit board resolution quorum is required",
        "example": true
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Governance progress (PENDING_APPROVAL | EXECUTED)",
        "example": "PENDING_APPROVAL"
      }
    ],
    "input": {
      "action_type": "EQUITY_INCENTIVE_GRANT",
      "description": "Series-B Executive Long-Term Equity Incentive Plan Allocation",
      "jurisdiction_id": "GB",
      "effective_date": "2026-10-01T00:00:00Z",
      "requires_board_approval": true,
      "status": "PENDING_APPROVAL"
    }
  },
  {
    "id": 6,
    "domain": "Legal, Corporate & Commercial",
    "name": "counterparty-management-svc",
    "port": 8124,
    "method": "POST",
    "path": "/api/v1/counterparties",
    "description": "Register a KYC-verified enterprise commercial counterparty",
    "presentationText": "Registers and maintains legal verification, jurisdictional nexus, and AML/KYC validation for commercial trading partners, clients, and corporate suppliers.",
    "fieldDocs": [
      {
        "field": "legal_name",
        "type": "string",
        "required": true,
        "description": "Registered legal business entity name",
        "example": "Apex Networks Global GmbH"
      },
      {
        "field": "country_code",
        "type": "string (ISO-3166)",
        "required": true,
        "description": "Incorporation jurisdiction code",
        "example": "DE"
      },
      {
        "field": "entity_type",
        "type": "enum",
        "required": true,
        "description": "Corporate formation type (CORPORATION | LLC | PARTNERSHIP)",
        "example": "CORPORATION"
      },
      {
        "field": "kyc_status",
        "type": "enum",
        "required": true,
        "description": "Due diligence verification state (VERIFIED | PENDING | REJECTED)",
        "example": "VERIFIED"
      },
      {
        "field": "risk_rating",
        "type": "enum",
        "required": true,
        "description": "Counterparty risk classification (LOW | MEDIUM | HIGH)",
        "example": "LOW"
      },
      {
        "field": "registered_address",
        "type": "string",
        "required": true,
        "description": "Official corporate statutory seat",
        "example": "Friedrichstraße 42, 10117 Berlin, Germany"
      }
    ],
    "input": {
      "legal_name": "Apex Networks Global GmbH",
      "country_code": "DE",
      "entity_type": "CORPORATION",
      "kyc_status": "VERIFIED",
      "risk_rating": "LOW",
      "registered_address": "Friedrichstraße 42, 10117 Berlin, Germany"
    }
  },
  {
    "id": 7,
    "domain": "Legal, Corporate & Commercial",
    "name": "purchase-request-svc",
    "port": 8100,
    "method": "POST",
    "path": "/api/v1/purchase-requests",
    "description": "Submit a commercial purchase requisition with budget approval parameters",
    "presentationText": "Submits an authoritative purchase requisition into the procurement pipeline upstream of the purchase order lifecycle. Configures legal entity, amount, currency, and justification awaiting dual-quorum approval.",
    "fieldDocs": [
      {
        "field": "legal_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "UUID of the procuring legal entity",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "description",
        "type": "string",
        "required": true,
        "description": "Commercial business description & purpose",
        "example": "Enterprise Cloud Infrastructure & High-Performance Compute Cluster Q3-2026"
      },
      {
        "field": "amount",
        "type": "number (float)",
        "required": true,
        "description": "Requisition commitment value",
        "example": 45000
      },
      {
        "field": "currency_code",
        "type": "string (ISO-4217)",
        "required": true,
        "description": "Procurement budget currency",
        "example": "GBP"
      },
      {
        "field": "department",
        "type": "string",
        "required": false,
        "description": "Originating internal department",
        "example": "Engineering & IT Infrastructure"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Initial lifecycle state (PENDING | APPROVED)",
        "example": "PENDING"
      }
    ],
    "input": {
      "legal_entity_id": "22222222-2222-2222-2222-222222222222",
      "description": "Enterprise Cloud Infrastructure & High-Performance Compute Cluster Q3-2026",
      "amount": 45000,
      "currency_code": "GBP",
      "department": "Engineering & IT Infrastructure",
      "status": "PENDING"
    }
  },
  {
    "id": 8,
    "domain": "Legal, Corporate & Commercial",
    "name": "purchase-order-svc",
    "port": 8129,
    "method": "POST",
    "path": "/api/v1/purchase-orders",
    "description": "Issue a binding purchase order against an approved supplier requisition",
    "presentationText": "Creates a formal commercial purchase order committed against an approved requisition, vendor identity, agreed delivery timeline, and billing currency.",
    "fieldDocs": [
      {
        "field": "supplier_name",
        "type": "string",
        "required": true,
        "description": "Approved commercial supplier legal entity name",
        "example": "Global Datacenters Ltd"
      },
      {
        "field": "vendor_id",
        "type": "string",
        "required": true,
        "description": "Supplier reference code in vendor ledger",
        "example": "v-gdc-01"
      },
      {
        "field": "po_number",
        "type": "string",
        "required": true,
        "description": "Unique tracking purchase order reference",
        "example": "PO-2026-09-001"
      },
      {
        "field": "total_amount",
        "type": "number",
        "required": true,
        "description": "Committed monetary value of purchase order",
        "example": 75000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Purchase order billing currency",
        "example": "GBP"
      },
      {
        "field": "delivery_date",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Contractual delivery fulfillment deadline",
        "example": "2026-11-15T00:00:00Z"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "PO lifecycle state (DRAFT | ISSUED | FULFILLED)",
        "example": "ISSUED"
      }
    ],
    "input": {
      "supplier_name": "Global Datacenters Ltd",
      "vendor_id": "v-gdc-01",
      "po_number": "PO-2026-09-001",
      "total_amount": 75000,
      "currency": "GBP",
      "delivery_date": "2026-11-15T00:00:00Z",
      "status": "ISSUED"
    }
  },
  {
    "id": 9,
    "domain": "Legal, Corporate & Commercial",
    "name": "spend-controls-svc",
    "port": 8131,
    "method": "POST",
    "path": "/api/v1/spend-controls/limits",
    "description": "Configure statutory departmental spend limits and policy thresholds",
    "presentationText": "Establishes budget ceiling constraints, warning notification margins, and hard automated cut-offs for departmental or cost-center operational expenditure.",
    "fieldDocs": [
      {
        "field": "legal_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "Entity to which the spend policy applies",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "category",
        "type": "enum",
        "required": true,
        "description": "Expenditure classification category",
        "example": "IT_INFRASTRUCTURE"
      },
      {
        "field": "period",
        "type": "enum",
        "required": true,
        "description": "Budget tracking frequency (MONTHLY | QUARTERLY | ANNUAL)",
        "example": "QUARTERLY"
      },
      {
        "field": "limit_amount",
        "type": "number",
        "required": true,
        "description": "Authorized expenditure cap",
        "example": 250000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Operating currency code",
        "example": "GBP"
      },
      {
        "field": "threshold_warning_percentage",
        "type": "number",
        "required": true,
        "description": "Threshold percentage to trigger advisory warning",
        "example": 85
      },
      {
        "field": "hard_stop_enforced",
        "type": "boolean",
        "required": true,
        "description": "Whether transactions exceeding cap are rejected automatically",
        "example": true
      }
    ],
    "input": {
      "legal_entity_id": "22222222-2222-2222-2222-222222222222",
      "category": "IT_INFRASTRUCTURE",
      "period": "QUARTERLY",
      "limit_amount": 250000,
      "currency": "GBP",
      "threshold_warning_percentage": 85,
      "hard_stop_enforced": true
    }
  },
  {
    "id": 10,
    "domain": "Legal, Corporate & Commercial",
    "name": "vendor-due-diligence-svc",
    "port": 8132,
    "method": "POST",
    "path": "/api/v1/vendor-due-diligence/checks",
    "description": "Run comprehensive AML, sanctions, and financial due diligence check on a vendor",
    "presentationText": "Executes automated anti-money-laundering (AML), politically exposed persons (PEP), and OFAC/EU sanctions screening against international supplier rosters.",
    "fieldDocs": [
      {
        "field": "vendor_id",
        "type": "string",
        "required": true,
        "description": "Identifier of target vendor under review",
        "example": "v-apex-01"
      },
      {
        "field": "vendor_name",
        "type": "string",
        "required": true,
        "description": "Legal name of supplier",
        "example": "Apex Networks Global GmbH"
      },
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Vendor registration country",
        "example": "DE"
      },
      {
        "field": "check_type",
        "type": "enum",
        "required": true,
        "description": "Screening tier (STANDARD_KYC | ENHANCED_DUE_DILIGENCE)",
        "example": "ENHANCED_DUE_DILIGENCE"
      },
      {
        "field": "sanctions_screening",
        "type": "boolean",
        "required": true,
        "description": "Screen against UN, OFAC, and EU sanctions lists",
        "example": true
      },
      {
        "field": "risk_tier",
        "type": "enum",
        "required": true,
        "description": "Expected baseline risk (LOW | MEDIUM | HIGH)",
        "example": "LOW"
      }
    ],
    "input": {
      "vendor_id": "v-apex-01",
      "vendor_name": "Apex Networks Global GmbH",
      "jurisdiction_id": "DE",
      "check_type": "ENHANCED_DUE_DILIGENCE",
      "sanctions_screening": true,
      "risk_tier": "LOW"
    }
  },
  {
    "id": 11,
    "domain": "Legal, Corporate & Commercial",
    "name": "procurement-workflow-svc",
    "port": 8134,
    "method": "POST",
    "path": "/api/v1/procurement-workflows",
    "description": "Initiate an automated multi-tier procurement approval & governance workflow",
    "presentationText": "Initiates an automated procurement approval pipeline enforcing dual-quorum thresholds, spend policy validation, segregation of duties, and vendor compliance checks.",
    "fieldDocs": [
      {
        "field": "workflow_name",
        "type": "string",
        "required": true,
        "description": "Name of the procurement workflow execution",
        "example": "Q3-2026 Enterprise Hardware Procurement Approval"
      },
      {
        "field": "purchase_request_id",
        "type": "string",
        "required": true,
        "description": "Associated purchase request identifier",
        "example": "preq-2026-9912"
      },
      {
        "field": "approval_tier",
        "type": "enum",
        "required": true,
        "description": "Threshold tier (TIER_1_STANDARD | TIER_2_EXECUTIVE | TIER_3_BOARD)",
        "example": "TIER_2_EXECUTIVE"
      },
      {
        "field": "threshold_amount",
        "type": "number",
        "required": true,
        "description": "Escalation ceiling amount",
        "example": 50000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Operating transaction currency",
        "example": "GBP"
      },
      {
        "field": "sod_enforced",
        "type": "boolean",
        "required": true,
        "description": "Enforce strict Segregation of Duties",
        "example": true
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Workflow execution status (IN_PROGRESS | APPROVED)",
        "example": "IN_PROGRESS"
      }
    ],
    "input": {
      "workflow_name": "Q3-2026 Enterprise Hardware Procurement Approval",
      "purchase_request_id": "preq-2026-9912",
      "approval_tier": "TIER_2_EXECUTIVE",
      "threshold_amount": 50000,
      "currency": "GBP",
      "sod_enforced": true,
      "status": "IN_PROGRESS"
    }
  },
  {
    "id": 12,
    "domain": "Tax & Compliance",
    "name": "tax-rules-svc",
    "port": 8125,
    "method": "POST",
    "path": "/api/v1/tax-rules",
    "description": "Register a statutory tax rate rule for a jurisdiction",
    "presentationText": "Registers an authoritative statutory tax rate rule for an official tax jurisdiction (e.g. HMRC UK, IRS US, IRAS SG). Inputs configure classification, percentage rate, exemptions, and validity dates.",
    "fieldDocs": [
      {
        "field": "jurisdiction_id",
        "type": "string (ISO-3166)",
        "required": true,
        "description": "Official sovereign jurisdiction code",
        "example": "GB"
      },
      {
        "field": "rule_code",
        "type": "string",
        "required": true,
        "description": "Unique regulatory rule identifier",
        "example": "UK-VAT-REDUCED-5"
      },
      {
        "field": "name",
        "type": "string",
        "required": true,
        "description": "Official statutory tax rule name",
        "example": "UK Domestic Energy Reduced Rate 5%"
      },
      {
        "field": "category",
        "type": "enum",
        "required": true,
        "description": "Tax category (VAT | GST | SALES_TAX | CORPORATE_INCOME)",
        "example": "VAT"
      },
      {
        "field": "tax_rate_percentage",
        "type": "number (float)",
        "required": true,
        "description": "Statutory percentage tax rate to apply",
        "example": 5
      },
      {
        "field": "standard_deductions",
        "type": "number",
        "required": false,
        "description": "Statutory base deduction before tax computation",
        "example": 0
      },
      {
        "field": "exemptions_json",
        "type": "string (JSON)",
        "required": false,
        "description": "Conditional exemption criteria in JSON format",
        "example": "{\"domestic_energy\":true}"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Regulatory rule state (ACTIVE | DRAFT | DEPRECATED)",
        "example": "ACTIVE"
      },
      {
        "field": "version",
        "type": "number",
        "required": true,
        "description": "Monotonically increasing rule version number",
        "example": 1
      },
      {
        "field": "effective_from",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "UTC timestamp from which this tax rule is in effect",
        "example": "2026-09-01T00:00:00Z"
      }
    ],
    "input": {
      "jurisdiction_id": "GB",
      "rule_code": "UK-VAT-REDUCED-5",
      "name": "UK Domestic Energy Reduced Rate 5%",
      "category": "VAT",
      "tax_rate_percentage": 5,
      "standard_deductions": 0,
      "exemptions_json": "{\"domestic_energy\":true}",
      "status": "ACTIVE",
      "version": 1,
      "effective_from": "2026-09-01T00:00:00Z"
    }
  },
  {
    "id": 13,
    "domain": "Tax & Compliance",
    "name": "tax-determination-svc",
    "port": 8126,
    "method": "POST",
    "path": "/api/v1/tax-determinations",
    "description": "Evaluate applicable tax and calculate liabilities on a commercial invoice",
    "presentationText": "Evaluates an accounts payable invoice, sales receipt, or purchase order against active jurisdiction tax rules. Computes net taxable base, applicable tax liability, and line-item tax breakdown.",
    "fieldDocs": [
      {
        "field": "transaction_id",
        "type": "string",
        "required": true,
        "description": "Upstream commercial transaction reference identifier",
        "example": "tx-inv-2026-8841"
      },
      {
        "field": "source_module",
        "type": "enum",
        "required": true,
        "description": "Originating ERP module (ACCOUNTS_PAYABLE | SALES | GL)",
        "example": "ACCOUNTS_PAYABLE"
      },
      {
        "field": "legal_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "UUID of the reporting legal entity",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Jurisdiction code where tax nexus applies",
        "example": "GB"
      },
      {
        "field": "tax_category",
        "type": "enum",
        "required": true,
        "description": "Target tax category to evaluate against",
        "example": "VAT"
      },
      {
        "field": "gross_amount",
        "type": "number (float)",
        "required": true,
        "description": "Total invoice gross commercial value",
        "example": 150000
      },
      {
        "field": "taxable_amount",
        "type": "number (float)",
        "required": true,
        "description": "Portion of gross amount subject to tax",
        "example": 150000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Invoice denomination currency",
        "example": "GBP"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Determination state (CALCULATED | COMMITTED)",
        "example": "CALCULATED"
      }
    ],
    "input": {
      "transaction_id": "tx-inv-2026-8841",
      "source_module": "ACCOUNTS_PAYABLE",
      "legal_entity_id": "22222222-2222-2222-2222-222222222222",
      "jurisdiction_id": "GB",
      "tax_category": "VAT",
      "gross_amount": 150000,
      "taxable_amount": 150000,
      "currency": "GBP",
      "status": "CALCULATED"
    }
  },
  {
    "id": 14,
    "domain": "Tax & Compliance",
    "name": "vat-gst-svc",
    "port": 8127,
    "method": "POST",
    "path": "/api/v1/vat-returns",
    "description": "Compile and file statutory periodic VAT / GST return",
    "presentationText": "Aggregates sales output VAT and purchase input VAT across general ledger transactions for an accounting period. Computes net statutory liability or reclaim due.",
    "fieldDocs": [
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Filing jurisdiction authority",
        "example": "GB"
      },
      {
        "field": "tax_registration_number",
        "type": "string",
        "required": true,
        "description": "Corporate VAT registration number",
        "example": "GB998877665"
      },
      {
        "field": "tax_period",
        "type": "string",
        "required": true,
        "description": "Statutory filing quarter / month (e.g. 2026-Q2)",
        "example": "2026-Q2"
      },
      {
        "field": "total_sales_amount",
        "type": "number (float)",
        "required": true,
        "description": "Total commercial sales subject to VAT",
        "example": 500000
      },
      {
        "field": "total_purchase_amount",
        "type": "number (float)",
        "required": true,
        "description": "Allowable purchases subject to input VAT reclaim",
        "example": 200000
      },
      {
        "field": "output_tax_amount",
        "type": "number (float)",
        "required": true,
        "description": "Total VAT collected on sales",
        "example": 100000
      },
      {
        "field": "input_tax_amount",
        "type": "number (float)",
        "required": true,
        "description": "Total VAT paid on allowable expenses",
        "example": 40000
      },
      {
        "field": "net_tax_payable",
        "type": "number (float)",
        "required": true,
        "description": "Net payable to revenue authority (output - input)",
        "example": 60000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Filing currency denomination",
        "example": "GBP"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Return lifecycle (DRAFT | SUBMITTED | ACCEPTED)",
        "example": "DRAFT"
      }
    ],
    "input": {
      "jurisdiction_id": "GB",
      "tax_registration_number": "GB998877665",
      "tax_period": "2026-Q2",
      "total_sales_amount": 500000,
      "total_purchase_amount": 200000,
      "output_tax_amount": 100000,
      "input_tax_amount": 40000,
      "net_tax_payable": 60000,
      "currency": "GBP",
      "status": "DRAFT"
    }
  },
  {
    "id": 15,
    "domain": "Tax & Compliance",
    "name": "corporate-tax-svc",
    "port": 8128,
    "method": "POST",
    "path": "/api/v1/corporate-tax-returns",
    "description": "Submit annual statutory corporate income tax assessment (Form 1120 / CT600)",
    "presentationText": "Computes and archives annual corporate income tax returns (such as UK HMRC CT600 or US IRS Form 1120). Balances gross revenue against allowable deductions to compute net tax liability.",
    "fieldDocs": [
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Tax filing country",
        "example": "GB"
      },
      {
        "field": "tax_registration_number",
        "type": "string",
        "required": true,
        "description": "Unique Taxpayer Reference (UTR / EIN)",
        "example": "GB-CT-443322"
      },
      {
        "field": "fiscal_year",
        "type": "number",
        "required": true,
        "description": "Filing accounting fiscal year",
        "example": 2026
      },
      {
        "field": "accounting_period_start",
        "type": "string (date)",
        "required": true,
        "description": "Beginning date of reporting fiscal window",
        "example": "2026-01-01"
      },
      {
        "field": "accounting_period_end",
        "type": "string (date)",
        "required": true,
        "description": "Ending date of reporting fiscal window",
        "example": "2026-12-31"
      },
      {
        "field": "gross_revenue",
        "type": "number",
        "required": true,
        "description": "Total recognized commercial entity revenue",
        "example": 3500000
      },
      {
        "field": "allowable_deductions",
        "type": "number",
        "required": true,
        "description": "Total recognized statutory business deductions",
        "example": 2100000
      },
      {
        "field": "taxable_income",
        "type": "number",
        "required": true,
        "description": "Net taxable profit before tax credits",
        "example": 1400000
      },
      {
        "field": "tax_rate_percent",
        "type": "number",
        "required": true,
        "description": "Statutory corporate tax percentage rate applied",
        "example": 25
      },
      {
        "field": "gross_tax_liability",
        "type": "number",
        "required": true,
        "description": "Computed gross tax liability",
        "example": 350000
      },
      {
        "field": "tax_credits",
        "type": "number",
        "required": false,
        "description": "Allowable R&D or investment tax credits",
        "example": 25000
      },
      {
        "field": "net_tax_payable",
        "type": "number",
        "required": true,
        "description": "Final statutory amount due to revenue authority",
        "example": 325000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Filing corporate tax currency",
        "example": "GBP"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Filing state (DRAFT | PENDING_REVIEW | SUBMITTED)",
        "example": "DRAFT"
      }
    ],
    "input": {
      "jurisdiction_id": "GB",
      "tax_registration_number": "GB-CT-443322",
      "fiscal_year": 2026,
      "accounting_period_start": "2026-01-01",
      "accounting_period_end": "2026-12-31",
      "gross_revenue": 3500000,
      "allowable_deductions": 2100000,
      "taxable_income": 1400000,
      "tax_rate_percent": 25,
      "gross_tax_liability": 350000,
      "tax_credits": 25000,
      "net_tax_payable": 325000,
      "currency": "GBP",
      "status": "DRAFT"
    }
  },
  {
    "id": 16,
    "domain": "Tax & Compliance",
    "name": "withholding-tax-svc",
    "port": 8129,
    "method": "POST",
    "path": "/api/v1/withholding-tax",
    "description": "Register cross-border withholding tax obligations (WHT on royalties/dividends)",
    "presentationText": "Evaluates international double taxation treaties (DTA) and registers statutory withholding tax obligations on outbound IP royalties, consulting fees, and shareholder dividend payments.",
    "fieldDocs": [
      {
        "field": "legal_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "UUID of the remitting legal entity",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "recipient_jurisdiction",
        "type": "string",
        "required": true,
        "description": "Beneficiary tax residency jurisdiction",
        "example": "US"
      },
      {
        "field": "recipient_name",
        "type": "string",
        "required": true,
        "description": "Beneficial owner entity legal name",
        "example": "CloudTech IP Holdings Delaware LLC"
      },
      {
        "field": "payment_type",
        "type": "enum",
        "required": true,
        "description": "Classification of payment (ROYALTIES | DIVIDENDS | SERVICES)",
        "example": "ROYALTIES"
      },
      {
        "field": "gross_payment_amount",
        "type": "number",
        "required": true,
        "description": "Total remittance amount before tax withholding",
        "example": 100000
      },
      {
        "field": "treaty_rate_percent",
        "type": "number",
        "required": true,
        "description": "Applicable DTA treaty withholding rate percent",
        "example": 15
      },
      {
        "field": "withholding_tax_amount",
        "type": "number",
        "required": true,
        "description": "Calculated statutory tax withheld for domestic revenue",
        "example": 15000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Remittance contract currency",
        "example": "GBP"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Obligation state (DRAFT | WITHHELD | REMITTED)",
        "example": "DRAFT"
      }
    ],
    "input": {
      "legal_entity_id": "22222222-2222-2222-2222-222222222222",
      "recipient_jurisdiction": "US",
      "recipient_name": "CloudTech IP Holdings Delaware LLC",
      "payment_type": "ROYALTIES",
      "gross_payment_amount": 100000,
      "treaty_rate_percent": 15,
      "withholding_tax_amount": 15000,
      "currency": "GBP",
      "status": "DRAFT"
    }
  },
  {
    "id": 17,
    "domain": "Tax & Compliance",
    "name": "filing-preparation-svc",
    "port": 8130,
    "method": "POST",
    "path": "/api/v1/filing-preparation/drafts",
    "description": "Compile and stage comprehensive audit evidence tax return package",
    "presentationText": "Assembles line-item transaction evidence, reconciliation workpapers, and jurisdiction calculation schedules into an immutable audit-ready tax filing draft.",
    "fieldDocs": [
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Target statutory tax authority jurisdiction",
        "example": "GB"
      },
      {
        "field": "filing_type",
        "type": "enum",
        "required": true,
        "description": "Statutory filing classification (VAT_RETURN | CORP_TAX | WHT)",
        "example": "VAT_RETURN"
      },
      {
        "field": "tax_period",
        "type": "string",
        "required": true,
        "description": "Accounting calendar period under review",
        "example": "2026-Q3"
      },
      {
        "field": "entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "UUID of the filing corporate subsidiary",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "prepared_by",
        "type": "string",
        "required": true,
        "description": "Tax manager or CPA officer username",
        "example": "lead.tax.cpa@zoiko.internal"
      },
      {
        "field": "notes",
        "type": "string",
        "required": false,
        "description": "Audit commentary and material variance explanations",
        "example": "Includes cross-border cloud software sales VAT adjustments under HMRC rules"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Draft preparation stage (DRAFT | AUDIT_VERIFIED | READY_TO_FILE)",
        "example": "DRAFT"
      }
    ],
    "input": {
      "jurisdiction_id": "GB",
      "filing_type": "VAT_RETURN",
      "tax_period": "2026-Q3",
      "entity_id": "22222222-2222-2222-2222-222222222222",
      "prepared_by": "lead.tax.cpa@zoiko.internal",
      "notes": "Includes cross-border cloud software sales VAT adjustments under HMRC rules",
      "status": "DRAFT"
    }
  },
  {
    "id": 18,
    "domain": "Tax & Compliance",
    "name": "filing-tracker-svc",
    "port": 8131,
    "method": "POST",
    "path": "/api/v1/filing-tracker/requirements",
    "description": "Register a statutory filing deadline and regulatory calendar milestone",
    "presentationText": "Maintains an authoritative regulatory filing calendar across jurisdictions, tracking mandatory due dates, responsible departments, and penalty escalation rules.",
    "fieldDocs": [
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Sovereign jurisdiction code",
        "example": "GB"
      },
      {
        "field": "filing_name",
        "type": "string",
        "required": true,
        "description": "Statutory return name",
        "example": "HMRC MTD VAT Return Q3 2026"
      },
      {
        "field": "statutory_deadline",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Hard regulatory filing cutoff deadline",
        "example": "2026-11-07T23:59:59Z"
      },
      {
        "field": "frequency",
        "type": "enum",
        "required": true,
        "description": "Filing frequency (MONTHLY | QUARTERLY | ANNUAL)",
        "example": "QUARTERLY"
      },
      {
        "field": "reporting_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "Legal entity responsible for filing",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Filing status (PENDING | IN_PROGRESS | SUBMITTED)",
        "example": "PENDING"
      }
    ],
    "input": {
      "jurisdiction_id": "GB",
      "filing_name": "HMRC MTD VAT Return Q3 2026",
      "statutory_deadline": "2026-11-07T23:59:59Z",
      "frequency": "QUARTERLY",
      "reporting_entity_id": "22222222-2222-2222-2222-222222222222",
      "status": "PENDING"
    }
  },
  {
    "id": 19,
    "domain": "Tax & Compliance",
    "name": "compliance-status-svc",
    "port": 8132,
    "method": "POST",
    "path": "/api/v1/compliance-status/evaluations",
    "description": "Submit an automated corporate compliance & audit-readiness health evaluation",
    "presentationText": "Evaluates comprehensive organizational posture against statutory criteria, producing composite readiness grades and highlighting open regulatory findings.",
    "fieldDocs": [
      {
        "field": "domain",
        "type": "enum",
        "required": true,
        "description": "Governance domain evaluated (TAX | WORKFORCE | PAYROLL | FINANCE)",
        "example": "TAX"
      },
      {
        "field": "legal_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "UUID of the evaluated corporate entity",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "evaluation_scope",
        "type": "string",
        "required": true,
        "description": "Scope and criteria checklist evaluated",
        "example": "Statutory VAT Nexus & International Withholding Tax Audit Readiness"
      },
      {
        "field": "audit_readiness_score",
        "type": "number",
        "required": true,
        "description": "Composite audit preparedness percentage (0-100)",
        "example": 96.5
      },
      {
        "field": "unresolved_findings",
        "type": "number",
        "required": true,
        "description": "Number of open regulatory findings",
        "example": 0
      },
      {
        "field": "compliance_grade",
        "type": "enum",
        "required": true,
        "description": "Assigned grade (GRADE_A | GRADE_B | GRADE_C)",
        "example": "GRADE_A"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Evaluation state (COMPLETED | IN_REVIEW)",
        "example": "COMPLETED"
      }
    ],
    "input": {
      "domain": "TAX",
      "legal_entity_id": "22222222-2222-2222-2222-222222222222",
      "evaluation_scope": "Statutory VAT Nexus & International Withholding Tax Audit Readiness",
      "audit_readiness_score": 96.5,
      "unresolved_findings": 0,
      "compliance_grade": "GRADE_A",
      "status": "COMPLETED"
    }
  },
  {
    "id": 20,
    "domain": "Tax & Compliance",
    "name": "exception-escalation-svc",
    "port": 8133,
    "method": "POST",
    "path": "/api/v1/exception-escalation/exceptions",
    "description": "Escalate a compliance breach or governance policy violation",
    "presentationText": "Dispatches high-priority governance alerts when automated threshold monitors detect policy drift, unauthorized approvals, or missed statutory deadlines.",
    "fieldDocs": [
      {
        "field": "title",
        "type": "string",
        "required": true,
        "description": "Summary headline of compliance incident",
        "example": "Cross-Border Tax Nexus Withholding Rate Discrepancy"
      },
      {
        "field": "domain",
        "type": "enum",
        "required": true,
        "description": "Associated governance domain",
        "example": "TAX"
      },
      {
        "field": "severity",
        "type": "enum",
        "required": true,
        "description": "Incident severity (CRITICAL | HIGH | MEDIUM)",
        "example": "HIGH"
      },
      {
        "field": "triggering_event_id",
        "type": "string",
        "required": true,
        "description": "Reference ID of transaction or audit log that caused escalation",
        "example": "evt-tax-nexus-8812"
      },
      {
        "field": "escalated_to_role",
        "type": "string",
        "required": true,
        "description": "Role accountable for resolving breach",
        "example": "Chief Compliance Officer"
      },
      {
        "field": "assigned_investigator",
        "type": "string",
        "required": false,
        "description": "Investigating officer email or username",
        "example": "lead.auditor@zoiko.internal"
      },
      {
        "field": "action_required",
        "type": "string",
        "required": true,
        "description": "Mandatory remediation action",
        "example": "Recalculate WHT under US-UK DTA treaty Article 12 and update ledger"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Escalation lifecycle state (OPEN | UNDER_REVIEW | RESOLVED)",
        "example": "OPEN"
      }
    ],
    "input": {
      "title": "Cross-Border Tax Nexus Withholding Rate Discrepancy",
      "domain": "TAX",
      "severity": "HIGH",
      "triggering_event_id": "evt-tax-nexus-8812",
      "escalated_to_role": "Chief Compliance Officer",
      "assigned_investigator": "lead.auditor@zoiko.internal",
      "action_required": "Recalculate WHT under US-UK DTA treaty Article 12 and update ledger",
      "status": "OPEN"
    }
  },
  {
    "id": 21,
    "domain": "Intelligence & Reporting",
    "name": "anomaly-detection-svc",
    "port": 8134,
    "method": "POST",
    "path": "/api/v1/intelligence/anomalies/detect",
    "description": "Execute machine-learning anomaly detection scan across transaction streams",
    "presentationText": "Runs unsupervised statistical algorithms across accounts payable, journal entries, and payroll disbursements to isolate statistical outliers and fraudulent spikes.",
    "fieldDocs": [
      {
        "field": "domain",
        "type": "enum",
        "required": true,
        "description": "Target transaction domain (ACCOUNTS_PAYABLE | PAYROLL | TREASURY)",
        "example": "ACCOUNTS_PAYABLE"
      },
      {
        "field": "source_module",
        "type": "string",
        "required": true,
        "description": "Originating ledger subsystem",
        "example": "INVOICE_PROCESSING"
      },
      {
        "field": "sampling_window_days",
        "type": "number",
        "required": true,
        "description": "Historical baseline sampling window",
        "example": 90
      },
      {
        "field": "sensitivity_threshold",
        "type": "number (float)",
        "required": true,
        "description": "Statistical standard deviation sensitivity (e.g. 3.0 sigma)",
        "example": 3
      },
      {
        "field": "scan_type",
        "type": "enum",
        "required": true,
        "description": "Algorithm profile (ISOLATION_FOREST | Z_SCORE | AUTOENCODER)",
        "example": "ISOLATION_FOREST"
      },
      {
        "field": "flag_outliers_only",
        "type": "boolean",
        "required": true,
        "description": "Suppress standard baseline items in output",
        "example": true
      }
    ],
    "input": {
      "domain": "ACCOUNTS_PAYABLE",
      "source_module": "INVOICE_PROCESSING",
      "sampling_window_days": 90,
      "sensitivity_threshold": 3,
      "scan_type": "ISOLATION_FOREST",
      "flag_outliers_only": true
    }
  },
  {
    "id": 22,
    "domain": "Intelligence & Reporting",
    "name": "forecasting-svc",
    "port": 8135,
    "method": "POST",
    "path": "/api/v1/intelligence/forecasts",
    "description": "Generate predictive cash runway and statutory tax liability forecasts",
    "presentationText": "Projects multi-quarter financial trajectories incorporating seasonality, recurring vendor obligations, statutory tax dead-lines, and payroll commitments.",
    "fieldDocs": [
      {
        "field": "entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "Legal entity under forecasting review",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "metric",
        "type": "enum",
        "required": true,
        "description": "Target metric (TAX_LIABILITY | CASH_RUNWAY | OPEX_DISBURSEMENT)",
        "example": "TAX_LIABILITY"
      },
      {
        "field": "horizon_months",
        "type": "number",
        "required": true,
        "description": "Forward forecast horizon in months",
        "example": 12
      },
      {
        "field": "confidence_interval_percent",
        "type": "number",
        "required": true,
        "description": "Statistical confidence interval band (95%)",
        "example": 95
      },
      {
        "field": "seasonality_adjusted",
        "type": "boolean",
        "required": true,
        "description": "Adjust for quarter-end fiscal spikes",
        "example": true
      },
      {
        "field": "model_type",
        "type": "enum",
        "required": true,
        "description": "Predictive model (ARIMA_BAYESIAN | PROPHET | LINEAR_REGRESSION)",
        "example": "ARIMA_BAYESIAN"
      }
    ],
    "input": {
      "entity_id": "22222222-2222-2222-2222-222222222222",
      "metric": "TAX_LIABILITY",
      "horizon_months": 12,
      "confidence_interval_percent": 95,
      "seasonality_adjusted": true,
      "model_type": "ARIMA_BAYESIAN"
    }
  },
  {
    "id": 23,
    "domain": "Intelligence & Reporting",
    "name": "compliance-risk-scoring-svc",
    "port": 8136,
    "method": "POST",
    "path": "/api/v1/intelligence/risk-scores",
    "description": "Compute entity-wide composite regulatory compliance risk score",
    "presentationText": "Evaluates multi-domain regulatory factors (tax filings, employee certifications, contract obligations, spend limits) to determine entity-level risk tiers.",
    "fieldDocs": [
      {
        "field": "legal_entity_id",
        "type": "string (UUID)",
        "required": true,
        "description": "Target legal entity identifier",
        "example": "22222222-2222-2222-2222-222222222222"
      },
      {
        "field": "jurisdiction_code",
        "type": "string (ISO-3166)",
        "required": true,
        "description": "Governing sovereign jurisdiction",
        "example": "GB"
      },
      {
        "field": "evaluation_date",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Timestamp of risk calculation run",
        "example": "2026-09-17T00:00:00Z"
      },
      {
        "field": "include_prior_penalties",
        "type": "boolean",
        "required": true,
        "description": "Weight historical authority audit penalties",
        "example": true
      },
      {
        "field": "weighting_profile",
        "type": "enum",
        "required": true,
        "description": "Factor weighting profile (STATUTORY_TAX_HEAVY | BALANCED | LABOR_HEAVY)",
        "example": "STATUTORY_TAX_HEAVY"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Run status (ACTIVE | SIMULATION)",
        "example": "ACTIVE"
      }
    ],
    "input": {
      "legal_entity_id": "22222222-2222-2222-2222-222222222222",
      "jurisdiction_code": "GB",
      "evaluation_date": "2026-09-17T00:00:00Z",
      "include_prior_penalties": true,
      "weighting_profile": "STATUTORY_TAX_HEAVY",
      "status": "ACTIVE"
    }
  },
  {
    "id": 24,
    "domain": "Intelligence & Reporting",
    "name": "reconciliation-intelligence-svc",
    "port": 8137,
    "method": "POST",
    "path": "/api/v1/intelligence/reconciliations",
    "description": "Trigger autonomous intelligent bank statement & ledger journal matching",
    "presentationText": "Applies heuristic and vector embedding pattern matching to reconcile complex multi-currency bank statement feeds against general ledger journal entries.",
    "fieldDocs": [
      {
        "field": "account_id",
        "type": "string",
        "required": true,
        "description": "Treasury operating bank account reference",
        "example": "ba-hsbc-gbp-01"
      },
      {
        "field": "statement_period",
        "type": "string",
        "required": true,
        "description": "Reporting period to reconcile",
        "example": "2026-08"
      },
      {
        "field": "tolerance_cents",
        "type": "number",
        "required": true,
        "description": "Permitted FX roundoff tolerance in cents",
        "example": 50
      },
      {
        "field": "match_algorithm",
        "type": "enum",
        "required": true,
        "description": "Matching technique (FUZZY_HEURISTIC | VECTOR_SEMANTIC | EXACT)",
        "example": "FUZZY_HEURISTIC"
      },
      {
        "field": "auto_post_variance",
        "type": "boolean",
        "required": true,
        "description": "Automatically post variance under tolerance to rounding expense",
        "example": true
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Reconciliation mode (AUTO_MATCH | DRY_RUN)",
        "example": "AUTO_MATCH"
      }
    ],
    "input": {
      "account_id": "ba-hsbc-gbp-01",
      "statement_period": "2026-08",
      "tolerance_cents": 50,
      "match_algorithm": "FUZZY_HEURISTIC",
      "auto_post_variance": true,
      "status": "AUTO_MATCH"
    }
  },
  {
    "id": 25,
    "domain": "Intelligence & Reporting",
    "name": "reporting-orchestration-svc",
    "port": 8138,
    "method": "POST",
    "path": "/api/v1/intelligence/reports/orchestrate",
    "description": "Orchestrate automated regulatory, executive, and board reporting pack generation",
    "presentationText": "Aggregates verified data from across all microservices to generate auditable executive PDF and XBRL regulatory reporting packages.",
    "fieldDocs": [
      {
        "field": "report_title",
        "type": "string",
        "required": true,
        "description": "Official governance reporting package title",
        "example": "Q3 2026 Board Governance & Statutory Compliance Pack"
      },
      {
        "field": "template_code",
        "type": "string",
        "required": true,
        "description": "Standard corporate reporting template",
        "example": "TPL-EXEC-GOVERNANCE-V2"
      },
      {
        "field": "target_entities_json",
        "type": "string (JSON)",
        "required": true,
        "description": "Entities included in consolidated report",
        "example": "[\"22222222-2222-2222-2222-222222222222\"]"
      },
      {
        "field": "reporting_quarter",
        "type": "string",
        "required": true,
        "description": "Quarterly accounting period",
        "example": "2026-Q3"
      },
      {
        "field": "export_formats",
        "type": "string",
        "required": true,
        "description": "Output format options (PDF, XBRL, JSON)",
        "example": "PDF,XBRL"
      },
      {
        "field": "include_audit_trail",
        "type": "boolean",
        "required": true,
        "description": "Embed SHA-256 cryptographic audit verification appendix",
        "example": true
      }
    ],
    "input": {
      "report_title": "Q3 2026 Board Governance & Statutory Compliance Pack",
      "template_code": "TPL-EXEC-GOVERNANCE-V2",
      "target_entities_json": "[\"22222222-2222-2222-2222-222222222222\"]",
      "reporting_quarter": "2026-Q3",
      "export_formats": "PDF,XBRL",
      "include_audit_trail": true
    }
  },
  {
    "id": 26,
    "domain": "Intelligence & Reporting",
    "name": "decision-support-svc",
    "port": 8138,
    "method": "POST",
    "path": "/api/v1/intelligence/decision-support",
    "description": "Evaluate high-value commercial action with multi-factor AI governance decision support",
    "presentationText": "Evaluates proposed commercial disbursements, supplier contracts, and entity restructurings against active governance policies, providing structured risk recommendation.",
    "fieldDocs": [
      {
        "field": "case_type",
        "type": "enum",
        "required": true,
        "description": "Decision domain (COMMERCIAL_DISBURSEMENT | VENDOR_APPROVAL | CONTRACT_SIGNING)",
        "example": "COMMERCIAL_DISBURSEMENT"
      },
      {
        "field": "subject_id",
        "type": "string",
        "required": true,
        "description": "Target document or transaction identifier",
        "example": "po-2026-09-001"
      },
      {
        "field": "requested_amount",
        "type": "number",
        "required": true,
        "description": "Financial commitment amount",
        "example": 75000
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Operating currency",
        "example": "GBP"
      },
      {
        "field": "risk_tier",
        "type": "enum",
        "required": true,
        "description": "Underlying risk classification",
        "example": "MEDIUM"
      },
      {
        "field": "governance_policy_code",
        "type": "string",
        "required": true,
        "description": "Governing policy rule applied",
        "example": "POL-SPEND-GLOBAL-01"
      }
    ],
    "input": {
      "case_type": "COMMERCIAL_DISBURSEMENT",
      "subject_id": "po-2026-09-001",
      "requested_amount": 75000,
      "currency": "GBP",
      "risk_tier": "MEDIUM",
      "governance_policy_code": "POL-SPEND-GLOBAL-01"
    }
  },
  {
    "id": 27,
    "domain": "Intelligence & Reporting",
    "name": "migration-integrity-svc",
    "port": 8139,
    "method": "POST",
    "path": "/api/v1/intelligence/migration-integrity/verify",
    "description": "Verify cryptographic integrity and balance consistency of migrated historical data",
    "presentationText": "Validates record counts, SHA-256 ledger checksums, and debit/credit balances across migrated database shards or ERP cutover batches.",
    "fieldDocs": [
      {
        "field": "migration_batch_id",
        "type": "string",
        "required": true,
        "description": "Batch execution tracking identifier",
        "example": "mig-batch-2026-09-alpha"
      },
      {
        "field": "source_system",
        "type": "string",
        "required": true,
        "description": "Legacy source system name",
        "example": "SAP_ECC_6"
      },
      {
        "field": "target_table",
        "type": "string",
        "required": true,
        "description": "Target platform store table",
        "example": "general_ledger_entries"
      },
      {
        "field": "record_count",
        "type": "number",
        "required": true,
        "description": "Total records transferred in batch",
        "example": 45000
      },
      {
        "field": "checksum_algorithm",
        "type": "enum",
        "required": true,
        "description": "Verification hash algorithm (SHA256 | BLAKE3)",
        "example": "SHA256"
      },
      {
        "field": "audit_sample_percent",
        "type": "number",
        "required": true,
        "description": "Percentage of records deep-verified",
        "example": 100
      }
    ],
    "input": {
      "migration_batch_id": "mig-batch-2026-09-alpha",
      "source_system": "SAP_ECC_6",
      "target_table": "general_ledger_entries",
      "record_count": 45000,
      "checksum_algorithm": "SHA256",
      "audit_sample_percent": 100
    }
  },
  {
    "id": 28,
    "domain": "Security & Trust",
    "name": "mtls-management-svc",
    "port": 8140,
    "method": "POST",
    "path": "/api/v1/security/mtls/certificates",
    "description": "Issue and register an internal mutual-TLS (mTLS) microservice certificate",
    "presentationText": "Manages the zero-trust public key infrastructure (PKI) layer, generating, rotating, and validating mutual-TLS X.509 certificates for service-to-service encryption.",
    "fieldDocs": [
      {
        "field": "common_name",
        "type": "string",
        "required": true,
        "description": "Certificate subject CN",
        "example": "general-ledger-svc.internal.zoikosuite.local"
      },
      {
        "field": "service_identifier",
        "type": "string",
        "required": true,
        "description": "Microservice name",
        "example": "general-ledger-svc"
      },
      {
        "field": "key_algorithm",
        "type": "enum",
        "required": true,
        "description": "Cryptographic key algorithm (RSA_4096 | ECDSA_P384 | ED25519)",
        "example": "ECDSA_P384"
      },
      {
        "field": "validity_days",
        "type": "number",
        "required": true,
        "description": "Certificate lifetime in days before rotation",
        "example": 90
      },
      {
        "field": "auto_rotate",
        "type": "boolean",
        "required": true,
        "description": "Enable automated zero-downtime rotation",
        "example": true
      },
      {
        "field": "ca_bundle",
        "type": "string",
        "required": true,
        "description": "Issuing Certificate Authority tier",
        "example": "ZOIKO_INTERNAL_ROOT_CA_V1"
      }
    ],
    "input": {
      "common_name": "general-ledger-svc.internal.zoikosuite.local",
      "service_identifier": "general-ledger-svc",
      "key_algorithm": "ECDSA_P384",
      "validity_days": 90,
      "auto_rotate": true,
      "ca_bundle": "ZOIKO_INTERNAL_ROOT_CA_V1"
    }
  },
  {
    "id": 29,
    "domain": "Security & Trust",
    "name": "siem-integration-svc",
    "port": 8141,
    "method": "POST",
    "path": "/api/v1/security/siem/events",
    "description": "Forward governed platform audit event to enterprise SIEM (Splunk / Sentinel)",
    "presentationText": "Enforces security compliance by streaming real-time security events, authentication anomalies, and privileged access grants into enterprise SIEM platforms.",
    "fieldDocs": [
      {
        "field": "event_name",
        "type": "string",
        "required": true,
        "description": "Security incident or access action name",
        "example": "PRIVILEGED_ROOT_KEY_ROTATION"
      },
      {
        "field": "severity",
        "type": "enum",
        "required": true,
        "description": "Incident classification (INFO | WARNING | ALERT | CRITICAL)",
        "example": "ALERT"
      },
      {
        "field": "source_component",
        "type": "string",
        "required": true,
        "description": "Emitting microservice or gateway",
        "example": "secret-vault-svc"
      },
      {
        "field": "principal_id",
        "type": "string (UUID)",
        "required": true,
        "description": "Acting administrator principal UUID",
        "example": "33333333-3333-3333-3333-333333333333"
      },
      {
        "field": "ip_address",
        "type": "string",
        "required": true,
        "description": "Originating network address",
        "example": "10.240.12.84"
      },
      {
        "field": "event_payload_json",
        "type": "string (JSON)",
        "required": true,
        "description": "Structured event context and affected resources",
        "example": "{\"target_key\":\"kms-master-01\",\"reason\":\"scheduled_quarterly_rotation\"}"
      }
    ],
    "input": {
      "event_name": "PRIVILEGED_ROOT_KEY_ROTATION",
      "severity": "ALERT",
      "source_component": "secret-vault-svc",
      "principal_id": "33333333-3333-3333-3333-333333333333",
      "ip_address": "10.240.12.84",
      "event_payload_json": "{\"target_key\":\"kms-master-01\",\"reason\":\"scheduled_quarterly_rotation\"}"
    }
  },
  {
    "id": 30,
    "domain": "Security & Trust",
    "name": "carta-svc",
    "port": 8142,
    "method": "POST",
    "path": "/api/v1/security/carta/captable",
    "description": "Sync and record statutory equity grant or cap table transaction with Carta",
    "presentationText": "Bridges corporate resolutions and option pool allocations to cap-table management systems (Carta / Pulley), maintaining shareholder registers and vesting schedules.",
    "fieldDocs": [
      {
        "field": "shareholder_id",
        "type": "string",
        "required": true,
        "description": "Shareholder or optionee reference ID",
        "example": "sh-exec-041"
      },
      {
        "field": "share_class",
        "type": "enum",
        "required": true,
        "description": "Share classification (COMMON | PREFERRED_SERIES_A | PREFERRED_SERIES_B | OPTIONS)",
        "example": "PREFERRED_SERIES_B"
      },
      {
        "field": "number_of_shares",
        "type": "number",
        "required": true,
        "description": "Total shares or options allocated",
        "example": 25000
      },
      {
        "field": "issue_price_per_share",
        "type": "number",
        "required": true,
        "description": "Agreed issue or strike price",
        "example": 4.8
      },
      {
        "field": "currency",
        "type": "string",
        "required": true,
        "description": "Currency denomination",
        "example": "GBP"
      },
      {
        "field": "grant_date",
        "type": "string (date)",
        "required": true,
        "description": "Board approved grant date",
        "example": "2026-09-01"
      },
      {
        "field": "board_approval_ref",
        "type": "string",
        "required": true,
        "description": "Board resolution minute reference code",
        "example": "RES-2026-08-04"
      }
    ],
    "input": {
      "shareholder_id": "sh-exec-041",
      "share_class": "PREFERRED_SERIES_B",
      "number_of_shares": 25000,
      "issue_price_per_share": 4.8,
      "currency": "GBP",
      "grant_date": "2026-09-01",
      "board_approval_ref": "RES-2026-08-04"
    }
  },
  {
    "id": 31,
    "domain": "Security & Trust",
    "name": "key-management-svc",
    "port": 8143,
    "method": "POST",
    "path": "/api/v1/security/kms/keys",
    "description": "Provision a hardware-backed HSM cryptographic master encryption key",
    "presentationText": "Provisions and configures FIPS 140-2 Level 3 Hardware Security Module (HSM) master encryption keys for document sealing, database encryption, and signature generation.",
    "fieldDocs": [
      {
        "field": "key_alias",
        "type": "string",
        "required": true,
        "description": "Human-readable KMS key identifier",
        "example": "kms-master-ledger-encryption-2026"
      },
      {
        "field": "key_usage",
        "type": "enum",
        "required": true,
        "description": "Key function (ENCRYPT_DECRYPT | SIGN_VERIFY)",
        "example": "ENCRYPT_DECRYPT"
      },
      {
        "field": "algorithm",
        "type": "enum",
        "required": true,
        "description": "Symmetric / Asymmetric algorithm",
        "example": "AES_256_GCM"
      },
      {
        "field": "rotation_interval_days",
        "type": "number",
        "required": true,
        "description": "Automated rotation cycle in days",
        "example": 365
      },
      {
        "field": "hsm_backing",
        "type": "boolean",
        "required": true,
        "description": "Enforce dedicated CloudHSM hardware isolation",
        "example": true
      },
      {
        "field": "policy_id",
        "type": "string",
        "required": true,
        "description": "Access policy governing who may invoke key",
        "example": "pol-kms-finance-restricted"
      }
    ],
    "input": {
      "key_alias": "kms-master-ledger-encryption-2026",
      "key_usage": "ENCRYPT_DECRYPT",
      "algorithm": "AES_256_GCM",
      "rotation_interval_days": 365,
      "hsm_backing": true,
      "policy_id": "pol-kms-finance-restricted"
    }
  },
  {
    "id": 32,
    "domain": "Integration & Extensibility",
    "name": "connectivity-api-bridge-svc",
    "port": 8144,
    "method": "POST",
    "path": "/api/v1/integrations/api-bridge/routes",
    "description": "Register an external enterprise ERP API integration gateway route",
    "presentationText": "Configures secure bi-directional API gateway routing, rate-limiting, and payload transformation between ZoikoSuite microservices and external legacy ERPs.",
    "fieldDocs": [
      {
        "field": "bridge_name",
        "type": "string",
        "required": true,
        "description": "Descriptive route name",
        "example": "SAP-S4HANA-Accounts-Payable-Bridge"
      },
      {
        "field": "source_protocol",
        "type": "enum",
        "required": true,
        "description": "Source data format (REST_JSON | ODATA | SOAP_XML)",
        "example": "REST_JSON"
      },
      {
        "field": "destination_endpoint",
        "type": "string (URL)",
        "required": true,
        "description": "Target ERP API endpoint",
        "example": "https://erp.enterprise.internal/api/v2/invoices"
      },
      {
        "field": "rate_limit_rpm",
        "type": "number",
        "required": true,
        "description": "Requests per minute rate limit ceiling",
        "example": 5000
      },
      {
        "field": "auth_mechanism",
        "type": "enum",
        "required": true,
        "description": "Authentication scheme (OAUTH2_MUTUAL_TLS | API_KEY)",
        "example": "OAUTH2_MUTUAL_TLS"
      },
      {
        "field": "retry_policy",
        "type": "enum",
        "required": true,
        "description": "Exponential backoff retry behavior",
        "example": "EXPONENTIAL_BACKOFF_3_RETRIES"
      }
    ],
    "input": {
      "bridge_name": "SAP-S4HANA-Accounts-Payable-Bridge",
      "source_protocol": "REST_JSON",
      "destination_endpoint": "https://erp.enterprise.internal/api/v2/invoices",
      "rate_limit_rpm": 5000,
      "auth_mechanism": "OAUTH2_MUTUAL_TLS",
      "retry_policy": "EXPONENTIAL_BACKOFF_3_RETRIES"
    }
  },
  {
    "id": 33,
    "domain": "Integration & Extensibility",
    "name": "banking-connector-svc",
    "port": 8145,
    "method": "POST",
    "path": "/api/v1/integrations/banking/connect",
    "description": "Establish automated Open Banking ISO 20022 direct bank connection",
    "presentationText": "Establishes secure, regulated Open Banking or SWIFT connectivity to major corporate banking institutions for direct statement retrieval and SEPA/Bacs payment initiation.",
    "fieldDocs": [
      {
        "field": "bank_name",
        "type": "string",
        "required": true,
        "description": "Financial institution name",
        "example": "HSBC Corporate Banking UK"
      },
      {
        "field": "bic_swift_code",
        "type": "string",
        "required": true,
        "description": "Bank SWIFT / BIC identifier",
        "example": "HBUKGB4140"
      },
      {
        "field": "connection_protocol",
        "type": "enum",
        "required": true,
        "description": "Integration standard (ISO_20022_CAMT053 | OPEN_BANKING_UK | EBICS)",
        "example": "ISO_20022_CAMT053"
      },
      {
        "field": "client_id",
        "type": "string",
        "required": true,
        "description": "Corporate banking client ID",
        "example": "corp-zoiko-uk-8821"
      },
      {
        "field": "environment",
        "type": "enum",
        "required": true,
        "description": "Connection tier (SANDBOX | PRODUCTION)",
        "example": "PRODUCTION"
      },
      {
        "field": "auto_sync_statements",
        "type": "boolean",
        "required": true,
        "description": "Enable continuous daily statement fetching",
        "example": true
      }
    ],
    "input": {
      "bank_name": "HSBC Corporate Banking UK",
      "bic_swift_code": "HBUKGB4140",
      "connection_protocol": "ISO_20022_CAMT053",
      "client_id": "corp-zoiko-uk-8821",
      "environment": "PRODUCTION",
      "auto_sync_statements": true
    }
  },
  {
    "id": 34,
    "domain": "Integration & Extensibility",
    "name": "hris-connector-svc",
    "port": 8146,
    "method": "POST",
    "path": "/api/v1/integrations/hris/sync",
    "description": "Trigger bidirectional HRIS employee & organization synchronization",
    "presentationText": "Synchronizes worker master directories, leave allocations, job hierarchy, and compensation tiers with external human capital systems (Workday, BambooHR, HiBob).",
    "fieldDocs": [
      {
        "field": "provider",
        "type": "enum",
        "required": true,
        "description": "External HRIS provider (WORKDAY | BAMBOOHR | HIBOB | RIPPLING)",
        "example": "WORKDAY"
      },
      {
        "field": "tenant_identifier",
        "type": "string",
        "required": true,
        "description": "External provider tenant organization ID",
        "example": "zoiko_workday_prod_01"
      },
      {
        "field": "sync_scope",
        "type": "enum",
        "required": true,
        "description": "Sync scope (FULL_DIRECTORY | COMPENSATION_ONLY | DEPARTMENTS)",
        "example": "FULL_DIRECTORY"
      },
      {
        "field": "auto_provision_accounts",
        "type": "boolean",
        "required": true,
        "description": "Automatically provision ZoikoSuite identity on new hires",
        "example": true
      },
      {
        "field": "last_sync_timestamp",
        "type": "string (ISO-8601)",
        "required": true,
        "description": "Timestamp of previous sync benchmark",
        "example": "2026-09-16T00:00:00Z"
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Sync state (EXECUTE_NOW | SCHEDULED)",
        "example": "EXECUTE_NOW"
      }
    ],
    "input": {
      "provider": "WORKDAY",
      "tenant_identifier": "zoiko_workday_prod_01",
      "sync_scope": "FULL_DIRECTORY",
      "auto_provision_accounts": true,
      "last_sync_timestamp": "2026-09-16T00:00:00Z",
      "status": "EXECUTE_NOW"
    }
  },
  {
    "id": 35,
    "domain": "Integration & Extensibility",
    "name": "tax-authority-interface-svc",
    "port": 8147,
    "method": "POST",
    "path": "/api/v1/tax-authority/interfaces",
    "description": "Register direct sovereign revenue authority submission gateway interface",
    "presentationText": "Configures certified protocol adapters (e.g. HMRC Making Tax Digital REST API, Germany ELSTER ERiC, US IRS MeF) for electronic statutory tax filing.",
    "fieldDocs": [
      {
        "field": "authority_code",
        "type": "string",
        "required": true,
        "description": "Regulatory agency identifier (HMRC | IRS | ELSTER | IRAS)",
        "example": "HMRC"
      },
      {
        "field": "jurisdiction_id",
        "type": "string",
        "required": true,
        "description": "Sovereign jurisdiction code",
        "example": "GB"
      },
      {
        "field": "protocol",
        "type": "enum",
        "required": true,
        "description": "Direct submission protocol (REST_OAUTH2 | AS4 | SFTP_ENCRYPTED)",
        "example": "REST_OAUTH2"
      },
      {
        "field": "auth_scheme",
        "type": "enum",
        "required": true,
        "description": "Authentication scheme (BEARER_TOKEN | MTLS | CLIENT_CREDENTIALS)",
        "example": "BEARER_TOKEN"
      },
      {
        "field": "endpoint_url",
        "type": "string (URL)",
        "required": true,
        "description": "Live authority submission API gateway URL",
        "example": "https://api.service.hmrc.gov.uk/organisations/vat"
      },
      {
        "field": "test_mode",
        "type": "boolean",
        "required": true,
        "description": "Send to government sandbox environment",
        "example": false
      },
      {
        "field": "status",
        "type": "enum",
        "required": true,
        "description": "Interface connection state (ACTIVE | MAINTENANCE)",
        "example": "ACTIVE"
      }
    ],
    "input": {
      "authority_code": "HMRC",
      "jurisdiction_id": "GB",
      "protocol": "REST_OAUTH2",
      "auth_scheme": "BEARER_TOKEN",
      "endpoint_url": "https://api.service.hmrc.gov.uk/organisations/vat",
      "test_mode": false,
      "status": "ACTIVE"
    }
  },
  {
    "id": 36,
    "domain": "Integration & Extensibility",
    "name": "esignature-integration-svc",
    "port": 8148,
    "method": "POST",
    "path": "/api/v1/integrations/esignature/envelopes",
    "description": "Create and dispatch legally binding e-Signature envelope (DocuSign / AdobeSign)",
    "presentationText": "Dispatches governed agreements for cryptographic digital signature under eIDAS and ESIGN Act standards, tracking recipient signing progress and audit certificates.",
    "fieldDocs": [
      {
        "field": "document_title",
        "type": "string",
        "required": true,
        "description": "Commercial agreement title",
        "example": "Enterprise MSA — GlobalCloud Inc Executed Copy"
      },
      {
        "field": "provider",
        "type": "enum",
        "required": true,
        "description": "Electronic signature provider (DOCUSIGN | ADOBE_SIGN | ZOIKO_NATIVE)",
        "example": "DOCUSIGN"
      },
      {
        "field": "recipient_email",
        "type": "string",
        "required": true,
        "description": "Authorized counterparty signatory email",
        "example": "legal.signatory@globalcloud.com"
      },
      {
        "field": "recipient_name",
        "type": "string",
        "required": true,
        "description": "Legal signatory full name",
        "example": "Sarah Jenkins"
      },
      {
        "field": "signer_role",
        "type": "enum",
        "required": true,
        "description": "Signer capacity (COUNTERPARTY_EXEC | INTERNAL_DIRECTOR)",
        "example": "COUNTERPARTY_EXEC"
      },
      {
        "field": "expiry_days",
        "type": "number",
        "required": true,
        "description": "Envelope signing expiration deadline in days",
        "example": 14
      },
      {
        "field": "requires_id_verification",
        "type": "boolean",
        "required": true,
        "description": "Require passport / digital ID verification before signing",
        "example": true
      }
    ],
    "input": {
      "document_title": "Enterprise MSA — GlobalCloud Inc Executed Copy",
      "provider": "DOCUSIGN",
      "recipient_email": "legal.signatory@globalcloud.com",
      "recipient_name": "Sarah Jenkins",
      "signer_role": "COUNTERPARTY_EXEC",
      "expiry_days": 14,
      "requires_id_verification": true
    }
  },
  {
    "id": 37,
    "domain": "Integration & Extensibility",
    "name": "external-data-feed-svc",
    "port": 8149,
    "method": "POST",
    "path": "/api/v1/integrations/data-feeds/subscribe",
    "description": "Subscribe to authoritative foreign exchange rates & market data feed",
    "presentationText": "Streams daily authoritative statutory foreign exchange fixing rates (European Central Bank / Bank of England) for automated multi-currency ledger consolidation.",
    "fieldDocs": [
      {
        "field": "feed_name",
        "type": "string",
        "required": true,
        "description": "Data feed subscription title",
        "example": "ECB Official Daily Currency Reference Fixings"
      },
      {
        "field": "feed_type",
        "type": "enum",
        "required": true,
        "description": "Market data category (FX_RATES | COMMODITY_INDEX | INFLATION_INDEX)",
        "example": "FX_RATES"
      },
      {
        "field": "provider",
        "type": "string",
        "required": true,
        "description": "Data provider authority",
        "example": "EUROPEAN_CENTRAL_BANK"
      },
      {
        "field": "update_frequency_minutes",
        "type": "number",
        "required": true,
        "description": "Polling or streaming interval in minutes",
        "example": 60
      },
      {
        "field": "currency_pairs_json",
        "type": "string (JSON)",
        "required": true,
        "description": "Subscribed ISO currency pairs",
        "example": "[\"GBP/EUR\",\"GBP/USD\",\"EUR/USD\",\"GBP/SGD\"]"
      },
      {
        "field": "alert_threshold_variance",
        "type": "number",
        "required": true,
        "description": "Volatility alert threshold percentage",
        "example": 2.5
      }
    ],
    "input": {
      "feed_name": "ECB Official Daily Currency Reference Fixings",
      "feed_type": "FX_RATES",
      "provider": "EUROPEAN_CENTRAL_BANK",
      "update_frequency_minutes": 60,
      "currency_pairs_json": "[\"GBP/EUR\",\"GBP/USD\",\"EUR/USD\",\"GBP/SGD\"]",
      "alert_threshold_variance": 2.5
    }
  }
];

const DOMAIN_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Legal, Corporate & Commercial": {
    "color": "text-blue-700 dark:text-blue-300",
    "bg": "bg-blue-50 dark:bg-blue-900/20",
    "border": "border-blue-200 dark:border-blue-500/30",
    "dot": "bg-blue-500"
  },
  "Tax & Compliance": {
    "color": "text-violet-700 dark:text-violet-300",
    "bg": "bg-violet-50 dark:bg-violet-900/20",
    "border": "border-violet-200 dark:border-violet-500/30",
    "dot": "bg-violet-500"
  },
  "Intelligence & Reporting": {
    "color": "text-amber-700 dark:text-amber-300",
    "bg": "bg-amber-50 dark:bg-amber-900/20",
    "border": "border-amber-200 dark:border-amber-500/30",
    "dot": "bg-amber-500"
  },
  "Security & Trust": {
    "color": "text-emerald-700 dark:text-emerald-300",
    "bg": "bg-emerald-50 dark:bg-emerald-900/20",
    "border": "border-emerald-200 dark:border-emerald-500/30",
    "dot": "bg-emerald-500"
  },
  "Integration & Extensibility": {
    "color": "text-cyan-700 dark:text-cyan-300",
    "bg": "bg-cyan-50 dark:bg-cyan-900/20",
    "border": "border-cyan-200 dark:border-cyan-500/30",
    "dot": "bg-cyan-500"
  }
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
  if (svc.id === 1) return { href: "/admin/legal", label: "View in Legal Contracts Console" };
  if (svc.id === 3) return { href: "/admin/obligations", label: "View in Obligations Register" };
  if (svc.id === 7) return { href: "/admin/purchase-requests", label: "View in Purchase Requests" };
  if (svc.id === 8) return { href: "/admin/commercial-ops", label: "View Purchase Order" };
  if (svc.id >= 12 && svc.id <= 20) return { href: "/admin/tax", label: "View in Tax Governance" };
  if (svc.id >= 21 && svc.id <= 27) return { href: "/admin/governance", label: "View in Intelligence & Governance" };
  if (svc.id >= 28 && svc.id <= 31) return { href: "/admin/audit-events", label: "View in Security & Audit" };
  if (svc.id >= 32 && svc.id <= 37) return { href: "/admin/settings", label: "View in Integration Settings" };
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
  "1": [
    {
      "label": "GlobalCloud Enterprise MSA (£320k)",
      "badge": "MSA",
      "description": "Binding Master Services Agreement for multi-region cloud infrastructure",
      "payload": {
        "title": "Enterprise Master Services Agreement — GlobalCloud Inc",
        "contract_type": "MSA",
        "counterparty_id": "cp-globalcloud-01",
        "counterparty_name": "GlobalCloud Inc",
        "currency": "GBP",
        "total_value": 320000,
        "effective_from": "2026-10-01T00:00:00Z",
        "status": "DRAFT"
      }
    },
    {
      "label": "Apex Networks SLA (€180k)",
      "badge": "SLA",
      "description": "Service Level Agreement covering 24/7 dedicated network transit",
      "payload": {
        "title": "Mission-Critical Tier-4 SLA — Apex Networks GmbH",
        "contract_type": "SLA",
        "counterparty_id": "cp-apex-01",
        "counterparty_name": "Apex Networks GmbH",
        "currency": "EUR",
        "total_value": 180000,
        "effective_from": "2026-11-01T00:00:00Z",
        "status": "ACTIVE"
      }
    }
  ],
  "2": [
    {
      "label": "UK GDPR Standard Clauses",
      "badge": "Data Protection",
      "description": "Approved UK model clauses for third-party processors",
      "payload": {
        "title": "UK GDPR Standard Model Clauses 2026",
        "category": "DATA_PROTECTION",
        "body": "The Data Processor shall process personal data solely in accordance with documented instructions of the Data Controller.",
        "jurisdiction_id": "GB",
        "is_standard": true,
        "status": "APPROVED"
      }
    }
  ],
  "3": [
    {
      "label": "Annual ISO 27001 Audit SLA",
      "badge": "High Risk",
      "description": "Deliver certified SOC-2 Type II audit report to counterparty",
      "payload": {
        "contract_id": "c-001",
        "title": "Annual ISO 27001 SOC-2 Type II Audit Certification",
        "description": "Deliver renewed SOC-2 Type II certification report to counterparty legal department",
        "due_date": "2026-12-15T00:00:00Z",
        "risk_level": "HIGH",
        "status": "PENDING"
      }
    }
  ],
  "4": [
    {
      "label": "Q3 Strategic Board Assembly",
      "badge": "Board Quorum",
      "description": "Formal board of directors meeting with 3 voting directors",
      "payload": {
        "meeting_type": "BOARD_OF_DIRECTORS",
        "title": "Q3 2026 Strategic Expansion & Subsidiary Funding Meeting",
        "scheduled_date": "2026-09-25T14:00:00Z",
        "location": "London HQ / Virtual Boardroom",
        "quorum_required": 3,
        "status": "SCHEDULED"
      }
    }
  ],
  "5": [
    {
      "label": "Executive Equity Incentive Grant",
      "badge": "Series B",
      "description": "Board-authorized stock options grant for key personnel",
      "payload": {
        "action_type": "EQUITY_INCENTIVE_GRANT",
        "description": "Series-B Executive Long-Term Equity Incentive Plan Allocation",
        "jurisdiction_id": "GB",
        "effective_date": "2026-10-01T00:00:00Z",
        "requires_board_approval": true,
        "status": "PENDING_APPROVAL"
      }
    }
  ],
  "6": [
    {
      "label": "German Tech Supplier (Apex GmbH)",
      "badge": "Verified KYC",
      "description": "Verified German corporate partner with Low risk rating",
      "payload": {
        "legal_name": "Apex Networks Global GmbH",
        "country_code": "DE",
        "entity_type": "CORPORATION",
        "kyc_status": "VERIFIED",
        "risk_rating": "LOW",
        "registered_address": "Friedrichstraße 42, 10117 Berlin, Germany"
      }
    }
  ],
  "7": [
    {
      "label": "Cloud GPU Cluster Requisition (£45k)",
      "badge": "IT Requisition",
      "description": "High-performance compute requisition awaiting approval",
      "payload": {
        "legal_entity_id": "22222222-2222-2222-2222-222222222222",
        "description": "Enterprise Cloud Infrastructure & High-Performance Compute Cluster Q3-2026",
        "amount": 45000,
        "currency_code": "GBP",
        "department": "Engineering & IT Infrastructure",
        "status": "PENDING"
      }
    }
  ],
  "8": [
    {
      "label": "Datacenter Hardware PO (£75k)",
      "badge": "Committed PO",
      "description": "Direct purchase order issued against approved requisition",
      "payload": {
        "supplier_name": "Global Datacenters Ltd",
        "vendor_id": "v-gdc-01",
        "po_number": "PO-2026-09-001",
        "total_amount": 75000,
        "currency": "GBP",
        "delivery_date": "2026-11-15T00:00:00Z",
        "status": "ISSUED"
      }
    }
  ],
  "9": [
    {
      "label": "Quarterly IT Spend Cap (£250k)",
      "badge": "Hard Stop",
      "description": "Quarterly ceiling with 85% warning threshold and hard cut-off",
      "payload": {
        "legal_entity_id": "22222222-2222-2222-2222-222222222222",
        "category": "IT_INFRASTRUCTURE",
        "period": "QUARTERLY",
        "limit_amount": 250000,
        "currency": "GBP",
        "threshold_warning_percentage": 85,
        "hard_stop_enforced": true
      }
    }
  ],
  "10": [
    {
      "label": "Enhanced Vendor Sanctions Check",
      "badge": "AML/PEP",
      "description": "OFAC, EU & UN sanctions screening for German vendor",
      "payload": {
        "vendor_id": "v-apex-01",
        "vendor_name": "Apex Networks Global GmbH",
        "jurisdiction_id": "DE",
        "check_type": "ENHANCED_DUE_DILIGENCE",
        "sanctions_screening": true,
        "risk_tier": "LOW"
      }
    }
  ],
  "11": [
    {
      "label": "Dual-Quorum Approval Workflow (£50k)",
      "badge": "Executive Tier",
      "description": "Automated dual-quorum pipeline for large enterprise requisitions",
      "payload": {
        "workflow_name": "Q3-2026 Enterprise Hardware Procurement Approval",
        "purchase_request_id": "preq-2026-9912",
        "approval_tier": "TIER_2_EXECUTIVE",
        "threshold_amount": 50000,
        "currency": "GBP",
        "sod_enforced": true,
        "status": "IN_PROGRESS"
      }
    }
  ],
  "12": [
    {
      "label": "UK Domestic Energy (5%)",
      "badge": "UK Reduced",
      "description": "HMRC 5% statutory reduced rate for domestic residential energy in the UK",
      "payload": {
        "jurisdiction_id": "GB",
        "rule_code": "UK-VAT-REDUCED-5",
        "name": "UK Domestic Energy Reduced Rate 5%",
        "category": "VAT",
        "tax_rate_percentage": 5,
        "standard_deductions": 0,
        "exemptions_json": "{\"domestic_energy\":true}",
        "status": "ACTIVE",
        "version": 1,
        "effective_from": "2026-09-01T00:00:00Z"
      }
    },
    {
      "label": "Germany Standard (19%)",
      "badge": "DE Standard",
      "description": "Federal Republic of Germany 19% standard VAT rate (Umsatzsteuer)",
      "payload": {
        "jurisdiction_id": "DE",
        "rule_code": "DE-VAT-STD-19",
        "name": "Germany Standard VAT Rate 19%",
        "category": "VAT",
        "tax_rate_percentage": 19,
        "standard_deductions": 0,
        "exemptions_json": "{\"medical_exempt\":false}",
        "status": "ACTIVE",
        "version": 1,
        "effective_from": "2026-01-01T00:00:00Z"
      }
    }
  ],
  "13": [
    {
      "label": "UK AP Invoice (£150,000)",
      "badge": "UK AP",
      "description": "Calculates £30,000 standard 20% VAT on corporate supplier invoice",
      "payload": {
        "transaction_id": "tx-inv-2026-8841",
        "source_module": "ACCOUNTS_PAYABLE",
        "legal_entity_id": "22222222-2222-2222-2222-222222222222",
        "jurisdiction_id": "GB",
        "tax_category": "VAT",
        "gross_amount": 150000,
        "taxable_amount": 150000,
        "currency": "GBP",
        "status": "CALCULATED"
      }
    }
  ],
  "14": [
    {
      "label": "UK HMRC VAT 100 (£60k Net Payable)",
      "badge": "UK Q2",
      "description": "Sales: £500k, Purchases: £200k, Net Payable: £60,000 GBP",
      "payload": {
        "jurisdiction_id": "GB",
        "tax_registration_number": "GB998877665",
        "tax_period": "2026-Q2",
        "total_sales_amount": 500000,
        "total_purchase_amount": 200000,
        "output_tax_amount": 100000,
        "input_tax_amount": 40000,
        "net_tax_payable": 60000,
        "currency": "GBP",
        "status": "DRAFT"
      }
    }
  ],
  "15": [
    {
      "label": "UK CT600 Annual (25% Rate)",
      "badge": "UK CT600",
      "description": "Revenue: £3.5M, Deductions: £2.1M, Net Tax: £325,000",
      "payload": {
        "jurisdiction_id": "GB",
        "tax_registration_number": "GB-CT-443322",
        "fiscal_year": 2026,
        "accounting_period_start": "2026-01-01",
        "accounting_period_end": "2026-12-31",
        "gross_revenue": 3500000,
        "allowable_deductions": 2100000,
        "taxable_income": 1400000,
        "tax_rate_percent": 25,
        "gross_tax_liability": 350000,
        "tax_credits": 25000,
        "net_tax_payable": 325000,
        "currency": "GBP",
        "status": "DRAFT"
      }
    }
  ],
  "16": [
    {
      "label": "US-UK Treaty Royalty WHT (15%)",
      "badge": "US WHT",
      "description": "Outbound IP licensing remittance with 15% DTA treaty rate",
      "payload": {
        "legal_entity_id": "22222222-2222-2222-2222-222222222222",
        "recipient_jurisdiction": "US",
        "recipient_name": "CloudTech IP Holdings Delaware LLC",
        "payment_type": "ROYALTIES",
        "gross_payment_amount": 100000,
        "treaty_rate_percent": 15,
        "withholding_tax_amount": 15000,
        "currency": "GBP",
        "status": "DRAFT"
      }
    }
  ],
  "17": [
    {
      "label": "Audit Tax Package (Q3 VAT)",
      "badge": "Audit Evidence",
      "description": "Staged reconciliation pack with cross-border cloud sales evidence",
      "payload": {
        "jurisdiction_id": "GB",
        "filing_type": "VAT_RETURN",
        "tax_period": "2026-Q3",
        "entity_id": "22222222-2222-2222-2222-222222222222",
        "prepared_by": "lead.tax.cpa@zoiko.internal",
        "notes": "Includes cross-border cloud software sales VAT adjustments under HMRC rules",
        "status": "DRAFT"
      }
    }
  ],
  "18": [
    {
      "label": "HMRC Q3 Deadline Tracker",
      "badge": "Quarterly Deadline",
      "description": "Tracking statutory HMRC MTD cutoff date for Q3 2026",
      "payload": {
        "jurisdiction_id": "GB",
        "filing_name": "HMRC MTD VAT Return Q3 2026",
        "statutory_deadline": "2026-11-07T23:59:59Z",
        "frequency": "QUARTERLY",
        "reporting_entity_id": "22222222-2222-2222-2222-222222222222",
        "status": "PENDING"
      }
    }
  ],
  "19": [
    {
      "label": "Tax Domain Grade A Evaluation",
      "badge": "96.5% Prepared",
      "description": "Full statutory compliance evaluation producing Grade A rating",
      "payload": {
        "domain": "TAX",
        "legal_entity_id": "22222222-2222-2222-2222-222222222222",
        "evaluation_scope": "Statutory VAT Nexus & International Withholding Tax Audit Readiness",
        "audit_readiness_score": 96.5,
        "unresolved_findings": 0,
        "compliance_grade": "GRADE_A",
        "status": "COMPLETED"
      }
    }
  ],
  "20": [
    {
      "label": "High-Priority Tax Nexus Escalation",
      "badge": "High Severity",
      "description": "Escalation to CCO regarding cross-border withholding variance",
      "payload": {
        "title": "Cross-Border Tax Nexus Withholding Rate Discrepancy",
        "domain": "TAX",
        "severity": "HIGH",
        "triggering_event_id": "evt-tax-nexus-8812",
        "escalated_to_role": "Chief Compliance Officer",
        "assigned_investigator": "lead.auditor@zoiko.internal",
        "action_required": "Recalculate WHT under US-UK DTA treaty Article 12 and update ledger",
        "status": "OPEN"
      }
    }
  ],
  "21": [
    {
      "label": "AP Invoice 3-Sigma Outlier Scan",
      "badge": "Isolation Forest",
      "description": "Detects disbursement spikes over 90 days sampling",
      "payload": {
        "domain": "ACCOUNTS_PAYABLE",
        "source_module": "INVOICE_PROCESSING",
        "sampling_window_days": 90,
        "sensitivity_threshold": 3,
        "scan_type": "ISOLATION_FOREST",
        "flag_outliers_only": true
      }
    }
  ],
  "22": [
    {
      "label": "12-Month Tax Runway Prediction",
      "badge": "Bayesian ARIMA",
      "description": "Projects 95% confidence tax liabilities for next 4 quarters",
      "payload": {
        "entity_id": "22222222-2222-2222-2222-222222222222",
        "metric": "TAX_LIABILITY",
        "horizon_months": 12,
        "confidence_interval_percent": 95,
        "seasonality_adjusted": true,
        "model_type": "ARIMA_BAYESIAN"
      }
    }
  ],
  "23": [
    {
      "label": "UK Sovereign Entity Risk Scoring",
      "badge": "Tax Heavy",
      "description": "Multi-factor score assessing statutory exposure and filings",
      "payload": {
        "legal_entity_id": "22222222-2222-2222-2222-222222222222",
        "jurisdiction_code": "GB",
        "evaluation_date": "2026-09-17T00:00:00Z",
        "include_prior_penalties": true,
        "weighting_profile": "STATUTORY_TAX_HEAVY",
        "status": "ACTIVE"
      }
    }
  ],
  "24": [
    {
      "label": "HSBC Daily Auto-Reconciliation",
      "badge": "Fuzzy Heuristic",
      "description": "Reconciles statement feeds with 50-cent FX tolerance",
      "payload": {
        "account_id": "ba-hsbc-gbp-01",
        "statement_period": "2026-08",
        "tolerance_cents": 50,
        "match_algorithm": "FUZZY_HEURISTIC",
        "auto_post_variance": true,
        "status": "AUTO_MATCH"
      }
    }
  ],
  "25": [
    {
      "label": "Consolidated Executive Board Pack",
      "badge": "PDF + XBRL",
      "description": "Generates board pack with cryptographic audit appendix",
      "payload": {
        "report_title": "Q3 2026 Board Governance & Statutory Compliance Pack",
        "template_code": "TPL-EXEC-GOVERNANCE-V2",
        "target_entities_json": "[\"22222222-2222-2222-2222-222222222222\"]",
        "reporting_quarter": "2026-Q3",
        "export_formats": "PDF,XBRL",
        "include_audit_trail": true
      }
    }
  ],
  "26": [
    {
      "label": "Disbursement Governance Decision",
      "badge": "Spend Policy",
      "description": "Evaluates £75,000 procurement commitment against policy limits",
      "payload": {
        "case_type": "COMMERCIAL_DISBURSEMENT",
        "subject_id": "po-2026-09-001",
        "requested_amount": 75000,
        "currency": "GBP",
        "risk_tier": "MEDIUM",
        "governance_policy_code": "POL-SPEND-GLOBAL-01"
      }
    }
  ],
  "27": [
    {
      "label": "SAP ECC-6 Ledger Verification",
      "badge": "SHA-256 100%",
      "description": "Audits 45,000 migrated historical entries against source hashes",
      "payload": {
        "migration_batch_id": "mig-batch-2026-09-alpha",
        "source_system": "SAP_ECC_6",
        "target_table": "general_ledger_entries",
        "record_count": 45000,
        "checksum_algorithm": "SHA256",
        "audit_sample_percent": 100
      }
    }
  ],
  "28": [
    {
      "label": "General Ledger mTLS Certificate",
      "badge": "ECDSA P-384",
      "description": "Issues 90-day mutual TLS certificate with auto-rotation",
      "payload": {
        "common_name": "general-ledger-svc.internal.zoikosuite.local",
        "service_identifier": "general-ledger-svc",
        "key_algorithm": "ECDSA_P384",
        "validity_days": 90,
        "auto_rotate": true,
        "ca_bundle": "ZOIKO_INTERNAL_ROOT_CA_V1"
      }
    }
  ],
  "29": [
    {
      "label": "Root Key Rotation SIEM Alert",
      "badge": "Splunk Forwarding",
      "description": "Streams privileged KMS rotation event to enterprise SIEM",
      "payload": {
        "event_name": "PRIVILEGED_ROOT_KEY_ROTATION",
        "severity": "ALERT",
        "source_component": "secret-vault-svc",
        "principal_id": "33333333-3333-3333-3333-333333333333",
        "ip_address": "10.240.12.84",
        "event_payload_json": "{\"target_key\":\"kms-master-01\",\"reason\":\"scheduled_quarterly_rotation\"}"
      }
    }
  ],
  "30": [
    {
      "label": "Series B Preferred Share Issue",
      "badge": "25,000 Shares",
      "description": "Records 25,000 Series B shares on Carta with board reference",
      "payload": {
        "shareholder_id": "sh-exec-041",
        "share_class": "PREFERRED_SERIES_B",
        "number_of_shares": 25000,
        "issue_price_per_share": 4.8,
        "currency": "GBP",
        "grant_date": "2026-09-01",
        "board_approval_ref": "RES-2026-08-04"
      }
    }
  ],
  "31": [
    {
      "label": "FIPS 140-2 Level 3 Master Key",
      "badge": "CloudHSM AES-256",
      "description": "Provisions hardware-backed master key for financial database",
      "payload": {
        "key_alias": "kms-master-ledger-encryption-2026",
        "key_usage": "ENCRYPT_DECRYPT",
        "algorithm": "AES_256_GCM",
        "rotation_interval_days": 365,
        "hsm_backing": true,
        "policy_id": "pol-kms-finance-restricted"
      }
    }
  ],
  "32": [
    {
      "label": "SAP S/4HANA Invoices Bridge",
      "badge": "5000 RPM",
      "description": "Secure mTLS REST gateway route to enterprise SAP ERP",
      "payload": {
        "bridge_name": "SAP-S4HANA-Accounts-Payable-Bridge",
        "source_protocol": "REST_JSON",
        "destination_endpoint": "https://erp.enterprise.internal/api/v2/invoices",
        "rate_limit_rpm": 5000,
        "auth_mechanism": "OAUTH2_MUTUAL_TLS",
        "retry_policy": "EXPONENTIAL_BACKOFF_3_RETRIES"
      }
    }
  ],
  "33": [
    {
      "label": "HSBC Corporate CAMT.053 Feed",
      "badge": "Production SWIFT",
      "description": "Direct Open Banking connection for continuous statements",
      "payload": {
        "bank_name": "HSBC Corporate Banking UK",
        "bic_swift_code": "HBUKGB4140",
        "connection_protocol": "ISO_20022_CAMT053",
        "client_id": "corp-zoiko-uk-8821",
        "environment": "PRODUCTION",
        "auto_sync_statements": true
      }
    }
  ],
  "34": [
    {
      "label": "Workday Enterprise Directory Sync",
      "badge": "Full Sync",
      "description": "Auto-provisions worker accounts and organizational structure",
      "payload": {
        "provider": "WORKDAY",
        "tenant_identifier": "zoiko_workday_prod_01",
        "sync_scope": "FULL_DIRECTORY",
        "auto_provision_accounts": true,
        "last_sync_timestamp": "2026-09-16T00:00:00Z",
        "status": "EXECUTE_NOW"
      }
    }
  ],
  "35": [
    {
      "label": "HMRC MTD Direct Production API",
      "badge": "OAuth2 Bearer",
      "description": "Certified production gateway for electronic VAT submissions",
      "payload": {
        "authority_code": "HMRC",
        "jurisdiction_id": "GB",
        "protocol": "REST_OAUTH2",
        "auth_scheme": "BEARER_TOKEN",
        "endpoint_url": "https://api.service.hmrc.gov.uk/organisations/vat",
        "test_mode": false,
        "status": "ACTIVE"
      }
    }
  ],
  "36": [
    {
      "label": "DocuSign Enterprise MSA Envelope",
      "badge": "14-Day Expiry",
      "description": "Dispatches contract with mandatory passport ID verification",
      "payload": {
        "document_title": "Enterprise MSA — GlobalCloud Inc Executed Copy",
        "provider": "DOCUSIGN",
        "recipient_email": "legal.signatory@globalcloud.com",
        "recipient_name": "Sarah Jenkins",
        "signer_role": "COUNTERPARTY_EXEC",
        "expiry_days": 14,
        "requires_id_verification": true
      }
    }
  ],
  "37": [
    {
      "label": "European Central Bank FX Feed",
      "badge": "Hourly Fixings",
      "description": "Streams GBP/EUR, GBP/USD, EUR/USD benchmark fixings",
      "payload": {
        "feed_name": "ECB Official Daily Currency Reference Fixings",
        "feed_type": "FX_RATES",
        "provider": "EUROPEAN_CENTRAL_BANK",
        "update_frequency_minutes": 60,
        "currency_pairs_json": "[\"GBP/EUR\",\"GBP/USD\",\"EUR/USD\",\"GBP/SGD\"]",
        "alert_threshold_variance": 2.5
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
