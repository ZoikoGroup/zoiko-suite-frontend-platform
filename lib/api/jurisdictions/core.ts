// Shared plumbing for the jurisdiction-rules-svc (:8082) client: API-4 list
// paging, API-3 ETags, and the service's RFC 9457 problems in words.
//
// Every call goes through lib/api/client.ts, which goes through envelope.ts:
// the bearer envelope, X-Request-Id, X-Correlation-ID, and an Idempotency-Key
// on every mutation. Administrative writes need the verified envelope
// (IDENTITY_VERIFY_ADMIN=require, J-01): headers alone answer 401.

import { apiGet, apiPost, apiPut, type ApiError, type ApiResult, type ApiWriteResult, type Identity } from "../client";
import type { EnvelopeOptions } from "../envelope";

export const JR = "jurisdictionRules" as const;

export type Caller = Identity & { principalId: string };

/** API-4 page: `{items, next_cursor, page_size}`. */
type Page<T> = { items: T[]; next_cursor?: string; page_size: number };

/**
 * Every item of an API-4 list, following `next_cursor` (200 per page, at most
 * `maxPages` pages). Filters travel as `filter[name]`; the service binds each
 * cursor to the tenant, the route and the filters, so a cursor is only ever
 * replayed against the list it came from.
 */
export async function listAll<T>(
  path: string,
  identity?: Identity,
  filters: Record<string, string | undefined> = {},
  maxPages = 20,
): Promise<ApiResult<T[]>> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const query: Record<string, string | undefined> = { page_size: "200", cursor };
    for (const [k, v] of Object.entries(filters)) if (v) query[`filter[${k}]`] = v;
    const r = await apiGet<Page<T>>(JR, path, { identity, query });
    if (!r.ok) return r;
    if (!r.data || !Array.isArray(r.data.items)) {
      return { ok: false, error: { kind: "malformed", message: `jurisdiction-rules-svc answered ${path} without an items list` } };
    }
    out.push(...r.data.items);
    cursor = r.data.next_cursor;
    if (!cursor) return { ok: true, data: out };
  }
  return { ok: true, data: out };
}

/** A record and the ETag it was read at (API-3), for the next command's If-Match. */
export type Versioned<T> = { data: T; etag?: string };

export async function getVersioned<T>(
  path: string,
  identity?: Identity,
  query?: Record<string, string | number | undefined>,
): Promise<ApiResult<Versioned<T>>> {
  let etag: string | undefined;
  const r = await apiGet<T>(JR, path, { identity, query, onHeaders: (h) => (etag = h.get("ETag") ?? undefined) });
  return r.ok ? { ok: true, data: { data: r.data, etag } } : r;
}

export function get<T>(path: string, identity?: Identity, query?: Record<string, string | number | undefined>): Promise<ApiResult<T>> {
  return apiGet<T>(JR, path, { identity, query });
}

export type WriteOpts = Pick<EnvelopeOptions, "ifMatch" | "approvalReference" | "idempotencyKey" | "evidenceRefs">;

export function post<T>(path: string, body: unknown, identity: Caller, opts: WriteOpts = {}): Promise<ApiWriteResult<T>> {
  return apiPost<T>(JR, path, body, { identity, ...opts });
}

export function put<T>(path: string, body: unknown, identity: Caller, opts: WriteOpts = {}): Promise<ApiWriteResult<T>> {
  return apiPut<T>(JR, path, body, { identity, ...opts });
}

/** The ETag of a record whose body carries `row_version` (jurisdictions, rules). */
export function etagOf(rowVersion: number | undefined | null): string | undefined {
  return rowVersion ? `"${rowVersion}"` : undefined;
}

export const seg = encodeURIComponent;

// ── problems ─────────────────────────────────────────────────────────────────

/** The `code` of an RFC 9457 problem the service answered, if it sent one. */
export function problemCode(error: ApiError): string {
  const b = error.body as { code?: unknown; error?: unknown } | undefined;
  if (b && typeof b.code === "string") return b.code;
  if (b && typeof b.error === "string") return b.error;
  return "";
}

