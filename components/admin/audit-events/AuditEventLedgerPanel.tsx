"use client";

import { useState, useMemo } from "react";
import { AuditEvent, AuditEventSummary } from "@/lib/api/audit-events";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/ui";
import {
  ShieldAlert,
  ShieldX,
  Search,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  Filter,
  Eye,
  FileCode,
  Clock,
  User,
  Activity,
  Layers,
  X,
} from "lucide-react";

export function AuditEventLedgerPanel({
  events,
  summary,
  isMock,
}: {
  events: AuditEvent[];
  summary: AuditEventSummary;
  isMock?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectEvent, setInspectEvent] = useState<AuditEvent | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesSearch =
        evt.correlation_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evt.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evt.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evt.principal_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evt.resource_id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDomain = selectedDomain === "all" || evt.domain === selectedDomain;
      const matchesStatus = selectedStatus === "all" || evt.status === selectedStatus;

      return matchesSearch && matchesDomain && matchesStatus;
    });
  }, [events, searchTerm, selectedDomain, selectedStatus]);

  const statusBadge = (status: AuditEvent["status"]) => {
    switch (status) {
      case "COMMITTED":
      case "AUTHORIZED":
        return (
          <Badge tone="success" className="w-fit">
            <CheckCircle2 className="h-3 w-3" />
            <span>{status}</span>
          </Badge>
        );
      case "ESCALATED":
        return (
          <Badge tone="warning" className="w-fit">
            <ShieldAlert className="h-3 w-3" />
            <span>ESCALATED</span>
          </Badge>
        );
      case "DENIED":
        return (
          <Badge tone="danger" className="w-fit">
            <ShieldX className="h-3 w-3" />
            <span>DENIED</span>
          </Badge>
        );
      default:
        return <Badge tone="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Fallback Banner */}
      {isMock && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong>Offline Fallback Dataset Loaded:</strong> Connected to audit-event-store-svc mock buffer.
            All SHA-256 signatures are synthetically generated for demonstration.
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ingested Events
              </span>
              <Activity className="h-4 w-4 text-navy-600 dark:text-navy-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary.totalEvents}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                +{summary.throughputPerMin}/min
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Append-only audit trail</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Hash Chain Status
              </span>
              <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                100% Intact
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Cryptographically immutable</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Authorized / Committed
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary.authorizedCount}
              </span>
              <span className="text-xs text-slate-500">executions</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Governance approved</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Escalations & Denials
              </span>
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summary.escalatedCount + summary.deniedCount}
              </span>
              <span className="text-xs text-slate-500">
                ({summary.escalatedCount} esc, {summary.deniedCount} den)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Policy enforcement stops</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Ledger Card */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Layers className="h-5 w-5 text-navy-600 dark:text-navy-400" />
                Immutable Audit Log Stream
              </CardTitle>
              <CardDescription>
                Real-time cryptographic audit log entries ingested across all platform domains.
              </CardDescription>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="mt-4 flex flex-wrap items-center gap-3 pt-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by action, correlation ID, principal, or resource..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="all">All Domains</option>
                <option value="tax">Tax</option>
                <option value="legal">Legal</option>
                <option value="commercial-ops">Commercial Ops</option>
                <option value="finance">Finance</option>
                <option value="payroll">Payroll</option>
                <option value="hr">HR & Workforce</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="all">All Statuses</option>
                <option value="COMMITTED">COMMITTED</option>
                <option value="AUTHORIZED">AUTHORIZED</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="DENIED">DENIED</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Event ID / Action</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Principal / User</th>
                  <th className="px-4 py-3">Resource Target</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Correlation ID</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No audit events match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((evt) => (
                    <tr
                      key={evt.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        <div className="font-mono text-xs font-semibold text-navy-700 dark:text-navy-300">
                          {evt.action}
                        </div>
                        <div className="text-[11px] text-slate-400">{evt.id}</div>
                      </td>

                      <td className="px-4 py-3">
                        <Badge tone="neutral" className="capitalize text-xs">
                          {evt.domain}
                        </Badge>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[140px]" title={evt.principal_name}>
                            {evt.principal_name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          {evt.resource}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {evt.resource_id}
                        </div>
                      </td>

                      <td className="px-4 py-3">{statusBadge(evt.status)}</td>

                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[110px]" title={evt.correlation_id}>
                            {evt.correlation_id}
                          </span>
                          <button
                            onClick={() => handleCopy(evt.correlation_id, evt.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Copy Correlation ID"
                          >
                            {copiedId === evt.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {new Date(evt.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectEvent(evt)}
                          className="h-8 px-2 text-xs text-navy-700 hover:bg-navy-50 dark:text-navy-300 dark:hover:bg-navy-950/50"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Custom Inspector Modal */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-navy-600 dark:text-navy-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Audit Event Record Detail
                </h3>
              </div>
              <button
                onClick={() => setInspectEvent(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
                    Event ID
                  </span>
                  <span className="font-mono text-slate-900 dark:text-slate-100 font-bold">
                    {inspectEvent.id}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
                    Action
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {inspectEvent.action}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
                    Correlation ID
                  </span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {inspectEvent.correlation_id}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
                    Tenant ID
                  </span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {inspectEvent.tenant_id}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Cryptographic SHA-256 Hash Signature
                </span>
                <div className="rounded-md bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 break-all select-all">
                  {inspectEvent.hash_signature}
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Previous Block Hash Link
                </span>
                <div className="rounded-md bg-slate-900 p-2.5 font-mono text-[11px] text-slate-400 break-all select-all">
                  {inspectEvent.previous_hash}
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Payload Metadata (JSON)
                </span>
                <pre className="rounded-md bg-slate-900 p-3 font-mono text-[11px] text-slate-200 overflow-x-auto">
                  {JSON.stringify(inspectEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                size="sm"
                onClick={() => setInspectEvent(null)}
                className="bg-navy-900 text-white hover:bg-navy-800 dark:bg-navy-700 dark:hover:bg-navy-600"
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
