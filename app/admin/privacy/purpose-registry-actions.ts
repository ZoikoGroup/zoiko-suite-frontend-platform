"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createPurpose,
  createPurposeVersion,
  publishPurposeVersion,
  createActivity,
  createActivityVersion,
  validateActivityVersion,
  submitActivityVersion,
  approveActivityVersion,
  rejectActivityVersion,
  activateActivityVersion,
  suspendActivityVersion,
  resumeActivityVersion,
  retireActivityVersion,
  getActivityAudit,
  listPurposes,
  listROPA,
  type PrivacyRole,
  type NoticeConsentDependency,
  type DPIATIAStatus,
  type PurposeVersion,
  type ProcessingActivityVersion,
} from "@/lib/api/privacy-purpose-registry";
import type { PurposeRegistryActionState } from "./purpose-registry-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) throw new Error("unauthenticated");
  // The signed-in user is always the actor. Maker-checker (§18 SoD) is enforced
  // by the registry against this principal; a checker signs in as themselves.
  return decoded;
}

const EXPIRED: PurposeRegistryActionState = { status: "error", message: "Session expired — please log in again." };

function splitList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createPurposeAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const statement = String(formData.get("statement") ?? "").trim();
  const compatibilityClass = String(formData.get("compatibility_class") ?? "").trim();
  const lawfulBasisRefs = splitList(formData.get("lawful_basis_refs"));
  const necessityRationale = String(formData.get("necessity_rationale") ?? "").trim();
  const specialConditionRefs = splitList(formData.get("special_condition_refs"));
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!statement || !compatibilityClass) {
    return { status: "error", message: "Statement and compatibility class are both required." };
  }

  const res = await createPurpose(
    {
      statement,
      compatibility_class: compatibilityClass,
      lawful_basis_refs: lawfulBasisRefs,
      necessity_rationale: necessityRationale || undefined,
      special_condition_refs: specialConditionRefs.length > 0 ? specialConditionRefs : undefined,
      effective_from: effectiveFrom || undefined,
    },
    identity
  );
  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Purpose registered as DRAFT version ${res.data.purpose_version_id}.`,
    purposeId: res.data.purpose_id,
    versionId: res.data.purpose_version_id,
  };
}

export async function createPurposeVersionAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const purposeId = String(formData.get("purpose_id") ?? "").trim();
  const parentVersionId = String(formData.get("parent_version_id") ?? "").trim();
  const statement = String(formData.get("statement") ?? "").trim();
  const compatibilityClass = String(formData.get("compatibility_class") ?? "").trim();
  const lawfulBasisRefs = splitList(formData.get("lawful_basis_refs"));
  const necessityRationale = String(formData.get("necessity_rationale") ?? "").trim();
  const specialConditionRefs = splitList(formData.get("special_condition_refs"));
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!purposeId || !parentVersionId || !statement || !compatibilityClass) {
    return { status: "error", message: "Purpose ID, parent version ID, statement, and compatibility class are all required." };
  }

  const res = await createPurposeVersion(
    purposeId,
    {
      parent_version_id: parentVersionId,
      statement,
      compatibility_class: compatibilityClass,
      lawful_basis_refs: lawfulBasisRefs,
      necessity_rationale: necessityRationale || undefined,
      special_condition_refs: specialConditionRefs.length > 0 ? specialConditionRefs : undefined,
      effective_from: effectiveFrom || undefined,
    },
    identity
  );
  if (!res.ok) {
    return { status: "error", message: `Could not create new version: ${res.error.message}` };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `New purpose version ${res.data.purpose_version_id} created (supersedes ${parentVersionId}).`,
    purposeId: res.data.purpose_id,
    versionId: res.data.purpose_version_id,
  };
}

export async function publishPurposeVersionAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const purposeId = String(formData.get("purpose_id") ?? "").trim();
  const versionId = String(formData.get("purpose_version_id") ?? "").trim();
  if (!purposeId || !versionId) {
    return { status: "error", message: "Both purpose ID and purpose version ID are required." };
  }

  const res = await publishPurposeVersion(purposeId, versionId, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not publish — ${res.error.message}` };
  }

  revalidatePath("/admin/privacy");
  return { status: "success", message: `Purpose version ${versionId} is now PUBLISHED and immutable.`, purposeId, versionId };
}

