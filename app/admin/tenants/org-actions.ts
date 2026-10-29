"use server";

// Server Actions for the ORG-02 (Tenant) and ORG-03 (Legal Entity) surfaces of
// tenant-entity-registry-svc.
//
// Written against what the service actually does, which differs from the older
// actions in this directory in three ways worth stating up front:
//
//  1. EVERY WRITE CARRIES expected_version. The forms render the version they
//     read and post it back, so a change made between the page rendering and
//     the button being pressed is refused rather than silently overwritten.
//     The service would still guard using the version IT reads if we sent
//     nothing — but that only catches a writer racing the service, not one
//     racing the operator, and the operator is the one who will be surprised.
//
//  2. 409 IS NOT ONE THING. The service uses it for a stale version, for a
//     tenant whose lifecycle forbids writing, and for a claimed registry
//     identity. Each has a different remedy, so each gets its own state and its
//     own sentence. Reporting all three as "conflict" would be accurate and
//     useless.
//
//  3. MESSAGES NAME THE CONSEQUENCE. Suspending a tenant stops writes across
//     the whole platform; a CORRECTION means anything already reported against
//     the prior version was misstated. The operator pressing the button is
//     entitled to know that before, and to be told what happened after.

import { revalidatePath } from "next/cache";
import type { SessionIdentity } from "@/lib/auth";
import { EXPIRED_MESSAGE, PATH, classify, requireIdentity, toRFC3339 } from "./failures";
import {
  IDLE_AS_OF_LOOKUP,
  IDLE_CONFLICT_RESOLUTION,
  IDLE_HOST_BINDING,
  IDLE_PROFILE_AMENDMENT,
  IDLE_REGISTRY_SEARCH,
  IDLE_TENANT_COMMAND,
  IDLE_TENANT_DEFAULTS,
  type AsOfLookupState,
  type ConflictResolutionState,
  type HostBindingState,
  type ProfileAmendmentState,
  type RegistrySearchState,
  type TenantCommandState,
  type TenantDefaultsState,
} from "./org-state";
import {
  TENANT_COMMANDS,
  TENANT_COMMAND_LABELS,
  amendLegalProfile,
  bindTenantHost,
  changeDefaultLocale,
  changeLegalName,
  changeRegisteredOffice,
  commandRequiresApproval,
  executeTenantCommand,
  findByRegistryNumber,
  getLegalEntityAsOf,
  resolveRegistryConflict,
  type AmendLegalProfileInput,
} from "@/lib/api/tenants-org";

/** Read an optional trimmed string, or undefined when absent. */
function optional(formData: FormData, key: string): string | undefined {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? undefined : v;
}

/**
 * Read expected_version from the form.
 *
 * Returns undefined rather than 0 for an absent or unparseable value. Zero is
 * meaningful to the service — it means "no expectation, use the version you
 * read" — so sending it for a field the form failed to populate would quietly
 * downgrade the guarantee the operator thinks they have.
 */
