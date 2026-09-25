"use server";

// Server Actions for retention-registry-svc (:8148).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the /admin
// proxy matcher. That matters here because releasing a legal hold unblocks
// deletion of records an authority ordered frozen.
//
// Three service properties shape everything below:
//
//  - Writes are authorized per SCOPE: a tenant-scoped hold against that tenant,
//    a platform-wide one against the platform scope. A denial names the grant
//    that is missing, not a platform-wide permission.
//  - Reads are scoped to the caller's verified tenant and include platform-wide
//    rows, because a platform-wide hold freezes this tenant's records too.
//  - Nothing here deletes anything. Resolve reports two independent findings and
//    the caller applies them.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createLegalHold,
  createRetentionPolicy,
  explainRetentionError,
  parseCustodians,
  releaseLegalHold,
  resolveRetention,
} from "@/lib/api/retention";
import {
  type CreateHoldState,
  type CreatePolicyState,
  type ReleaseHoldState,
  type ResolveState,
} from "./state";

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

/**
 * A date input submits `2026-10-05` — no time, no zone. The service parses
 * RFC3339 and rejects that outright, answering only "effective_from must be
 * RFC3339" with nothing about the real cause. Converted once here rather than at
 * each call site, the same trap this console hit on board meeting dates.
 */
function asRFC3339Date(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Record classes are free-text in the service on purpose — a new class of
 *  record must not need a redeploy — but they are compared exactly, so a
 *  lower-case entry would be a rule that matches nothing. */
function asRecordClass(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

// ─── Record a retention policy ───────────────────────────────────────────────

export async function createPolicyAction(
  _prev: CreatePolicyState,
  formData: FormData,
): Promise<CreatePolicyState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const recordClass = asRecordClass(String(formData.get("record_class") ?? ""));
  const legalRegulatoryBasis = String(formData.get("legal_regulatory_basis") ?? "").trim();
  const minRaw = String(formData.get("min_retention_days") ?? "").trim();
  const maxRaw = String(formData.get("max_retention_days") ?? "").trim();
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();
  const jurisdictionCode = String(formData.get("jurisdiction_code") ?? "").trim();
  const platformWide = String(formData.get("platform_wide") ?? "") === "on";
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!recordClass) return { status: "error", message: "A record class is required." };
  if (!legalRegulatoryBasis) {
    return {
      status: "error",
      message:
        "A legal or regulatory basis is required. A retention period with no cited basis is a number nobody can defend.",
    };
  }

  const minRetentionDays = Number(minRaw);
  if (!Number.isInteger(minRetentionDays) || minRetentionDays < 1) {
    return {
      status: "error",
      message:
        "Minimum retention must be a whole number of days, at least one. A zero-day policy permits immediate deletion, which is a decision to state explicitly rather than express as an empty rule.",
    };
  }

  let maxRetentionDays: number | undefined;
  if (maxRaw) {
    const parsed = Number(maxRaw);
    if (!Number.isInteger(parsed) || parsed < minRetentionDays) {
      return {
        status: "error",
        message: "Maximum retention must be a whole number of days and not less than the minimum.",
      };
    }
    maxRetentionDays = parsed;
  }

  const effectiveFrom = asRFC3339Date(effectiveFromRaw);
  if (!effectiveFrom) return { status: "error", message: "An effective-from date is required." };
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key." };
  }

  const result = await createRetentionPolicy({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    recordClass,
    minRetentionDays,
    maxRetentionDays,
    legalRegulatoryBasis,
    effectiveFrom,
    jurisdictionCode: jurisdictionCode || undefined,
    // Empty tenant_id means platform-wide on the wire. Sent explicitly from a
    // checkbox rather than inferred from a blank field, because "I left it
    // blank" and "I meant every tenant" are different intentions and only one
    // of them should create a rule binding the whole platform.
    tenantId: platformWide ? undefined : identity.tenantId,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainRetentionError(message) };
    if (status === 403) return { status: "refused", message: explainRetentionError(message) };
    return { status: "error", message: explainRetentionError(message) };
  }

  refresh();

  const scope = platformWide ? "every tenant" : "this tenant";
  return {
    status: "created",
    policy: result.data,
    message: `${recordClass} must now be kept for at least ${minRetentionDays.toLocaleString("en-US")} days across ${scope}. Policies are immutable — changing this later appends a new rule rather than editing this one.`,
  };
}

// ─── Engage a legal hold ─────────────────────────────────────────────────────

