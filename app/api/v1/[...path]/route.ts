import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import type { CallerIdentity } from "@/lib/api/envelope";
import type { ApiResult, ApiWriteResult } from "@/lib/api/client";

// Active domain imports (Blocks 6–10)
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
  registerTaxAuthorityInterface,
  testTaxAuthorityConnection,
  finalizeFilingDraft,
} from "@/lib/api/tax";

import {
  listContracts,
  listClauses,
  listObligations,
  listBoardMeetings,
  listCorporateActions,
  listCounterparties,
  createClause,
  createBoardMeeting,
  createCorporateAction,
} from "@/lib/api/legal";
import { draftContract } from "@/lib/api/contracts";

import { listPurchaseOrders, listSpendLimits } from "@/lib/api/commercial-ops";
import { issuePurchaseOrder } from "@/lib/api/purchase-orders";
import { listPurchaseRequests } from "@/lib/api/purchase-requests";
import { createSpendPolicy } from "@/lib/api/spend-controls";
import { listVendorChecks } from "@/lib/api/vendor-due-diligence";

import {
  listFilingRequirements,
  listComplianceEvaluations,
  listEscalatedExceptions,
  createFilingRequirement,
  createEscalatedException,
  evaluateCompliance,
} from "@/lib/api/compliance";

import { listEvidenceRequirements } from "@/lib/api/evidence";
import { listFeatureFlags, listConfigEntries } from "@/lib/api/configuration";
import { listDelegations, getDelegation } from "@/lib/api/delegations";
import { listLeases, listApplicableSecretPolicyVersions, listSecretAudit } from "@/lib/api/secret-vault";
import {
  listMtlsCertificates,
  listSiemEvents,
  listCartaAssessments,
  evaluateCartaAccess,
  listKmsKeys,
  rotateKmsKey,
} from "@/lib/api/security-trust";
import {
  createAIRun,
  setActionRiskClassification,
  registerModelProvider,
  listRiskClassifications,
  listModelProviders,
} from "@/lib/api/ai-governance";
import {
  listAnomalies,
  listForecasts,
  listRiskScores,
  listReconciliations,
  listReports,
  listRecommendations,
  listMigrationJobs as listIntelligenceMigrationJobs,
} from "@/lib/api/intelligence";
import {
  listBridgeConnections,
  listBankConnections,
  triggerBankSync,
  listHrisConnections,
  triggerHrisSync,
  listEsignatureEnvelopes,
  listExternalDataFeeds,
} from "@/lib/api/integration";

/**
 * The caller's identity, from the session cookie only.
 *
 * This route is outside the proxy's /admin matcher, so it is the only check
 * between an anonymous request and the backend. It used to substitute a fixed
 * demo principal/tenant/legal entity when there was no session, which let an
 * unauthenticated caller read and write as that tenant. No session → null → 401.
 */
async function resolveIdentity(req: NextRequest): Promise<Required<CallerIdentity> | null> {
  const session = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) return null;
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  } as Required<CallerIdentity>;
}

// A failed read is answered as a failure with the service's own status, never as
// an empty list: an empty list tells the page there is nothing, when the truth is
// that the console could not look.
function readFailed(error: { kind: string; status?: number; message: string }) {
  return NextResponse.json({ error: error.kind, message: error.message }, { status: error.status ?? 502 });
}

