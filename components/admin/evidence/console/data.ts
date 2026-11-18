// Everything the Evidence Requirements console shows, read once per request.
// Server-only. Each read keeps its own result, so one register that cannot be
// read says so in its own tab instead of showing as empty — an empty catalogue
// and an unreadable one mean very different things for an evidence gate.

import type { SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiResult } from "@/lib/api/client";
import { authorize } from "@/lib/api/authorization";
import {
  getEvidenceSummary,
  listEvaluations,
  listEvidenceRequests,
  listEvidenceRequirements,
  readAll,
  type EvidenceEvaluation,
  type EvidenceRequest,
  type EvidenceRequirement,
  type EvidenceSummary,
} from "@/lib/api/evidence";

/** A register's rows, or why there are none to show. `more` = cut at the limit. */
export type Read<T> = { rows: T[]; error: ApiError | null; more: boolean };

/** How many recent evaluations the console lists and summarises. */
export const EVALUATION_WINDOW = 1000;

export type EvidenceData = {
  summary: { value: EvidenceSummary | null; error: ApiError | null };
  requirements: Read<EvidenceRequirement>;
  evaluations: Read<EvidenceEvaluation>;
  requests: Read<EvidenceRequest>;
  /** Whether the signed-in person holds EVIDENCE_REQUEST_MANAGE at their entity
   *  (the scan-result command is shown only then). null = could not be asked. */
  canManageRequests: boolean | null;
};

function read<T>(r: ApiResult<{ rows: T[]; more: boolean }>): Read<T> {
  return r.ok ? { rows: r.data.rows, error: null, more: r.data.more } : { rows: [], error: r.error, more: false };
}

export async function loadEvidence(identity: SessionIdentity): Promise<EvidenceData> {
  const who = { ...identity, tenantId: identity.tenantId };
  const [summary, requirements, evaluations, requests, manage] = await Promise.all([
    getEvidenceSummary(who),
    readAll((p) => listEvidenceRequirements(who, {}, p)),
    readAll((p) => listEvaluations(who, {}, p), EVALUATION_WINDOW),
    readAll((p) => listEvidenceRequests(who, { open: false }, p)),
    authorize({ identity, principalId: identity.principalId, legalEntityId: identity.legalEntityId, actionType: "EVIDENCE_REQUEST_MANAGE" }),
  ]);
  return {
    summary: summary.ok ? { value: summary.data, error: null } : { value: null, error: summary.error },
    requirements: read(requirements),
    evaluations: read(evaluations),
    requests: read(requests),
    canManageRequests: manage.ok ? manage.data.decision_outcome === "GRANTED" : null,
  };
}

/** The first unreadable register among these, ignoring "you may not see this" (403). */
export function firstProblem(...reads: { error: ApiError | null }[]): ApiError | null {
  return reads.find((r) => r.error && r.error.status !== 403)?.error ?? null;
}
