import type { EvidenceManifest, ManifestRecord } from "@/lib/api/evidence-manifest";

/**
 * A ManifestRecord with its base64 snapshot already decoded server-side
 * (decoding needs Node's Buffer, which a "use client" component cannot use).
 * `decoded` is undefined when the snapshot could not be parsed — the raw
 * base64 is kept in that case so nothing is silently dropped.
 */
export type DisplayManifestRecord = ManifestRecord & { decoded?: unknown };

/**
 * Outcome of generating a manifest.
 *
 * `refused` is an RBAC answer, not a fault. There is no `failed` variant
 * carrying a manifest: when generation fails closed because a source service
 * was unreachable, the service DOES persist a FAILED manifest row, but its
 * POST response is only {"error":"source_service_unavailable"} — the
 * manifest_id is never returned on that path, so there is nothing here to
 * look it up by afterwards. That is a real limit of the service's own API,
 * not something this console can work around, and explainManifestError says
 * so plainly.
 */
export type GenerateManifestState =
  | { status: "idle" }
  | { status: "generated"; manifest: EvidenceManifest; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_GENERATE: GenerateManifestState = { status: "idle" };

export type LookupState =
  | { status: "idle" }
  | { status: "found"; manifest: EvidenceManifest }
  | { status: "not_found"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_LOOKUP: LookupState = { status: "idle" };

export type RecordsState =
  | { status: "idle" }
  | { status: "loaded"; manifestId: string; records: DisplayManifestRecord[] }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_RECORDS: RecordsState = { status: "idle" };
