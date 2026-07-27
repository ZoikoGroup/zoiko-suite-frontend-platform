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
  Settings,
} from "lucide-react";

export type DomainKey =
  | "finance"
  | "payroll"
  | "hr"
  | "legal"
  | "tax"
  | "compliance"
  | "commercial-ops";

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
    status: "attention",
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
    status: "action-required",
    coreServices: [
      "Tax Rules Service",
      "Tax Determination Service",
      "VAT / GST Engine",
      "Payroll Tax Engine",
      "Corporate Tax Estimation Service",
      "Withholding Tax Service",
      "Filing Preparation Service",
      "Tax Evidence Service",
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    href: "/admin/compliance",
    icon: ShieldCheck,
    purpose:
      "Govern statutory, regulatory, operational, and internal policy obligations as a managed, evidential system.",
    status: "attention",
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
];

export const PRIMARY_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  ...DOMAINS.map((d) => ({ label: d.label, href: d.href, icon: d.icon })),
];

export const SECONDARY_NAV = [
  { label: "Settings", href: "/admin/settings", icon: Settings },
];
