"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  checkMigrationHealthAction,
  validateMigrationAction,
  listMigrationJobsAction,
  getMigrationJobByIdAction,
  remediateAuditEntryAction,
  archiveMigrationJobAction,
  runMigrationQASuiteAction,
  type MigrationQAReport,
} from "@/app/admin/migrations/actions";
import type { MigrationJob, IntegrityCheck, AuditEntry } from "@/lib/api/migration-integrity";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR, BANNER_WARNING } from "@/components/admin/shared/form";

const PRIMARY_TENANT = "11111111-1111-1111-1111-111111111111";
const SECONDARY_TENANT = "99999999-9999-9999-9999-999999999999";
const DEMO_LEGAL_ENTITY = "22222222-2222-2222-2222-222222222222";

export function MigrationIntegrityWorkbench() {
  const [activeTab, setActiveTab] = useState<"validate" | "jobs" | "qa" | "architecture">("validate");
  const [isPending, startTransition] = useTransition();

  // Health state
  const [health, setHealth] = useState<{ ok: boolean; status: string; service: string; port: string } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Validation Form state
  const [migrationName, setMigrationName] = useState("Opening Balance Ledger Cutover 2026");
  const [sourceSystem, setSourceSystem] = useState("LEGACY_SAP_ERP");
  const [targetService, setTargetService] = useState("general-ledger-svc");
  const [legalEntityId, setLegalEntityId] = useState(DEMO_LEGAL_ENTITY);
  const [tenantScope, setTenantScope] = useState(PRIMARY_TENANT);
  const [requiredFieldsStr, setRequiredFieldsStr] = useState("account_code, amount, currency");
  const [recordsJson, setRecordsJson] = useState(
    JSON.stringify(
      [
        { ref: "ROW-001", fields: { account_code: "GL-1010", amount: "250000.00", currency: "GBP" } },
        { ref: "ROW-002", fields: { account_code: "GL-1020", amount: "185000.50", currency: "GBP" } },
        { ref: "ROW-003", fields: { account_code: "GL-2010", amount: "435000.50", currency: "GBP" } },
      ],
      null,
      2
    )
  );
  const [validating, setValidating] = useState(false);
  const [lastValidationResult, setLastValidationResult] = useState<MigrationJob | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Remediation state
  const [remediatingEntryId, setRemediatingEntryId] = useState<string | null>(null);
  const [remediationNotes, setRemediationNotes] = useState("");
  const [remediationFeedback, setRemediationFeedback] = useState<string | null>(null);

  // Jobs list state
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MigrationJob | null>(null);

  // QA Suite state
  const [qaReports, setQaReports] = useState<MigrationQAReport[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaRunCompleted, setQaRunCompleted] = useState(false);

  useEffect(() => {
    fetchHealth();
    loadJobs();
  }, []);

  async function fetchHealth() {
    setHealthLoading(true);
    try {
      const res = await checkMigrationHealthAction();
      setHealth(res);
    } catch {
      // offline fallback
    } finally {
      setHealthLoading(false);
    }
  }

  async function loadJobs() {
    setJobsLoading(true);
    try {
      const res = await listMigrationJobsAction({}, { tenantId: tenantScope });
      if (res.ok) {
        setJobs(res.jobs);
      }
    } finally {
      setJobsLoading(false);
    }
  }

  function handlePreset(type: "clean" | "defective" | "payroll") {
    if (type === "clean") {
      setMigrationName("Opening Balance Ledger Cutover 2026");
      setSourceSystem("LEGACY_SAP_ERP");
      setTargetService("general-ledger-svc");
      setRequiredFieldsStr("account_code, amount, currency");
      setRecordsJson(
        JSON.stringify(
          [
            { ref: "ROW-001", fields: { account_code: "GL-1010", amount: "250000.00", currency: "GBP" } },
            { ref: "ROW-002", fields: { account_code: "GL-1020", amount: "185000.50", currency: "GBP" } },
            { ref: "ROW-003", fields: { account_code: "GL-2010", amount: "435000.50", currency: "GBP" } },
          ],
          null,
          2
        )
      );
    } else if (type === "defective") {
      setMigrationName("Defective Vendor AP Migration Batch");
      setSourceSystem("EXCEL_IMPORT");
      setTargetService("accounts-payable-svc");
      setRequiredFieldsStr("vendor_id, invoice_ref, amount, currency");
      setRecordsJson(
        JSON.stringify(
          [
            { ref: "INV-001", fields: { vendor_id: "V-881", invoice_ref: "INV-2026-01", amount: "15000.00", currency: "GBP" } },
            { ref: "INV-002", fields: { vendor_id: "V-882", invoice_ref: "", amount: "23000.00", currency: "GBP" } }, // Missing required invoice_ref
            { ref: "INV-002", fields: { vendor_id: "V-882", invoice_ref: "INV-2026-02", amount: "12000.00", currency: "GBP" } }, // Duplicate ref INV-002
            { ref: "INV-003", fields: { vendor_id: "V-883", invoice_ref: "INV-2026-03", amount: "INVALID_SUM", currency: "GBP" } }, // Format check failure
          ],
          null,
          2
        )
      );
    } else {
      setMigrationName("HR Master & Payroll Opening Cutover");
      setSourceSystem("WORKDAY_CORE");
      setTargetService("employee-master-svc");
      setRequiredFieldsStr("employee_id, work_email, salary, start_date");
      setRecordsJson(
        JSON.stringify(
          [
            { ref: "EMP-001", fields: { employee_id: "EMP-101", work_email: "e101@company.com", salary: "85000.00", start_date: "2026-01-15" } },
            { ref: "EMP-002", fields: { employee_id: "EMP-102", work_email: "e102@company.com", salary: "92000.00", start_date: "2026-02-01" } },
          ],
          null,
          2
        )
      );
    }
  }

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    setValidating(true);
    setValidationError(null);
    setLastValidationResult(null);

    let parsedRecords: any[] = [];
    try {
      parsedRecords = JSON.parse(recordsJson);
      if (!Array.isArray(parsedRecords)) throw new Error("Records must be a JSON array");
    } catch (err: any) {
      setValidationError(`Invalid JSON in Records: ${err.message}`);
      setValidating(false);
      return;
    }

    const fields = requiredFieldsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await validateMigrationAction(
        {
          legal_entity_id: legalEntityId.trim(),
          migration_name: migrationName.trim(),
          source_system: sourceSystem.trim(),
          target_service: targetService.trim(),
          required_fields: fields,
          records: parsedRecords,
        },
        { tenantId: tenantScope }
      );

      if (res.ok) {
        setLastValidationResult(res.data);
        loadJobs();
      } else {
        setValidationError(res.data.error || res.data.message || `Validation rejected (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setValidationError(err.message);
    } finally {
      setValidating(false);
    }
  }

  async function handleRemediate(jobId: string, entryId: string) {
    if (!remediationNotes.trim()) {
      alert("Please enter compliance remediation notes");
      return;
    }

    startTransition(async () => {
      try {
        const res = await remediateAuditEntryAction(jobId, entryId, remediationNotes.trim(), { tenantId: tenantScope });
        if (res.ok) {
          setRemediationFeedback(`Entry ${entryId.slice(0, 8)}... successfully marked remediated.`);
          setRemediatingEntryId(null);
          setRemediationNotes("");
          // refresh selected job or last validation
          if (lastValidationResult && lastValidationResult.id === jobId) {
            const updated = await getMigrationJobByIdAction(jobId, { tenantId: tenantScope });
            if (updated.ok && updated.job) setLastValidationResult(updated.job);
          }
          if (selectedJob && selectedJob.id === jobId) {
            const updated = await getMigrationJobByIdAction(jobId, { tenantId: tenantScope });
            if (updated.ok && updated.job) setSelectedJob(updated.job);
          }
          loadJobs();
        } else {
          alert(`Failed to remediate: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    });
  }

  async function handleArchive(jobId: string) {
    if (!confirm(`Archive migration job ${jobId}?`)) return;
    try {
      const res = await archiveMigrationJobAction(jobId, { tenantId: tenantScope });
      if (res.ok) {
        loadJobs();
        if (selectedJob?.id === jobId) setSelectedJob(null);
      } else {
        alert(`Failed to archive: ${res.error}`);
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleRunQASuite() {
    setQaLoading(true);
    setQaRunCompleted(false);
    try {
      const reports = await runMigrationQASuiteAction();
      setQaReports(reports);
      setQaRunCompleted(true);
      fetchHealth();
      loadJobs();
    } catch (err: any) {
      alert(`QA Test Runner Exception: ${err.message}`);
    } finally {
      setQaLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Telemetry Header */}
      <div className="rounded-xl border border-navy-200 bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 p-5 text-white shadow-lg dark:border-navy-500/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-lg font-bold tracking-tight text-white">
                Migration Integrity & Cutover Engine (:8139)
              </h2>
              <span className="rounded-full bg-navy-800 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
                migration-integrity-svc
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              Tier 0 opening balance & data cutover integrity validation standard (ZS-MIG-001). Performs schema presence,
              duplicate detection, and type/format integrity checks with immutable audit remediation trails.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchHealth}
              disabled={healthLoading}
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              {healthLoading ? "Checking..." : "Refresh Probes"}
            </button>
            <button
              onClick={() => handlePreset("clean")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              Preset: Clean Batch (100%)
            </button>
            <button
              onClick={() => handlePreset("defective")}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
            >
              Preset: Defective Batch (Violations)
            </button>
          </div>
        </div>

        {/* Telemetry Metrics Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-800 pt-4">
          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">Service Daemon</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-rose-500"}`} />
              <span className="text-xs font-semibold text-slate-100">
                {health?.ok ? "HEALTHY & READY" : "OFFLINE"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Port :8139 | /healthz 200</p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">PostgreSQL Database</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-100">migration_integrity</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Port :5432 | RLS Enforced</p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">Authorization Plane</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-100">authorization-svc (:8089)</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Bundle: MIGRATION_FULL</p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-2.5 border border-slate-700/50">
            <span className="text-[10px] uppercase font-semibold text-slate-400">Event Publisher</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-100">zoiko-kafka (:9092)</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Topic: zoiko.migration-integrity</p>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("validate")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "validate"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Migration Validation Studio
        </button>

        <button
          onClick={() => {
            setActiveTab("jobs");
            loadJobs();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "jobs"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Jobs & Audit Lineage Register
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {jobs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("qa")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "qa"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Senior QA Test Matrix (7 Scenarios)
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Automated
          </span>
        </button>

        <button
          onClick={() => setActiveTab("architecture")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "architecture"
              ? "border-navy-900 text-navy-900 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Architecture & Security Posture
        </button>
      </div>

      {/* TAB 1: Validation Studio */}
      {activeTab === "validate" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Validate Opening Balance & Migration Batches (POST /v1/migrations/validate)
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Dispatches multi-rule integrity evaluation across migration records before any cutover write is committed to
              general-ledger-svc, payroll-run-svc, or employee-master-svc.
            </p>

            <form onSubmit={handleValidate} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="tenant-scope" className={LABEL}>
                    Tenant ID Scope <span className="text-rose-500">* (Mandatory Zero-Trust Guard)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="tenant-scope"
                      type="text"
                      value={tenantScope}
                      onChange={(e) => setTenantScope(e.target.value)}
                      className={`${FIELD} font-mono text-xs`}
                    />
                    <button
                      type="button"
                      onClick={() => setTenantScope(PRIMARY_TENANT)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Tenant 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenantScope(SECONDARY_TENANT)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Tenant 2
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenantScope("")}
                      className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300"
                    >
                      Clear (Neg)
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="legal-entity" className={LABEL}>
                    Legal Entity ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="legal-entity"
                    type="text"
                    required
                    value={legalEntityId}
                    onChange={(e) => setLegalEntityId(e.target.value)}
                    className={`${FIELD} font-mono text-xs`}
                  />
                </div>

                <div>
                  <label htmlFor="migration-name" className={LABEL}>
                    Migration Batch Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="migration-name"
                    type="text"
                    required
                    value={migrationName}
                    onChange={(e) => setMigrationName(e.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="source-system" className={LABEL}>
                    Source System <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="source-system"
                    value={sourceSystem}
                    onChange={(e) => setSourceSystem(e.target.value)}
                    className={FIELD}
                  >
                    <option value="LEGACY_SAP_ERP">LEGACY_SAP_ERP</option>
                    <option value="ORACLE_EBS_GL">ORACLE_EBS_GL</option>
                    <option value="EXCEL_IMPORT">EXCEL_IMPORT</option>
                    <option value="WORKDAY_CORE">WORKDAY_CORE</option>
                    <option value="NETSUITE_ONEWORLD">NETSUITE_ONEWORLD</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="target-service" className={LABEL}>
                    Target Core Service <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="target-service"
                    value={targetService}
                    onChange={(e) => setTargetService(e.target.value)}
                    className={FIELD}
                  >
                    <option value="general-ledger-svc">general-ledger-svc (:8098)</option>
                    <option value="accounts-payable-svc">accounts-payable-svc (:8099)</option>
                    <option value="payroll-run-svc">payroll-run-svc (:8110)</option>
                    <option value="employee-master-svc">employee-master-svc (:8108)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="required-fields" className={LABEL}>
                    Required Fields (Schema Rule)
                  </label>
                  <input
                    id="required-fields"
                    type="text"
                    value={requiredFieldsStr}
                    onChange={(e) => setRequiredFieldsStr(e.target.value)}
                    placeholder="account_code, amount, currency"
                    className={FIELD}
                  />
                  <p className={HINT}>Comma-separated list of mandatory attributes.</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="records-json" className={LABEL}>
                    Migration Records Payload (JSON Array of MigrationRecord)
                  </label>
                  <span className="text-[11px] text-slate-400">Format: [&#123; ref: string, fields: &#123; ... &#125; &#125;]</span>
                </div>
                <textarea
                  id="records-json"
                  rows={7}
                  value={recordsJson}
                  onChange={(e) => setRecordsJson(e.target.value)}
                  className={`${FIELD} font-mono text-xs`}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreset("clean")}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Preset: Clean GL Cutover
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreset("defective")}
                    className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  >
                    Preset: Defective AP Batch
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreset("payroll")}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Preset: HR Workday Master
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={validating}
                  className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                >
                  {validating ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Validating Batch...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Validate Migration Batch
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/50 dark:text-rose-300">
              <div className="flex items-center gap-2 font-bold">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Validation Rejected / Guard Activated
              </div>
              <p className="mt-1">{validationError}</p>
            </div>
          )}

          {/* Remediation Feedback */}
          {remediationFeedback && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/50 dark:text-emerald-300">
              {remediationFeedback}
            </div>
          )}

          {/* Validation Results Scorecard */}
          {lastValidationResult && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {lastValidationResult.migration_name}
                    </h4>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        lastValidationResult.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {lastValidationResult.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Job ID: {lastValidationResult.id} | Source: {lastValidationResult.source_system} &rarr; Target:{" "}
                    {lastValidationResult.target_service}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Integrity Score</span>
                    <div
                      className={`text-2xl font-extrabold ${
                        lastValidationResult.integrity_score === 100
                          ? "text-emerald-600 dark:text-emerald-400"
                          : lastValidationResult.integrity_score >= 80
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {lastValidationResult.integrity_score}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Records Breakdown Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Scanned</span>
                  <div className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {lastValidationResult.total_records_count} Records
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40">
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Valid Records</span>
                  <div className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {lastValidationResult.valid_records_count}
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40">
                  <span className="text-[10px] uppercase font-bold text-rose-600">Defects / Violations</span>
                  <div className="mt-1 text-xl font-extrabold text-rose-600 dark:text-rose-400">
                    {lastValidationResult.invalid_records_count}
                  </div>
                </div>
              </div>

              {/* Integrity Checks Table */}
              {lastValidationResult.integrity_checks && lastValidationResult.integrity_checks.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Integrity Rule Checks Evaluated
                  </h5>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                      <thead className="bg-slate-50 dark:bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Check Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Rule Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Checked</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Passed</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Failed</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Severity</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                        {lastValidationResult.integrity_checks.map((c, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{c.check_name}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{c.check_type}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.records_checked}</td>
                            <td className="px-3 py-2 font-bold text-emerald-600">{c.records_passed}</td>
                            <td className="px-3 py-2 font-bold text-rose-600">{c.records_failed}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  c.severity === "CRITICAL"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    : c.severity === "WARNING"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {c.severity}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">{c.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Audit Entries & Remediation Trail */}
              {lastValidationResult.audit_entries && lastValidationResult.audit_entries.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Audit Defect Entries Logged ({lastValidationResult.audit_entries.length})
                    </h5>
                    <span className="text-[11px] text-slate-400">
                      Remediating logs audit trails via POST /audit/&#123;id&#125;/remediate
                    </span>
                  </div>

                  <div className="space-y-2">
                    {lastValidationResult.audit_entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`rounded-lg border p-3 text-xs ${
                          entry.is_remediated
                            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20"
                            : "border-rose-200 bg-rose-50/50 dark:border-rose-800/40 dark:bg-rose-950/20"
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                entry.is_remediated
                                  ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                                  : "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100"
                              }`}
                            >
                              {entry.is_remediated ? "REMEDIATED" : "OPEN DEFECT"}
                            </span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              Ref: {entry.record_ref}
                            </span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {entry.violation_type}
                            </span>
                            {entry.field_name && (
                              <span className="font-mono text-slate-500">Field: {entry.field_name}</span>
                            )}
                          </div>

                          {!entry.is_remediated && (
                            <div>
                              {remediatingEntryId === entry.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Enter remediation notes..."
                                    value={remediationNotes}
                                    onChange={(e) => setRemediationNotes(e.target.value)}
                                    className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                                  />
                                  <button
                                    onClick={() => handleRemediate(lastValidationResult.id, entry.id!)}
                                    disabled={isPending}
                                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setRemediatingEntryId(null)}
                                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setRemediatingEntryId(entry.id!);
                                    setRemediationNotes(
                                      `Corrected ${entry.field_name || "record"} from audit source verification`
                                    );
                                  }}
                                  className="rounded border border-navy-300 bg-white px-2.5 py-1 text-xs font-semibold text-navy-800 hover:bg-navy-50 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300"
                                >
                                  Remediate Defect
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Jobs Register */}
      {activeTab === "jobs" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Migration Jobs & Audit Lineage Register
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Persistent PostgreSQL record of all validated cutover batches scoped by Tenant ID and Legal Entity.
                </p>
              </div>
              <button
                onClick={loadJobs}
                disabled={jobsLoading}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {jobsLoading ? "Refreshing..." : "Refresh Jobs"}
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  No migration jobs found for tenant {tenantScope}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Run a validation in the Validation Studio tab or click a preset above.
                </p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Migration Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Pipeline</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Records</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Score</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Created</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200">
                          <div>{job.migration_name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{job.id.slice(0, 16)}...</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                          {job.source_system} &rarr; {job.target_service}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          Total: <strong>{job.total_records_count}</strong> | Valid:{" "}
                          <strong className="text-emerald-600">{job.valid_records_count}</strong>
                        </td>
                        <td className="px-3 py-2.5 font-bold">
                          <span
                            className={
                              job.integrity_score === 100
                                ? "text-emerald-600"
                                : job.integrity_score >= 80
                                ? "text-amber-600"
                                : "text-rose-600"
                            }
                          >
                            {job.integrity_score}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              job.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : job.status === "ARCHIVED"
                                ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(job.created_at).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2.5 text-right space-x-1.5">
                          <button
                            onClick={async () => {
                              const res = await getMigrationJobByIdAction(job.id, { tenantId: tenantScope });
                              if (res.ok && res.job) setSelectedJob(res.job);
                            }}
                            className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Inspect
                          </button>
                          {job.status !== "ARCHIVED" && (
                            <button
                              onClick={() => handleArchive(job.id)}
                              className="rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
                            >
                              Archive
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inspect Job Drawer */}
          {selectedJob && (
            <div className="rounded-lg border border-navy-300 bg-white p-5 shadow-sm dark:border-cyan-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Inspecting Job: {selectedJob.migration_name}
                  </h4>
                  <p className="font-mono text-xs text-slate-400">UUID: {selectedJob.id}</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="rounded border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700"
                >
                  Close
                </button>
              </div>

              {selectedJob.audit_entries && selectedJob.audit_entries.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Audit Entries ({selectedJob.audit_entries.length})
                  </h5>
                  {selectedJob.audit_entries.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded bg-slate-50 p-2.5 text-xs dark:bg-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            e.is_remediated ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {e.is_remediated ? "REMEDIATED" : "OPEN"}
                        </span>
                        <span className="font-mono font-bold">{e.record_ref}</span>
                        <span className="font-mono text-slate-500">{e.violation_type}</span>
                        {e.field_name && <span className="text-slate-400">({e.field_name})</span>}
                      </div>

                      {!e.is_remediated && (
                        <button
                          onClick={() => handleRemediate(selectedJob.id, e.id!)}
                          className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-emerald-500"
                        >
                          Remediate
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">No defect audit entries recorded for this job (Clean batch).</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Automated QA Suite */}
      {activeTab === "qa" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Automated Senior QA Acceptance Test Matrix
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Executes all 7 acceptance criteria tests: health probes, clean cutover validation, defect detection,
                  audit entry remediation, job archival lifecycle, missing-tenant scope guard, and Postgres RLS cross-tenant
                  isolation.
                </p>
              </div>

              <button
                onClick={handleRunQASuite}
                disabled={qaLoading}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-navy-800 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
              >
                {qaLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Executing 7 Test Cases...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run Complete QA Test Suite
                  </>
                )}
              </button>
            </div>

            {/* Scorecard Strip */}
            {qaRunCompleted && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Executed</span>
                  <div className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {qaReports.length} Tests
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40">
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Passed</span>
                  <div className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {qaReports.filter((r) => r.passed).length} / {qaReports.length}
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40">
                  <span className="text-[10px] uppercase font-bold text-rose-600">Failed</span>
                  <div className="mt-1 text-xl font-extrabold text-rose-600 dark:text-rose-400">
                    {qaReports.filter((r) => !r.passed).length}
                  </div>
                </div>
                <div className="rounded-lg bg-cyan-50 p-3 dark:bg-cyan-950/40">
                  <span className="text-[10px] uppercase font-bold text-cyan-700">Total Duration</span>
                  <div className="mt-1 text-xl font-extrabold text-cyan-800 dark:text-cyan-300">
                    {qaReports.reduce((sum, r) => sum + r.latencyMs, 0)}ms
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Case Cards */}
          {qaReports.length > 0 && (
            <div className="space-y-3">
              {qaReports.map((report) => (
                <div
                  key={report.id}
                  className={`rounded-lg border p-4 transition-all ${
                    report.passed
                      ? "border-emerald-200 bg-white dark:border-emerald-800/40 dark:bg-slate-900"
                      : "border-rose-300 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-950/20"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${
                          report.passed
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {report.passed ? "PASS" : "FAIL"}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-500">{report.id}</span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{report.title}</h4>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          report.category === "POSITIVE"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                        }`}
                      >
                        {report.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-slate-500">
                        Status: <strong className={report.passed ? "text-emerald-600" : "text-rose-600"}>{report.actualStatus}</strong>{" "}
                        (Exp: {report.expectedStatus})
                      </span>
                      <span className="font-mono text-slate-400">{report.latencyMs}ms</span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{report.description}</p>

                  <div className="mt-3 grid grid-cols-1 gap-2 rounded bg-slate-50 p-2.5 text-xs dark:bg-slate-800 sm:grid-cols-2">
                    <div>
                      <strong className="text-slate-700 dark:text-slate-300">Response Summary:</strong>{" "}
                      <span className="font-mono text-slate-600 dark:text-slate-400">{report.responseSummary}</span>
                    </div>
                    <div>
                      <strong className="text-slate-700 dark:text-slate-300">QA Assessment:</strong>{" "}
                      <span className="text-slate-500 dark:text-slate-400">{report.notes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!qaRunCompleted && !qaLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <svg className="mx-auto h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Acceptance Test Matrix Ready
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Click &quot;Run Complete QA Test Suite&quot; above to execute the 7 automated end-to-end acceptance scenarios.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Architecture */}
      {activeTab === "architecture" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Migration Integrity Engine Architecture & Zero-Trust Posture
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Technical pipeline topology and security guarantees governing ZS-MIG-001 opening balance cutovers.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-[10px] text-white">
                    1
                  </span>
                  Ingestion & Gateway
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-navy-800 dark:text-cyan-300">
                  Frontend Platform (:3000)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Passes canonical ZS-ARCH-SVC-001 v2.0 envelope headers: <code>X-Tenant-Id</code>, <code>X-Principal-Id</code>,{" "}
                  <code>X-Legal-Entity-Id</code>, <code>Idempotency-Key</code>.
                </p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-[10px] text-white">
                    2
                  </span>
                  Authorization Plane
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-blue-800 dark:text-blue-300">
                  authorization-svc (:8089)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Enforces fail-closed RBAC & SoD checks for <code>MIGRATION_JOB_VALIDATE</code>, <code>MIGRATION_JOB_ARCHIVE</code>,{" "}
                  <code>AUDIT_ENTRY_REMEDIATE</code>.
                </p>
              </div>

              <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900 dark:text-purple-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-700 text-[10px] text-white">
                    3
                  </span>
                  Integrity Engine
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-purple-800 dark:text-purple-300">
                  migration-integrity-svc (:8139)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Evaluates schema presence, duplicate keys, numeric formats, and emits audit event trails to Kafka.
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] text-white">
                    4
                  </span>
                  RLS Relational Store
                </div>
                <div className="mt-2 text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                  zoiko-postgres (:5432)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Enforces <code>tenant_id = current_setting(&#39;app.tenant_id&#39;, true)</code> on tables <code>migration_jobs</code>,{" "}
                  <code>migration_integrity_checks</code>, <code>migration_audit_entries</code>.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Key Fixes & Findings Resolved
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <strong className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Fix 1: Authorization Header Forwarding in Authz Client
                  </strong>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Resolved 503 authz unavailable error by configuring <code>checkAllowedLive</code> in <code>internal/authz/client.go</code>{" "}
                    to forward <code>X-Tenant-Id</code>, <code>X-Principal-Id</code>, <code>X-Legal-Entity-Id</code>, and envelope headers.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <strong className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Fix 2: MIGRATION_FULL Permission Bundle Provisioning
                  </strong>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Provisioned <code>MIGRATION_FULL</code> bundle for <code>CONSOLE_DEMO_OPERATOR</code> in <code>authorization_svc</code>{" "}
                    enabling legitimate execution of validation, audit remediation, and job archival.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