function expectedVersion(formData: FormData): number | undefined {
  const raw = String(formData.get("expected_version") ?? "").trim();
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Split the service's 409s apart by their message.
 *
 * Matching on message text is fragile and is used deliberately anyway: the
 * alternative is three new HTTP statuses for conditions that genuinely are
 * conflicts, which would be worse. Each branch falls back to a generic
 * conflict, so a reworded message degrades to a less specific sentence rather
 * than to a wrong one.
 */
function conflictKind(message: string): "version" | "not-transactable" | "registry" | "other" {
  const m = message.toLowerCase();
  if (m.includes("expected_version") || m.includes("record_version")) return "version";
  if (m.includes("may transact") || m.includes("lifecycle_state")) return "not-transactable";
  if (m.includes("registry identity") || m.includes("registration_number")) return "registry";
  return "other";
}

// ── ORG-02: named lifecycle commands ────────────────────────────────────────

/**
 * Apply one of ORG-02's five named lifecycle commands.
 *
 * The command arrives in the form rather than being fixed per-action so one
 * action serves all five; it is validated against the known list before
 * anything is sent, because an unknown command reaches the service as a 404 on
 * a URL, which reads as "tenant not found".
 */
export async function executeTenantCommandAction(
  _prev: TenantCommandState,
  formData: FormData,
): Promise<TenantCommandState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_TENANT_COMMAND, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const command = String(formData.get("command") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const approver = optional(formData, "approved_by_principal_id");

  if (!tenantId) {
    return { status: "error", message: "No tenant on this request." };
  }
  if (!(TENANT_COMMANDS as readonly string[]).includes(command)) {
    return {
      status: "error",
      message: `${command || "That"} is not one of the five lifecycle commands this registry accepts.`,
    };
  }
  if (!reason) {
    return {
      status: "error",
      message:
        "A reason is required. It is written to the tenant's lifecycle history, which is the record someone reads months from now asking why this happened.",
    };
  }
  if (commandRequiresApproval(command) && !approver) {
    return {
      status: "approval-required",
      message: `${TENANT_COMMAND_LABELS[command] ?? command} needs a second person to approve it. Enter the approving principal's id — it cannot be you.`,
    };
  }

  const result = await executeTenantCommand(
    tenantId,
    command,
    {
      reason,
      expected_version: expectedVersion(formData),
      approved_by_principal_id: approver,
    },
    identity,
  );

  if (!result.ok) {
    if (result.error.status === 409) {
      const kind = conflictKind(result.error.message);
      if (kind === "version") {
        return {
          status: "version-conflict",
          message:
            "This tenant changed while the page was open, so the command was refused rather than applied on top of somebody else's change. Reload to see the current state.",
        };
      }
      return { status: "error", message: result.error.message };
    }
    if (result.error.status === 422 && /approv/i.test(result.error.message)) {
      return {
        status: "approval-required",
        message:
          "The registry refused the approver. It must be a different principal from the one acting — the database enforces that independently of the console.",
      };
    }
    return classify(result.error, [
      "unauthenticated",
      "unauthorized",
      "tenant-context",
      "illegal",
    ] as const);
  }

  revalidatePath(PATH);
  const label = TENANT_COMMAND_LABELS[command] ?? command;
  const consequence =
    result.data.to_state === "SUSPENDED"
      ? " Writes for this tenant now refuse across the platform; reads still work."
      : result.data.to_state === "TERMINATED"
        ? " This is final — the tenant cannot be reactivated. Governed records are retained."
        : result.data.to_state === "OFFBOARDING"
          ? " Writes have stopped and will not resume; the only way forward is Complete termination."
          : "";

  return {
    status: "applied",
    result: result.data,
    message:
      `${label} applied — the tenant moved from ${result.data.from_state} to ${result.data.to_state} ` +
      `and is now at version ${result.data.record_version}.${consequence}`,
  };
}

/** ORG-02 ChangeDefaultLocale. */
export async function changeDefaultLocaleAction(
  _prev: TenantDefaultsState,
  formData: FormData,
): Promise<TenantDefaultsState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_TENANT_DEFAULTS, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const locale = optional(formData, "primary_locale");
  const timezone = optional(formData, "primary_timezone");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!locale && !timezone) {
    return { status: "error", message: "Change at least one of locale or timezone." };
  }
  if (!reason) {
    return { status: "error", message: "A reason is required — it is recorded against the change." };
  }

  const result = await changeDefaultLocale(
    tenantId,
    { primary_locale: locale, primary_timezone: timezone, reason, expected_version: expectedVersion(formData) },
    identity,
  );

  if (!result.ok) {
    if (result.error.status === 409) {
      const kind = conflictKind(result.error.message);
      return {
        status: kind === "version" ? "version-conflict" : "not-transactable",
        message:
          kind === "version"
            ? "This tenant changed while the page was open. Reload and try again."
            : "This tenant's lifecycle state does not allow changes. Resume it first — no permission grant will change this.",
      };
    }
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "changed",
    tenant: result.data,
    message:
      `Defaults changed — locale ${result.data.primary_locale}, timezone ${result.data.primary_timezone}. ` +
      `Recorded in the lifecycle history as ChangeDefaultLocale; the tenant's lifecycle state is unchanged.`,
  };
}

/** Bind a hostname to the tenant. */
export async function bindTenantHostAction(
  _prev: HostBindingState,
  formData: FormData,
): Promise<HostBindingState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_HOST_BINDING, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const hostname = String(formData.get("hostname") ?? "").trim().toLowerCase();
  if (!hostname) {
    return { status: "error", message: "A hostname is required." };
  }

  const result = await bindTenantHost(
    tenantId,
    { hostname, is_primary: formData.get("is_primary") === "on" },
    identity,
  );

  if (!result.ok) {
    if (result.error.status === 409) {
      const kind = conflictKind(result.error.message);
      if (kind === "not-transactable") {
        return {
          status: "not-transactable",
          message: "This tenant's lifecycle state does not allow changes.",
        };
      }
      return {
        status: "conflict",
        message:
          "That hostname is already bound, or this tenant already has a primary hostname. A hostname can only ever point at one tenant — that is what makes the host/tenant mismatch check meaningful.",
      };
    }
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "bound",
    binding: result.data,
    message:
      `${result.data.hostname} now resolves to this tenant. ` +
      `A request arriving on it that claims a different tenant will be refused before any data is read.`,
  };
}