export function problemDetail(error: ApiError): string {
  const b = error.body as { detail?: unknown } | undefined;
  return b && typeof b.detail === "string" ? b.detail : "";
}

const SENTENCES: Record<string, string> = {
  identity_not_verified:
    "This change needs your verified sign-in, and the registry did not receive one. Sign in again, then repeat it. Nothing was written.",
  missing_principal: "The registry received no signed-in person, so it refused. Sign in again.",
  missing_tenant: "The registry received no tenant for this request. Sign in again.",
  unauthorized:
    "authorization-svc refused this. Your role needs the matching JURISDICTION_* grant on the platform scope: jurisdictions are platform-wide reference data, not owned by a legal entity.",
  authz_unavailable: "The registry could not get an authorization decision, so it refused rather than guess. Nothing was written. Retry.",
  self_approval_forbidden: "The rule's author cannot activate it. A second person must, citing an approval someone other than the author decided.",
  segregation_of_duties: "You recorded this, so you cannot also review or approve it. A second person must.",
  not_assigned_reviewer: "This notice is assigned to another reviewer.",
  approval_not_valid: "workflow-svc does not confirm this approval for this rule.",
  approval_service_unavailable:
    "workflow-svc could not be asked whether the approval is valid, so the activation was refused (fail-closed). Nothing changed. Retry when workflow-svc is up.",
  missing_approval_reference: "Activating a rule needs the approval it rests on: the workflow-svc approval id.",
  precondition_failed: "Someone else changed this record after you opened it. Reload the page and try again.",
  invalid_if_match: "The record version sent with this change was not valid. Reload the page and try again.",
  event_not_recorded:
    "The change could not be recorded together with its event, so nothing was written (one transaction per request). Retry.",
  store_unavailable: "The registry's database did not answer. Nothing was written. Retry.",
  idempotency_conflict: "This request was already sent with different content under the same key. Reload and start again.",
  idempotency_key_reused: "This request was already sent with different content under the same key. Reload and start again.",
  request_in_progress: "The same request is still being processed. Wait a moment, then reload.",
  jurisdiction_not_found: "No such jurisdiction is in force here. Services that validate against this register fail closed on it.",
  unknown_jurisdiction_code: "No jurisdiction has that code here.",
  rule_not_found: "No such rule in this register.",
  source_not_found: "No such source in the register.",
  source_not_ready: "That source cannot be used yet: it must be reviewed by a second person first, and not superseded.",
  interpretation_not_found: "No such interpretation.",
  interpretation_not_approved: "That interpretation is not approved yet. A second person must approve it before rules or packs cite it.",
  regime_not_found: "No such regime.",
  pack_not_found: "No such pack.",
  pack_version_not_found: "No such pack version.",
  not_compiled: "Compile the pack version first: there is no artifact yet.",
  already_compiled: "This version is already compiled. Its artifact is immutable; author a new version to change it.",
  not_certified: "This version is not certified yet.",
  no_test_bundle: "Submit a test bundle before running the tests.",
  not_draft: "Only a DRAFT version can do this.",
  not_under_review: "This version is not under review.",
  invalid_lifecycle_state: "The pack's state machine does not allow that step from its current state.",
  version_not_newer: "A new version must be newer than the versions already registered.",
  pinned_pack_not_eligible: "That pinned pack version is not eligible to answer (not released, or withdrawn or blocked).",
  signing_not_configured: "Pack signing is not configured on this service (no signing key). Platform ops must set it up.",
  signing_key_not_active: "The signing key is not active.",
  signing_key_not_found: "No such signing key.",
  key_mismatch: "That key ref is already registered with a different public key.",
  ring_not_found: "No such deployment ring.",
  region_not_found: "No such deployment region.",
  deployment_not_found: "No active deployment matches that ring and region.",
  hotfix_not_found: "No hotfix is declared for this version.",
  notice_not_found: "No such source-change notice.",
  import_not_found: "No such import batch.",
  import_already_decided: "This import was already approved or rejected.",
  import_has_invalid_rows: "This import has rows that failed validation, so it cannot be approved. Reject it and propose a corrected one.",
  import_version_conflict: "The register changed since this import was proposed. Propose it again against the current register.",
  alias_not_found: "No such alias.",
  alias_conflict: "That alias code is already mapped for this period.",
  calendar_not_found: "No such calendar.",
  calendar_not_ready: "That calendar has no published version yet.",
  no_calendar_version: "That calendar has no version in force at that date.",
  calendar_import_conflict: "A version for that effective date already exists with different content.",
  payment_term_not_found: "No such payment term.",
  payment_term_version_not_found: "No such payment-term version.",
  payment_term_not_draft: "Only a DRAFT payment-term version can be approved.",
  payment_term_not_active: "Only an ACTIVE payment-term version can be superseded or retired.",
  no_payment_term_version: "That payment term has no version in force at that date.",
  basis_date_required: "A basis date (invoice, receipt or delivery date) is required.",
  obligation_rule_not_found: "No such obligation rule.",
  rollout_not_found: "No such rollout.",
  remediation_case_not_found: "No such remediation case.",
  nothing_to_remediate: "No decision was made with that version, so there is nothing to remediate.",
  remediation_refused: "The remediation case refused that step.",
  decision_not_found: "No such decision.",
  decision_not_in_case: "That decision is not part of this case.",
  disposition_differs: "That decision already has a different disposition. Dispositions are append-only.",
  submission_not_found: "No such submission.",
  operation_not_found: "No such operation.",
  operation_not_cancelable: "Only a queued operation can be cancelled.",
  outbox_event_not_found: "No such outbox event.",
  outbox_event_not_parked: "That event is not parked.",
  supersedes_taken: "Another version already supersedes that one.",
  supersession_required: "This change must supersede the version in force.",
  invalid_supersession: "That supersession is not allowed.",
  registry_unavailable: "tenant-entity-registry-svc did not answer, so nothing was changed. Retry.",
  registry_refused: "tenant-entity-registry-svc refused the read.",
  evidence_required: "Evidence is required for this step: name the document or ticket it rests on.",
  unknown_filter: "The register was asked with a filter it does not know.",
  invalid_cursor: "The page link has expired or belongs to another list. Go back to the first page.",
};

