// document-vault-svc (:8094) — the store of record for governed documents.
//
// Per docs/architecture/01-backend.md §8.3 this service does not merely store
// documents, it "preserves documentary evidence as part of operational truth":
// an append-only version lineage, a SHA-256 checksum recomputed on every read,
// and an append-only log of every access. financial-close-svc already writes
// close evidence here, so this is not a new dependency — only the first surface
// on it.
//
// Five properties shape this page, and four of them were gaps until 18 Aug:
//
//  1. NOTHING WAS AUTHORIZED. Every route answered anything that could reach
//     the port — including GET /{id}/content, which returns the bytes, on a
//     vault whose own schema classifies its contents PUBLIC / INTERNAL /
//     CONFIDENTIAL / RESTRICTED. Five actions gate it now.
//  2. READ AND DOWNLOAD ARE DIFFERENT GRANTS. Knowing a document exists and
//     reading it are different disclosures; the access log has recorded them as
//     different access types since day one, and authorization now agrees. So a
//     principal can legitimately see this register and be refused the content.
//  3. THE ACCESS LOG IS ITS OWN GRANT AGAIN. It says who read what and when —
//     the record an investigator consults — so it does not fall out of ordinary
//     read access.
//  4. EVERY READ IS RECORDED. Opening a document's metadata appends a METADATA
//     entry; fetching content appends a DOWNLOAD entry. There is no way to look
//     without leaving a trace, which is the point of the service.
//  5. VERSIONS ARE APPEND-ONLY. A new version is a new row and a bump of
//     current_version; a version is never rewritten, and nothing is deleted.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Wire shape. Field names match the Go json tags exactly. */
export type VaultDocument = {
  document_id: string;
  tenant_id: string;
  legal_entity_id: string;
  title: string;
  classification: Classification;
  retention_policy: string;
  residency_region_code?: string | null;
  current_version: number;
  status: "ACTIVE" | "RETAINED" | "PURGE_PENDING";
  created_by_principal_id: string;
  created_at: string;
  updated_at: string;
};

export type DocumentVersion = {
  document_version_id: string;
  document_id: string;
  version: number;
  checksum_sha256: string;
  storage_key: string;
  size_bytes: number;
  content_type: string;
  created_by_principal_id: string;
  created_at: string;
};

export type DocumentAccessEntry = {
  access_log_id: string;
  document_id: string;
  document_version_id?: string | null;
  accessed_by_principal_id: string;
  access_type: "METADATA" | "DOWNLOAD";
  correlation_id?: string | null;
  accessed_at: string;
};

/**
 * The register for one legal entity.
 *
 * legalEntityId is required, and that is the service's rule rather than this
 * client's preference: documents are authorized per legal entity, so a register
 * spanning every entity in the tenant would have no single scope to authorize
 * against. Defaulting to "everything the tenant owns" is exactly how the
 * unscoped reads elsewhere in this platform came about.
 *
 * There was no list endpoint at all before this pass — six routes, every one of
 * which needed a document_id you already had. The vault could be written to and
 * read from but never browsed, which is why it had no console page: there was
 * nothing to put on one.
 */
