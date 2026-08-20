import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Landmark,
  Wallet,
  Users,
  Scale,
  Percent,
  ShieldCheck,
  ShoppingCart,
  History,
  Settings,
  ScrollText,
  Gavel,
  ClipboardCheck,
  ClipboardList,
  KeyRound,
  Building2,
  FileJson,
  Bot,
} from "lucide-react";

export type DomainKey =
  | "finance"
  | "payroll"
  | "hr"
  | "legal"
  | "tax"
  | "compliance"
  | "commercial-ops"
  | "audit-events";

export type DomainStatus = "operational" | "attention" | "action-required";

export type Domain = {
  key: DomainKey;
  label: string;
  href: string;
  icon: LucideIcon;
  purpose: string;
  status: DomainStatus;
  coreServices: string[];
};

export const DOMAINS: Domain[] = [
  {
    key: "finance",
    label: "Finance",
    href: "/admin/finance",
    icon: Landmark,
    purpose:
      "Govern financial truth across entities, currencies, obligations, and reporting structures.",
    status: "operational",
    coreServices: [
      "General Ledger Service",
      "Accounts Receivable Service",
      "Accounts Payable Service",
      "Treasury & Cash Position Service",
      "Bank Reconciliation Service",
      "Intercompany Accounting Service",
      "Consolidation Service",
      "Chart of Accounts Service",
      "Financial Close Service",
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/admin/payroll",
    icon: Wallet,
    purpose:
      "Govern remuneration, deductions, benefits, employer contributions, and payroll tax obligations by jurisdiction and entity.",
    status: "operational",
    coreServices: [
      "Payroll Run Orchestrator",
      "Compensation Service",
      "Deductions Service",
      "Benefits Service",
      "Payroll Tax Service",
      "Payslip Service",
      "Employer Contributions Service",
      "Payroll Exceptions Service",
    ],
  },
  {
    key: "hr",
    label: "HR & Workforce",
    href: "/admin/hr",
    icon: Users,
    purpose:
      "Govern workforce lifecycle, employment structure, people records, and employment-law-sensitive actions.",
    status: "operational",
    coreServices: [
      "Employee Master Service",
      "Onboarding Service",
      "Contract Issuance Service",
      "Leave & Absence Service",
      "Position & Organization Service",
      "Performance Review Service",
      "Offboarding Service",
      "Workforce Compliance Service",
    ],
  },
  {
    key: "legal",
    label: "Legal & Contracts",
    href: "/admin/legal",
    icon: Scale,
    purpose:
      "Govern commercial agreements, corporate actions, board resolutions, legal obligations, and approval-bound execution.",
    status: "operational",
    coreServices: [
      "Contract Lifecycle Service",
      "Clause & Template Service",
      "Obligation Tracking Service",
      "Board Resolution Service",
      "Corporate Actions Service",
      "Legal Approvals Service",
      "Counterparty Management Service",
    ],
  },
  {
    key: "tax",
    label: "Tax",
    href: "/admin/tax",
    icon: Percent,
    purpose:
      "Govern direct and indirect tax obligations across entity structures and jurisdictions.",
    status: "operational",
    coreServices: [
      "Tax Rules Service",
      "Tax Determination Service",
      "VAT / GST Engine",
      "Payroll Tax Engine",
      "Corporate Tax Estimation Service",
      "Withholding Tax Service",
      "Filing Preparation Service",
      "Tax Evidence Service",
      "Tax Authority Interface Service",
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    href: "/admin/compliance",
    icon: ShieldCheck,
    purpose:
      "Govern statutory, regulatory, operational, and internal policy obligations as a managed, evidential system.",
    status: "operational",

    coreServices: [
      "Obligations Registry",
      "Deadline Engine",
      "Filing Tracker",
      "Compliance Status Service",
      "Evidence Sufficiency Service",
      "Exception & Escalation Service",
    ],
  },
  {
    key: "commercial-ops",
    label: "Commercial Ops",
    href: "/admin/commercial-ops",
    icon: ShoppingCart,
    purpose:
      "Govern procurement, vendor approvals, invoice workflows, and commercial execution linked to financial and legal controls.",
    status: "operational",
    coreServices: [
      "Procurement Workflow Service",
      "Purchase Request Service",
      "Purchase Order Service",
      "Invoice Approval Service",
      "Vendor Due Diligence Service",
      "Spend Controls Service",
    ],
  },
  {
    key: "audit-events",
    label: "Audit Event Store",
    href: "/admin/audit-events",
    icon: History,
    purpose:
      "Govern immutable, append-only cryptographic event logging, hash-chain verification, and provenance auditing across all services.",
    status: "operational",
    coreServices: [
      "Audit Event Ingestion Engine",
      "Cryptographic Hash-Chain Service",
      "Event Provenance Auditor",
      "Correlation ID Tracing Service",
      "Tamper Evidence Verifier",
    ],
  },
];

export const PRIMARY_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  ...DOMAINS.map((d) => ({ label: d.label, href: d.href, icon: d.icon })),
];

/**
 * The governance control plane.
 *
 * Separate from PRIMARY_NAV because these are not business domains — they are the
 * cross-cutting services every domain is meant to be governed BY. Grouping them
 * with Finance and Payroll would imply they sit at the same level, when in fact a
 * policy or evidence requirement configured here constrains all of them.
 */
export const PLATFORM_NAV = [
  // First in the list because it is first in the dependency order: nothing else
  // in the platform can be created until a tenant and a legal entity exist here,
  // and every other service scopes its data by the ids this registry issues.
  { label: "Tenants & Entities", href: "/admin/tenants", icon: Building2 },
  { label: "Governance Log", href: "/admin/governance", icon: ScrollText },
  { label: "Policies", href: "/admin/policies", icon: Gavel },
  { label: "Obligations", href: "/admin/obligations", icon: ClipboardList },
  { label: "Evidence", href: "/admin/evidence", icon: ClipboardCheck },
  { label: "Secret Vault", href: "/admin/secrets", icon: KeyRound },
  // Event contracts constrain every domain rather than belonging to one, so
  // this sits with the platform services and not under a business area.
  { label: "Event Schemas", href: "/admin/schemas", icon: FileJson },
  { label: "AI Governance", href: "/admin/ai-governance", icon: Bot },
];

export const SECONDARY_NAV = [
  { label: "Settings", href: "/admin/settings", icon: Settings },
];
