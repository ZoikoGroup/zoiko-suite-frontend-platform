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
  getTaxAuthorityHealth,
  finalizeFilingDraft,
  validateFilingDraft,
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
  listBoardResolutions,
} from "@/lib/api/legal";
import { draftContract } from "@/lib/api/contracts";

import { listJournals } from "@/lib/api/general-ledger";
import { listFiscalPeriods } from "@/lib/api/financial-close";
import { listCustomerInvoices } from "@/lib/api/accounts-receivable";
import { listVendorInvoices } from "@/lib/api/accounts-payable";
import { listStatementLines } from "@/lib/api/bank-reconciliation";
import { listIntercompanyEntries } from "@/lib/api/intercompany";

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
  listSiemEventsForEntity,
  listCartaAssessments,
  evaluateCartaAccess,
  listKmsKeys,
  rotateKmsKey,
  type AccessContext,
} from "@/lib/api/security-trust";
import {
  createAIRun,
  setActionRiskClassification,
  registerModelProvider,
} from "@/lib/api/ai-governance";
import {
  listAnomalies,
  listForecasts,
  listRiskScores,
  listReconciliations,
  listReportDefinitions,
  listRecommendations,
  listMigrationJobs as listIntelligenceMigrationJobs,
} from "@/lib/api/intelligence";
import {
  listBridges,
  listBankConnections,
  listHrisIntegrations,
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

const UNAUTHENTICATED = () =>
  NextResponse.json({ error: "unauthenticated", message: "Sign in to use this API." }, { status: 401 });

/**
 * A list read under `key`, or the upstream failure with its status.
 *
 * The older mappings above answer { key: [] } with 200 when the service fails,
 * so an outage reads as an empty register. The mappings that use this helper
 * report the failure instead; `page_limit` says when the list is one page.
 */
function listResponse<T>(key: string, res: ApiResult<T[]>, pageLimit: number | null = null) {
  if (res.ok) return NextResponse.json({ [key]: res.data, page_limit: pageLimit });
  return NextResponse.json(
    { error: res.error.message, kind: res.error.kind },
    { status: res.error.kind === "http" && res.error.status ? res.error.status : 502 },
  );
}

/** A 400 naming the required body fields that are absent or empty, or null. */
function missingFields(fields: Record<string, unknown>) {
  const missing = Object.entries(fields)
    .filter(([, v]) => v === undefined || v === null || v === "")
    .map(([k]) => k);
  return missing.length
    ? NextResponse.json({ error: "missing_fields", fields: missing }, { status: 400 })
    : null;
}

/** Page size asked of the services whose lists are bounded; see page_limit. */
const LIST_PAGE = 200;

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const identity = await resolveIdentity(req);
  if (!identity) return UNAUTHENTICATED();
  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  // ── Tax Domain ─────────────────────────────────────────────────────────────
  if (endpoint === "tax-rules") {
    return listResponse("tax_rules", await listTaxRules(identity));
  }
  if (endpoint === "tax-determinations") {
    return listResponse("determinations", await listTaxDeterminations(identity));
  }
  if (endpoint === "vat-returns") {
    return listResponse("vat_returns", await listVATReturns(identity));
  }
  if (endpoint === "corporate-tax-returns") {
    return listResponse("corporate_tax_returns", await listCorporateTaxReturns(identity));
  }
  if (endpoint === "withholding-tax") {
    return listResponse("withholding_obligations", await listWithholdingObligations(identity));
  }
  if (endpoint === "filing-preparation/drafts") {
    return listResponse("filing_drafts", await listFilingDrafts(identity));
  }
  if (endpoint === "tax-authority/interfaces") {
    return listResponse("tax_authority_interfaces", await listTaxAuthorityInterfaces(identity));
  }
  // tax-authority-interface-svc has no connection test; this is its record of
  // recent submission calls for one provider adapter (503 while adapters are off).
  if (endpoint === "tax-authority/health") {
    const providerKey = req.nextUrl.searchParams.get("provider_key");
    if (!providerKey) return NextResponse.json({ error: "provider_key is required" }, { status: 400 });
    return toJsonResponse(await getTaxAuthorityHealth(providerKey, identity));
  }
  if (endpoint === "tax/summary") {
    return toJsonResponse(await getTaxSummaryStats(identity));
  }
  if (endpoint === "tax/deadlines") {
    return listResponse("deadlines", await listUpcomingTaxDeadlines(identity));
  }

  // ── Legal Domain ───────────────────────────────────────────────────────────
  if (endpoint === "contracts") {
    return listResponse("contracts", await listContracts(identity));
  }
  if (endpoint === "clauses") {
    return listResponse("clauses", await listClauses(identity));
  }
  if (endpoint === "obligations") {
    return listResponse("obligations", await listObligations(identity));
  }
  if (endpoint === "meetings") {
    return listResponse("meetings", await listBoardMeetings(identity));
  }
  if (endpoint === "corporate-actions") {
    return listResponse("corporate_actions", await listCorporateActions(identity));
  }
  if (endpoint === "counterparties") {
    return listResponse("counterparties", await listCounterparties(identity));
  }
  // board-resolutions-svc GET /v1/resolutions -> { resolutions, total, limit, offset }.
  if (endpoint === "resolutions") {
    return listResponse("resolutions", await listBoardResolutions(identity));
  }

  // ── Finance Domain ─────────────────────────────────────────────────────────
  // Read by the Finance process timeline. Each is scoped to the session's legal
  // entity where the service supports it, and `status` is passed through for the
  // services that filter on it (the service rejects an unknown value with 400).
  if (endpoint === "journals") {
    return listResponse(
      "journals",
      await listJournals({
        identity,
        legalEntityId: identity.legalEntityId,
        status: status as Parameters<typeof listJournals>[0]["status"],
        limit: LIST_PAGE,
      }),
      LIST_PAGE,
    );
  }
  if (endpoint === "fiscal-periods") {
    return listResponse(
      "fiscal_periods",
      await listFiscalPeriods({ identity, legalEntityId: identity.legalEntityId }),
    );
  }
  if (endpoint === "ar-invoices") {
    return listResponse(
      "invoices",
      await listCustomerInvoices({ identity, legalEntityId: identity.legalEntityId, limit: LIST_PAGE }),
      LIST_PAGE,
    );
  }
  if (endpoint === "ap-invoices") {
    return listResponse(
      "invoices",
      await listVendorInvoices({
        identity,
        legalEntityId: identity.legalEntityId,
        status: status as Parameters<typeof listVendorInvoices>[0]["status"],
      }),
    );
  }
  if (endpoint === "bank-reconciliation/statement-lines") {
    // bank-reconciliation-svc has no legal-entity filter; it is tenant-scoped.
    return listResponse(
      "statement_lines",
      await listStatementLines({
        identity,
        status: status as Parameters<typeof listStatementLines>[0]["status"],
        limit: LIST_PAGE,
      }),
      LIST_PAGE,
    );
  }
  if (endpoint === "intercompany/entries") {
    // Both directions: an entity's intercompany position is the entries where it
    // is the source and where it is the target. Always filtered — the service
    // skips its authorization check when neither entity is given.
    const [asSource, asTarget] = await Promise.all([
      listIntercompanyEntries(identity, { sourceEntityId: identity.legalEntityId }),
      listIntercompanyEntries(identity, { targetEntityId: identity.legalEntityId }),
    ]);
    if (!asSource.ok) return listResponse("entries", asSource);
    if (!asTarget.ok) return listResponse("entries", asTarget);
    const byId = new Map(
      [...(asSource.data ?? []), ...(asTarget.data ?? [])].map((e) => [e.intercompany_entry_id, e]),
    );
    return listResponse("entries", { ok: true, data: [...byId.values()] });
  }

  // ── Commercial Ops Domain ──────────────────────────────────────────────────
  if (endpoint === "purchase-orders") {
    return listResponse("purchase_orders", await listPurchaseOrders(identity));
  }
  if (endpoint === "purchase-requests") {
    return listResponse("purchase_requests", await listPurchaseRequests({ identity }));
  }
  if (endpoint === "spend-controls/limits") {
    return listResponse("spend_limits", await listSpendLimits(identity));
  }
  if (endpoint === "vendor-checks") {
    return listResponse("vendor_checks", await listVendorChecks({ identity }));
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
  if (endpoint === "filing-tracker/requirements") {
    return listResponse("requirements", await listFilingRequirements(identity));
  }
  if (endpoint === "compliance-status") {
    return listResponse("evaluations", await listComplianceEvaluations(identity));
  }
  if (endpoint === "exception-escalation/exceptions") {
    return listResponse("exceptions", await listEscalatedExceptions(identity));
  }

  // ── Evidence Domain ────────────────────────────────────────────────────────
  if (endpoint === "evidence/requirements") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listEvidenceRequirements({ tenantId }, { ...identity, tenantId });
    return NextResponse.json({ requirements: res.ok ? res.data : [] });
  }

  // ── Configuration / Service Inputs ─────────────────────────────────────────
  if (endpoint === "config/feature-flags") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listFeatureFlags(tenantId);
    return NextResponse.json({ feature_flags: res.ok ? res.data : [] });
  }
  if (endpoint === "config/entries") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listConfigEntries(tenantId);
    return NextResponse.json({ config_entries: res.ok ? res.data : [] });
  }

  // ── Delegations ────────────────────────────────────────────────────────────
  if (endpoint === "delegations") {
    const res = await listDelegations({ identity });
    return NextResponse.json({ delegations: res.ok ? res.data : [] });
  }

  // ── Secret Vault ───────────────────────────────────────────────────────────
  if (endpoint === "secrets/leases") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listLeases(tenantId);
    return NextResponse.json({ leases: res.ok ? res.data : [] });
  }
  if (endpoint === "secrets/policies") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listApplicableSecretPolicyVersions({
      secretClass: "DATABASE_CREDENTIAL",
      callerTenantId: tenantId,
    });
    return NextResponse.json({ policies: res.ok ? res.data : [] });
  }
  if (endpoint === "secrets/audit") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listSecretAudit(tenantId);
    return NextResponse.json({ audit_events: res.ok ? res.data : [] });
  }

  // ── Security & Trust Domain ───────────────────────────────────────────────
  // Blocks 8-10 mappings below report a failed read with its status (see
  // listResponse) rather than as an empty register.
  if (endpoint === "security/certificates") {
    return listResponse("certificates", await listMtlsCertificates(identity));
  }
  if (endpoint === "security/keys") {
    return listResponse("keys", await listKmsKeys(identity));
  }
  if (endpoint === "security/events") {
    const res = await listSiemEventsForEntity(identity);
    if (!res.ok) return listResponse("events", res);
    return NextResponse.json({
      events: res.data.events,
      exporter_count: res.data.exporters.length,
      exporters_read: res.data.exportersRead,
    });
  }
  // carta-svc is a zero-trust access-risk engine, not an equity/cap-table
  // service — this route returns risk assessments, not "equity grants".
  if (endpoint === "security/assessments") {
    return listResponse("assessments", await listCartaAssessments(identity));
  }

  // ── AI Governance Domain ──────────────────────────────────────────────────
  // ILLUSTRATIVE, NOT LIVE. These three GETs answer hardcoded rows; none calls
  // ai-governance-svc. Each response says so in `illustrative`, and the panels
  // that read them show a notice. Against the service (zoiko-suite-backend):
  //   runs                 -> no list route exists (only GET /v1/ai-runs/{id})
  //   risk-classifications -> GET /v1/action-risk-classifications exists, but
  //                           its fields (risk_category, human_review_trigger,
  //                           requires_maker_checker) differ from these rows
  //   model-providers      -> GET /v1/model-providers exists, also a different
  //                           shape (provider_name, dpa_verified, data_region)
  // Wiring the two real lists means changing what the panel displays.
  if (endpoint === "ai-governance/runs") {
    return NextResponse.json({
      illustrative: true,
      illustrative_reason: "ai-governance-svc has no AI-run list endpoint; these runs are hardcoded examples.",
      runs: [
        {
          run_id: "run-ai-001",
          model_provider: "anthropic",
          model_name: "claude-3-7-sonnet",
          prompt_tokens: 1450,
          completion_tokens: 320,
          cost_estimate_usd: 0.0118,
          guardrail_status: "PASSED",
          purpose: "Contract compliance review — MSA renewal",
          created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        },
        {
          run_id: "run-ai-002",
          model_provider: "openai",
          model_name: "gpt-4o",
          prompt_tokens: 3200,
          completion_tokens: 890,
          cost_estimate_usd: 0.0512,
          guardrail_status: "PASSED",
          purpose: "Automated VAT return reconciliation extract",
          created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        },
        {
          run_id: "run-ai-003",
          model_provider: "anthropic",
          model_name: "claude-3-5-haiku",
          prompt_tokens: 820,
          completion_tokens: 110,
          cost_estimate_usd: 0.0016,
          guardrail_status: "FLAGGED",
          purpose: "Vendor due-diligence sanctions screening",
          created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        },
      ],
    });
  }
  if (endpoint === "ai-governance/risk-classifications") {
    return NextResponse.json({
      illustrative: true,
      illustrative_reason: "Hardcoded examples; not read from ai-governance-svc.",
      classifications: [
        {
          action_type: "contract.draft_generate",
          risk_tier: "TIER_3_MEDIUM",
          requires_human_in_the_loop: true,
          approval_quorum: 1,
          description: "Automated drafting of commercial agreements from standard clause templates",
        },
        {
          action_type: "payment.batch_disburse",
          risk_tier: "TIER_1_CRITICAL",
          requires_human_in_the_loop: true,
          approval_quorum: 2,
          description: "Autonomous initiation or settlement of bank disbursements over £10,000",
        },
        {
          action_type: "tax.determination_evaluate",
          risk_tier: "TIER_4_LOW",
          requires_human_in_the_loop: false,
          approval_quorum: 0,
          description: "Real-time calculation of VAT/GST rates on sales line items",
        },
        {
          action_type: "sec.kms_key_rotate",
          risk_tier: "TIER_2_HIGH",
          requires_human_in_the_loop: true,
          approval_quorum: 1,
          description: "Initiating scheduled cryptographic key version rotation on HSM vaults",
        },
      ],
    });
  }
  if (endpoint === "ai-governance/model-providers") {
    return NextResponse.json({
      illustrative: true,
      illustrative_reason: "Hardcoded examples; not read from ai-governance-svc.",
      providers: [
        {
          provider: "anthropic",
          model: "claude-3-7-sonnet",
          is_verified: true,
          max_context_tokens: 200000,
          data_residency_region: "eu-west-1",
        },
        {
          provider: "openai",
          model: "gpt-4o",
          is_verified: true,
          max_context_tokens: 128000,
          data_residency_region: "eu-west-1",
        },
      ],
    });
  }

  // ── Intelligence & Reporting Domain ───────────────────────────────────────
  if (endpoint === "intelligence/anomalies") {
    return listResponse("anomalies", await listAnomalies(identity));
  }
  if (endpoint === "intelligence/forecasts") {
    return listResponse("forecasts", await listForecasts(identity));
  }
  if (endpoint === "intelligence/risk-scores") {
    return listResponse("scores", await listRiskScores(identity));
  }
  if (endpoint === "intelligence/reconciliations") {
    return listResponse("reconciliations", await listReconciliations(identity));
  }
  if (endpoint === "intelligence/reports") {
    return listResponse("reports", await listReportDefinitions(identity));
  }
  if (endpoint === "intelligence/recommendations") {
    return listResponse("recommendations", await listRecommendations(identity));
  }
  if (endpoint === "intelligence/migrations") {
    return listResponse("jobs", await listIntelligenceMigrationJobs(identity));
  }

  // ── Integration & Extensibility Domain ────────────────────────────────────
  if (endpoint === "integration/connections") {
    return listResponse("connections", await listBridges(identity));
  }
  if (endpoint === "integration/banking") {
    return listResponse("connections", await listBankConnections(identity));
  }
  if (endpoint === "integration/hris") {
    return listResponse("connections", await listHrisIntegrations(identity));
  }
  if (endpoint === "integration/envelopes") {
    return listResponse("envelopes", await listEsignatureEnvelopes(identity));
  }
  if (endpoint === "integration/feeds") {
    return listResponse("subscriptions", await listExternalDataFeeds(identity));
  }

  return NextResponse.json({ error: `Not found: ${endpoint}` }, { status: 404 });
}