const UNAUTHENTICATED = () =>
  NextResponse.json({ error: "unauthenticated", message: "Sign in to use this API." }, { status: 401 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const identity = await resolveIdentity(req);
  if (!identity) return UNAUTHENTICATED();

  // ── Tax Domain ─────────────────────────────────────────────────────────────
  if (endpoint === "tax-rules") {
    const res = await listTaxRules(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ tax_rules: res.data });
  }
  if (endpoint === "tax-determinations") {
    const res = await listTaxDeterminations(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ determinations: res.data });
  }
  if (endpoint === "vat-returns") {
    const res = await listVATReturns(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ vat_returns: res.data });
  }
  if (endpoint === "corporate-tax-returns") {
    const res = await listCorporateTaxReturns(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ corporate_tax_returns: res.data });
  }
  if (endpoint === "withholding-tax") {
    const res = await listWithholdingObligations(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ withholding_obligations: res.data });
  }
  if (endpoint === "filing-preparation/drafts") {
    const res = await listFilingDrafts(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ filing_drafts: res.data });
  }
  if (endpoint === "tax-authority/interfaces") {
    const res = await listTaxAuthorityInterfaces(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ tax_authority_interfaces: res.data });
  }
  if (endpoint === "tax/summary") {
    const res = await getTaxSummaryStats(identity);
    return NextResponse.json({ summary: res.ok ? res.data : {} });
  }
  if (endpoint === "tax/deadlines") {
    const res = await listUpcomingTaxDeadlines(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ deadlines: res.data });
  }

  // ── Legal Domain ───────────────────────────────────────────────────────────
  if (endpoint === "contracts") {
    const res = await listContracts(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ contracts: res.data });
  }
  if (endpoint === "clauses") {
    const res = await listClauses(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ clauses: res.data });
  }
  if (endpoint === "obligations") {
    const res = await listObligations(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ obligations: res.data });
  }
  if (endpoint === "meetings") {
    const res = await listBoardMeetings(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ meetings: res.data });
  }
  if (endpoint === "corporate-actions") {
    const res = await listCorporateActions(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ corporate_actions: res.data });
  }
  if (endpoint === "counterparties") {
    const res = await listCounterparties(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ counterparties: res.data });
  }

  // ── Commercial Ops Domain ──────────────────────────────────────────────────
  if (endpoint === "purchase-orders") {
    const res = await listPurchaseOrders(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ purchase_orders: res.data });
  }
  if (endpoint === "purchase-requests") {
    const tenantId = identity.tenantId;
    const res = await listPurchaseRequests({ identity: { ...identity, tenantId } });
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ purchase_requests: res.data });
  }
  if (endpoint === "spend-controls/limits") {
    const res = await listSpendLimits(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ spend_limits: res.data });
  }
  if (endpoint === "vendor-checks") {
    const tenantId = identity.tenantId;
    const res = await listVendorChecks({ identity: { ...identity, tenantId } });
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ vendor_checks: res.data });
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
  if (endpoint === "filing-tracker/requirements") {
    const res = await listFilingRequirements(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ requirements: res.data });
  }
  if (endpoint === "compliance-status") {
    const res = await listComplianceEvaluations(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ evaluations: res.data });
  }
  if (endpoint === "exception-escalation/exceptions") {
    const res = await listEscalatedExceptions(identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ exceptions: res.data });
  }

  // ── Evidence Domain ────────────────────────────────────────────────────────
  if (endpoint === "evidence/requirements") {
    const tenantId = identity.tenantId;
    const res = await listEvidenceRequirements({ tenantId }, { ...identity, tenantId });
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ requirements: res.data });
  }

  // ── Configuration / Service Inputs ─────────────────────────────────────────
  if (endpoint === "config/feature-flags") {
    const tenantId = identity.tenantId;
    const res = await listFeatureFlags(tenantId);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ feature_flags: res.data });
  }
  if (endpoint === "config/entries") {
    const tenantId = identity.tenantId;
    const res = await listConfigEntries(tenantId);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ config_entries: res.data });
  }

  // ── Delegations ────────────────────────────────────────────────────────────
  if (endpoint === "delegations") {
    const res = await listDelegations({ identity });
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ delegations: res.data });
  }

  // ── Secret Vault ───────────────────────────────────────────────────────────
  if (endpoint === "secrets/leases") {
    const tenantId = identity.tenantId;
    const res = await listLeases(tenantId);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ leases: res.data });
  }
  if (endpoint === "secrets/policies") {
    const tenantId = identity.tenantId;
    const res = await listApplicableSecretPolicyVersions({
      secretClass: "DATABASE_CREDENTIAL",
      callerTenantId: tenantId,
    });
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ policies: res.data });
  }
  if (endpoint === "secrets/audit") {
    const tenantId = identity.tenantId;
    const res = await listSecretAudit(tenantId);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ audit_events: res.data });
  }

  // ── Security & Trust Domain ───────────────────────────────────────────────
  if (endpoint === "security/certificates") {
    const tenantId = identity.tenantId;
    const res = await listMtlsCertificates(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ certificates: res.data });
  }
  if (endpoint === "security/keys") {
    const tenantId = identity.tenantId;
    const res = await listKmsKeys(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ keys: res.data });
  }
  if (endpoint === "security/events") {
    const tenantId = identity.tenantId;
    const res = await listSiemEvents(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ events: res.data });
  }
  // carta-svc is a zero-trust access-risk engine, not an equity/cap-table
  // service — this route returns risk assessments, not "equity grants".
  if (endpoint === "security/assessments") {
    const tenantId = identity.tenantId;
    const res = await listCartaAssessments(tenantId, identity);
    if (!res.ok) return NextResponse.json({ error: res.error.kind, message: res.error.message }, { status: res.error.status ?? 502 });
    return NextResponse.json({ assessments: res.data });
  }

  // ── AI Governance Domain ──────────────────────────────────────────────────
  if (endpoint === "ai-governance/runs") {
    // ai-governance-svc has no endpoint that lists AI runs (a run is read by id).
    return NextResponse.json(
      { error: "not_supported", message: "ai-governance-svc does not list AI runs; read a run by id." },
      { status: 501 },
    );
  }
  if (endpoint === "ai-governance/risk-classifications") {
    const res = await listRiskClassifications(identity);
    if (!res.ok) return NextResponse.json({ error: res.error.kind, message: res.error.message }, { status: res.error.status ?? 502 });
    return NextResponse.json({ classifications: res.data });
  }
  if (endpoint === "ai-governance/model-providers") {
    const res = await listModelProviders(identity);
    if (!res.ok) return NextResponse.json({ error: res.error.kind, message: res.error.message }, { status: res.error.status ?? 502 });
    return NextResponse.json({ providers: res.data });
  }

  // ── Intelligence & Reporting Domain ───────────────────────────────────────
  if (endpoint === "intelligence/anomalies") {
    const tenantId = identity.tenantId;
    const res = await listAnomalies(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ anomalies: res.data?.anomalies ?? [] });
  }
  if (endpoint === "intelligence/forecasts") {
    const tenantId = identity.tenantId;
    const res = await listForecasts(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ forecasts: res.data?.forecasts ?? [] });
  }
  if (endpoint === "intelligence/risk-scores") {
    const tenantId = identity.tenantId;
    const res = await listRiskScores(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ scores: res.data?.scores ?? [] });
  }
  if (endpoint === "intelligence/reconciliations") {
    const tenantId = identity.tenantId;
    const res = await listReconciliations(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ reconciliations: res.data?.reconciliations ?? [] });
  }
  if (endpoint === "intelligence/reports") {
    const tenantId = identity.tenantId;
    const res = await listReports(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ reports: res.data?.reports ?? [] });
  }
  if (endpoint === "intelligence/recommendations") {
    const tenantId = identity.tenantId;
    const res = await listRecommendations(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ recommendations: res.data?.recommendations ?? [] });
  }
  if (endpoint === "intelligence/migrations") {
    const tenantId = identity.tenantId;
    const res = await listIntelligenceMigrationJobs(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ jobs: res.data?.jobs ?? [] });
  }

  // ── Integration & Extensibility Domain ────────────────────────────────────
  if (endpoint === "integration/connections") {
    const tenantId = identity.tenantId;
    const res = await listBridgeConnections(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ connections: res.data?.connections ?? [] });
  }
  if (endpoint === "integration/banking") {
    const tenantId = identity.tenantId;
    const res = await listBankConnections(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ connections: res.data?.connections ?? [] });
  }
  if (endpoint === "integration/hris") {
    const tenantId = identity.tenantId;
    const res = await listHrisConnections(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ connections: res.data?.connections ?? [] });
  }
  if (endpoint === "integration/envelopes") {
    const tenantId = identity.tenantId;
    const res = await listEsignatureEnvelopes(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ envelopes: res.data?.envelopes ?? [] });
  }
  if (endpoint === "integration/feeds") {
    const tenantId = identity.tenantId;
    const res = await listExternalDataFeeds(tenantId, identity);
    if (!res.ok) return readFailed(res.error);
    return NextResponse.json({ subscriptions: res.data?.subscriptions ?? [] });
  }

  return NextResponse.json({ error: `Not found: ${endpoint}` }, { status: 404 });
}

