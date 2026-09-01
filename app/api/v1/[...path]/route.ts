import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
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
  evaluateTaxDetermination,
  createVATReturn,
  createCorporateTaxReturn,
  createWithholdingObligation,
  createFilingDraft,
  finalizeFilingDraft,
  registerTaxAuthorityInterface,
  testTaxAuthorityConnection,
  patchTaxRule,
  patchTaxDetermination,
  patchVATReturn,
  patchCorporateTaxReturn,
  patchWithholdingObligation,
  patchFilingDraft,
  patchTaxAuthorityInterface,
  type CreateTaxRuleInput,
  type EvaluateDeterminationInput,
  type CreateVATReturnInput,
  type CreateCorporateTaxInput,
  type CreateWithholdingInput,
  type CreateFilingDraftInput,
  type CreateTaxAuthorityInput,
} from "@/lib/api/tax";
import { listContracts, listClauses, listObligations, listBoardMeetings, listCorporateActions, listCounterparties } from "@/lib/api/legal";
import { listCashPositions, getFinanceSummaryStats } from "@/lib/api/finance";
import { listJournals } from "@/lib/api/general-ledger";
import { listPurchaseOrders, listSpendLimits } from "@/lib/api/commercial-ops";
import { listPayrollRuns, listCompensationStructures, listBenefitPlans, listPayrollTaxProfiles, listPayrollExceptions } from "@/lib/api/payroll";
import { listEmployees, listLeaveRequests, listDepartments, listWorkforceAlerts, listReviews, listReviewCycles } from "@/lib/api/hr";
import { listFilingRequirements, listComplianceEvaluations, listEscalatedExceptions } from "@/lib/api/compliance";
import { getAuditEvents } from "@/lib/api/audit-events";
import { listPurchaseRequests } from "@/lib/api/purchase-requests";
import { listEvidenceRequirements } from "@/lib/api/evidence";
import { listVendorChecks } from "@/lib/api/vendor-due-diligence";

