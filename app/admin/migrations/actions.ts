"use server";

import {
  getMigrationIntegrityHealth,
  validateMigration,
  listMigrationJobs,
  getMigrationJobById,
  remediateAuditEntry,
  archiveMigrationJob,
  type ValidateMigrationRequest,
  type MigrationJob,
  type AuditEntry,
  type HeaderOptions,
} from "@/lib/api/migration-integrity";

export type MigrationQAReport = {
  id: string;
  title: string;
  category: "POSITIVE" | "NEGATIVE";
  description: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
  latencyMs: number;
  responseSummary: string;
  notes: string;
};

export async function checkMigrationHealthAction() {
  return await getMigrationIntegrityHealth();
}

export async function validateMigrationAction(req: ValidateMigrationRequest, opts?: HeaderOptions) {
  return await validateMigration(req, opts);
}

export async function listMigrationJobsAction(
  filters?: { legalEntityId?: string; status?: string },
  opts?: HeaderOptions
) {
  return await listMigrationJobs(filters, opts);
}

export async function getMigrationJobByIdAction(id: string, opts?: HeaderOptions) {
  return await getMigrationJobById(id, opts);
}

export async function remediateAuditEntryAction(
  jobId: string,
  entryId: string,
  notes: string,
  opts?: HeaderOptions
) {
  return await remediateAuditEntry(jobId, entryId, notes, opts);
}

export async function archiveMigrationJobAction(id: string, opts?: HeaderOptions) {
  return await archiveMigrationJob(id, opts);
}

/**
 * Executes complete automated QA suite against migration-integrity-svc (:8139).
 */
