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
  LayoutGrid,
  FileArchive,
  Users,
  Store,
  Fingerprint,
  Building2,
  ToggleLeft,
  KeyRound,
  DoorOpen,
  Bell,
  Handshake,
  KeySquare,
  Globe2,
  ScrollText,
  Gavel,
  LockKeyhole,
  Workflow,
  ClipboardCheck,
  Landmark,
  Wallet,
  Calculator,
  Settings2,
  House,
  Activity,
  SquareCheckBig,
  ListChecks,
  TriangleAlert,
  UserCheck,
  History,
  FileText,
  Banknote,
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
      "Govern mTLS certificates, SIEM exporters, key metadata and rotation, and zero-trust access-risk assessments.",
    status: "operational",
    coreServices: [
      "mTLS Management Service",
      "SIEM Integration Service",
      "CARTA Access-Risk Service",
      "Key Management Service",
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    href: "/admin/integration",
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

/**
 * The eleven business domains of docs/ZOIKOSUITE_PLATFORM_BRIEF.md §3, as shown
 * on /admin/platform.
 *
 * Kept apart from DOMAINS above: DOMAINS keys the Overview status grid and the
 * /readyz probes in lib/api/health.ts, and its entries are pages rather than
 * domains (Purchase Requests, Evidence and Delegated Authority are each one).
 *
 * `destinations` lists only routes that have a page.tsx. An empty list means the
 * domain has no page in this console yet and is rendered as "Not yet available"
 * with no link. `gap` names what the brief describes that has no page.
 */
export type BusinessDomain = {
  section: string;
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  destinations: { label: string; href: string }[];
  gap?: string;
};

export const BUSINESS_DOMAINS: BusinessDomain[] = [
  {
    section: "3.1",
    key: "identity-foundation",
    label: "Identity, Scope & Foundation",
    description:
      "Identity context, tenant and entity registry, gateway auth, delegated authority, access control, secrets, configuration and notifications.",
    icon: Fingerprint,
    destinations: [{ label: "Delegated Authority", href: "/admin/delegations" }],
    gap: "Identity, tenants, access control, secrets, settings and notifications have no page.",
  },
  {
    section: "3.2",
    key: "governance",
    label: "Governance Platform",
    description:
      "The non-bypassable control spine: authorization, policy, jurisdiction rules, workflow, obligations, evidence requirements and the decision log.",
    icon: Landmark,
    destinations: [{ label: "Evidence Requirements", href: "/admin/evidence" }],
    gap: "Policies, jurisdictions, obligations and the governance decision log have no page.",
  },
  {
    section: "3.3",
    key: "evidence-audit",
    label: "Evidence, Audit & Utility",
    description:
      "Audit event store, document vault, evidence manifests, workflow history, schema and retention registries, source authority and kill switches.",
    icon: FileArchive,
    destinations: [
      { label: "Source Authority", href: "/admin/source-authority" },
      { label: "Audit Events", href: "/admin/audit-events" },
      { label: "Document Vault", href: "/admin/documents" },
    ],
    gap: "Schemas and retention have no page.",
  },
  {
    section: "3.4",
    key: "finance",
    label: "Finance",
    description:
      "General ledger, payables, receivables, bank reconciliation, treasury, financial close, intercompany, consolidation and invoice approval.",
    icon: CircleDollarSign,
    destinations: [{ label: "Finance & Payments", href: "/admin/finance" }],
  },
  {
    section: "3.5",
    key: "payroll-workforce",
    label: "Payroll & Workforce",
    description:
      "Employee master, employment contracts, payroll runs, compensation, benefits, payroll tax, leave, org structure and workforce compliance.",
    icon: Users,
    destinations: [
      { label: "HR & Workforce", href: "/admin/hr" },
      { label: "Payroll", href: "/admin/payroll" },
    ],
  },
  {
    section: "3.6",
    key: "legal-commercial",
    label: "Legal, Corporate & Commercial",
    description:
      "Contract lifecycle, clauses, board resolutions, corporate actions, counterparties, procurement, purchase requests and orders, and spend controls.",
    icon: Scale,
    destinations: [
      { label: "Legal & Contracts", href: "/admin/legal" },
      { label: "Commercial Ops", href: "/admin/commercial-ops" },
      { label: "Purchase Requests", href: "/admin/purchase-requests" },
    ],
  },
  {
    section: "3.7",
    key: "tax-compliance",
    label: "Tax & Compliance",
    description:
      "Tax rules and determination, VAT/GST, corporate and withholding tax, filing preparation and tracking, compliance status and escalation.",
    icon: Percent,
    destinations: [
      { label: "Tax", href: "/admin/tax" },
      { label: "Compliance", href: "/admin/compliance" },
    ],
  },
  {
    section: "3.8",
    key: "intelligence",
    label: "Intelligence & Reporting",
    description:
      "Anomaly detection, forecasting, risk scoring, reconciliation intelligence, reporting, decision support and migration integrity.",
    icon: BrainCircuit,
    destinations: [
      { label: "Intelligence & Reporting", href: "/admin/intelligence" },
      { label: "Migration Integrity", href: "/admin/migrations" },
    ],
  },
  {
    section: "3.9",
    key: "security-trust",
    label: "Security & Trust",
    description: "mTLS certificates, SIEM integration, cryptographic key management and CARTA risk assessment.",
    icon: Lock,
    destinations: [{ label: "Security & Trust", href: "/admin/security" }],
  },
  {
    section: "3.10",
    key: "integration",
    label: "Integration & Extensibility",
    description:
      "Governed connectors to banks, HRIS, tax authorities, eSignature providers and external data feeds.",
    icon: Plug,
    // Singular route: /admin/integrations (plural) is the static placeholder.
    destinations: [{ label: "Integrations", href: "/admin/integration" }],
  },
  {
    section: "3.11",
    key: "commercial-plane",
    label: "Commercial Plane",
    description: "The monetization layer: commercial accounts, capability registry and AI governance.",
    icon: Store,
    destinations: [{ label: "AI Governance", href: "/admin/ai-governance" }],
    gap: "Commercial accounts and the capability registry have no page.",
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
  // search-indexer-svc has no sidebar entry: searching is the top-bar box on
  // every page, and its admin page (/admin/search) opens from that box.
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

/**
 * The sidebar's groups. Each is a collapsible heading, and its icon is what the
 * collapsed rail shows for the whole group.
 */
export const NAV_SECTIONS: { title: string; icon: LucideIcon; items: typeof SECONDARY_NAV }[] = [
  // The live Overview dashboard stays at /admin, reached from the logo.
  {
    title: "Overview",
    icon: House,
    items: [
      { label: "Executive Dashboard", href: "/admin/overview/executive-dashboard", icon: LayoutDashboard },
      { label: "Domain Health", href: "/admin/overview/domain-health", icon: Activity },
    ],
  },
  {
    title: "My Work",
    icon: SquareCheckBig,
    items: [
      { label: "Tasks & Approvals", href: "/admin/my-work/tasks", icon: ListChecks },
      { label: "Exceptions", href: "/admin/my-work/exceptions", icon: TriangleAlert },
      { label: "Assigned Actions", href: "/admin/my-work/assigned-actions", icon: UserCheck },
    ],
  },
  { title: "Identity, Scope & Foundation", icon: Fingerprint, items: DOMAIN_1_IDENTITY },
  { title: "Governance Platform", icon: Landmark, items: DOMAIN_2_GOVERNANCE },
  {
    title: "Evidence & Audit",
    icon: FileArchive,
    items: [
      { label: "Audit Events", href: "/admin/audit-events", icon: History },
      { label: "Document Vault", href: "/admin/documents", icon: FileText },
    ],
  },
  {
    title: "Finance & Treasury",
    icon: Wallet,
    items: [
      { label: "Finance & Payments", href: "/admin/finance", icon: CircleDollarSign },
    ],
  },
  {
    title: "Payroll & Workforce",
    icon: Users,
    items: [
      { label: "HR & Workforce", href: "/admin/hr", icon: Users },
      { label: "Payroll", href: "/admin/payroll", icon: Banknote },
    ],
  },
  {
    title: "Legal, Corporate & Commercial",
    icon: Scale,
    items: [
      { label: "Legal & Contracts", href: "/admin/legal", icon: Scale },
      { label: "Commercial Ops", href: "/admin/commercial-ops", icon: ShoppingCart },
      { label: "Purchase Requests", href: "/admin/purchase-requests", icon: ClipboardList },
    ],
  },
  {
    title: "Tax & Compliance",
    icon: Calculator,
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
    icon: BrainCircuit,
    items: [
      { label: "Intelligence & Reporting", href: "/admin/intelligence", icon: BrainCircuit },
    ],
  },
  {
    title: "Security & Trust",
    icon: ShieldCheck,
    items: [
      { label: "Security & Trust", href: "/admin/security", icon: Lock },
    ],
  },
  {
    title: "Integration & Extensibility",
    icon: Plug,
    items: [
      // Points at /admin/integration (singular) — the route with real panels
      // wired to live data. /admin/integrations (plural) is a static,
      // non-functional placeholder left over from an earlier pass; not linked.
      { label: "Integrations", href: "/admin/integration", icon: Plug },
    ],
  },
  {
    title: "Platform",
    icon: Settings2,
    items: [
      { label: "Business Domains", href: "/admin/platform", icon: LayoutGrid },
      { label: "Service Inputs", href: "/admin/service-inputs", icon: Sliders },
    ],
  },
];

export type NavSection = (typeof NAV_SECTIONS)[number];
export type NavEntry = NavSection["items"][number];

/** Whether `href` is the page at `pathname` or one of its sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The sidebar group and entry a path sits under, for the active state and the
 * page breadcrumb. The longest matching href wins, so a sub-page such as
 * /admin/authorization/approvals resolves to its parent entry.
 */
export function findNavLocation(
  pathname: string,
): { section: NavSection; item: NavEntry } | null {
  let best: { section: NavSection; item: NavEntry } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (isNavActive(pathname, item.href) && (!best || item.href.length > best.item.href.length)) {
        best = { section, item };
      }
    }
  }
  return best;
}