/** One refusal from jurisdiction-rules-svc, in words. */
export function explainJurisdictionProblem(error: ApiError): string {
  if (error.kind === "unreachable") return "jurisdiction-rules-svc could not be reached. Nothing was read or written.";
  if (error.kind === "timeout") return "jurisdiction-rules-svc did not answer in time. Nothing was confirmed.";
  if (error.tenantContext === "denied") return "The gateway refused your tenant context (unknown or suspended tenant). Signing in again will not help.";
  const code = problemCode(error);
  const detail = problemDetail(error);
  if (code === "missing_field") return `A required field is empty: ${detail || "see the form"}.`;
  if (code === "approval_not_valid") return `${SENTENCES.approval_not_valid}${detail ? ` ${capitalize(detail.replace(/^approval reference is not a valid approval of this rule: /, ""))}.` : ""}`;
  if (SENTENCES[code]) return SENTENCES[code];
  if (code.startsWith("invalid_") || code.endsWith("_not_found")) return detail ? capitalize(detail) + (detail.endsWith(".") ? "" : ".") : `The service refused the request (${code}).`;
  if (error.status === 401) return SENTENCES.identity_not_verified;
  if (error.status === 403) return SENTENCES.unauthorized;
  if (error.status === 412) return SENTENCES.precondition_failed;
  if (error.status === 503) return SENTENCES.store_unavailable;
  return detail || error.message;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** A refusal that is the control working (shown amber) rather than a fault. */
export function isRefusal(error: ApiError): boolean {
  return error.status !== undefined && [400, 403, 404, 409, 412, 422].includes(error.status);
}