// ── ORG-03: profile amendments ──────────────────────────────────────────────

/**
 * Amend a legal profile — the general form, plus the two narrow commands.
 *
 * `mode` selects between them. All three create a new effective-dated version;
 * they differ in the change_reason recorded, which is what a downstream
 * consumer keys off.
 */
export async function amendLegalProfileAction(
  _prev: ProfileAmendmentState,
  formData: FormData,
): Promise<ProfileAmendmentState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_PROFILE_AMENDMENT, status: "error", message: EXPIRED_MESSAGE };
  }

  const entityId = String(formData.get("entity_id") ?? "").trim();
  if (!entityId) return { status: "error", message: "No entity on this request." };

  const mode = String(formData.get("mode") ?? "amend");
  const effectiveDate = optional(formData, "effective_from");
  const effectiveFrom = effectiveDate ? toRFC3339(effectiveDate) : undefined;
  const approver = optional(formData, "approved_by_principal_id");
  const evidence = optional(formData, "source_evidence_ref");
  const version = expectedVersion(formData);

  let result;
  if (mode === "legal-name") {
    const legalName = String(formData.get("legal_name") ?? "").trim();
    if (!legalName) return { status: "error", message: "A new legal name is required." };
    if (!approver) {
      return {
        status: "approval-required",
        message:
          "A legal-name change needs a second person to approve it, and it cannot be you. This is a segregation-of-duties rule, not a permissions one.",
      };
    }
    result = await changeLegalName(
      entityId,
      {
        legal_name: legalName,
        effective_from: effectiveFrom,
        source_evidence_ref: evidence,
        approved_by_principal_id: approver,
        expected_version: version,
      },
      identity,
    );
  } else if (mode === "registered-office") {
    const office = String(formData.get("registered_office") ?? "").trim();
    if (!office) return { status: "error", message: "A registered office is required." };
    result = await changeRegisteredOffice(
      entityId,
      {
        registered_office: office,
        effective_from: effectiveFrom,
        source_evidence_ref: evidence,
        approved_by_principal_id: approver,
        expected_version: version,
      },
      identity,
    );
  } else {
    const input: AmendLegalProfileInput = {
      trading_name: optional(formData, "trading_name"),
      legal_form_code: optional(formData, "legal_form_code"),
      legal_form_local_text: optional(formData, "legal_form_local_text"),
      registration_number: optional(formData, "registration_number"),
      registry_authority: optional(formData, "registry_authority"),
      effective_from: effectiveFrom,
      change_reason: optional(formData, "change_reason") ?? "AMENDMENT",
      source_evidence_ref: evidence,
      approved_by_principal_id: approver,
      expected_version: version,
    };
    const named = Object.entries(input).filter(
      ([k, v]) => v !== undefined && !["effective_from", "change_reason", "source_evidence_ref", "approved_by_principal_id", "expected_version"].includes(k),
    );
    if (named.length === 0) {
      return {
        status: "error",
        message:
          "Nothing to change. An amendment that names no field would create a version identical to the one in force.",
      };
    }
    result = await amendLegalProfile(entityId, input, identity);
  }

  if (!result.ok) {
    if (result.error.status === 409) {
      const kind = conflictKind(result.error.message);
      if (kind === "version") {
        return {
          status: "version-conflict",
          message:
            "This entity changed while the page was open, so the amendment was refused rather than layered on top of somebody else's change. Reload to see the current profile.",
        };
      }
      if (kind === "registry") {
        return {
          status: "registry-conflict",
          message:
            "Another active entity in this jurisdiction already holds that registration number. Nothing was written, and the attempt has been quarantined for review — see the registry conflicts panel. " +
            result.error.message,
        };
      }
      return {
        status: "not-transactable",
        message:
          "This entity's tenant is in a lifecycle state that does not allow writes. Resume the tenant first.",
      };
    }
    if (result.error.status === 422 && /approv/i.test(result.error.message)) {
      return {
        status: "approval-required",
        message:
          "The registry refused the approver — it must be a different principal from the one making the change.",
      };
    }
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  revalidatePath(PATH);
  const v = result.data;
  const correction =
    v.change_reason === "CORRECTION"
      ? " This was recorded as a CORRECTION, which means the previous version was wrong — anything already reported against it may need restating."
      : "";
  const backdated =
    new Date(v.effective_from).getTime() < Date.now() - 86_400_000
      ? " It is backdated, so it changes what a historical lookup returns for that period and leaves the entity's present-day identity alone."
      : "";

  return {
    status: "amended",
    version: v,
    message:
      `Version ${v.version_number} created, effective from ${v.effective_from.slice(0, 10)}. ` +
      `The previous version is closed, not overwritten — a lookup as of an earlier date still returns it.${correction}${backdated}`,
  };
}

