"use client";

import { Fragment, useMemo, useState } from "react";
import { Search, Download, History, ScrollText, FilePlus2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import {
  downloadDocumentAction,
  fetchAccessLogAction,
  fetchVersionsAction,
} from "@/app/admin/documents/actions";
import type { Classification, VaultDocument } from "@/lib/api/documents";
import { formatSize } from "@/lib/api/documents";
import { AddVersionForm } from "./DocumentForms";

function ClassificationBadge({ value }: { value: Classification }) {
  const style =
    value === "RESTRICTED"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : value === "CONFIDENTIAL"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : value === "INTERNAL"
          ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400";

  return (
    <span
      className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " + style}
      title="Reading this document's bytes needs DOCUMENT_DOWNLOAD, which is a separate grant from seeing it listed here."
    >
      {value}
    </span>
  );
}

function when(value: string): string {
  return new Date(value).toLocaleString();
}

/** Decode a base64 payload into a Blob and trigger a browser save-as. */
function saveBase64(base64: string, contentType: string, filename: string) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const blob = new Blob([array], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Tab = "versions" | "access-log" | "add-version";

/**
 * The register table, interactive: search, and per-row Download / Versions /
 * Access log / Add version — all four already real, authorized, tested
 * endpoints on document-vault-svc that this console previously gave no way
 * to reach. Data for each tab is fetched on first open and cached per
 * document for the rest of the session, so switching between an already-open
 * document's tabs is instant.
 */
export function DocumentRegisterTable({ documents }: { documents: VaultDocument[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("versions");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null);

  const [versionsById, setVersionsById] = useState<Record<string, Awaited<ReturnType<typeof fetchVersionsAction>>>>({});
  const [accessLogById, setAccessLogById] = useState<Record<string, Awaited<ReturnType<typeof fetchAccessLogAction>>>>({});

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.classification.toLowerCase().includes(term) ||
        d.document_id.toLowerCase().includes(term),
    );
  }, [documents, searchTerm]);

  async function toggleRow(documentId: string, tab: Tab) {
    if (expanded === documentId && activeTab === tab) {
      setExpanded(null);
      return;
    }
    setExpanded(documentId);
    setActiveTab(tab);
    if (tab === "versions" && !versionsById[documentId]) {
      const result = await fetchVersionsAction(documentId);
      setVersionsById((prev) => ({ ...prev, [documentId]: result }));
    }
    if (tab === "access-log" && !accessLogById[documentId]) {
      const result = await fetchAccessLogAction(documentId);
      setAccessLogById((prev) => ({ ...prev, [documentId]: result }));
    }
  }

  async function handleDownload(documentId: string, title: string) {
    setDownloading(documentId);
    setDownloadError(null);
    const result = await downloadDocumentAction(documentId, title);
    setDownloading(null);
    if (result.status === "downloaded") {
      saveBase64(result.contentBase64, result.contentType, result.filename);
      return;
    }
    setDownloadError({
      id: documentId,
      message: "message" in result ? result.message : "The download could not be completed.",
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by title, classification, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse">
          <thead>
            <tr>
              <th className={HEAD}>Title</th>
              <th className={HEAD}>Classification</th>
              <th className={HEAD}>Version</th>
              <th className={HEAD}>Retention</th>
              <th className={HEAD}>Residency</th>
              <th className={HEAD}>Filed by</th>
              <th className={HEAD}>Filed</th>
              <th className={HEAD}>ID</th>
              <th className={HEAD}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className={`${CELL} text-slate-400 dark:text-slate-500`} colSpan={9}>
                  No document matches &ldquo;{searchTerm}&rdquo;.
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <Fragment key={d.document_id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800">
                    <td className={CELL}>{d.title}</td>
                    <td className={CELL}>
                      <ClassificationBadge value={d.classification} />
                    </td>
                    <td className={CELL}>
                      <span title="Versions are append-only — this is the current one, not the only one.">
                        v{d.current_version}
                      </span>
                    </td>
                    <td className={CELL}>
                      <span className="text-xs">{d.retention_policy}</span>
                    </td>
                    <td className={CELL}>
                      <span className="text-xs">{d.residency_region_code ?? "—"}</span>
                    </td>
                    <td className={CELL}>
                      <span className="text-xs">{d.created_by_principal_id}</span>
                    </td>
                    <td className={CELL}>
                      <span className="text-xs">{when(d.created_at)}</span>
                    </td>
                    <td className={CELL}>
                      <CopyableId value={d.document_id} />
                    </td>
                    <td className={CELL}>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Download this document's current version (needs DOCUMENT_DOWNLOAD)"
                          disabled={downloading === d.document_id}
                          onClick={() => handleDownload(d.document_id, d.title)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="View version lineage"
                          onClick={() => toggleRow(d.document_id, "versions")}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="View access log"
                          onClick={() => toggleRow(d.document_id, "access-log")}
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Add a new version"
                          onClick={() => toggleRow(d.document_id, "add-version")}
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                        </Button>
                        {expanded === d.document_id ? (
                          <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </div>
                    </td>
                  </tr>

                  {downloadError?.id === d.document_id && (
                    <tr>
                      <td colSpan={9} className="border-t-0 px-3 pb-2">
                        <ResultBanner tone="warning" message={downloadError.message} />
                      </td>
                    </tr>
                  )}

                  {expanded === d.document_id && (
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      <td colSpan={9} className="p-4">
                        {activeTab === "versions" && (
                          <VersionsPanel result={versionsById[d.document_id]} />
                        )}
                        {activeTab === "access-log" && (
                          <AccessLogPanel result={accessLogById[d.document_id]} />
                        )}
                        {activeTab === "add-version" && <AddVersionForm documentId={d.document_id} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VersionsPanel({ result }: { result: Awaited<ReturnType<typeof fetchVersionsAction>> | undefined }) {
  if (!result || result.status === "idle") {
    return <p className="text-sm text-slate-500">Loading version lineage…</p>;
  }
  if (result.status !== "loaded") {
    return <ResultBanner tone={result.status === "refused" ? "warning" : "error"} message={result.message} />;
  }
  if (result.versions.length === 0) {
    return <p className="text-sm text-slate-500">No version rows returned.</p>;
  }
  return (
    <table className="w-full min-w-[36rem] border-collapse text-sm">
      <thead>
        <tr>
          <th className={HEAD}>Version</th>
          <th className={HEAD}>Size</th>
          <th className={HEAD}>Content type</th>
          <th className={HEAD}>Checksum (SHA-256)</th>
          <th className={HEAD}>Created by</th>
          <th className={HEAD}>Created</th>
        </tr>
      </thead>
      <tbody>
        {result.versions.map((v) => (
          <tr key={v.document_version_id} className="border-t border-slate-100 dark:border-slate-800">
            <td className={CELL}>v{v.version}</td>
            <td className={CELL}>{formatSize(v.size_bytes)}</td>
            <td className={CELL}>
              <span className="text-xs">{v.content_type}</span>
            </td>
            <td className={CELL}>
              <span className="font-mono text-[11px]">{v.checksum_sha256.slice(0, 16)}…</span>
            </td>
            <td className={CELL}>
              <span className="text-xs">{v.created_by_principal_id}</span>
            </td>
            <td className={CELL}>
              <span className="text-xs">{when(v.created_at)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccessLogPanel({ result }: { result: Awaited<ReturnType<typeof fetchAccessLogAction>> | undefined }) {
  if (!result || result.status === "idle") {
    return <p className="text-sm text-slate-500">Loading access log…</p>;
  }
  if (result.status !== "loaded") {
    return <ResultBanner tone={result.status === "refused" ? "warning" : "error"} message={result.message} />;
  }
  if (result.entries.length === 0) {
    return <p className="text-sm text-slate-500">No access recorded yet.</p>;
  }
  return (
    <table className="w-full min-w-[32rem] border-collapse text-sm">
      <thead>
        <tr>
          <th className={HEAD}>Accessed by</th>
          <th className={HEAD}>Access type</th>
          <th className={HEAD}>Correlation ID</th>
          <th className={HEAD}>When</th>
        </tr>
      </thead>
      <tbody>
        {result.entries.map((e) => (
          <tr key={e.access_log_id} className="border-t border-slate-100 dark:border-slate-800">
            <td className={CELL}>
              <span className="text-xs">{e.accessed_by_principal_id}</span>
            </td>
            <td className={CELL}>
              <span
                className={
                  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (e.access_type === "DOWNLOAD"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400")
                }
              >
                {e.access_type}
              </span>
            </td>
            <td className={CELL}>
              <span className="font-mono text-[11px] text-slate-400">{e.correlation_id ?? "—"}</span>
            </td>
            <td className={CELL}>
              <span className="text-xs">{when(e.accessed_at)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