function toJsonResponse<T>(res: ApiResult<T> | ApiWriteResult<T>) {
  if (res.ok) {
    const status = "status" in res && typeof res.status === "number" ? res.status : 200;
    return NextResponse.json(res.data, { status });
  }
  return NextResponse.json(
    { error: res.error.message, detail: res.error.body, kind: res.error.kind },
    // No upstream status means the service was never reached (or timed out).
    { status: res.error.status ?? 502 },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const identity = await resolveIdentity(req);
  if (!identity) return UNAUTHENTICATED();
  const body = await req.json().catch(() => ({}));

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
  const filingValidateMatch = endpoint.match(/^filing-preparation\/drafts\/([^/]+)\/validate$/);
  if (filingValidateMatch) {
    return toJsonResponse(await validateFilingDraft(filingValidateMatch[1], identity));
  }
  const filingFinalizeMatch = endpoint.match(/^filing-preparation\/drafts\/([^/]+)\/finalize$/);
  if (filingFinalizeMatch) {
    const res = await finalizeFilingDraft(filingFinalizeMatch[1], body, identity);
    return toJsonResponse(res);
  }

  // ── Integration & Extensibility Domain ────────────────────────────────────
  // banking-connector-svc has no sync operation (its /refresh rotates a token
  // lease), so integration/banking/{id}/sync is no longer mapped.
  const hrisSyncMatch = endpoint.match(/^integration\/hris\/([^/]+)\/sync$/);
  if (hrisSyncMatch) {
    return toJsonResponse(await triggerHrisSync(identity, hrisSyncMatch[1]));
  }

  // ── Legal Domain ───────────────────────────────────────────────────────────
  // The body is snake_case (the service's own names); it used to be spread
  // into this camelCase input, so every field arrived undefined and the
  // service answered 400.
  if (endpoint === "contracts") {
    const missing = missingFields({
      title: body.title, contract_type: body.contract_type, counterparty_id: body.counterparty_id,
      effective_from: body.effective_from, currency: body.currency, total_value: body.total_value,
    });
    if (missing) return missing;
    const res = await draftContract({
      identity,
      title: String(body.title),
      contractType: body.contract_type,
      counterpartyId: String(body.counterparty_id),
      ...(body.counterparty_name ? { counterpartyName: String(body.counterparty_name) } : {}),
      ...(body.description ? { description: String(body.description) } : {}),
      effectiveFrom: String(body.effective_from),
      ...(body.effective_to ? { effectiveTo: String(body.effective_to) } : {}),
      currency: String(body.currency),
      totalValue: Number(body.total_value),
    });
    return toJsonResponse(res);
  }
  // Only the fields the caller states; legal entity and author are the session's.
  if (endpoint === "clauses") {
    const missing = missingFields({
      title: body.title, category: body.category, body: body.body,
      jurisdiction_id: body.jurisdiction_id, effective_from: body.effective_from,
    });
    if (missing) return missing;
    return toJsonResponse(
      await createClause(
        {
          title: String(body.title),
          category: body.category,
          body: String(body.body),
          jurisdiction_id: String(body.jurisdiction_id),
          effective_from: String(body.effective_from),
        },
        identity,
      ),
    );
  }
  if (endpoint === "meetings") {
    const res = await createBoardMeeting({
      ...body,
      identity,
    });
    return toJsonResponse(res);
  }
  if (endpoint === "corporate-actions") {
    const missing = missingFields({ title: body.title, action_type: body.action_type, effective_date: body.effective_date });
    if (missing) return missing;
    return toJsonResponse(
      await createCorporateAction(
        {
          title: String(body.title),
          action_type: String(body.action_type),
          effective_date: String(body.effective_date),
          ...(body.description ? { description: String(body.description) } : {}),
          ...(body.resolution_id ? { resolution_id: String(body.resolution_id) } : {}),
        },
        identity,
      ),
    );
  }

  // ── Commercial Ops Domain ──────────────────────────────────────────────────
  // Amount, currency, category and period are the caller's to state. They used
  // to default to 0 / "GBP" / "PROCUREMENT" / "MONTHLY", which recorded a
  // commitment nobody had entered.
  if (endpoint === "purchase-orders") {
    const totalAmount = body.totalAmount ?? body.total_amount;
    const currencyCode = body.currencyCode ?? body.currency_code;
    const missing = missingFields({ total_amount: totalAmount, currency_code: currencyCode });
    if (missing) return missing;
    const res = await issuePurchaseOrder({
      ...body,
      identity,
      totalAmount: Number(totalAmount),
      currencyCode: String(currencyCode),
    });
    return toJsonResponse(res);
  }
  if (endpoint === "spend-controls/policies") {
    const thresholdAmount = body.thresholdAmount ?? body.threshold_amount;
    const currencyCode = body.currencyCode ?? body.currency_code;
    const missing = missingFields({
      category: body.category,
      period: body.period,
      threshold_amount: thresholdAmount,
      currency_code: currencyCode,
    });
    if (missing) return missing;
    const res = await createSpendPolicy({
      ...body,
      identity,
      category: String(body.category),
      period: body.period,
      thresholdAmount: Number(thresholdAmount),
      currencyCode: String(currencyCode),
    });
    return toJsonResponse(res);
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
  // Bodies use the backend's own snake_case field names; identity fields
  // (tenant, legal entity, created_by) always come from the session.
  if (endpoint === "filing-tracker/requirements") {
    const missing = missingFields({
      jurisdiction_id: body.jurisdiction_id, filing_authority: body.filing_authority, filing_type: body.filing_type,
      period_key: body.period_key, due_date: body.due_date,
    });
    if (missing) return missing;
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
    const missing = missingFields({
      jurisdiction_id: body.jurisdiction_id, exception_type: body.exception_type, severity_level: body.severity_level,
      linked_object_type: body.linked_object_type, linked_object_id: body.linked_object_id, description: body.description,
    });
    if (missing) return missing;
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
    // Counts and the effective date are the caller's; they used to default to
    // 0 and to today, which recorded an evaluation nobody had made.
    const missing = missingFields({
      jurisdiction_id: body.jurisdiction_id, domain_name: body.domain_name,
      total_obligations: body.total_obligations, fulfilled_obligations: body.fulfilled_obligations,
      pending_obligations: body.pending_obligations, overdue_obligations: body.overdue_obligations,
      open_exceptions: body.open_exceptions, effective_from: body.effective_from,
    });
    if (missing) return missing;
    const n = (v: unknown) => Number(v);
    const res = await evaluateCompliance({
      identity,
      jurisdictionId: String(body.jurisdiction_id ?? ""),
      domainName: String(body.domain_name ?? ""),
      totalObligations: n(body.total_obligations),
      fulfilledObligations: n(body.fulfilled_obligations),
      pendingObligations: n(body.pending_obligations),
      overdueObligations: n(body.overdue_obligations),
      openExceptions: n(body.open_exceptions),
      effectiveFrom: String(body.effective_from),
      ...(body.notes ? { notes: String(body.notes) } : {}),
    });
    return toJsonResponse(res);
  }

  // ── Security & Trust Domain ───────────────────────────────────────────────
  const rotateMatch = endpoint.match(/^security\/keys\/([^/]+)\/rotate$/);
  if (rotateMatch) {
    return toJsonResponse(await rotateKmsKey(identity, rotateMatch[1]));
  }
  if (endpoint === "security/assessments/evaluate") {
    // The legal entity is the session's; a body value is not the caller's to choose.
    // carta-svc validates the context itself and answers 400 for a bad one.
    const { context } = (body ?? {}) as { context: AccessContext };
    return toJsonResponse(
      await evaluateCartaAccess(identity, { legal_entity_id: identity.legalEntityId, context }),
    );
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
