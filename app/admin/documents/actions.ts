"use server";

// Server Actions for document-vault-svc (:8094).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.
//
// The file content arrives here as a base64 string rather than as a browser
// File. The vault's own API takes content_base64 inline, and doing the encode
// on the client keeps the bytes out of a multipart round trip that this console
// has no other use for.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  CLASSIFICATIONS,
  addVersion,
  createDocument,
  explainDocumentError,
  type Classification,
} from "@/lib/api/documents";
import { type AddVersionState, type FileDocumentState } from "./state";

async function requireIdentity(): Promise<SessionIdentity & { principalId: string }> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

/** Roughly 9 MiB of document once decoded — the service caps the body at 12 MiB
 *  of base64, so refusing here explains the limit instead of letting the upload
 *  die as a truncated request. */
const MAX_BASE64_CHARS = 12 * 1024 * 1024;

export async function fileDocumentAction(
  _prev: FileDocumentState,
  formData: FormData,
): Promise<FileDocumentState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const title = String(formData.get("title") ?? "").trim();
  const classification = String(formData.get("classification") ?? "").trim();
  const contentType = String(formData.get("content_type") ?? "").trim() || "application/octet-stream";
  const contentBase64 = String(formData.get("content_base64") ?? "");
  const retentionPolicy = String(formData.get("retention_policy") ?? "").trim();
  const residencyRegionCode = String(formData.get("residency_region_code") ?? "").trim();

  if (!legalEntityId) return { status: "error", message: "A legal entity is required — documents are authorized per entity." };
  if (!title) return { status: "error", message: "A title is required." };
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) {
    return {
      status: "error",
      message: "Choose a classification. It decides how this document is protected, so the vault will not accept a document without one.",
    };
  }
  if (!contentBase64) return { status: "error", message: "Choose a file to file." };
  if (contentBase64.length > MAX_BASE64_CHARS) {
    return { status: "error", message: "That file is too large for the vault's 12 MiB request limit." };
  }

  const result = await createDocument({
    identity,
    legalEntityId,
    title,
    classification: classification as Classification,
    contentType,
    contentBase64,
    ...(retentionPolicy ? { retentionPolicy } : {}),
    ...(residencyRegionCode ? { residencyRegionCode } : {}),
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainDocumentError(message) };
    if (status === 403) return { status: "refused", message: explainDocumentError(message) };
    return { status: "error", message: explainDocumentError(message) };
  }

  refresh();

  return {
    status: "filed",
    document: result.data,
    message: `Filed “${result.data.title}” as ${result.data.classification}, version 1. Its checksum is recorded now and re-verified on every read, and every access from here on appends a row to its log.`,
  };
}

export async function addVersionAction(
  _prev: AddVersionState,
  formData: FormData,
): Promise<AddVersionState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const documentId = String(formData.get("document_id") ?? "").trim();
  const contentType = String(formData.get("content_type") ?? "").trim() || "application/octet-stream";
  const contentBase64 = String(formData.get("content_base64") ?? "");

  if (!documentId) return { status: "error", message: "A document id is required." };
  if (!contentBase64) return { status: "error", message: "Choose a file for the new version." };
  if (contentBase64.length > MAX_BASE64_CHARS) {
    return { status: "error", message: "That file is too large for the vault's 12 MiB request limit." };
  }

  const result = await addVersion({ identity, documentId, contentType, contentBase64 });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainDocumentError(message) };
    if (status === 403) return { status: "refused", message: explainDocumentError(message) };
    return { status: "error", message: explainDocumentError(message) };
  }

  refresh();

  return {
    status: "added",
    document: result.data,
    message: `Added version ${result.data.current_version}. The previous version is untouched — the lineage is append-only, so nothing that was ever filed here is rewritten or removed.`,
  };
}
