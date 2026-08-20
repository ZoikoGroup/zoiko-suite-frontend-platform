import { cookies } from "next/headers";
import { FileText, CloudOff, ShieldAlert } from "lucide-react";
import { PanelEmptyState, CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  explainDocumentError,
  listDocuments,
  type Classification,
  type VaultDocument,
} from "@/lib/api/documents";

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

/**
 * The vault register for the session's legal entity.
 *
 * Two things about this panel are the service's design rather than choices
 * made here:
 *
 *  - It is scoped to ONE legal entity, because that is what the vault
 *    authorizes against. There is no all-entities view to offer.
 *  - Listing a document does not mean its content is readable. DOCUMENT_READ
 *    and DOCUMENT_DOWNLOAD are separate grants, so a row can legitimately
 *    appear here and its download be refused.
 */
export async function DocumentRegisterPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Not signed in"
        hint="The vault records every read against the caller, so there is no anonymous view of it."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listDocuments({ identity, legalEntityId: session.legalEntityId });

  if (!result.ok) {
    // A 403 here is a governance answer, not an outage: this principal holds no
    // DOCUMENT_READ on the entity. Saying so is more useful than "unavailable".
    const denied = result.error.status === 403;
    return (
      <PanelEmptyState
        icon={denied ? ShieldAlert : CloudOff}
        tone="warning"
        label={denied ? "You cannot read this entity's vault" : "Document vault unavailable"}
        hint={explainDocumentError(result.error.message)}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={FileText}
        tone="neutral"
        label="No documents filed for this legal entity"
        hint="Documents filed here keep an append-only version lineage and a log of every read. Nothing is ever deleted — a superseded version stays alongside the one that replaced it."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse">
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
          </tr>
        </thead>
        <tbody>
          {result.data.map((d: VaultDocument) => (
            <tr key={d.document_id} className="border-t border-slate-100 dark:border-slate-800">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
