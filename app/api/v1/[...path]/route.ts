import { NextRequest, NextResponse } from "next/server";
import {
  listTaxRules,
  listTaxDeterminations,
  listVATReturns,
  listCorporateTaxReturns,
  listWithholdingObligations,
  listFilingDrafts,
  listTaxAuthorityInterfaces,
  getTaxSummaryStats,
  listUpcomingTaxDeadlines,
  patchTaxRule,
  patchTaxDetermination,
  patchVATReturn,
  patchCorporateTaxReturn,
  patchWithholdingObligation,
  patchFilingDraft,
  patchTaxAuthorityInterface,
} from "@/lib/api/tax";
import { listContracts, listClauses, listObligations, listBoardMeetings, listCorporateActions, listCounterparties, createClause, createResolution } from "@/lib/api/legal";
import { listJournalEntries, listCashPositions, getFinanceSummaryStats, createJournalEntry, matchStatementLine, createStatementLine, createFiscalPeriod, lockFiscalPeriod } from "@/lib/api/finance";
import { listPurchaseOrders, listSpendLimits } from "@/lib/api/commercial-ops";
import { listPayrollRuns, listCompensationStructures, listBenefitPlans, listPayrollTaxProfiles, listPayrollExceptions, initiatePayrollRun, createCompensationStructure, raisePayrollException } from "@/lib/api/payroll";
import { listEmployees, listLeaveRequests, listDepartments, listWorkforceAlerts, createEmployee, submitLeaveRequest, initiateTermination } from "@/lib/api/hr";
import { listFilingRequirements, listComplianceEvaluations, listEscalatedExceptions, createFilingRequirement, evaluateCompliance, generateEvidenceManifest } from "@/lib/api/compliance";
import { getAuditEvents } from "@/lib/api/audit-events";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  const identity = callerIdentity(req);

  // Tax Domain
  if (endpoint === "tax-rules") {
    const res = await listTaxRules(identity);
    return NextResponse.json({ tax_rules: res.ok ? res.data : [] });
  }
  if (endpoint === "tax-determinations") {
    const res = await listTaxDeterminations(identity);
    return NextResponse.json({ determinations: res.ok ? res.data : [] });
  }
  if (endpoint === "vat-returns") {
    const res = await listVATReturns(identity);
    return NextResponse.json({ vat_returns: res.ok ? res.data : [] });
  }
  if (endpoint === "corporate-tax-returns") {
    const res = await listCorporateTaxReturns(identity);
    return NextResponse.json({ corporate_tax_returns: res.ok ? res.data : [] });
  }
  if (endpoint === "withholding-tax") {
    const res = await listWithholdingObligations(identity);
    return NextResponse.json({ obligations: res.ok ? res.data : [] });
  }
  if (endpoint === "filing-preparation/drafts") {
    const res = await listFilingDrafts(identity);
    return NextResponse.json({ drafts: res.ok ? res.data : [] });
  }
  if (endpoint === "tax-authority/interfaces") {
    const res = await listTaxAuthorityInterfaces(identity);
    return NextResponse.json({ interfaces: res.ok ? res.data : [] });
  }
  if (endpoint === "tax/summary") {
    const res = await getTaxSummaryStats(identity);
    return NextResponse.json({ summary: res.ok ? res.data : {} });
  }
  if (endpoint === "tax/deadlines") {
    const res = await listUpcomingTaxDeadlines(identity);
    return NextResponse.json({ deadlines: res.ok ? res.data : [] });
  }

  // Legal Domain
  if (endpoint === "contracts") {
    const res = await listContracts(identity);
    return NextResponse.json({ contracts: res.ok ? res.data : [] });
  }
  if (endpoint === "clauses") {
    const res = await listClauses(identity);
    return NextResponse.json({ clauses: res.ok ? res.data : [] });
  }
  if (endpoint === "obligations") {
    const res = await listObligations(identity);
    return NextResponse.json({ obligations: res.ok ? res.data : [] });
  }
  if (endpoint === "meetings") {
    const res = await listBoardMeetings(identity);
    return NextResponse.json({ meetings: res.ok ? res.data : [] });
  }
  if (endpoint === "corporate-actions") {
    const res = await listCorporateActions(identity);
    return NextResponse.json({ corporate_actions: res.ok ? res.data : [] });
  }
  if (endpoint === "counterparties") {
    const res = await listCounterparties(identity);
    return NextResponse.json({ counterparties: res.ok ? res.data : [] });
  }

  // Finance Domain
  if (endpoint === "journal-entries") {
    const res = await listJournalEntries();
    return NextResponse.json({ journal_entries: res.ok ? res.data : [] });
  }
  if (endpoint === "cash-positions") {
    const res = await listCashPositions();
    return NextResponse.json({ cash_positions: res.ok ? res.data : [] });
  }
  if (endpoint === "finance/summary") {
    const res = await getFinanceSummaryStats();
    return NextResponse.json({ summary: res.ok ? res.data : {} });
  }

  // Commercial Ops Domain
  if (endpoint === "purchase-orders") {
    const res = await listPurchaseOrders(identity);
    return NextResponse.json({ purchase_orders: res.ok ? res.data : [] });
  }
  if (endpoint === "spend-controls/limits") {
    const res = await listSpendLimits(identity);
    return NextResponse.json({ spend_limits: res.ok ? res.data : [] });
  }

  // Payroll Domain
  if (endpoint === "payroll-runs") {
    const res = await listPayrollRuns(identity);
    return NextResponse.json({ payroll_runs: res.ok ? res.data : [] });
  }
  if (endpoint === "compensation/structures") {
    const res = await listCompensationStructures(identity);
    return NextResponse.json({ structures: res.ok ? res.data : [] });
  }
  if (endpoint === "benefits/plans") {
    const res = await listBenefitPlans(identity);
    return NextResponse.json({ plans: res.ok ? res.data : [] });
  }
  if (endpoint === "payroll-tax/profiles") {
    const res = await listPayrollTaxProfiles(identity);
    return NextResponse.json({ profiles: res.ok ? res.data : [] });
  }
  if (endpoint === "payroll-exceptions") {
    const res = await listPayrollExceptions(identity);
    return NextResponse.json({ exceptions: res.ok ? res.data : [] });
  }

  // HR Domain
  if (endpoint === "employees") {
    const res = await listEmployees(identity);
    return NextResponse.json({ employees: res.ok ? res.data : [] });
  }
  if (endpoint === "leave/requests") {
    const res = await listLeaveRequests(identity);
    return NextResponse.json({ requests: res.ok ? res.data : [] });
  }
  if (endpoint === "org/departments") {
    const res = await listDepartments(identity);
    return NextResponse.json({ departments: res.ok ? res.data : [] });
  }
  if (endpoint === "compliance/alerts") {
    const res = await listWorkforceAlerts(identity);
    return NextResponse.json({ alerts: res.ok ? res.data : [] });
  }

  // Compliance Domain
  if (endpoint === "filing-tracker/requirements") {
    const res = await listFilingRequirements(identity);
    return NextResponse.json({ requirements: res.ok ? res.data : [] });
  }
  if (endpoint === "compliance-status") {
    const res = await listComplianceEvaluations(identity);
    return NextResponse.json({ evaluations: res.ok ? res.data : [] });
  }
  if (endpoint === "exception-escalation/exceptions") {
    const res = await listEscalatedExceptions(identity);
    return NextResponse.json({ exceptions: res.ok ? res.data : [] });
  }

  // Audit Events Domain
  if (endpoint === "audit/events" || endpoint === "audit-events") {
    const res = await getAuditEvents();
    return NextResponse.json({ events: res.data ?? [], total: res.summary?.totalEvents ?? 0, hash_chain_valid: res.summary?.hashChainVerified ?? true });
  }
  if (endpoint === "audit/logs") {
    const res = await getAuditEvents();
    return NextResponse.json({ logs: res.data ?? [], total: res.summary?.totalEvents ?? 0 });
  }

  return NextResponse.json({ message: `Endpoint /v1/${endpoint} handled by Zoiko Suite Next.js API Gateway`, status: "ACTIVE" });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const body = await req.json().catch(() => ({}));
  const identity = callerIdentity(req);

  // Tax Domain POST handlers
  if (endpoint === "tax-rules") {
    const rate = Number(body.tax_rate_percentage) || 20;
    const ruleCode = body.rule_code || `RULE-${Date.now()}`;
    const rule = {
      rule_id: `rule-${Date.now()}`,
      tenant_id: identity.tenantId,
      jurisdiction_id: body.jurisdiction_id || "uk-gov-01",
      rule_code: ruleCode,
      name: body.name || `Rule ${ruleCode}`,
      category: body.category || "VAT",
      tax_rate_percentage: rate,
      standard_deductions: body.standard_deductions || 0,
      status: "ACTIVE",
      version: 1,
      effective_from: body.effective_from || new Date().toISOString(),
      created_by: identity.principalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json(rule, { status: 201 });
  }

  if (endpoint === "tax-determinations") {
    const gross = Number(body.gross_amount) || Number(body.taxable_amount) || 100000;
    const rate = Number(body.tax_rate_percentage) || 21.0;
    const taxable = body.taxable_amount !== undefined ? Number(body.taxable_amount) : gross;
    const calc = (taxable * rate) / 100;
    const determination = {
      determination_id: `det-${Date.now()}`,
      tenant_id: identity.tenantId,
      transaction_id: body.transaction_id || `tx-${Date.now()}`,
      source_module: body.source_module || "ADMIN_CONSOLE",
      legal_entity_id: body.legal_entity_id || "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: body.jurisdiction_id || "us-fed-01",
      rule_id: body.rule_id || "rule-us-cit-fed",
      tax_category: body.tax_category || "CORPORATE_INCOME",
      gross_amount: gross,
      taxable_amount: taxable,
      tax_rate_percentage: rate,
      calculated_tax_amount: calc,
      exempt_amount: body.exempt_amount || 0,
      currency: body.currency || "USD",
      status: "CALCULATED",
      effective_from: body.effective_from || new Date().toISOString(),
      evaluated_at: new Date().toISOString(),
      evaluated_by: body.evaluated_by || identity.principalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json(determination, { status: 201 });
  }

  if (endpoint === "filing-preparation/drafts") {
    const draft = {
      draft_id: `draft-${Date.now()}`,
      tenant_id: identity.tenantId,
      legal_entity_id: body.legal_entity_id || "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: body.jurisdiction_id || "uk-gov-01",
      filing_type: body.filing_type || "VAT100_MTD",
      period_key: body.period_key || "2026-Q2",
      reporting_period: body.period_key || "2026-Q2",
      due_date: body.due_date || "2026-08-07",
      tax_due_amount: 186000,
      payload_data: body.payload_data || "{}",
      evidence_manifest_ref: body.evidence_manifest_ref || "ev-manifest-2026-q2",
      notes: body.notes || "Assembled from the Tax Governance console.",
      status: "DRAFT",
      validation_status: "PREPARED",
      created_by: identity.principalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json(draft, { status: 201 });
  }

  if (endpoint.startsWith("filing-preparation/drafts/") && endpoint.endsWith("/finalize")) {
    const draftId = endpoint.split("/")[2];
    return NextResponse.json({
      draft_id: draftId,
      status: "FINALIZED",
      validation_status: "FINALIZED",
      filing_type: "VAT100_MTD",
      period_key: "2026-Q2",
      finalized_at: new Date().toISOString(),
      finalized_by: identity.principalId,
    }, { status: 200 });
  }

  if (endpoint === "vat-returns") {
    const vatReturn = {
      return_id: `vat-${Date.now()}`,
      tenant_id: identity.tenantId,
      legal_entity_id: body.legal_entity_id || "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: body.jurisdiction_id || "jur-uk-gb",
      tax_registration_number: body.tax_registration_number || "GB998877665",
      tax_period: body.tax_period || "2026-Q3",
      total_sales_amount: Number(body.total_sales_amount) || 0,
      total_purchase_amount: Number(body.total_purchase_amount) || 0,
      output_tax_amount: Number(body.output_tax_amount) || 0,
      input_tax_amount: Number(body.input_tax_amount) || 0,
      net_tax_payable: Number(body.net_tax_payable) || 0,
      currency: body.currency || "GBP",
      status: "DRAFT",
      created_by: identity.principalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json(vatReturn, { status: 201 });
  }

  // Finance Domain POST handlers
  if (endpoint === "journal-entries") {
    const res = await createJournalEntry(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "bank-reconciliation/match") {
    const { statement_line_id, journal_id } = body;
    const res = await matchStatementLine(statement_line_id, { journal_id }, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "bank-reconciliation/statement-lines") {
    const res = await createStatementLine(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "financial-close/periods") {
    const res = await createFiscalPeriod(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint.startsWith("financial-close/periods/") && endpoint.endsWith("/lock")) {
    const periodId = endpoint.split("/")[2];
    const res = await lockFiscalPeriod(periodId, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  // HR Domain POST handlers
  if (endpoint === "employees") {
    const res = await createEmployee(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "leave/requests") {
    const res = await submitLeaveRequest(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "terminations") {
    const res = await initiateTermination(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  // Payroll Domain POST handlers
  if (endpoint === "payroll/runs") {
    const res = await initiatePayrollRun(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "compensation/structures") {
    const res = await createCompensationStructure(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "payroll-exceptions") {
    const res = await raisePayrollException(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  // Compliance Domain POST handlers
  if (endpoint === "filing-tracker/requirements") {
    const res = await createFilingRequirement(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "compliance-status/evaluate") {
    const res = await evaluateCompliance(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "evidence-manifests") {
    const res = await generateEvidenceManifest(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  // Tax Domain — additional POST handlers (corporate-tax-returns, withholding-tax, tax-authority)
  if (endpoint === "corporate-tax-returns") {
    const ret = {
      return_id: `corp-ret-${Date.now()}`,
      tenant_id: identity.tenantId,
      legal_entity_id: body.legal_entity_id || "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: body.jurisdiction_id || "us-fed-01",
      tax_registration_number: body.tax_registration_number || "US-EIN-00000000",
      fiscal_year: body.fiscal_year || new Date().getFullYear(),
      accounting_period_start: body.accounting_period_start || "",
      accounting_period_end: body.accounting_period_end || "",
      gross_revenue: Number(body.gross_revenue) || 0,
      allowable_deductions: Number(body.allowable_deductions) || 0,
      taxable_income: Number(body.taxable_income) || 0,
      tax_rate_percent: Number(body.tax_rate_percent) || 21,
      gross_tax_liability: Number(body.gross_tax_liability) || 0,
      tax_credits: Number(body.tax_credits) || 0,
      net_tax_payable: Number(body.net_tax_payable) || 0,
      tax_already_paid: Number(body.tax_already_paid) || 0,
      balance_due: Number(body.balance_due) || 0,
      currency: body.currency || "USD",
      status: "DRAFT",
      created_by: identity.principalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json(ret, { status: 201 });
  }

  if (endpoint === "withholding-tax") {
    const obs = {
      obligation_id: `wht-${Date.now()}`,
      tenant_id: identity.tenantId,
      legal_entity_id: body.legal_entity_id || "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: body.jurisdiction_id || "uk-gov-01",
      counterparty_id: body.counterparty_id || "",
      payment_reference: body.payment_reference || `PAY-${Date.now()}`,
      payment_type: body.payment_type || "ROYALTIES",
      gross_payment_amount: Number(body.gross_payment_amount) || 0,
      taxable_base_amount: Number(body.taxable_base_amount) || Number(body.gross_payment_amount) || 0,
      withholding_rate_percent: Number(body.withholding_rate_percent) || 0,
      statutory_rate_percent: Number(body.statutory_rate_percent) || 0,
      treaty_reduced_rate_percent: Number(body.treaty_reduced_rate_percent) || 0,
      applied_rate_percent: Number(body.applied_rate_percent) || Number(body.withholding_rate_percent) || 0,
      tax_withheld_amount: Number(body.tax_withheld_amount) || 0,
      net_amount_payable: Number(body.net_amount_payable) || (Number(body.gross_payment_amount) - Number(body.tax_withheld_amount || 0)),
      currency: body.currency || "GBP",
      status: "PENDING_REMITTANCE",
      statutory_due_date: body.statutory_due_date || "",
      created_by: identity.principalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json(obs, { status: 201 });
  }

  if (endpoint === "tax-authority/interfaces") {
    const iface = {
      interface_id: `if-${Date.now()}`,
      tenant_id: identity.tenantId,
      jurisdiction_id: body.jurisdiction_id || "uk-gov-01",
      authority_code: (body.authority_name || "UNKNOWN").toUpperCase().replace(/\s+/g, "_"),
      authority_name: body.authority_name || "Tax Authority",
      api_endpoint: body.api_endpoint || "https://api.tax.gov",
      endpoint_url: body.api_endpoint || body.sftp_host || "https://api.tax.gov",
      auth_type: body.auth_type || "API Key",
      auth_credential_id: body.api_key_vault_ref || "",
      protocol: body.protocol || "REST_API_KEY",
      protocol_type: body.protocol || "REST_API_KEY",
      status: "ACTIVE",
      health_status: "UNKNOWN",
      is_active: true,
      error_count: 0,
      created_at: new Date().toISOString(),
    };
    return NextResponse.json(iface, { status: 201 });
  }

  // Legal Domain POST handlers
  if (endpoint === "clauses") {
    const res = await createClause(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  if (endpoint === "resolutions") {
    const res = await createResolution(body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 201 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 500 });
  }

  return NextResponse.json({
    message: `Resource created/processed successfully at /v1/${endpoint}`,
    received_payload: body,
    status: "CREATED",
    timestamp: new Date().toISOString(),
  }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const body = await req.json().catch(() => ({}));

  return NextResponse.json({
    message: `Resource updated at /v1/${endpoint}`,
    received_payload: body,
    status: "UPDATED",
    timestamp: new Date().toISOString(),
  }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const id = path[path.length - 1];

  return NextResponse.json({
    message: `Resource ${id} at /v1/${endpoint} successfully deleted`,
    status: "DELETED",
    timestamp: new Date().toISOString(),
  }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const body = await req.json().catch(() => ({}));
  const identity = callerIdentity(req);

  // Tax-rules PATCH — proxy to mock for real lifecycle transitions
  if (endpoint.startsWith("tax-rules/")) {
    const ruleId = endpoint.split("/").pop()!;
    const res = await patchTaxRule(ruleId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // Tax-determinations PATCH
  if (endpoint.startsWith("tax-determinations/")) {
    const detId = endpoint.split("/").pop()!;
    const res = await patchTaxDetermination(detId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // VAT-returns PATCH
  if (endpoint.startsWith("vat-returns/")) {
    const returnId = endpoint.split("/").pop()!;
    const res = await patchVATReturn(returnId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // Corporate-tax-returns PATCH
  if (endpoint.startsWith("corporate-tax-returns/")) {
    const returnId = endpoint.split("/").pop()!;
    const res = await patchCorporateTaxReturn(returnId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // Withholding-tax PATCH
  if (endpoint.startsWith("withholding-tax/")) {
    const obligationId = endpoint.split("/").pop()!;
    const res = await patchWithholdingObligation(obligationId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // Filing-preparation/drafts PATCH (includes /finalize nested path)
  if (endpoint.startsWith("filing-preparation/drafts/")) {
    const parts = endpoint.split("/");
    const draftId = parts[2];
    const res = await patchFilingDraft(draftId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // Tax-authority/interfaces PATCH
  if (endpoint.startsWith("tax-authority/interfaces/")) {
    const interfaceId = endpoint.split("/").pop()!;
    const res = await patchTaxAuthorityInterface(interfaceId, body, identity);
    return res.ok
      ? NextResponse.json(res.data, { status: 200 })
      : NextResponse.json({ error: res.error.message }, { status: res.error.status ?? 502 });
  }

  // Generic PATCH fallback
  return NextResponse.json({
    message: `Resource at /v1/${endpoint} patched`,
    received_payload: body,
    status: "UPDATED",
    timestamp: new Date().toISOString(),
  }, { status: 200 });
}

/** Caller identity from the X-* headers, with the console demo defaults. */
function callerIdentity(req: NextRequest) {
  const tenantId = req.headers.get("X-Tenant-Id") ?? "11111111-1111-1111-1111-111111111111";
  const principalId = req.headers.get("X-Principal-Id") ?? "33333333-3333-3333-3333-333333333333";
  return { tenantId, principalId };
}
