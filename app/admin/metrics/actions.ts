"use server";

import { cookies } from "next/headers";
import { refresh, revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createMetricDefinition,
  explainMetricError,
  parseDataSources,
  publishMetricVersion,
} from "@/lib/api/metric-registry";
import {
  type CreateMetricState,
  type PublishVersionState,
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

function asRFC3339Date(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function asMetricCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export async function createMetricAction(
  _prev: CreateMetricState,
  formData: FormData,
): Promise<CreateMetricState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const metricCode = asMetricCode(String(formData.get("metric_code") ?? ""));
  const metricName = String(formData.get("metric_name") ?? "").trim();
  const formulaDescription = String(formData.get("formula_description") ?? "").trim();
  const dataSources = parseDataSources(String(formData.get("data_sources") ?? ""));
  const ownerPrincipalId = String(formData.get("owner_principal_id") ?? "").trim() || identity.principalId;
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim() || crypto.randomUUID();

  if (!metricCode) return { status: "error", message: "Metric code is required." };
  if (!metricName) return { status: "error", message: "Metric name is required." };
  if (!formulaDescription) {
    return {
      status: "error",
      message:
        "A formula description is required. Executive metrics must define what the metric computes so it is not misrepresented.",
    };
  }
  if (!ownerPrincipalId) return { status: "error", message: "An accountable owner principal ID is required." };
  if (!effectiveFromRaw) return { status: "error", message: "Effective from date is required." };

  const effectiveFrom = asRFC3339Date(effectiveFromRaw);
  if (!effectiveFrom) {
    return { status: "error", message: "Effective from date must be a valid date." };
  }

  const result = await createMetricDefinition(
    {
      metric_code: metricCode,
      metric_name: metricName,
      formula_description: formulaDescription,
      data_sources: dataSources,
      owner_principal_id: ownerPrincipalId,
      effective_from: effectiveFrom,
      correlation_id: correlationId,
    },
    identity,
  );

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainMetricError(message) };
    if (status === 403) return { status: "refused", message: explainMetricError(message) };
    if (status === 409) return { status: "conflict", message: explainMetricError(message) };
    return { status: "error", message: explainMetricError(message) };
  }

  refresh();
  revalidatePath("/admin/metrics");

  return {
    status: "created",
    metric: result.data,
    message: `Metric ${metricCode} (Version 1) created successfully. Status: ACTIVE. Carries required intelligence disclaimer.`,
  };
}

export async function publishVersionAction(
  _prev: PublishVersionState,
  formData: FormData,
): Promise<PublishVersionState> {
  let identity: SessionIdentity & { principalId: string };
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const metricCode = asMetricCode(String(formData.get("metric_code") ?? ""));
  const metricName = String(formData.get("metric_name") ?? "").trim();
  const formulaDescription = String(formData.get("formula_description") ?? "").trim();
  const dataSources = parseDataSources(String(formData.get("data_sources") ?? ""));
  const ownerPrincipalId = String(formData.get("owner_principal_id") ?? "").trim() || identity.principalId;
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();
  const correlationId = String(formData.get("correlation_id") ?? "").trim() || crypto.randomUUID();

  if (!metricCode) return { status: "error", message: "Metric code is required." };
  if (!metricName) return { status: "error", message: "Metric name is required." };
  if (!formulaDescription) {
    return {
      status: "error",
      message: "Formula description is required for the revised version.",
    };
  }
  if (!ownerPrincipalId) return { status: "error", message: "Owner principal ID is required." };
  if (!effectiveFromRaw) return { status: "error", message: "Effective from date is required." };

  const effectiveFrom = asRFC3339Date(effectiveFromRaw);
  if (!effectiveFrom) {
    return { status: "error", message: "Effective from date must be a valid date." };
  }

  const result = await publishMetricVersion(
    {
      metric_code: metricCode,
      metric_name: metricName,
      formula_description: formulaDescription,
      data_sources: dataSources,
      owner_principal_id: ownerPrincipalId,
      effective_from: effectiveFrom,
      correlation_id: correlationId,
    },
    identity,
  );

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 401) return { status: "unauthorized", message: explainMetricError(message) };
    if (status === 403) return { status: "refused", message: explainMetricError(message) };
    if (status === 404) return { status: "notFound", message: explainMetricError(message) };
    return { status: "error", message: explainMetricError(message) };
  }

  refresh();
  revalidatePath("/admin/metrics");

  return {
    status: "published",
    metric: result.data,
    message: `New version ${result.data.version} of ${metricCode} published and marked ACTIVE. Prior active version has been atomically SUPERSEDED.`,
  };
}