export async function createActivityAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const privacyRole = String(formData.get("privacy_role") ?? "") as PrivacyRole;
  const owner = String(formData.get("owner") ?? "").trim();
  const privacyOwner = String(formData.get("privacy_owner") ?? "").trim();
  if (!owner) {
    return { status: "error", message: "Business Owner is required." };
  }

  const noticeConsent = String(formData.get("notice_consent_dependency") ?? "").trim() as NoticeConsentDependency;
  const dpiaTia = String(formData.get("dpia_tia_status") ?? "").trim() as DPIATIAStatus;

  const res = await createActivity(
    {
      privacy_role: privacyRole,
      owner,
      privacy_owner: privacyOwner || undefined,
      purpose_ids: splitList(formData.get("purpose_ids")),
      subject_classes: splitList(formData.get("subject_classes")),
      data_categories: splitList(formData.get("data_categories")),
      sources: splitList(formData.get("sources")),
      recipients: splitList(formData.get("recipients")),
      jurisdictions: splitList(formData.get("jurisdictions")),
      retention_rule_refs: splitList(formData.get("retention_rule_refs")),
      transfer_refs: splitList(formData.get("transfer_refs")),
      processor_refs: splitList(formData.get("processor_refs")),
      notice_consent_dependency: noticeConsent || undefined,
      dpia_tia_status: dpiaTia || undefined,
    },
    identity
  );
  if (!res.ok) {
    return { status: "error", message: res.error.message };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Processing activity created as DRAFT version ${res.data.activity_version_id}.`,
    activityId: res.data.activity_id,
    activityVersionId: res.data.activity_version_id,
  };
}

export async function createActivityVersionAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const activityId = String(formData.get("activity_id") ?? "").trim();
  const parentVersionId = String(formData.get("parent_version_id") ?? "").trim();
  const privacyRole = String(formData.get("privacy_role") ?? "") as PrivacyRole;
  const owner = String(formData.get("owner") ?? "").trim();
  const privacyOwner = String(formData.get("privacy_owner") ?? "").trim();

  if (!activityId || !parentVersionId || !owner) {
    return { status: "error", message: "Activity ID, parent version ID, and owner are required." };
  }

  const noticeConsent = String(formData.get("notice_consent_dependency") ?? "").trim() as NoticeConsentDependency;
  const dpiaTia = String(formData.get("dpia_tia_status") ?? "").trim() as DPIATIAStatus;

  const res = await createActivityVersion(
    activityId,
    {
      parent_version_id: parentVersionId,
      privacy_role: privacyRole,
      owner,
      privacy_owner: privacyOwner || undefined,
      purpose_ids: splitList(formData.get("purpose_ids")),
      subject_classes: splitList(formData.get("subject_classes")),
      data_categories: splitList(formData.get("data_categories")),
      sources: splitList(formData.get("sources")),
      recipients: splitList(formData.get("recipients")),
      jurisdictions: splitList(formData.get("jurisdictions")),
      retention_rule_refs: splitList(formData.get("retention_rule_refs")),
      transfer_refs: splitList(formData.get("transfer_refs")),
      processor_refs: splitList(formData.get("processor_refs")),
      notice_consent_dependency: noticeConsent || undefined,
      dpia_tia_status: dpiaTia || undefined,
    },
    identity
  );
  if (!res.ok) {
    return { status: "error", message: `Could not create activity version: ${res.error.message}` };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `New activity version ${res.data.activity_version_id} created (supersedes ${parentVersionId}).`,
    activityId: res.data.activity_id,
    activityVersionId: res.data.activity_version_id,
  };
}

type Transition = "validate" | "submit" | "approve" | "suspend" | "resume" | "retire";

async function runTransition(
  action: Transition,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const activityId = String(formData.get("activity_id") ?? "").trim();
  const versionId = String(formData.get("activity_version_id") ?? "").trim();
  if (!activityId || !versionId) {
    return { status: "error", message: "Both activity ID and activity version ID are required." };
  }

  const fn = {
    validate: validateActivityVersion,
    submit: submitActivityVersion,
    approve: approveActivityVersion,
    suspend: suspendActivityVersion,
    resume: resumeActivityVersion,
    retire: retireActivityVersion,
  }[action];

  const res = await fn(activityId, versionId, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not ${action} — ${res.error.message}`, activityId, activityVersionId: versionId };
  }

  revalidatePath("/admin/privacy");
  if (action === "validate" && res.data.validation_findings && res.data.validation_findings.length > 0) {
    return {
      status: "error",
      message: `Validation found ${res.data.validation_findings.length} issue(s) — status stays DRAFT until gates are met.`,
      activityId,
      activityVersionId: versionId,
      findings: res.data.validation_findings,
    };
  }
  return {
    status: "success",
    message: `Activity version ${versionId} successfully transitioned to ${res.data.version_status}.`,
    activityId,
    activityVersionId: versionId,
  };
}

