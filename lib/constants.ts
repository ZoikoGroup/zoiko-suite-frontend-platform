import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Scale,
  Percent,
  ShieldCheck,
  ShoppingCart,
  ClipboardList,
  Sliders,
  Lock,
  Plug,
} from "lucide-react";

export type DomainKey =
  | "legal"
  | "tax"
  | "compliance"
  | "commercial-ops"
  | "purchase-requests"
  | "security"
  | "integrations"
  | "delegations"
  | "evidence";

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
      "Corporate Tax Service",
      "Withholding Tax Service",
      "Filing Preparation Service",
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
      "Filing Tracker",
      "Compliance Status Service",
      "Exception & Escalation Service",
      "Anomaly Detection Service",
      "Forecasting Service",
      "Compliance Risk Scoring Service",
      "Reconciliation Intelligence Service",
      "Reporting Orchestration Service",
      "Decision Support Service",
      "Migration Integrity Service",
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
      "Vendor Due Diligence Service",
      "Spend Controls Service",
    ],
  },
  {
    key: "purchase-requests",
    label: "Purchase Requests",
    href: "/admin/purchase-requests",
    icon: ClipboardList,
    purpose:
      "Govern the requisition lifecycle — raise, approve and reject requests before any purchase order can be issued.",
    status: "operational",
    coreServices: ["Purchase Request Service"],
  },
  {
    key: "security",
    label: "Security & Trust",
    href: "/admin/security",
    icon: Lock,
    purpose:
      "Govern mTLS certificates, SIEM integrations, cryptographic key lifecycle, and cap table records.",
    status: "operational",
    coreServices: [
      "mTLS Management Service",
      "SIEM Integration Service",
      "Carta Cap Table Service",
      "Key Management Service",
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    href: "/admin/integrations",
    icon: Plug,
    purpose:
      "Govern all external system connectors — banking, HRIS, tax authority, eSignature, and data feeds.",
    status: "operational",
    coreServices: [
      "Connectivity API Bridge",
      "Banking Connector",
      "HRIS Connector",
      "Tax Authority Interface",
      "eSignature Integration",
      "External Data Feed",
    ],
  },
  {
    key: "delegations",
    label: "Delegated Authority",
    href: "/admin/delegations",
    icon: ClipboardList,
    purpose:
      "The register of who may act for whom — time-bound, entity-scoped grants of one principal's authority to another.",
    status: "operational",
    coreServices: ["Compliance Risk Scoring Service"],
  },
  {
    key: "evidence",
    label: "Evidence",
    href: "/admin/evidence",
    icon: ClipboardList,
    purpose: "Track filing evidence and preparation records required for compliance.",
    status: "operational",
    coreServices: ["Filing Preparation Service"],
  },
];

export const PRIMARY_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  ...DOMAINS.map((d) => ({ label: d.label, href: d.href, icon: d.icon })),
];

export const PLATFORM_NAV = [
  { label: "Service Inputs", href: "/admin/service-inputs", icon: Sliders },
];

export const SECONDARY_NAV = [
  { label: "Service Inputs", href: "/admin/service-inputs", icon: Sliders },
];

export const NAV_SECTIONS: { title: string; items: typeof SECONDARY_NAV }[] = [
  {
    title: "Legal, Corporate & Commercial",
    items: [
      { label: "Legal & Contracts", href: "/admin/legal", icon: Scale },
      { label: "Commercial Ops", href: "/admin/commercial-ops", icon: ShoppingCart },
      { label: "Purchase Requests", href: "/admin/purchase-requests", icon: ClipboardList },
    ],
  },
  {
    title: "Tax & Compliance",
    items: [
      { label: "Tax", href: "/admin/tax", icon: Percent },
      { label: "Compliance", href: "/admin/compliance", icon: ShieldCheck },
      { label: "Evidence", href: "/admin/evidence", icon: ClipboardList },
      { label: "Delegated Authority", href: "/admin/delegations", icon: ClipboardList },
    ],
  },
  {
    title: "Security & Trust",
    items: [
      { label: "Security & Trust", href: "/admin/security", icon: Lock },
    ],
  },
  {
    title: "Integration & Extensibility",
    items: [
      { label: "Integrations", href: "/admin/integrations", icon: Plug },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Service Inputs", href: "/admin/service-inputs", icon: Sliders },
    ],
  },
];