export async function listDocuments(params: {
  identity: Identity;
  legalEntityId: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<VaultDocument[]>> {
  return apiGet<VaultDocument[]>("documentVault", "/v1/documents/", {
    identity: params.identity,
    query: {
      legal_entity_id: params.legalEntityId,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

/**
 * Read one document's metadata.
 *
 * This APPENDS a METADATA row to its access log. There is no quiet read — the
 * console cannot look at a document without the vault recording that it did.
 */
export async function getDocument(params: {
  identity: Identity;
  documentId: string;
}): Promise<ApiResult<VaultDocument>> {
  return apiGet<VaultDocument>(
    "documentVault",
    `/v1/documents/${encodeURIComponent(params.documentId)}`,
    { identity: params.identity },
  );
}

export async function listVersions(params: {
  identity: Identity;
  documentId: string;
}): Promise<ApiResult<DocumentVersion[]>> {
  return apiGet<DocumentVersion[]>(
    "documentVault",
    `/v1/documents/${encodeURIComponent(params.documentId)}/versions`,
    { identity: params.identity },
  );
}

/**
 * The access history, newest first.
 *
 * Needs DOCUMENT_ACCESS_LOG_READ, which is deliberately not implied by being
 * able to read the document itself.
 */
export async function listAccessLog(params: {
  identity: Identity;
  documentId: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<DocumentAccessEntry[]>> {
  return apiGet<DocumentAccessEntry[]>(
    "documentVault",
    `/v1/documents/${encodeURIComponent(params.documentId)}/access-log`,
    { identity: params.identity, query: { limit: params.limit, offset: params.offset } },
  );
}

/**
 * File a document.
 *
 * The content is sent base64-encoded inline; the service computes the SHA-256
 * on write and re-verifies it on every read, so an integrity failure surfaces
 * as a 409 rather than as silently wrong bytes.
 *
 * tenant_id is NOT sent. The service takes it from the verified X-Tenant-Id
 * header and refuses a body naming a different one — sending it from here would
 * only create a second place for the two to disagree.
 */
export async function createDocument(params: {
  identity: Identity;
  legalEntityId: string;
  title: string;
  classification: Classification;
  contentType: string;
  contentBase64: string;
  retentionPolicy?: string;
  residencyRegionCode?: string;
}): Promise<ApiWriteResult<VaultDocument>> {
  return apiPost<VaultDocument>(
    "documentVault",
    "/v1/documents/",
    {
      legal_entity_id: params.legalEntityId,
      title: params.title,
      classification: params.classification,
      content_type: params.contentType,
      content_base64: params.contentBase64,
      ...(params.retentionPolicy ? { retention_policy: params.retentionPolicy } : {}),
      ...(params.residencyRegionCode ? { residency_region_code: params.residencyRegionCode } : {}),
    },
    { identity: params.identity },
  );
}

/** Append a new version. The previous one is never rewritten. */
export async function addVersion(params: {
  identity: Identity;
  documentId: string;
  contentType: string;
  contentBase64: string;
}): Promise<ApiWriteResult<VaultDocument>> {
  return apiPost<VaultDocument>(
    "documentVault",
    `/v1/documents/${encodeURIComponent(params.documentId)}/versions`,
    { content_type: params.contentType, content_base64: params.contentBase64 },
    { identity: params.identity },
  );
}

/**
 * Turn a service refusal into something an operator can act on.
 *
 * Most of these depend on grants only authorization-svc knows about, which is
 * exactly when a bare error string leaves the reader with nothing to do next.
 */
export function explainDocumentError(message: string): string {
  if (message.includes("not authorized")) {
    return "authorization-svc refused this. The vault distinguishes five separate grants — creating, reading metadata, downloading content, adding a version, and reading the access log — so being able to see a document does not imply being able to open it.";
  }
  if (message.includes("authorization-svc unavailable")) {
    return "authorization-svc could not be reached, so nothing could be checked. Nothing was read or written — this service fails closed rather than guessing.";
  }
  if (message.includes("tenant_id in the body does not match")) {
    return "The document named a different tenant than the request. The vault files documents into the tenant the request is scoped to, and refuses a body that disagrees rather than filing it somewhere unexpected.";
  }
  if (message.includes("tenant context missing")) {
    return "The request carried no tenant. Sign in again.";
  }
  if (message.includes("caller identity missing")) {
    return "The vault received no verified principal. Every read is recorded against the caller, so an unidentified one is refused rather than logged as “unknown”.";
  }
  if (message.includes("checksum mismatch") || message.includes("integrity")) {
    return "The stored bytes no longer match the checksum recorded when this version was filed. The vault refuses to serve content that failed integrity verification — this is the control working, and it needs investigating rather than retrying.";
  }
  if (message.includes("residency")) {
    return "This document's residency region does not permit the access. The vault fails closed on residency rather than serving the content and noting the violation afterwards.";
  }
  if (message.includes("invalid_classification") || message.includes("invalid classification")) {
    return "That is not a classification this vault recognises. Use PUBLIC, INTERNAL, CONFIDENTIAL or RESTRICTED.";
  }
  if (message.includes("legal_entity_id is required")) {
    return "A legal entity is required. Documents are authorized per legal entity, so there is no register spanning all of them.";
  }
  if (message.includes("limit must be")) {
    return "The register read asked for an out-of-range page. limit must be 1–500 and offset must not be negative.";
  }
  if (message.includes("document not found")) {
    return "No document with that id in this tenant.";
  }
  if (message.includes("storage_unavailable")) {
    return "The document metadata is readable but its bytes could not be fetched from storage. The record is intact; the blob store is not answering.";
  }
  return message;
}

/** Bytes, rendered for a register column. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