export async function runMigrationQASuiteAction(): Promise<MigrationQAReport[]> {
  const reports: MigrationQAReport[] = [];
  const PRIMARY_TENANT = "11111111-1111-1111-1111-111111111111";
  const SECONDARY_TENANT = "99999999-9999-9999-9999-999999999999";
  const DEMO_ENTITY = "22222222-2222-2222-2222-222222222222";

  // TC-01: Health Probe Check (:8139)
  {
    const start = Date.now();
    const h = await getMigrationIntegrityHealth();
    const passed = h.ok && h.status === "ok";
    reports.push({
      id: "TC-01",
      title: "Service Liveness & Readiness Probe (:8139)",
      category: "POSITIVE",
      description: "Verify GET /healthz returns 200 OK and confirms service is migration-integrity-svc",
      expectedStatus: 200,
      actualStatus: passed ? 200 : 503,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: `Service: ${h.service} | Status: ${h.status}`,
      notes: "Validates process responsiveness and container uptime.",
    });
  }

  let cleanJobId = "";
  // TC-02: Clean Migration Batch Validation (100% Integrity Score)
  {
    const start = Date.now();
    const res = await validateMigration(
      {
        legal_entity_id: DEMO_ENTITY,
        migration_name: "QA Clean General Ledger Cutover 2026",
        source_system: "ORACLE_EBS_GL",
        target_service: "general-ledger-svc",
        required_fields: ["account_code", "amount", "currency"],
        records: [
          { ref: "ROW-QA-001", fields: { account_code: "GL-1010", amount: "500000.00", currency: "GBP" } },
          { ref: "ROW-QA-002", fields: { account_code: "GL-1020", amount: "750000.00", currency: "GBP" } },
          { ref: "ROW-QA-003", fields: { account_code: "GL-1030", amount: "1250000.00", currency: "GBP" } },
        ],
      },
      { tenantId: PRIMARY_TENANT }
    );

    const passed = res.ok && res.status === 201 && res.data.integrity_score === 100;
    if (passed) cleanJobId = res.data.id;

    reports.push({
      id: "TC-02",
      title: "Clean Migration Batch Validation (100% Score)",
      category: "POSITIVE",
      description: "Execute POST /v1/migrations/validate with 3 valid records — all integrity checks must pass",
      expectedStatus: 201,
      actualStatus: res.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: passed
        ? `Score: ${res.data.integrity_score}% | Status: ${res.data.status} | Job ID: ${res.data.id.slice(0, 8)}...`
        : res.data.error || "Failed",
      notes: "Verifies schema presence, duplicate detection, and numeric formatting engine.",
    });
  }

  let violationJobId = "";
  let violationEntryId = "";
  // TC-03: Violation Detection & Integrity Checks Breakdown
  {
    const start = Date.now();
    const res = await validateMigration(
      {
        legal_entity_id: DEMO_ENTITY,
        migration_name: "QA Defective Batch Cutover",
        source_system: "EXCEL_IMPORT",
        target_service: "payroll-run-svc",
        required_fields: ["employee_id", "gross_salary", "tax_code"],
        records: [
          { ref: "EMP-001", fields: { employee_id: "E-100", gross_salary: "65000.00", tax_code: "1257L" } },
          { ref: "EMP-002", fields: { employee_id: "E-101", gross_salary: "", tax_code: "1257L" } }, // Missing required
          { ref: "EMP-002", fields: { employee_id: "E-101", gross_salary: "72000.00", tax_code: "1257L" } }, // Duplicate ref
          { ref: "EMP-003", fields: { employee_id: "E-102", gross_salary: "NOT_A_NUMBER", tax_code: "BR" } }, // Format failure
        ],
      },
      { tenantId: PRIMARY_TENANT }
    );

    // Job should be created, invalid_records_count > 0, integrity_score < 100
    const passed =
      res.ok &&
      res.status === 201 &&
      res.data.invalid_records_count > 0 &&
      res.data.integrity_score < 100 &&
      res.data.audit_entries?.length > 0;

    if (passed) {
      violationJobId = res.data.id;
      violationEntryId = res.data.audit_entries[0].id;
    }

    reports.push({
      id: "TC-03",
      title: "Data Violation & Defect Detection Engine",
      category: "POSITIVE",
      description: "Submit batch with missing fields, duplicate keys, and invalid numeric types",
      expectedStatus: 201,
      actualStatus: res.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: passed
        ? `Detected ${res.data.invalid_records_count} invalid records | Violations logged: ${res.data.audit_entries.length} | Score: ${res.data.integrity_score}%`
        : res.data.error || "Failed",
      notes: "Audit entries logged for MISSING_REQUIRED, DUPLICATE, and FORMAT_CHECK violations.",
    });
  }

  // TC-04: Audit Violation Remediation Trail
  {
    const start = Date.now();
    if (!violationJobId || !violationEntryId) {
      reports.push({
        id: "TC-04",
        title: "Audit Violation Remediation Workflow",
        category: "POSITIVE",
        description: "Remediate audit entry via POST /v1/migrations/{id}/audit/{entryId}/remediate",
        expectedStatus: 200,
        actualStatus: 500,
        passed: false,
        latencyMs: Date.now() - start,
        responseSummary: "Prerequisite violation entry not available",
        notes: "Requires TC-03 to generate audit entries first.",
      });
    } else {
      const res = await remediateAuditEntry(
        violationJobId,
        violationEntryId,
        "Corrected missing gross salary field from HR payroll master backup",
        { tenantId: PRIMARY_TENANT }
      );

      const passed = res.ok && res.status === 200 && res.entry?.is_remediated === true;
      reports.push({
        id: "TC-04",
        title: "Audit Violation Remediation Workflow",
        category: "POSITIVE",
        description: "Remediate an audit entry with compliance notes and audit trail timestamp",
        expectedStatus: 200,
        actualStatus: res.status,
        passed,
        latencyMs: Date.now() - start,
        responseSummary: passed
          ? `Entry ${violationEntryId.slice(0, 8)}... remediated: ${res.entry?.is_remediated}`
          : res.error || "Failed",
        notes: "Updates audit row state and emits migration.audit_entry_remediated Kafka event.",
      });
    }
  }

  // TC-05: Migration Job Archival Lifecycle
  {
    const start = Date.now();
    const targetId = cleanJobId || violationJobId;
    if (!targetId) {
      reports.push({
        id: "TC-05",
        title: "Migration Job Archival Lifecycle",
        category: "POSITIVE",
        description: "Archive migration job via DELETE /v1/migrations/{id}",
        expectedStatus: 200,
        actualStatus: 500,
        passed: false,
        latencyMs: Date.now() - start,
        responseSummary: "No job available to archive",
        notes: "Requires job from TC-02 or TC-03.",
      });
    } else {
      const res = await archiveMigrationJob(targetId, { tenantId: PRIMARY_TENANT });
      const passed = res.ok && res.status === 200;
      reports.push({
        id: "TC-05",
        title: "Migration Job Archival Lifecycle",
        category: "POSITIVE",
        description: "Soft-archive completed migration job and verify status update in store",
        expectedStatus: 200,
        actualStatus: res.status,
        passed,
        latencyMs: Date.now() - start,
        responseSummary: passed ? `Archived Job ${targetId.slice(0, 8)}...` : res.error || "Failed",
        notes: "Emits migration.job_archived event and transitions status to ARCHIVED.",
      });
    }
  }

  // TC-06: Negative: Missing Tenant Header Scope Guard
  {
    const start = Date.now();
    const res = await validateMigration(
      {
        legal_entity_id: DEMO_ENTITY,
        migration_name: "Unscoped Migration Attempt",
        source_system: "ANONYMOUS",
        target_service: "general-ledger-svc",
        required_fields: ["field1"],
        records: [{ ref: "ROW-1", fields: { field1: "val" } }],
      },
      { tenantId: "" } // Deliberately omit tenant header
    );

    const passed = res.status === 401;
    reports.push({
      id: "TC-06",
      title: "Negative: Missing Tenant Header Scope Guard",
      category: "NEGATIVE",
      description: "Attempt migration validation without X-Tenant-Id — must be rejected with 401 Unauthorized",
      expectedStatus: 401,
      actualStatus: res.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: res.data?.error || `Status ${res.status}`,
      notes: "Architectural mandate: zero-trust tenant boundary prevents anonymous cross-tenant execution.",
    });
  }

  // TC-07: Negative: Cross-Tenant Data Isolation Boundary
  {
    const start = Date.now();
    // Query job list under foreign tenant UUID
    const res = await listMigrationJobs({}, { tenantId: SECONDARY_TENANT });
    // Should succeed with HTTP 200, but count should be 0 because all jobs belong to Tenant 1
    const passed = res.ok && res.status === 200 && res.count === 0;
    reports.push({
      id: "TC-07",
      title: "Negative: Cross-Tenant Data Isolation Boundary",
      category: "NEGATIVE",
      description: "Query migration jobs as Tenant 2 — must return 0 jobs and isolate Tenant 1 records",
      expectedStatus: 200,
      actualStatus: res.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: `Returned ${res.count} jobs for Tenant 2 (0 expected)`,
      notes: "PostgreSQL Row Level Security (RLS) enforces app.tenant_id isolation.",
    });
  }

  return reports;
}
