"use client";

// SIEM exporters and the events recorded against each.
//
// siem-integration-svc records an exporter and the events streamed to it, but
// sends nothing to the exporter's endpoint (it has no delivery code), while
// storing each event as "DELIVERED" and counting it in events_sent. This panel
// shows those as recorded, with the stored status only beside that caveat.
// Events are read per exporter: the service lists them by exporter_id.

import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { SiemEvent, SiemExporter } from "@/lib/api/security-trust";
import { CreateRecordForm } from "@/components/admin/intelligence/CreateRecordForm";
import { opts, type FieldSpec } from "@/components/admin/intelligence/create-state";
import { createSiemExporterAction, sendSiemTestEventAction, loadSiemExporters, loadSiemEvents } from "@/app/admin/security/actions";
import { SIEM_NO_DELIVERY, siemStatusText } from "./siem-caveat";

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

const EXPORTER_FIELDS: FieldSpec[] = [
  { name: "name", label: "Exporter name", kind: "text", required: true },
  { name: "platform", label: "Platform", kind: "select", required: true, options: opts("SPLUNK", "DATADOG", "ELASTIC", "SENTINEL", "SYSLOG") },
  { name: "endpoint_url", label: "Endpoint URL", kind: "url", required: true, hint: "Recorded only; the service does not contact it." },
  {
    name: "auth_token",
    label: "Auth token",
    kind: "password",
    hint: "Write-only. The service refuses it (503) when no credential sealing key is configured.",
  },
];

const eventFields = (exporterId: string): FieldSpec[] => [
  { name: "exporter_id", label: "Exporter", kind: "hidden", initial: exporterId },
  // The sender's own identity, which is what the console is.
  { name: "source_service", label: "Source service", kind: "text", required: true, initial: "zoiko-console" },
  { name: "event_type", label: "Event type", kind: "text", required: true },
  { name: "severity", label: "Severity", kind: "select", required: true, options: opts("LOW", "MEDIUM", "HIGH", "CRITICAL") },
  { name: "message", label: "Message", kind: "text", required: true },
  { name: "payload", label: "Payload (JSON)", kind: "textarea" },
];

type EventsState = { loading: boolean; events?: SiemEvent[]; error?: string };

export function SiemIntegrationPanel() {
  const [exporters, setExporters] = useState<SiemExporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEvents, setOpenEvents] = useState<Record<string, boolean>>({});
  const [events, setEvents] = useState<Record<string, EventsState>>({});

  const fetchExporters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadSiemExporters();
      if (res.ok) {
        setExporters(res.exporters);
        setError(null);
      } else {
        setExporters([]);
        setError(`siem-integration-svc: ${res.message}`);
      }
    } catch {
      setExporters([]);
      setError("siem-integration-svc could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async (exporterId: string) => {
    setEvents((m) => ({ ...m, [exporterId]: { ...m[exporterId], loading: true } }));
    try {
      const res = await loadSiemEvents(exporterId);
      setEvents((m) => ({
        ...m,
        [exporterId]: res.ok ? { loading: false, events: res.events } : { loading: false, error: res.message },
      }));
    } catch {
      setEvents((m) => ({ ...m, [exporterId]: { loading: false, error: "siem-integration-svc could not be reached." } }));
    }
  }, []);

  useEffect(() => {
    void fetchExporters();
  }, [fetchExporters]);

  const toggleEvents = (exporterId: string) => {
    const next = !openEvents[exporterId];
    setOpenEvents((m) => ({ ...m, [exporterId]: next }));
    if (next) void fetchEvents(exporterId);
  };

  const afterEvent = (exporterId: string) => {
    setOpenEvents((m) => ({ ...m, [exporterId]: true }));
    void fetchEvents(exporterId);
    void fetchExporters();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>SIEM exporters and recorded events (no external delivery is configured)</span>
          <span className="font-mono text-[11px] text-slate-400">siem-integration-svc</span>
        </div>
        <button type="button" onClick={() => void fetchExporters()} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <CreateRecordForm
        title="Register SIEM exporter"
        description="siem-integration-svc records the exporter. It does not connect to the endpoint, and events recorded against it are not sent there."
        fields={EXPORTER_FIELDS}
        action={createSiemExporterAction}
        submitLabel="Register exporter"
        onCreated={() => void fetchExporters()}
      />

      {loading && exporters.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">{error}</p>
      ) : exporters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <AlertOctagon className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No SIEM exporters are registered for this legal entity.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exporters.map((x) => {
            const ev = events[x.id];
            return (
              <section
                key={x.id}
                aria-label={`Exporter ${x.name}`}
                data-exporter-id={x.id}
                className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {x.name} <span className="font-normal text-slate-500">· {x.platform} · {x.status}</span>
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {x.endpoint_url} (not contacted) · {x.id}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300" data-field="events-recorded">
                      Events recorded: <span className="font-semibold">{x.events_sent}</span>
                      <span className="text-slate-400"> (the service&apos;s events_sent; none was sent)</span>
                      {x.last_streamed ? ` · last ${new Date(x.last_streamed).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleEvents(x.id)}
                    aria-expanded={Boolean(openEvents[x.id])}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-300"
                  >
                    {openEvents[x.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Recorded events
                  </button>
                </div>

                <CreateRecordForm
                  title="Send test event"
                  description={`The event is ${SIEM_NO_DELIVERY}: it is stored against this exporter and nothing is sent to its endpoint.`}
                  fields={eventFields(x.id)}
                  action={sendSiemTestEventAction}
                  submitLabel="Record event"
                  onCreated={() => afterEvent(x.id)}
                />

                {openEvents[x.id] && (
                  <div className="rounded-md border border-slate-100 dark:border-slate-800">
                    {!ev || ev.loading ? (
                      <p className="px-3 py-2 text-[11px] text-slate-400">Reading events…</p>
                    ) : ev.error ? (
                      <p className="px-3 py-2 text-[11px] text-amber-600">siem-integration-svc: {ev.error}</p>
                    ) : !ev.events || ev.events.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-slate-500">No events recorded against this exporter.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {ev.events.map((e) => (
                          <li key={e.id} className="space-y-0.5 px-3 py-2" data-event-id={e.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGES[e.severity] || SEVERITY_BADGES.LOW}`}>
                                {e.severity}
                              </span>
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{e.event_type}</span>
                              <span className="font-mono text-[11px] text-slate-400">{e.source_service}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{e.message}</p>
                            <p className="text-[11px] text-slate-500">{siemStatusText(e.status)}</p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {new Date(e.timestamp).toLocaleString()} · {e.id}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
