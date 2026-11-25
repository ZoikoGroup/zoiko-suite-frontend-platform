import { serviceUrl } from "./config";

export type CheckType =
  | "SCHEMA_VALIDATION"
  | "REFERENTIAL_INTEGRITY"
  | "DUPLICATE_DETECTION"
  | "RANGE_CHECK"
  | "FORMAT_CHECK";

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export type ViolationType =
  | "MISSING_REQUIRED"
  | "TYPE_MISMATCH"
  | "DUPLICATE"
  | "OUT_OF_RANGE"
  | "ORPHANED_REFERENCE";

export type JobStatus =
  | "PENDING"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED"
  | "ARCHIVED";

export type MigrationRecord = {
  ref: string;
  fields: Record<string, string>;
};

export type IntegrityCheck = {
  id?: string;
  tenant_id: string;
  job_id: string;
  check_name: string;
  check_type: CheckType;
  records_checked: number;
  records_passed: number;
  records_failed: number;
  severity: Severity;
  detail: string;
  created_at: string;
};

export type AuditEntry = {
  id?: string;
  tenant_id: string;
  job_id: string;
  record_ref: string;
  field_name?: string;
  source_value?: string;
  target_value?: string;
  violation_type: ViolationType;
  is_remediated: boolean;
  created_at: string;
};

export type MigrationJob = {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  migration_name: string;
  source_system: string;
  target_service: string;
  total_records_count: number;
  valid_records_count: number;
  invalid_records_count: number;
  integrity_score: number;
  status: JobStatus;
  integrity_checks?: IntegrityCheck[];
  audit_entries?: AuditEntry[];
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
};

export type ValidateMigrationRequest = {
  legal_entity_id: string;
  migration_name: string;
  source_system: string;
  target_service: string;
  required_fields: string[];
  records: MigrationRecord[];
  /** Who owns the exceptions the run raises (required). */
  exception_owner_id: string;
  /** From the extract manifest; the service reconciles the batch against them (required). */
  control_totals: { amount_field: string; record_count: number; amount_total: string };
};

/** migration-integrity-svc RemediateRequest. A waiver is time-limited. */
export type RemediateInput = {
  disposition: "REMEDIATED" | "WAIVED";
  remediation_reason: string;
  remediation_evidence_ref: string;
  waiver_expires_at?: string;
};

/**
 * The caller's identity, always the session's.
 *
 * This used to be optional caller-supplied options with a demo tenant,
 * principal and legal entity as defaults, and the server actions forwarded
 * whatever the browser sent, so any signed-in user could read and write as
 * any tenant. Empty values were also used to strip headers for "negative"
 * tests.
 */
export type HeaderOptions = {
  tenantId: string;
  principalId: string;
  legalEntityId?: string;
};

function buildHeaders(opts: HeaderOptions, write = false): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Id": opts.tenantId,
    "X-Principal-Id": opts.principalId,
    "X-Actor-Subject-Id": opts.principalId,
    "X-Request-Id": crypto.randomUUID(),
    "X-Correlation-Id": crypto.randomUUID(),
    "X-Source-Channel": "web",
  };
  if (opts.legalEntityId) headers["X-Legal-Entity-Id"] = opts.legalEntityId;
  if (write) headers["Idempotency-Key"] = crypto.randomUUID();
  return headers;
}

/**
 * Check healthz probe for migration-integrity-svc (:8139).
 */
export async function getMigrationIntegrityHealth(): Promise<{
  ok: boolean;
  service: string;
  status: string;
  port: string;
}> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/healthz`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        service: data.service || "migration-integrity-svc",
        status: data.status || "ok",
        port: "",
      };
    }
    return { ok: false, service: "migration-integrity-svc", status: `HTTP ${res.status}`, port: "" };
  } catch (err: any) {
    return { ok: false, service: "migration-integrity-svc", status: err.message, port: "" };
  }
}

/**
 * Validate a data migration batch (POST /v1/migrations/validate).
 */
export async function validateMigration(
  req: ValidateMigrationRequest,
  opts: HeaderOptions
): Promise<{ ok: boolean; status: number; data: MigrationJob | any }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/validate`, {
      method: "POST",
      headers: buildHeaders(opts, true),
      body: JSON.stringify(req),
      cache: "no-store",
    });

    const body = await res.json();
    return { ok: res.ok, status: res.status, data: body };
  } catch (err: any) {
    return { ok: false, status: 503, data: { error: err.message } };
  }
}

/**
 * List migration jobs (GET /v1/migrations/).
 */
export async function listMigrationJobs(
  filters: { legalEntityId?: string; status?: string },
  opts: HeaderOptions
): Promise<{ ok: boolean; status: number; jobs: MigrationJob[]; count: number; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const params = new URLSearchParams();
    if (filters?.legalEntityId) params.set("legal_entity_id", filters.legalEntityId);
    if (filters?.status) params.set("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${url}/v1/migrations/${query}`, {
      method: "GET",
      headers: buildHeaders(opts),
      cache: "no-store",
    });

    const body = await res.json();
    if (res.ok) {
      return { ok: true, status: res.status, jobs: body.data || [], count: body.count || 0 };
    }
    return { ok: false, status: res.status, jobs: [], count: 0, error: body.error || body.message };
  } catch (err: any) {
    return { ok: false, status: 503, jobs: [], count: 0, error: err.message };
  }
}

/**
 * Get single migration job by ID (GET /v1/migrations/{id}).
 */
export async function getMigrationJobById(
  id: string,
  opts: HeaderOptions
): Promise<{ ok: boolean; status: number; job?: MigrationJob; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: buildHeaders(opts),
      cache: "no-store",
    });

    const body = await res.json();
    if (res.ok) {
      return { ok: true, status: res.status, job: body };
    }
    return { ok: false, status: res.status, error: body.error || body.message };
  } catch (err: any) {
    return { ok: false, status: 503, error: err.message };
  }
}

/**
 * Remediate an audit entry (POST /v1/migrations/{id}/audit/{entryId}/remediate).
 */
export async function remediateAuditEntry(
  jobId: string,
  entryId: string,
  input: RemediateInput,
  opts: HeaderOptions
): Promise<{ ok: boolean; status: number; entry?: AuditEntry; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/${encodeURIComponent(jobId)}/audit/${encodeURIComponent(entryId)}/remediate`, {
      method: "POST",
      headers: buildHeaders(opts, true),
      body: JSON.stringify(input),
      cache: "no-store",
    });

    const body = await res.json();
    if (res.ok) {
      return { ok: true, status: res.status, entry: body };
    }
    return { ok: false, status: res.status, error: body.error || body.message };
  } catch (err: any) {
    return { ok: false, status: 503, error: err.message };
  }
}

/**
 * Archive a migration job (DELETE /v1/migrations/{id}).
 */
export async function archiveMigrationJob(
  id: string,
  opts: HeaderOptions
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: buildHeaders(opts, true),
      cache: "no-store",
    });

    const body = await res.json();
    if (res.ok) {
      return { ok: true, status: res.status, data: body };
    }
    return { ok: false, status: res.status, error: body.error || body.message };
  } catch (err: any) {
    return { ok: false, status: 503, error: err.message };
  }
}
