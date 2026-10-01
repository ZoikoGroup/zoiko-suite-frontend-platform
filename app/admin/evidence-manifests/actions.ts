"use server";

// Server Actions for evidence-manifest-svc (:8095).
//
// Three real endpoints, three actions: generate (the only write this service
// has), look up one manifest by id, and list its records. There is no list-
// all-manifests action because the service has no such endpoint — see
// lib/api/evidence-manifest.ts.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  SCENARIO_TYPES,
  decodeRecordSnapshot,
  generateManifest,
  getManifest,
  listManifestRecords,
  explainManifestError,
  type ScenarioType,
} from "@/lib/api/evidence-manifest";
import {
  type GenerateManifestState,
  type LookupState,
  type RecordsState,
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

/** Split a textarea of IDs on commas, newlines, or both. Blank entries dropped. */
function splitIds(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** An HTML date input gives YYYY-MM-DD; the service wants RFC3339. */
function toRFC3339StartOfDay(date: string): string {
  return `${date}T00:00:00Z`;
}
function toRFC3339EndOfDay(date: string): string {
  return `${date}T23:59:59Z`;
}

export async function generateManifestAction(
  _prev: GenerateManifestState,
  formData: FormData,
): Promise<GenerateManifestState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim() || identity.legalEntityId;
  const scenarioType = String(formData.get("scenario_type") ?? "").trim();
  const requestedBy = String(formData.get("requested_by") ?? "").trim();
  const fromDate = String(formData.get("governance_decisions_from") ?? "").trim();
  const toDate = String(formData.get("governance_decisions_to") ?? "").trim();
  const governanceDecisionIds = splitIds(String(formData.get("governance_decision_ids") ?? ""));
  const accessDecisionIds = splitIds(String(formData.get("access_decision_ids") ?? ""));
  const workflowInstanceIds = splitIds(String(formData.get("workflow_instance_ids") ?? ""));

  if (!legalEntityId) {
    return { status: "error", message: "A legal entity is required — manifests are authorized per entity." };
  }
  if (!(SCENARIO_TYPES as readonly string[]).includes(scenarioType)) {
    return {
      status: "error",
      message: "Choose a scenario type. It decides why this manifest exists, and the service will not accept one without it.",
    };
  }
  if (!fromDate && !toDate && governanceDecisionIds.length === 0 && accessDecisionIds.length === 0 && workflowInstanceIds.length === 0) {
    return {
      status: "error",
      message: "A manifest needs at least one source: a governance decision date range, explicit governance decision IDs, explicit access decision IDs, or explicit workflow instance IDs.",
    };
  }

  const result = await generateManifest({
    identity,
    legalEntityId,
    scenarioType: scenarioType as ScenarioType,
    ...(requestedBy ? { requestedBy } : {}),
    ...(fromDate ? { governanceDecisionsFrom: toRFC3339StartOfDay(fromDate) } : {}),
    ...(toDate ? { governanceDecisionsTo: toRFC3339EndOfDay(toDate) } : {}),
    ...(governanceDecisionIds.length ? { governanceDecisionIds } : {}),
    ...(accessDecisionIds.length ? { accessDecisionIds } : {}),
    ...(workflowInstanceIds.length ? { workflowInstanceIds } : {}),
  });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainManifestError(message);
    if (status === 401) return { status: "unauthorized", message: explained };
    if (status === 403) return { status: "refused", message: explained };
    return { status: "error", message: explained };
  }

  return {
    status: "generated",
    manifest: result.data,
    message: `Generated manifest ${result.data.manifest_id} for ${result.data.scenario_type}. Its checksum is fixed now — the manifest is immutable from here.`,
  };
}

export async function lookupManifestAction(
  _prev: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const manifestId = String(formData.get("manifest_id") ?? "").trim();
  if (!manifestId) return { status: "error", message: "A manifest id is required." };

  const result = await getManifest({ identity, manifestId });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainManifestError(message);
    if (status === 401) return { status: "unauthorized", message: explained };
    if (status === 403) return { status: "refused", message: explained };
    if (status === 404) return { status: "not_found", message: explained };
    return { status: "error", message: explained };
  }

  return { status: "found", manifest: result.data };
}

export async function fetchManifestRecordsAction(manifestId: string): Promise<RecordsState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "unauthorized", message: EXPIRED };
  }

  const result = await listManifestRecords({ identity, manifestId });

  if (!result.ok) {
    const { status, message } = result.error;
    const explained = explainManifestError(message);
    if (status === 401) return { status: "unauthorized", message: explained };
    if (status === 403) return { status: "refused", message: explained };
    return { status: "error", message: explained };
  }

  // Decoded here, not on the client: decodeRecordSnapshot uses Node's Buffer,
  // which a "use client" component cannot reach. The raw base64 stays on the
  // record either way, so nothing is lost if decoding fails.
  const records = result.data.map((record) => {
    const decoded = decodeRecordSnapshot(record.record_snapshot);
    return decoded.ok ? { ...record, decoded: decoded.data } : record;
  });

  return { status: "loaded", manifestId, records };
}