export async function createHoldAction(
  _prev: CreateHoldState,
  formData: FormData,
): Promise<CreateHoldState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const scopeDescription = String(formData.get("scope_description") ?? "").trim();
  const authority = String(formData.get("authority") ?? "").trim();
  const custodians = parseCustodians(String(formData.get("custodians_objects") ?? ""));
  const recordClassRaw = String(formData.get("record_class") ?? "").trim();
  const entityRef = String(formData.get("entity_ref") ?? "").trim();
  const platformWide = String(formData.get("platform_wide") ?? "") === "on";
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!scopeDescription) {
    return { status: "error", message: "Describe what is being frozen — this is the matter record." };
  }
  if (!authority) {
    return {
      status: "error",
      message:
        "An authority is required: the court, regulator or internal body that ordered the freeze. A hold with no stated authority cannot be defended or audited later.",
    };
  }
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key." };
  }

  const result = await createLegalHold({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    scopeDescription,
    authority,
    custodiansObjects: custodians,
    recordClass: recordClassRaw ? asRecordClass(recordClassRaw) : undefined,
    tenantId: platformWide ? undefined : identity.tenantId,
    entityRef: entityRef || undefined,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainRetentionError(message) };
    if (status === 403) return { status: "refused", message: explainRetentionError(message) };
    return { status: "error", message: explainRetentionError(message) };
  }

  refresh();

  const narrowing = [
    recordClassRaw ? `record class ${asRecordClass(recordClassRaw)}` : null,
    entityRef ? `entity ${entityRef}` : null,
  ].filter(Boolean);

  return {
    status: "engaged",
    hold: result.data,
    message:
      `Hold engaged. Deletion, export and migration are blocked for ${
        narrowing.length ? narrowing.join(" and ") : "everything in scope"
      } across ${platformWide ? "every tenant" : "this tenant"}, overriding every retention policy that would otherwise permit it, until this hold is released.`,
  };
}

// ─── Release a legal hold ────────────────────────────────────────────────────

export async function releaseHoldAction(
  _prev: ReleaseHoldState,
  formData: FormData,
): Promise<ReleaseHoldState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const legalHoldId = String(formData.get("legal_hold_id") ?? "").trim();
  const approver = String(formData.get("release_approved_by_principal_id") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim();

  if (!legalHoldId) return { status: "error", message: "Choose the hold to release." };
  if (!approver) {
    return {
      status: "error",
      message:
        "Name the principal who approved this release. It is recorded on the hold as the accountable approver — the service requires it and does not default it to you.",
    };
  }
  if (!correlationId) {
    return { status: "error", message: "A correlation id is required; it is the idempotency key." };
  }

  const result = await releaseLegalHold({
    identity: { ...identity, principalId: identity.principalId, tenantId: identity.tenantId },
    legalHoldId,
    releaseApprovedByPrincipalId: approver,
    correlationId,
  });

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainRetentionError(message) };
    if (status === 403) return { status: "refused", message: explainRetentionError(message) };
    // 409 is a fact about the hold, not a fault in the request: somebody already
    // released it. Kept distinct so an operator can tell "you unfroze these
    // records" from "they were already unfrozen".
    if (status === 409) {
      return { status: "alreadyReleased", message: explainRetentionError(message) };
    }
    return { status: "error", message: explainRetentionError(message) };
  }

  refresh();

  return {
    status: "released",
    hold: result.data,
    message: `Hold released. Records in its scope are no longer frozen by it, and deletion is now governed by the applicable retention policy alone. Recorded as released by you, approved by ${approver}.`,
  };
}

// ─── Resolve: may this be deleted yet ────────────────────────────────────────

export async function resolveAction(
  _prev: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const recordClass = asRecordClass(String(formData.get("record_class") ?? ""));
  const jurisdictionCode = String(formData.get("jurisdiction_code") ?? "").trim();
  const entityRef = String(formData.get("entity_ref") ?? "").trim();

  if (!recordClass) return { status: "error", message: "A record class is required." };

  const result = await resolveRetention(
    {
      recordClass,
      jurisdictionCode: jurisdictionCode || undefined,
      // The caller's own tenant. This endpoint accepts any tenant because
      // services call it about arbitrary tenants, but a console operator asking
      // about someone else's records is not a case this page offers.
      tenantId: identity.tenantId,
      entityRef: entityRef || undefined,
    },
    identity,
  );

  if (!result.ok) {
    return { status: "error", message: explainRetentionError(result.error.message) };
  }

  return { status: "answered", resolution: result.data, recordClass };
}
