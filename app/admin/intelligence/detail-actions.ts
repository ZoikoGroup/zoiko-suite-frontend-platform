"use server";

// Read one reconciliation job with its suggestions, for the per-item
// decisions on the Intelligence page. The list read omits them;
// reconciliation-intelligence-svc returns them only on GET /{id}. Identity is
// the session's. (Migration audit entries are decided on /admin/migrations.)

import { isUuid } from "@/lib/api/tenants";
import { apiGet } from "@/lib/api/client";
import { sessionIdentity } from "./create-support";

export type JobItem = {
  id: string;
  status: string;
  /** One line describing the item, from the service's own fields. */
  summary: string;
};

export type JobDetail =
  | { ok: true; version?: number; items: JobItem[] }
  | { ok: false; message: string };


type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export async function readReconciliationItems(jobId: string): Promise<JobDetail> {
  if (!isUuid(jobId)) return { ok: false, message: "The job id is not valid." };
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, message: "Your session has expired — sign in again." };

  const res = await apiGet<Raw>("reconciliationIntelligence", `/v1/reconciliations/${jobId}`, { identity });
  if (!res.ok) return { ok: false, message: res.error.message };

  const job = res.data ?? {};
  const rows = job.unmatched_items as Raw[] | undefined;
  const items: JobItem[] = (Array.isArray(rows) ? rows : [])
    .filter((r) => typeof r?.id === "string" && r.id)
    .map((r) => ({
      id: str(r.id),
      status: str(r.suggestion_status ?? r.resolution_status),
      summary: `${str(r.recommendation)} · ${str(r.discrepancy_type)} · ${str(r.source_record_a)} ${str(r.amount_a)} vs ${str(r.amount_b)}`,
    }));
  const version = typeof job.version === "number" ? job.version : undefined;
  return { ok: true, version, items };
}
