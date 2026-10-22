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
  CircleDollarSign,
  BrainCircuit,
  Fingerprint,
  Building2,
  ToggleLeft,
  KeyRound,
  DoorOpen,
  Search,
  Bell,
  Handshake,
  KeySquare,
  Globe2,
  ScrollText,
  Gavel,
  LockKeyhole,
  Workflow,
  ClipboardCheck,
} from "lucide-react";

export type DomainKey =
  | "legal"
  | "tax"
  | "compliance"
  | "commercial-ops"
  | "purchase-requests"
  | "security"
  | "integrations"
  | "integration"
  | "intelligence"
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
    coreServices: ["Delegated Authority Service"],
  },
  {
    key: "evidence",
    label: "Evidence",
    href: "/admin/evidence",
    icon: ClipboardList,
    purpose:
      "The evidence each governed action must carry before it may proceed — a catalogue of requirements and the evaluation of whether one is met.",
    status: "operational",
    coreServices: ["Evidence Requirements Service"],
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

/**
 * Domains 1 and 2 of the service register (Zoiko-Suite Microservices Domain
 * Ownership, 17 Sep 2026): one page per service, in the register's S.No order.
 * They lead the sidebar because everything below them depends on them — no
 * other domain can act without a tenant, an identity and an authorization
 * decision from these two.
 */
const DOMAIN_1_IDENTITY: typeof SECONDARY_NAV = [
  { label: "Identity Context", href: "/admin/identity", icon: Fingerprint },            // identity-context-svc
  { label: "Tenants & Entities", href: "/admin/tenants", icon: Building2 },             // tenant-entity-registry-svc
  { label: "Feature Flags & Config", href: "/admin/settings", icon: ToggleLeft },       // configuration-feature-flag-svc
  { label: "Secret Vault", href: "/admin/secrets", icon: KeyRound },                    // secret-vault-integration-svc
  { label: "Gateway Authentication", href: "/admin/gateway", icon: DoorOpen },          // gateway-auth-svc
  { label: "Search", href: "/admin/search", icon: Search },                             // search-indexer-svc
  { label: "Notifications", href: "/admin/notifications", icon: Bell },                 // notification-svc
  { label: "Delegated Authority", href: "/admin/delegations", icon: Handshake },        // delegated-authority-svc
  { label: "Roles & Access", href: "/admin/access-control", icon: KeySquare },          // access-control-svc
];

const DOMAIN_2_GOVERNANCE: typeof SECONDARY_NAV = [
  { label: "Jurisdictions & Rules", href: "/admin/jurisdictions", icon: Globe2 },       // jurisdiction-rules-svc
  { label: "Governance Log", href: "/admin/governance", icon: ScrollText },             // governance-decision-log-svc
  { label: "Policies", href: "/admin/policies", icon: Gavel },                          // policy-svc
  { label: "Obligations", href: "/admin/obligations", icon: ClipboardList },            // obligations-svc
  { label: "Authorization", href: "/admin/authorization", icon: LockKeyhole },          // authorization-svc
  { label: "Workflows & Approvals", href: "/admin/workflows", icon: Workflow },         // workflow-svc
  { label: "Evidence", href: "/admin/evidence", icon: ClipboardCheck },                 // evidence-requirements-svc
];

export const NAV_SECTIONS: { title: string; items: typeof SECONDARY_NAV }[] = [
  { title: "Identity, Scope & Foundation", items: DOMAIN_1_IDENTITY },
  { title: "Governance Platform", items: DOMAIN_2_GOVERNANCE },
  {
    title: "Finance & Treasury",
    items: [
      { label: "Finance & Payments", href: "/admin/finance", icon: CircleDollarSign },
    ],
  },
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
      // Evidence (evidence-requirements-svc) and Delegated Authority
      // (delegated-authority-svc) moved to Governance Platform and Identity,
      // Scope & Foundation — the domains their services belong to.
    ],
  },
  {
    title: "Intelligence & Reporting",
    items: [
      { label: "Intelligence & Reporting", href: "/admin/intelligence", icon: BrainCircuit },
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
      // Points at /admin/integration (singular) — the route with real panels
      // wired to live data. /admin/integrations (plural) is a static,
      // non-functional placeholder left over from an earlier pass; not linked.
      { label: "Integrations", href: "/admin/integration", icon: Plug },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Service Inputs", href: "/admin/service-inputs", icon: Sliders },
    ],
  },
];