export async function validateActivityAction(_p: PurposeRegistryActionState, f: FormData) {
  return runTransition("validate", f);
}
export async function submitActivityAction(_p: PurposeRegistryActionState, f: FormData) {
  return runTransition("submit", f);
}
export async function approveActivityAction(_p: PurposeRegistryActionState, f: FormData) {
  return runTransition("approve", f);
}
export async function suspendActivityAction(_p: PurposeRegistryActionState, f: FormData) {
  return runTransition("suspend", f);
}
export async function resumeActivityAction(_p: PurposeRegistryActionState, f: FormData) {
  return runTransition("resume", f);
}
export async function retireActivityAction(_p: PurposeRegistryActionState, f: FormData) {
  return runTransition("retire", f);
}

export async function rejectActivityAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const activityId = String(formData.get("activity_id") ?? "").trim();
  const versionId = String(formData.get("activity_version_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!activityId || !versionId || !reason) {
    return { status: "error", message: "Activity ID, activity version ID, and a reason are all required." };
  }

  const res = await rejectActivityVersion(activityId, versionId, reason, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not reject — ${res.error.message}` };
  }

  revalidatePath("/admin/privacy");
  return { status: "success", message: `Activity version ${versionId} REJECTED.`, activityId, activityVersionId: versionId };
}

export async function activateActivityAction(
  _previous: PurposeRegistryActionState,
  formData: FormData
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const activityId = String(formData.get("activity_id") ?? "").trim();
  const versionId = String(formData.get("activity_version_id") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  if (!activityId || !versionId) {
    return { status: "error", message: "Both activity ID and activity version ID are required." };
  }

  const res = await activateActivityVersion(activityId, versionId, effectiveFrom || undefined, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not activate — ${res.error.message}` };
  }

  revalidatePath("/admin/privacy");
  return { status: "success", message: `Activity version ${versionId} is now ACTIVE on ROPA register.`, activityId, activityVersionId: versionId };
}

export async function fetchActivityAuditAction(
  activityId: string
): Promise<PurposeRegistryActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  if (!activityId) {
    return { status: "error", message: "Activity ID is required to view audit trail." };
  }

  const res = await getActivityAudit(activityId, identity);
  if (!res.ok) {
    return { status: "error", message: `Could not fetch audit trail — ${res.error.message}` };
  }

  return {
    status: "success",
    message: `Loaded ${res.data.length} audit trail event(s).`,
    activityId,
    auditRecords: res.data,
  };
}

export async function getPurposesList(): Promise<PurposeVersion[]> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return [];
  const res = await listPurposes({ principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId });
  if (res.ok) return res.data;
  return [];
}

export async function getRopaList(): Promise<ProcessingActivityVersion[]> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return [];
  const res = await listROPA({}, { principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId });
  if (res.ok) return res.data.data;
  return [];
}