// ── ORG-03: registry conflicts ──────────────────────────────────────────────

export async function resolveRegistryConflictAction(
  _prev: ConflictResolutionState,
  formData: FormData,
): Promise<ConflictResolutionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_CONFLICT_RESOLUTION, status: "error", message: EXPIRED_MESSAGE };
  }

  const conflictId = String(formData.get("conflict_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const note = String(formData.get("resolution_note") ?? "").trim();

  if (!note) {
    return {
      status: "error",
      message: "A note is required. A resolution nobody can audit is not a resolution.",
    };
  }

  const result = await resolveRegistryConflict(
    conflictId,
    { status, resolution_note: note },
    identity,
  );

  if (!result.ok) {
    if (result.error.status === 409) {
      return {
        status: "already-resolved",
        message:
          "Somebody already resolved this conflict. Their conclusion stands — it is not overwritten by a second one.",
      };
    }
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  revalidatePath(PATH);
  const consequence =
    status === "RESOLVED_DUPLICATE"
      ? " Note that this records the finding only — nothing has been merged, and merging is a separate governed operation."
      : "";
  return { status: "resolved", message: `Conflict closed.${consequence}` };
}

// ── ORG-03: read-only lookups ───────────────────────────────────────────────

/**
 * Reconstruct an entity as of a business date.
 *
 * A successful lookup that finds no profile is reported as its own state, not
 * as an error: it means the date is before the entity had any recorded
 * identity, which is a real answer.
 */
export async function lookupEntityAsOfAction(
  _prev: AsOfLookupState,
  formData: FormData,
): Promise<AsOfLookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_AS_OF_LOOKUP, status: "error", message: EXPIRED_MESSAGE };
  }

  const entityId = String(formData.get("entity_id") ?? "").trim();
  const asOf = String(formData.get("as_of") ?? "").trim();
  if (!entityId) return { status: "error", message: "Choose an entity." };
  if (!asOf) return { status: "error", message: "Choose a date to reconstruct as of." };

  const result = await getLegalEntityAsOf(entityId, asOf, identity);
  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  if (!result.data.profile) {
    return {
      status: "no-profile-then",
      result: result.data,
      message: `This entity had no recorded profile on ${asOf} — that date is before its identity was first recorded.`,
    };
  }

  const p = result.data.profile;
  return {
    status: "found",
    result: result.data,
    message:
      `On ${asOf} this entity was "${p.legal_name}" (profile version ${p.version_number}, ` +
      `in force from ${p.effective_from.slice(0, 10)}${p.effective_to ? ` to ${p.effective_to.slice(0, 10)}` : " and still current"}).`,
  };
}

/** Search for entities by registry number. */
export async function findByRegistryNumberAction(
  _prev: RegistrySearchState,
  formData: FormData,
): Promise<RegistrySearchState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_REGISTRY_SEARCH, status: "error", message: EXPIRED_MESSAGE };
  }

  const number = String(formData.get("registration_number") ?? "").trim();
  if (!number) return { status: "error", message: "Enter a registration number." };

  const result = await findByRegistryNumber(
    number,
    String(formData.get("jurisdiction_id") ?? "").trim(),
    identity,
  );
  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  const matches = result.data.map((e) => ({
    legal_entity_id: e.legal_entity_id,
    entity_code: e.entity_code,
    legal_name: e.legal_name,
    entity_status: e.entity_status,
  }));

  if (matches.length === 0) {
    return { status: "none", message: `No entity in this tenant holds registration number ${number}.` };
  }

  return {
    status: "found",
    matches,
    message:
      matches.length === 1
        ? `One entity holds ${number}.`
        : `${matches.length} entities hold ${number}. A registry number plus a jurisdiction is a duplicate signal, not an identifier — more than one match is a prompt to look, not proof of a duplicate.`,
  };
}
