import type { DocumentAccessEntry, DocumentVersion, VaultDocument } from "@/lib/api/documents";

/**
 * Action states for the document vault.
 *
 * `refused` is kept apart from `error` because this service has five separate
 * grants, and being refused one of them is a governance answer rather than a
 * fault — a principal who can see the register and not open a RESTRICTED
 * document is the control working exactly as intended.
 *
 * `integrity` is kept apart from both. A checksum mismatch means the stored
 * bytes no longer match what was filed. That is not a permission problem and
 * not a transient failure; it is the one outcome on this page that warrants
 * stopping and investigating, and folding it into a generic error would bury
 * the only alarm the vault can raise.
 */

export type FileDocumentState =
  | { status: "idle" }
  | { status: "filed"; document: VaultDocument; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type AddVersionState =
  | { status: "idle" }
  | { status: "added"; document: VaultDocument; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_FILE_DOCUMENT: FileDocumentState = { status: "idle" };
export const IDLE_ADD_VERSION: AddVersionState = { status: "idle" };

/**
 * Outcome of fetching a document's bytes.
 *
 * `integrity` is its own outcome, not folded into `error` — a checksum
 * mismatch means the stored bytes no longer match what was filed, which is
 * the one alarm this vault exists to raise and warrants investigating rather
 * than retrying (see explainDocumentError).
 */
export type DownloadState =
  | { status: "idle" }
  | { status: "downloaded"; contentBase64: string; contentType: string; filename: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "integrity"; message: string }
  | { status: "error"; message: string };

export const IDLE_DOWNLOAD: DownloadState = { status: "idle" };

export type VersionsState =
  | { status: "idle" }
  | { status: "loaded"; documentId: string; versions: DocumentVersion[] }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_VERSIONS: VersionsState = { status: "idle" };

export type AccessLogState =
  | { status: "idle" }
  | { status: "loaded"; documentId: string; entries: DocumentAccessEntry[] }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_ACCESS_LOG: AccessLogState = { status: "idle" };