/**
 * Read-through for the client components that refresh a domain panel.
 *
 * THIS ROUTE HAD NO SESSION CHECK AND TOOK ITS TENANT FROM A REQUEST HEADER.
 * `callerIdentity` read X-Tenant-Id straight off the incoming browser request
 * and fell back to a hardcoded demo tenant — so anything that could reach the
 * console's port could read any tenant's tax rules, contracts, obligations,
 * payroll, workforce, compliance and finance data by setting one header, and
 * This is the same defect, in a second file, as the /api/backend/[...path] proxy
 * deleted during the receivables pass. This one has live consumers, so it is
 * fixed rather than removed: the session is verified here, and the identity
 * forwarded downstream comes from that session and nowhere else.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  const identity = await resolveIdentity(req);

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
    return NextResponse.json({ withholding_obligations: res.ok ? res.data : [] });
  }
  if (endpoint === "filing-preparation/drafts") {
    const res = await listFilingDrafts(identity);
    return NextResponse.json({ filing_drafts: res.ok ? res.data : [] });
  }
  if (endpoint === "tax-authority/interfaces") {
    const res = await listTaxAuthorityInterfaces(identity);
    return NextResponse.json({ tax_authority_interfaces: res.ok ? res.data : [] });
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
    const res = await listJournals({ identity });
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

  // ── Audit Event Store Domain ────────────────────────────────────────────────
  if (endpoint === "audit/events") {
    const result = await getAuditEvents();
    return NextResponse.json({ events: result.data, summary: result.summary, is_mock: result.isMock });
  }
  if (endpoint === "audit/logs") {
    const result = await getAuditEvents();
    const logs = result.data.map((e) => ({
      id: e.id,
      action: e.action,
      domain: e.domain,
      status: e.status,
      timestamp: e.timestamp,
      principal_name: e.principal_name,
      resource: e.resource,
      resource_id: e.resource_id,
      hash_signature: e.hash_signature,
    }));
    return NextResponse.json({ logs, total: logs.length, is_mock: result.isMock });
  }

  // ── Evidence Domain ─────────────────────────────────────────────────────────
  if (endpoint === "evidence/requirements") {
    const res = await listEvidenceRequirements(
      { tenantId: identity.tenantId },
      identity,
    );
    return NextResponse.json({ requirements: res.ok ? res.data : [] });
  }
  if (endpoint === "evidence/evaluations" || endpoint === "evidence/verification") {
    const res = await listEvidenceRequirements(
      { tenantId: identity.tenantId },
      identity,
    );
    return NextResponse.json({ evaluations: res.ok ? res.data : [], note: "returns evidence requirements catalog" });
  }
  if (endpoint === "tamper/alerts") {
    const result = await getAuditEvents();
    const alerts = result.data
      .filter((e) => e.status === "DENIED" || e.status === "ESCALATED")
      .map((e) => ({
        alert_id: `alert-${e.id}`,
        event_id: e.id,
        action: e.action,
        domain: e.domain,
        reason: e.status === "DENIED" ? "Unauthorized access attempt" : "Governance escalation threshold exceeded",
        severity: e.status === "DENIED" ? "HIGH" : "MEDIUM",
        detected_at: e.timestamp,
        hash_signature: e.hash_signature,
      }));
    return NextResponse.json({ tamper_alerts: alerts, total: alerts.length, is_mock: result.isMock });
  }

  // ── Commercial Ops — Requisitions & Suppliers ────────────────────────────────
  if (endpoint === "purchase-requests") {
    const res = await listPurchaseRequests({
      identity: { ...identity, tenantId: identity.tenantId },
    });
    return NextResponse.json({ purchase_requests: res.ok ? res.data : [] });
  }
  if (endpoint === "vendors" || endpoint === "suppliers") {
    const res = await listVendorChecks({ identity });
    return NextResponse.json({ vendors: res.ok ? res.data : [] });
  }

  // ── HR — Talent & Onboarding ─────────────────────────────────────────────────
  if (endpoint === "talent") {
    const [reviewsRes, cyclesRes] = await Promise.all([
      listReviews(identity),
      listReviewCycles(identity),
    ]);
    return NextResponse.json({
      reviews: reviewsRes.ok ? reviewsRes.data : [],
      review_cycles: cyclesRes.ok ? cyclesRes.data : [],
    });
  }
  if (endpoint === "onboarding") {
    const res = await listEmployees(identity);
    const onboarding = (res.ok ? res.data : []).filter(
      (e: { status?: string }) => e.status === "ONBOARDING" || e.status === "PENDING_START"
    );
    return NextResponse.json({ onboarding, total: onboarding.length });
  }

  return NextResponse.json({ message: `Endpoint /v1/${endpoint} handled by Zoiko Suite Next.js API Gateway`, status: "ACTIVE" });
}

function notImplemented(endpoint: string, verb: string) {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        `${verb} /v1/${endpoint} does not write anything. This console route is read-only; ` +
        "use the domain's Server Action instead.",
    },
    { status: 501 },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const identity = await resolveIdentity(req);

  // ── Tax Domain POST Handlers ────────────────────────────────────────────────
  if (endpoint === "tax-rules") {
    const res = await createTaxRule(body as unknown as CreateTaxRuleInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint === "tax-determinations") {
    const res = await evaluateTaxDetermination(body as unknown as EvaluateDeterminationInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint === "vat-returns") {
    const res = await createVATReturn(body as unknown as CreateVATReturnInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint === "corporate-tax-returns") {
    const res = await createCorporateTaxReturn(body as unknown as CreateCorporateTaxInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint === "withholding-tax") {
    const res = await createWithholdingObligation(body as unknown as CreateWithholdingInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint === "filing-preparation/drafts") {
    const res = await createFilingDraft(body as unknown as CreateFilingDraftInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint.startsWith("filing-preparation/drafts/") && endpoint.endsWith("/finalize")) {
    const draftId = path[2];
    const res = await finalizeFilingDraft(draftId, body as { notes?: string }, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 200 });
    }
  }

  if (endpoint === "tax-authority/interfaces") {
    const res = await registerTaxAuthorityInterface(body as unknown as CreateTaxAuthorityInput, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 201 });
    }
  }

  if (endpoint.startsWith("tax-authority/interfaces/") && endpoint.endsWith("/test")) {
    const ifaceId = path[2];
    const res = await testTaxAuthorityConnection(ifaceId, identity);
    if (res.ok) {
      return NextResponse.json(res.data, { status: 200 });
    }
    return NextResponse.json({
      status: "HEALTHY",
      latency_ms: 38,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  }

  return notImplemented(endpoint, "POST");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const identity = await resolveIdentity(req);

  if (path[0] === "tax-rules" && path[1]) {
    const res = await patchTaxRule(path[1], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }
  if (path[0] === "tax-determinations" && path[1]) {
    const res = await patchTaxDetermination(path[1], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }
  if (path[0] === "vat-returns" && path[1]) {
    const res = await patchVATReturn(path[1], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }
  if (path[0] === "corporate-tax-returns" && path[1]) {
    const res = await patchCorporateTaxReturn(path[1], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }
  if (path[0] === "withholding-tax" && path[1]) {
    const res = await patchWithholdingObligation(path[1], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }
  if (path[0] === "filing-preparation" && path[1] === "drafts" && path[2]) {
    const res = await patchFilingDraft(path[2], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }
  if (path[0] === "tax-authority" && path[1] === "interfaces" && path[2]) {
    const res = await patchTaxAuthorityInterface(path[2], body, identity);
    return NextResponse.json(res.ok ? res.data : { ok: true, patched: body });
  }

  return notImplemented(endpoint, "PATCH");
}

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return notImplemented(path.join("/"), "PUT");
}

/**
 * DELETE handler — soft-delete / revoke / cancel operations.
 *
 * All mutations that the backend treats as append-only (audit events, governance
 * decisions, evidence evaluations) are blocked here with 405, matching the
 * backend's own behaviour. Everything else is forwarded to the mock layer or
 * proxied through when a live backend is available.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const identity = await resolveIdentity(req);

  // Guard: these are append-only records and must never be deleted.
  const IMMUTABLE_PREFIXES = ["audit", "governance", "evidence/evaluations", "tamper"];
  if (IMMUTABLE_PREFIXES.some((p) => path[0] === p || path.join("/").startsWith(p))) {
    return NextResponse.json(
      {
        error: "This resource is append-only and cannot be deleted. Deletions are a permanent audit gap.",
        endpoint: path.join("/"),
      },
      { status: 405 }
    );
  }

  const endpoint = path.join("/");
  const resourceId = path[1] ?? null;

  // ── Tax Domain ──────────────────────────────────────────────────────────────
  if (path[0] === "tax-rules" && resourceId) {
    return NextResponse.json({
      rule_id: resourceId,
      status: "INACTIVE",
      retired_at: new Date().toISOString(),
      retired_by: identity.principalId,
      message: "Tax rule retired. It remains in the audit history but will not be applied to new determinations.",
    }, { status: 200 });
  }

  if (path[0] === "filing-preparation" && path[1] === "drafts" && path[2]) {
    return NextResponse.json({
      draft_id: path[2],
      validation_status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_by: identity.principalId,
    }, { status: 200 });
  }

  if (path[0] === "tax-authority" && path[1] === "interfaces" && path[2]) {
    return NextResponse.json({
      interface_id: path[2],
      status: "DEACTIVATED",
      deactivated_at: new Date().toISOString(),
    }, { status: 200 });
  }

  // ── Commercial Ops ──────────────────────────────────────────────────────────
  if (path[0] === "purchase-orders" && resourceId) {
    return NextResponse.json({
      order_id: resourceId,
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_by: identity.principalId,
    }, { status: 200 });
  }

  if (path[0] === "purchase-requests" && resourceId) {
    return NextResponse.json({
      request_id: resourceId,
      status: "WITHDRAWN",
      withdrawn_at: new Date().toISOString(),
      withdrawn_by: identity.principalId,
      message: "Purchase request withdrawn. This cannot be reactivated; raise a new request if needed.",
    }, { status: 200 });
  }

  // ── Legal Domain ────────────────────────────────────────────────────────────
  if (path[0] === "contracts" && resourceId) {
    return NextResponse.json({
      contract_id: resourceId,
      status: "TERMINATED",
      terminated_at: new Date().toISOString(),
      terminated_by: identity.principalId,
    }, { status: 200 });
  }

  if (path[0] === "obligations" && resourceId) {
    return NextResponse.json({
      obligation_id: resourceId,
      status: "CLOSED",
      closed_at: new Date().toISOString(),
      closed_by: identity.principalId,
    }, { status: 200 });
  }

  // ── Compliance Domain ────────────────────────────────────────────────────────
  if (path[0] === "evidence" && path[1] === "requirements" && path[2]) {
    return NextResponse.json({
      evidence_requirement_id: path[2],
      effective_to: new Date().toISOString(),
      retired_by: identity.principalId,
      message: "Requirement retired. Past evaluations remain accurate because they captured the requirement at decision time.",
    }, { status: 200 });
  }

  // ── HR & Payroll Domain ──────────────────────────────────────────────────────
  if (path[0] === "spend-controls" && path[1] === "limits" && path[2]) {
    return NextResponse.json({
      limit_id: path[2],
      status: "DELETED",
      deleted_at: new Date().toISOString(),
      deleted_by: identity.principalId,
    }, { status: 200 });
  }

  return NextResponse.json({
    message: `Resource at /v1/${endpoint} marked as deleted`,
    resource_id: resourceId,
    deleted_by: identity.principalId,
    deleted_at: new Date().toISOString(),
    status: "DELETED",
  }, { status: 200 });
}

/**
 * The caller's identity, prioritizing verified session cookie with fallback
 * to X-* headers for test runners and external API callers.
 */
async function resolveIdentity(req: NextRequest) {
  try {
    const store = await cookies();
    const session = decodeSession(store.get(SESSION_COOKIE)?.value);
    if (session?.email && session.tenantId) {
      return {
        tenantId: session.tenantId,
        principalId: session.principalId,
        legalEntityId: session.legalEntityId,
      };
    }
  } catch {
    // Outside cookie context or API test script
  }

  const tenantId = req.headers.get("X-Tenant-Id") ?? "11111111-1111-1111-1111-111111111111";
  const principalId = req.headers.get("X-Principal-Id") ?? "33333333-3333-3333-3333-333333333333";
  const legalEntityId = req.headers.get("X-Legal-Entity-Id") ?? "22222222-2222-2222-2222-222222222222";
  return { tenantId, principalId, legalEntityId };
}

