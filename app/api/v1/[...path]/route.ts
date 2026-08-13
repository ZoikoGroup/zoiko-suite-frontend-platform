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
  createTaxRule,
  updateTaxRule,
  evaluateTaxDetermination,
  createVATReturn,
  createFilingDraft,
  validateFilingDraft,
  finalizeFilingDraft,
  updateFilingDraft,
} from "@/lib/api/tax";
import type { ApiWriteResult } from "@/lib/api/client";
import { listContracts, listClauses, listObligations, listBoardMeetings, listCorporateActions, listCounterparties } from "@/lib/api/legal";
import { listJournalEntries, listCashPositions, getFinanceSummaryStats } from "@/lib/api/finance";
import { listPurchaseOrders, listSpendLimits } from "@/lib/api/commercial-ops";
import { listPayrollRuns, listCompensationStructures, listBenefitPlans, listPayrollTaxProfiles, listPayrollExceptions } from "@/lib/api/payroll";
import { listEmployees, listLeaveRequests, listDepartments, listWorkforceAlerts } from "@/lib/api/hr";
import { listFilingRequirements, listComplianceEvaluations, listEscalatedExceptions } from "@/lib/api/compliance";

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
    const res = await listJournalEntries(identity);
    return NextResponse.json({ journal_entries: res.ok ? res.data : [] });
  }
  if (endpoint === "cash-positions") {
    const res = await listCashPositions(identity);
    return NextResponse.json({ cash_positions: res.ok ? res.data : [] });
  }
  if (endpoint === "finance/summary") {
    const res = await getFinanceSummaryStats(identity);
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

  return NextResponse.json({ message: `Endpoint /v1/${endpoint} handled by Zoiko Suite Next.js API Gateway`, status: "ACTIVE" });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const body = await req.json().catch(() => ({}));
  const identity = callerIdentity(req);

  // Tax Domain — writes are forwarded to the real backend services.
  if (endpoint === "tax-rules") {
    return writeResponse(
      await createTaxRule(
        { ...body, created_by: body.created_by ?? identity.principalId },
        identity,
      ),
    );
  }
  if (endpoint === "tax-determinations") {
    return writeResponse(await evaluateTaxDetermination(body, identity));
  }
  if (endpoint === "vat-returns") {
    return writeResponse(
      await createVATReturn({ ...body, created_by: body.created_by ?? identity.principalId }, identity),
    );
  }
  if (endpoint === "filing-preparation/drafts") {
    return writeResponse(
      await createFilingDraft(
        { ...body, created_by: body.created_by ?? identity.principalId },
        identity,
      ),
    );
  }
  const validateMatch = endpoint.match(/^filing-preparation\/drafts\/([^/]+)\/validate$/);
  if (validateMatch) {
    return writeResponse(await validateFilingDraft(validateMatch[1], body, identity));
  }
  const finalizeMatch = endpoint.match(/^filing-preparation\/drafts\/([^/]+)\/finalize$/);
  if (finalizeMatch) {
    return writeResponse(await finalizeFilingDraft(finalizeMatch[1], body, identity));
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
  const identity = callerIdentity(req);

  // Tax Domain — idempotent updates forwarded to the real backend services.
  const ruleMatch = endpoint.match(/^tax-rules\/([^/]+)$/);
  if (ruleMatch) {
    return writeResponse(
      await updateTaxRule(ruleMatch[1], { ...body, updated_by: body.updated_by ?? identity.principalId }, identity),
    );
  }
  const draftMatch = endpoint.match(/^filing-preparation\/drafts\/([^/]+)$/);
  if (draftMatch) {
    return writeResponse(await updateFilingDraft(draftMatch[1], body, identity));
  }

  return NextResponse.json({
    message: `Resource updated at /v1/${endpoint}`,
    received_payload: body,
    status: "UPDATED",
    timestamp: new Date().toISOString(),
  }, { status: 200 });
}

/**
 * Map an ApiWriteResult to an HTTP response. Backend error detail is passed
 * through so validation failures reach the UI intact.
 */
function writeResponse<T>(res: ApiWriteResult<T>): NextResponse {
  if (res.ok) return NextResponse.json(res.data, { status: res.status });
  const status =
    res.error.status ??
    (res.error.kind === "unreachable" || res.error.kind === "timeout" ? 502 : 500);
  return NextResponse.json({ error: res.error.message }, { status });
}

/** Caller identity from the X-* headers, with the console demo defaults. */
function callerIdentity(req: NextRequest) {
  const tenantId = req.headers.get("X-Tenant-Id") ?? "11111111-1111-1111-1111-111111111111";
  const principalId = req.headers.get("X-Principal-Id") ?? "33333333-3333-3333-3333-333333333333";
  return { tenantId, principalId };
}
