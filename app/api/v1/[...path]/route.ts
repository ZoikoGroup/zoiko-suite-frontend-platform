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
} from "@/lib/api/tax";
import { listContracts, listClauses, listObligations, listBoardMeetings, listCorporateActions, listCounterparties } from "@/lib/api/legal";
import { listJournalEntries, listCashPositions, getFinanceSummaryStats } from "@/lib/api/finance";
import { listPurchaseOrders, listSpendLimits } from "@/lib/api/commercial-ops";
import { listPayrollRuns, listCompensationStructures, listBenefitPlans, listPayrollTaxProfiles, listPayrollExceptions } from "@/lib/api/payroll";
import { listEmployees, listLeaveRequests, listDepartments, listWorkforceAlerts } from "@/lib/api/hr";
import { listFilingRequirements, listComplianceEvaluations, listEscalatedExceptions } from "@/lib/api/compliance";
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

/** Caller identity from the X-* headers, with the console demo defaults. */
function callerIdentity(req: NextRequest) {
  const tenantId = req.headers.get("X-Tenant-Id") ?? "11111111-1111-1111-1111-111111111111";
  const principalId = req.headers.get("X-Principal-Id") ?? "33333333-3333-3333-3333-333333333333";
  return { tenantId, principalId };
}
