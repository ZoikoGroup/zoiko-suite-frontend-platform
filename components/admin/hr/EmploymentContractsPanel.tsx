"use client";

import { useActionState } from "react";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Edit3,
  XCircle,
  Search,
  Briefcase,
  UserCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared/JsonBlock";
import { ResultBanner } from "@/components/admin/shared/ResultBanner";
import {
  issueContractAction,
  amendContractAction,
  terminateContractAction,
  lookupContractAction,
  type ContractActionState,
} from "@/app/admin/hr/contract-actions";
import { IDLE_LOOKUP, type LookupState } from "@/components/admin/shared/lookup";

const IDLE_ACTION: ContractActionState = { status: "idle" };

export function EmploymentContractsPanel() {
  const [issueState, issueSubmit, issuePending] = useActionState(
    issueContractAction,
    IDLE_ACTION
  );

  const [amendState, amendSubmit, amendPending] = useActionState(
    amendContractAction,
    IDLE_ACTION
  );

  const [terminateState, terminateSubmit, terminatePending] = useActionState(
    terminateContractAction,
    IDLE_ACTION
  );

  const [lookupState, lookupSubmit, lookupPending] = useActionState(
    lookupContractAction,
    IDLE_LOOKUP
  );

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Employment Contracts Governance & Lifecycle
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Live, writable. Backed by <code className="font-mono text-xs text-indigo-700 dark:text-indigo-300">employment-contracts-svc (:8109)</code> and <code className="font-mono text-xs text-indigo-700 dark:text-indigo-300">employee-master-svc (:8108)</code>.
          Enforces multi-entity workforce boundaries, strict version lineage on compensation amendments, and irreversible termination workflows.
        </p>
      </div>

      {/* ── Step 1: Issue Contract ────────────────────────────────────────── */}
      <Card className="border-indigo-100 dark:border-indigo-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>1. Issue Governed Employment Contract (employment-contracts-svc :8109)</CardTitle>
              <CardDescription>
                Issues an initial Version 1 contract in <code className="font-mono text-xs">ACTIVE</code> status. Cross-validates legal entity alignment against <code className="font-mono text-xs">employee-master-svc (:8108)</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={issueSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="legal_entity_id" className={LABEL}>
                  Legal Entity ID (Employer)
                </label>
                <select id="legal_entity_id" name="legal_entity_id" defaultValue="11111111-1111-1111-1111-111111111111" className={FIELD}>
                  <option value="11111111-1111-1111-1111-111111111111">UK Operating Entity (11111111-1111-1111-1111-111111111111)</option>
                  <option value="22222222-2222-2222-2222-222222222222">US Operations Corp (22222222-2222-2222-2222-222222222222)</option>
                </select>
                <p className={HINT}>Entity issuing and funding the contract</p>
              </div>

              <div>
                <label htmlFor="employee_id" className={LABEL}>
                  Employee ID (UUID)
                </label>
                <input
                  id="employee_id"
                  name="employee_id"
                  defaultValue="e1111111-1111-1111-1111-111111111111"
                  placeholder="Employee UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>Must be registered & active in employee-master-svc (e.g. Arthur Pendleton)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="contract_type" className={LABEL}>
                  Contract Type
                </label>
                <select id="contract_type" name="contract_type" defaultValue="FULL_TIME" className={FIELD}>
                  <option value="FULL_TIME">FULL_TIME (Permanent)</option>
                  <option value="PART_TIME">PART_TIME</option>
                  <option value="FIXED_TERM">FIXED_TERM</option>
                  <option value="EXECUTIVE">EXECUTIVE</option>
                </select>
              </div>

              <div>
                <label htmlFor="title" className={LABEL}>
                  Job Title
                </label>
                <input
                  id="title"
                  name="title"
                  defaultValue="Senior Systems Architect"
                  className={FIELD}
                  required
                />
              </div>

              <div>
                <label htmlFor="pay_frequency" className={LABEL}>
                  Pay Frequency
                </label>
                <select id="pay_frequency" name="pay_frequency" defaultValue="MONTHLY" className={FIELD}>
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="BIWEEKLY">BIWEEKLY</option>
                  <option value="WEEKLY">WEEKLY</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="base_salary_amount" className={LABEL}>
                  Base Salary Amount
                </label>
                <input
                  id="base_salary_amount"
                  name="base_salary_amount"
                  type="number"
                  step="0.01"
                  defaultValue="95000.00"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Must be greater than 0.00</p>
              </div>

              <div>
                <label htmlFor="currency" className={LABEL}>
                  Currency (ISO 4217)
                </label>
                <select id="currency" name="currency" defaultValue="GBP" className={FIELD}>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              <div>
                <label htmlFor="effective_from" className={LABEL}>
                  Effective From Date
                </label>
                <input
                  id="effective_from"
                  name="effective_from"
                  type="date"
                  defaultValue="2026-04-01"
                  className={FIELD}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="effective_to" className={LABEL}>
                  Effective To Date (Optional for fixed-term)
                </label>
                <input
                  id="effective_to"
                  name="effective_to"
                  type="date"
                  className={FIELD}
                />
                <p className={HINT}>Must be on or after Effective From (negative test rule)</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={issuePending} size="sm">
                <Briefcase className="mr-1.5 h-4 w-4" />
                {issuePending ? "Issuing Contract…" : "Issue Employment Contract"}
              </Button>
            </div>

            {issueState.status === "success" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{issueState.message}</span>
                </div>
                {issueState.contractId && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">Contract ID:</span>
                    <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                      {issueState.contractId}
                    </code>
                  </div>
                )}
              </div>
            )}

            {issueState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{issueState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 2: Amend Contract ────────────────────────────────────────── */}
      <Card className="border-indigo-100 dark:border-indigo-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300">
              <Edit3 className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>2. Amend Contract (Version Lineage & Compensation Merit)</CardTitle>
              <CardDescription>
                Applies an immutable amendment. Prior version moves to <code className="font-mono text-xs">SUPERSEDED</code> and a new active version (e.g. Version 2) is created with audit justification.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={amendSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="amend_contract_id" className={LABEL}>
                  Contract ID (from Step 1)
                </label>
                <input
                  id="amend_contract_id"
                  name="contract_id"
                  defaultValue={issueState.contractId ?? ""}
                  placeholder="Paste Contract UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>The contract being amended</p>
              </div>

              <div>
                <label htmlFor="amend_title" className={LABEL}>
                  Revised Job Title
                </label>
                <input
                  id="amend_title"
                  name="title"
                  defaultValue="Lead Systems Architect"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="amend_base_salary_amount" className={LABEL}>
                  Revised Base Salary Amount
                </label>
                <input
                  id="amend_base_salary_amount"
                  name="base_salary_amount"
                  type="number"
                  step="0.01"
                  defaultValue="110000.00"
                  className={FIELD}
                />
                <p className={HINT}>Updated annual compensation</p>
              </div>

              <div>
                <label htmlFor="amend_effective_from" className={LABEL}>
                  Amendment Effective Date
                </label>
                <input
                  id="amend_effective_from"
                  name="effective_from"
                  type="date"
                  defaultValue="2026-07-01"
                  className={FIELD}
                  required
                />
              </div>

              <div>
                <label htmlFor="amendment_reason" className={LABEL}>
                  Amendment Reason / Rationale
                </label>
                <input
                  id="amendment_reason"
                  name="amendment_reason"
                  defaultValue="Annual performance merit promotion to Lead Systems Architect"
                  className={FIELD}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={amendPending} size="sm">
                <Edit3 className="mr-1.5 h-4 w-4" />
                {amendPending ? "Applying Amendment…" : "Apply Amendment (Increment Version)"}
              </Button>
            </div>

            {amendState.status === "success" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{amendState.message}</span>
                </div>
                {amendState.contractId && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">New Version Contract ID:</span>
                    <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                      {amendState.contractId}
                    </code>
                  </div>
                )}
              </div>
            )}

            {amendState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{amendState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 3: Terminate Contract ────────────────────────────────────── */}
      <Card className="border-indigo-100 dark:border-indigo-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300">
              <XCircle className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>3. Terminate Contract (Lifecycle Completion)</CardTitle>
              <CardDescription>
                Transitions the active contract into <code className="font-mono text-xs">TERMINATED</code> status. Once terminated, no further amendments are permitted.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={terminateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="term_contract_id" className={LABEL}>
                  Contract ID
                </label>
                <input
                  id="term_contract_id"
                  name="contract_id"
                  defaultValue={amendState.contractId ?? issueState.contractId ?? ""}
                  placeholder="Paste Contract UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>The contract to end</p>
              </div>

              <div>
                <label htmlFor="termination_date" className={LABEL}>
                  Termination Effective Date
                </label>
                <input
                  id="termination_date"
                  name="termination_date"
                  type="date"
                  defaultValue="2026-12-31"
                  className={FIELD}
                  required
                />
              </div>
            </div>

            <Button type="submit" loading={terminatePending} size="sm" variant="secondary" className="border-rose-300 text-rose-800 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300">
              <XCircle className="mr-1.5 h-4 w-4" />
              {terminatePending ? "Terminating…" : "Terminate Contract"}
            </Button>

            {terminateState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{terminateState.message}</span>
              </div>
            )}

            {terminateState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{terminateState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 4: Audit Lookup & Lineage Verification ───────────────────── */}
      <Card className="border-indigo-100 dark:border-indigo-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>4. Look up Contract Audit Record & Live State</CardTitle>
              <CardDescription>
                Direct query against <code className="font-mono text-xs">employment-contracts-svc (:8109)</code> to verify live database state, version lineage, and timestamps.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={lookupSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lookup_contract_id" className={LABEL}>
                  Contract ID (UUID)
                </label>
                <input
                  id="lookup_contract_id"
                  name="lookup_contract_id"
                  defaultValue={terminateState.contractId ?? amendState.contractId ?? issueState.contractId ?? ""}
                  placeholder="Paste Contract UUID"
                  className={`${FIELD} font-mono text-xs`}
                />
                <p className={HINT}>Look up exact contract version record</p>
              </div>

              <div>
                <label htmlFor="lookup_employee_id" className={LABEL}>
                  Or Employee ID (Active Contract Query)
                </label>
                <input
                  id="lookup_employee_id"
                  name="lookup_employee_id"
                  defaultValue="e1111111-1111-1111-1111-111111111111"
                  placeholder="Paste Employee UUID"
                  className={`${FIELD} font-mono text-xs`}
                />
                <p className={HINT}>Queries /v1/contracts/employee/{'{id}'}/active</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" loading={lookupPending}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {lookupPending ? "Querying :8109…" : "Look up Contract Record"}
              </Button>
            </div>

            <ResultBanner tone={lookupState.status === "found" ? "success" : lookupState.status === "error" ? "error" : "neutral"} message={lookupState.message}>
              {lookupState.status === "found" && <JsonBlock value={lookupState.record} />}
            </ResultBanner>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