function toJsonResponse<T>(res: ApiResult<T> | ApiWriteResult<T>) {
  if (res.ok) {
    const status = "status" in res && typeof res.status === "number" ? res.status : 200;
    return NextResponse.json(res.data, { status });
  }
  return NextResponse.json(
    { error: res.error.message, detail: res.error.body },
    { status: res.error.status ?? 500 },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const identity = await resolveIdentity(req);
  if (!identity) return UNAUTHENTICATED();
  const raw = await req.json().catch(() => ({}));
  // Tenant and legal entity in a write are the session's. A page may send its own
  // (several did, as fixed demo IDs); they are replaced here, never trusted.
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if ("tenant_id" in body) body.tenant_id = identity.tenantId;
  if ("legal_entity_id" in body) body.legal_entity_id = identity.legalEntityId ?? null;

  // ── Tax Domain ─────────────────────────────────────────────────────────────
  if (endpoint === "tax-rules") {
    const res = await createTaxRule(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "tax-determinations") {
    const res = await evaluateTaxDetermination(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "vat-returns") {
    const res = await createVATReturn(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "corporate-tax-returns") {
    const res = await createCorporateTaxReturn(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "withholding-tax") {
    const res = await createWithholdingObligation(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "filing-preparation/drafts") {
    const res = await createFilingDraft(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "tax-authority/interfaces") {
    const res = await registerTaxAuthorityInterface(body, identity);
    return toJsonResponse(res);
  }
  const taxAuthorityTestMatch = endpoint.match(/^tax-authority\/interfaces\/([^/]+)\/test$/);
  if (taxAuthorityTestMatch) {
    const res = await testTaxAuthorityConnection(taxAuthorityTestMatch[1], identity);
    return toJsonResponse(res);
  }
  const filingFinalizeMatch = endpoint.match(/^filing-preparation\/drafts\/([^/]+)\/finalize$/);
  if (filingFinalizeMatch) {
    const res = await finalizeFilingDraft(filingFinalizeMatch[1], body, identity);
    return toJsonResponse(res);
  }

  // ── Integration & Extensibility Domain ────────────────────────────────────
  const bankSyncMatch = endpoint.match(/^integration\/banking\/([^/]+)\/sync$/);
  if (bankSyncMatch) {
    const tenantId = identity.tenantId;
    const res = await triggerBankSync(tenantId, bankSyncMatch[1]);
    return toJsonResponse(res);
  }
  const hrisSyncMatch = endpoint.match(/^integration\/hris\/([^/]+)\/sync$/);
  if (hrisSyncMatch) {
    const tenantId = identity.tenantId;
    const res = await triggerHrisSync(tenantId, hrisSyncMatch[1]);
    return toJsonResponse(res);
  }

  // ── Legal Domain ───────────────────────────────────────────────────────────
  if (endpoint === "contracts") {
    const res = await draftContract({
      ...body,
      identity: {
        principalId: identity.principalId,
        tenantId: identity.tenantId,
        legalEntityId: identity.legalEntityId,
      },
    });
    return toJsonResponse(res);
  }
  if (endpoint === "clauses") {
    const res = await createClause(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "meetings") {
    const res = await createBoardMeeting({
      ...body,
      identity: {
        principalId: identity.principalId,
        tenantId: identity.tenantId,
        legalEntityId: identity.legalEntityId,
      },
    });
    return toJsonResponse(res);
  }
  if (endpoint === "corporate-actions") {
    const res = await createCorporateAction(body, identity);
    return toJsonResponse(res);
  }

  // ── Commercial Ops Domain ──────────────────────────────────────────────────
  if (endpoint === "purchase-orders") {
    const res = await issuePurchaseOrder({
      ...body,
      identity: {
        principalId: identity.principalId,
        tenantId: identity.tenantId,
        legalEntityId: identity.legalEntityId,
      },
      totalAmount: Number(body.totalAmount ?? body.total_amount ?? 0),
      currencyCode: String(body.currencyCode ?? body.currency_code ?? "GBP"),
    });
    return toJsonResponse(res);
  }
  if (endpoint === "spend-controls/policies") {
    const res = await createSpendPolicy({
      ...body,
      identity: {
        principalId: identity.principalId,
        tenantId: identity.tenantId,
        legalEntityId: identity.legalEntityId,
      },
      category: String(body.category ?? "PROCUREMENT"),
      period: body.period ?? "MONTHLY",
      thresholdAmount: Number(body.thresholdAmount ?? body.threshold_amount ?? 0),
      currencyCode: String(body.currencyCode ?? body.currency_code ?? "GBP"),
    });
    return toJsonResponse(res);
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
  // Bodies use the backend's own snake_case field names; identity fields
  // (tenant, legal entity, created_by) always come from the session.
  if (endpoint === "filing-tracker/requirements") {
    const res = await createFilingRequirement({
      identity,
      jurisdictionId: String(body.jurisdiction_id ?? ""),
      filingAuthority: String(body.filing_authority ?? ""),
      filingType: String(body.filing_type ?? ""),
      periodKey: String(body.period_key ?? ""),
      dueDate: String(body.due_date ?? ""),
      ...(body.notes ? { notes: String(body.notes) } : {}),
    });
    return toJsonResponse(res);
  }
  if (endpoint === "exception-escalation/exceptions") {
    const res = await createEscalatedException({
      identity,
      jurisdictionId: String(body.jurisdiction_id ?? ""),
      exceptionType: String(body.exception_type ?? ""),
      severityLevel: body.severity_level,
      linkedObjectType: String(body.linked_object_type ?? ""),
      linkedObjectId: String(body.linked_object_id ?? ""),
      description: String(body.description ?? ""),
      ...(body.assigned_to_role ? { assignedToRole: String(body.assigned_to_role) } : {}),
    });
    return toJsonResponse(res);
  }
  if (endpoint === "compliance-status/evaluate") {
    const n = (v: unknown) => Number(v ?? 0);
    const res = await evaluateCompliance({
      identity,
      jurisdictionId: String(body.jurisdiction_id ?? ""),
      domainName: String(body.domain_name ?? ""),
      totalObligations: n(body.total_obligations),
      fulfilledObligations: n(body.fulfilled_obligations),
      pendingObligations: n(body.pending_obligations),
      overdueObligations: n(body.overdue_obligations),
      openExceptions: n(body.open_exceptions),
      effectiveFrom: String(body.effective_from ?? new Date().toISOString().slice(0, 10)),
      ...(body.notes ? { notes: String(body.notes) } : {}),
    });
    return toJsonResponse(res);
  }

  // ── Security & Trust Domain ───────────────────────────────────────────────
  const rotateMatch = endpoint.match(/^security\/keys\/([^/]+)\/rotate$/);
  if (rotateMatch) {
    const tenantId = identity.tenantId;
    const res = await rotateKmsKey(tenantId, rotateMatch[1], identity);
    return toJsonResponse(res);
  }
  if (endpoint === "security/assessments/evaluate") {
    const tenantId = identity.tenantId;
    if (!identity.legalEntityId) {
      return NextResponse.json({ error: "no_legal_entity", message: "Your session has no legal entity; CARTA evaluation needs one." }, { status: 400 });
    }
    // The legal entity comes from the session, never from the request body.
    const res = await evaluateCartaAccess(tenantId, { context: body.context, legal_entity_id: identity.legalEntityId }, identity);
    return toJsonResponse(res);
  }

  // ── AI Governance Domain ──────────────────────────────────────────────────
  if (endpoint === "ai-governance/runs") {
    const res = await createAIRun(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "ai-governance/risk-classifications") {
    const res = await setActionRiskClassification(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "ai-governance/model-providers") {
    const res = await registerModelProvider(body, identity);
    return toJsonResponse(res);
  }

  return NextResponse.json({ error: `POST handler not implemented for ${endpoint}` }, { status: 404 });
}
