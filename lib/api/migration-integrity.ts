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
};

export type HeaderOptions = {
  tenantId?: string;
  principalId?: string;
  legalEntityId?: string;
  requestId?: string;
  correlationId?: string;
  sourceChannel?: string;
  idempotencyKey?: string;
};

const DEFAULT_TENANT = "11111111-1111-1111-1111-111111111111";
const DEFAULT_PRINCIPAL = "33333333-3333-3333-3333-333333333333";
const DEFAULT_ENTITY = "22222222-2222-2222-2222-222222222222";

function buildHeaders(opts?: HeaderOptions): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Id": opts?.tenantId !== undefined ? opts.tenantId : DEFAULT_TENANT,
    "X-Principal-Id": opts?.principalId !== undefined ? opts.principalId : DEFAULT_PRINCIPAL,
    "X-Actor-Subject-Id": opts?.principalId !== undefined ? opts.principalId : DEFAULT_PRINCIPAL,
    "X-Legal-Entity-Id": opts?.legalEntityId !== undefined ? opts.legalEntityId : DEFAULT_ENTITY,
    "X-Request-Id": opts?.requestId || `req-mig-${Date.now()}`,
    "X-Correlation-Id": opts?.correlationId || `corr-mig-${Date.now()}`,
    "X-Source-Channel": opts?.sourceChannel || "web",
    "Idempotency-Key": opts?.idempotencyKey || `idemp-mig-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  };

  // Remove empty headers to test missing header negative paths
  if (opts?.tenantId === "") {
    delete headers["X-Tenant-Id"];
  }
  if (opts?.principalId === "") {
    delete headers["X-Principal-Id"];
    delete headers["X-Actor-Subject-Id"];
  }

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
        port: "8139",
      };
    }
    return { ok: false, service: "migration-integrity-svc", status: `HTTP ${res.status}`, port: "8139" };
  } catch (err: any) {
    return { ok: false, service: "migration-integrity-svc", status: err.message, port: "8139" };
  }
}

/**
 * Validate a data migration batch (POST /v1/migrations/validate).
 */
export async function validateMigration(
  req: ValidateMigrationRequest,
  opts?: HeaderOptions
): Promise<{ ok: boolean; status: number; data: MigrationJob | any }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/validate`, {
      method: "POST",
      headers: buildHeaders({
        ...opts,
        legalEntityId: req.legal_entity_id || opts?.legalEntityId,
      }),
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
  filters?: { legalEntityId?: string; status?: string },
  opts?: HeaderOptions
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
  opts?: HeaderOptions
): Promise<{ ok: boolean; status: number; job?: MigrationJob; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/${id}`, {
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
  notes: string,
  opts?: HeaderOptions
): Promise<{ ok: boolean; status: number; entry?: AuditEntry; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/${jobId}/audit/${entryId}/remediate`, {
      method: "POST",
      headers: buildHeaders(opts),
      body: JSON.stringify({ notes }),
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
  opts?: HeaderOptions
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const url = serviceUrl("migrationIntegrity");
  try {
    const res = await fetch(`${url}/v1/migrations/${id}`, {
      method: "DELETE",
      headers: buildHeaders(opts),
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
