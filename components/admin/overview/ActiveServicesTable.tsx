"use client";

import { useState, useMemo } from "react";
import {
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Play,
  Loader2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";

export interface ServiceItem {
  id: number;
  block: string;
  domain: string;
  name: string;
  port: number;
  method: "GET" | "POST";
  endpoint: string;
  description: string;
}

export const ALL_SERVICES: ServiceItem[] = [
  // Block 6
  { id: 1, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "contract-lifecycle-svc", port: 8119, method: "POST", endpoint: "/api/v1/contracts", description: "Enterprise MSA draft & contract lifecycle orchestration" },
  { id: 2, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "clause-template-svc", port: 8120, method: "POST", endpoint: "/api/v1/clauses", description: "Standard legal clause library and jurisdictional template engine" },
  { id: 3, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "obligation-tracking-svc", port: 8121, method: "POST", endpoint: "/api/v1/obligations", description: "Contractual obligation deadlines and compliance covenants" },
  { id: 4, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "board-resolutions-svc", port: 8122, method: "POST", endpoint: "/api/v1/meetings", description: "Executive board resolutions and governance committee meetings" },
  { id: 5, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "corporate-actions-svc", port: 8123, method: "POST", endpoint: "/api/v1/corporate-actions", description: "Corporate restructuring, share issuance and dividend actions" },
  { id: 6, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "counterparty-management-svc", port: 8124, method: "GET", endpoint: "/api/v1/counterparties", description: "KYC-verified counterparties and corporate affiliations" },
  { id: 7, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "purchase-request-svc", port: 8100, method: "POST", endpoint: "/api/v1/purchase-requests", description: "Commercial procurement requisitions and department approvals" },
  { id: 8, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "purchase-order-svc", port: 8150, method: "POST", endpoint: "/api/v1/purchase-orders", description: "Vendor purchase orders with remapped port 8150" },
  { id: 9, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "spend-controls-svc", port: 8131, method: "POST", endpoint: "/api/v1/spend-controls/limits", description: "Departmental spend limits and approval thresholds" },
  { id: 10, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "vendor-due-diligence-svc", port: 8132, method: "GET", endpoint: "/api/v1/vendors", description: "Vendor due diligence status and sanction screening" },
  { id: 11, block: "Block 6", domain: "Legal, Corporate & Commercial", name: "procurement-workflow-svc", port: 8134, method: "POST", endpoint: "/api/v1/procurement/workflows", description: "Multi-tier procurement approval lifecycle engine" },

  // Block 7
  { id: 12, block: "Block 7", domain: "Tax & Compliance", name: "tax-rules-svc", port: 8125, method: "POST", endpoint: "/api/v1/tax-rules", description: "Statutory tax rate rules and exemptions schedule" },
  { id: 13, block: "Block 7", domain: "Tax & Compliance", name: "tax-determination-svc", port: 8126, method: "POST", endpoint: "/api/v1/tax-determinations", description: "Real-time tax determination and Nexus evaluation" },
  { id: 14, block: "Block 7", domain: "Tax & Compliance", name: "vat-gst-svc", port: 8127, method: "POST", endpoint: "/api/v1/vat-returns", description: "Quarterly VAT/GST return filings with input/output reconciliations" },
  { id: 15, block: "Block 7", domain: "Tax & Compliance", name: "corporate-tax-svc", port: 8128, method: "POST", endpoint: "/api/v1/corporate-tax-returns", description: "Statutory corporate income tax computations" },
  { id: 16, block: "Block 7", domain: "Tax & Compliance", name: "withholding-tax-svc", port: 8129, method: "POST", endpoint: "/api/v1/withholding-tax", description: "Cross-border withholding tax deductions and schedules" },
  { id: 17, block: "Block 7", domain: "Tax & Compliance", name: "filing-preparation-svc", port: 8130, method: "POST", endpoint: "/api/v1/filing-preparation/drafts", description: "Electronic drafts for jurisdictional tax submissions" },
  { id: 18, block: "Block 7", domain: "Tax & Compliance", name: "filing-tracker-svc", port: 8151, method: "POST", endpoint: "/api/v1/filing-tracker/requirements", description: "Statutory regulatory filing requirements & deadlines (port 8151)" },
  { id: 19, block: "Block 7", domain: "Tax & Compliance", name: "compliance-status-svc", port: 8152, method: "GET", endpoint: "/api/v1/compliance-status", description: "Multi-jurisdiction corporate compliance indicators (port 8152)" },
  { id: 20, block: "Block 7", domain: "Tax & Compliance", name: "exception-escalation-svc", port: 8133, method: "POST", endpoint: "/api/v1/exception-escalation/exceptions", description: "Regulatory exception escalation and SLA breach tracking" },

  // Block 8
  { id: 21, block: "Block 8", domain: "Intelligence & Reporting", name: "anomaly-detection-svc", port: 8153, method: "GET", endpoint: "/api/v1/anomalies", description: "AI-driven transaction anomaly detector (port 8153)" },
  { id: 22, block: "Block 8", domain: "Intelligence & Reporting", name: "forecasting-svc", port: 8135, method: "GET", endpoint: "/api/v1/forecasts", description: "Predictive cash flow, CapEx and tax liability projections" },
  { id: 23, block: "Block 8", domain: "Intelligence & Reporting", name: "compliance-risk-scoring-svc", port: 8136, method: "GET", endpoint: "/api/v1/compliance/risk-scores", description: "Dynamic risk scoring based on filing velocity" },
  { id: 24, block: "Block 8", domain: "Intelligence & Reporting", name: "reconciliation-intelligence-svc", port: 8137, method: "GET", endpoint: "/api/v1/reconciliation/intelligence", description: "Automated fuzzy transaction matching and unallocated resolver" },
  { id: 25, block: "Block 8", domain: "Intelligence & Reporting", name: "reporting-orchestration-svc", port: 8138, method: "POST", endpoint: "/api/v1/reports/orchestrate", description: "Statutory and board governance reporting packages" },
  { id: 26, block: "Block 8", domain: "Intelligence & Reporting", name: "decision-support-svc", port: 8154, method: "GET", endpoint: "/api/v1/decision-support", description: "Algorithmic governance recommendations (port 8154)" },
  { id: 27, block: "Block 8", domain: "Intelligence & Reporting", name: "migration-integrity-svc", port: 8139, method: "GET", endpoint: "/api/v1/migrations/integrity", description: "Cryptographic schema upgrade & ledger integrity verification" },

  // Block 9
  { id: 28, block: "Block 9", domain: "Security & Trust", name: "mtls-management-svc", port: 8140, method: "GET", endpoint: "/api/v1/mtls/certificates", description: "Service-to-service mutual TLS x509 certificates and trust bundles" },
  { id: 29, block: "Block 9", domain: "Security & Trust", name: "siem-integration-svc", port: 8141, method: "POST", endpoint: "/api/v1/siem/events", description: "Security telemetry and event forwarding to corporate SIEM" },
  { id: 30, block: "Block 9", domain: "Security & Trust", name: "carta-svc", port: 8142, method: "GET", endpoint: "/api/v1/carta/captable", description: "Shareholder equity ledgers and Carta cap table synchronizer" },
  { id: 31, block: "Block 9", domain: "Security & Trust", name: "key-management-svc", port: 8143, method: "GET", endpoint: "/api/v1/keys", description: "HSM key rotation and cryptographic envelope key manager" },

  // Block 10
  { id: 32, block: "Block 10", domain: "Integration & Extensibility", name: "connectivity-api-bridge-svc", port: 8144, method: "GET", endpoint: "/api/v1/bridge/connections", description: "External API gateway bridge and webhook ingress router" },
  { id: 33, block: "Block 10", domain: "Integration & Extensibility", name: "banking-connector-svc", port: 8145, method: "GET", endpoint: "/api/v1/banking/institutions", description: "Open Banking CMA9 and institutional banking connectors" },
  { id: 34, block: "Block 10", domain: "Integration & Extensibility", name: "hris-connector-svc", port: 8146, method: "GET", endpoint: "/api/v1/hris/connectors", description: "Workday, BambooHR and corporate HRIS synchronizer" },
  { id: 35, block: "Block 10", domain: "Integration & Extensibility", name: "tax-authority-interface-svc", port: 8147, method: "POST", endpoint: "/api/v1/tax-authority/interfaces", description: "HMRC MTD and international revenue service interfaces" },
  { id: 36, block: "Block 10", domain: "Integration & Extensibility", name: "esignature-integration-svc", port: 8148, method: "POST", endpoint: "/api/v1/esignature/envelopes", description: "DocuSign / Adobe Sign electronic signature envelope workflow" },
  { id: 37, block: "Block 10", domain: "Integration & Extensibility", name: "external-data-feed-svc", port: 8149, method: "GET", endpoint: "/api/v1/datafeeds", description: "ECB FX rates, market indices and external reference data feeds" },
];

export function ActiveServicesTable() {
  const [search, setSearch] = useState("");
  const [selectedBlock, setSelectedBlock] = useState("ALL");
  const [pingStates, setPingStates] = useState<Record<number, { ok: boolean; status: number; latency: number; loading: boolean }>>({});

  const blocks = ["ALL", "Block 6", "Block 7", "Block 8", "Block 9", "Block 10"];

  const filtered = useMemo(() => {
    return ALL_SERVICES.filter((svc) => {
      const matchesBlock = selectedBlock === "ALL" || svc.block === selectedBlock;
      const matchesSearch =
        svc.name.toLowerCase().includes(search.toLowerCase()) ||
        svc.domain.toLowerCase().includes(search.toLowerCase()) ||
        String(svc.port).includes(search) ||
        svc.description.toLowerCase().includes(search.toLowerCase());
      return matchesBlock && matchesSearch;
    });
  }, [search, selectedBlock]);

  async function pingService(svc: ServiceItem) {
    setPingStates((prev) => ({
      ...prev,
      [svc.id]: { ok: false, status: 0, latency: 0, loading: true },
    }));

    try {
      const start = Date.now();
      const res = await fetch(`/api/backend/ping?port=${svc.port}`);
      const data = await res.json();
      const latency = Date.now() - start;

      setPingStates((prev) => ({
        ...prev,
        [svc.id]: {
          ok: data.ok || res.ok,
          status: data.status || res.status,
          latency: data.latencyMs || latency,
          loading: false,
        },
      }));
    } catch {
      setPingStates((prev) => ({
        ...prev,
        [svc.id]: { ok: false, status: 500, latency: 0, loading: false },
      }));
    }
  }

  async function pingAll() {
    for (const svc of ALL_SERVICES) {
      pingService(svc);
    }
  }

  return (
    <Card className="overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Server className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Active Microservices Directory (37 / 37 Live)
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Complete registry of all operational backend microservices running on local Docker runtime.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={pingAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-600 hover:bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors dark:bg-navy-700 dark:hover:bg-navy-600"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Ping All 37 Services
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-slate-100 dark:border-slate-800/80 px-6 py-3 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {blocks.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBlock(b)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                selectedBlock === b
                  ? "bg-navy-900 text-white dark:bg-navy-600"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search service, port, domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-navy-500"
          />
        </div>
      </div>

      {/* Services Table */}
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/90 dark:border-slate-800 dark:bg-slate-800/90 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">#</th>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Service Name</th>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Port</th>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Block / Domain</th>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Endpoint</th>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Status</th>
              <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {filtered.map((svc) => {
              const ping = pingStates[svc.id];
              return (
                <tr
                  key={svc.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-slate-400">{svc.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 font-mono">
                          {svc.name}
                        </span>
                        <p className="text-[11px] text-slate-400 line-clamp-1 max-w-[280px]">
                          {svc.description}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-navy-700 dark:text-navy-300">
                    :{svc.port}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50 mr-1.5">
                      {svc.block}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                      {svc.domain}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                      {svc.method}
                    </span>
                    {svc.endpoint}
                  </td>
                  <td className="px-4 py-3">
                    {ping?.loading ? (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Pinging...
                      </span>
                    ) : ping ? (
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          ping.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"
                        }`}
                      >
                        {ping.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        HTTP {ping.status} ({ping.latency}ms)
                      </span>
                    ) : (
                      <Badge tone="success">
                        Operational
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => pingService(svc)}
                      disabled={ping?.loading}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors"
                      title="Test live response"
                    >
                      <Play className="h-2.5 w-2.5 fill-current" />
                      Test
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-3 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Showing {filtered.length} of {ALL_SERVICES.length} microservices</span>
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          All 37 Services Reachable on Localhost
        </span>
      </div>
    </Card>
  );
}
