import { cookies } from "next/headers";
import { FileText, CloudOff, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { explainDocumentError, listDocuments, MAX_DOCUMENTS_PAGE } from "@/lib/api/documents";
import { DocumentRegisterTable } from "./DocumentRegisterTable";

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

  const result = await listDocuments({
    identity,
    legalEntityId: session.legalEntityId,
    limit: MAX_DOCUMENTS_PAGE,
  });

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

  const truncated = result.data.length === MAX_DOCUMENTS_PAGE;

  return (
    <div className="space-y-3">
      {truncated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
          This entity has at least {MAX_DOCUMENTS_PAGE} filed documents — the vault&rsquo;s own page
          ceiling — so more may exist beyond what is shown below.
        </div>
      )}
      <DocumentRegisterTable documents={result.data} />
    </div>
  );
}
