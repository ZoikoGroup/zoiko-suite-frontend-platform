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
} from "@/lib/api/compliance";

import { listEvidenceRequirements } from "@/lib/api/evidence";
import { listFeatureFlags, listConfigEntries } from "@/lib/api/configuration";
import { listDelegations, getDelegation } from "@/lib/api/delegations";
import { listLeases, listApplicableSecretPolicyVersions, listSecretAudit } from "@/lib/api/secret-vault";

async function resolveIdentity(req: NextRequest): Promise<CallerIdentity> {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const session = decodeSession(sessionCookie);

  return {
    principalId: session?.principalId ?? "00000000-0000-0000-0000-000000000001",
    tenantId: session?.tenantId ?? "11111111-1111-1111-1111-111111111111",
    legalEntityId: session?.legalEntityId ?? "22222222-2222-2222-2222-222222222222",
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const identity = await resolveIdentity(req);

  // ── Tax Domain ─────────────────────────────────────────────────────────────
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

  // ── Legal Domain ───────────────────────────────────────────────────────────
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

  // ── Commercial Ops Domain ──────────────────────────────────────────────────
  if (endpoint === "purchase-orders") {
    const res = await listPurchaseOrders(identity);
    return NextResponse.json({ purchase_orders: res.ok ? res.data : [] });
  }
  if (endpoint === "purchase-requests") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listPurchaseRequests({ identity: { ...identity, tenantId } });
    return NextResponse.json({ purchase_requests: res.ok ? res.data : [] });
  }
  if (endpoint === "spend-controls/limits") {
    const res = await listSpendLimits(identity);
    return NextResponse.json({ spend_limits: res.ok ? res.data : [] });
  }
  if (endpoint === "vendor-checks") {
    const tenantId = identity.tenantId ?? "11111111-1111-1111-1111-111111111111";
    const res = await listVendorChecks({ identity: { ...identity, tenantId } });
    return NextResponse.json({ vendor_checks: res.ok ? res.data : [] });
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
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

  // ── Legal Domain ───────────────────────────────────────────────────────────
  if (endpoint === "contracts") {
    const res = await draftContract({
      ...body,
      identity: {
        principalId: identity.principalId ?? "00000000-0000-0000-0000-000000000001",
        tenantId: identity.tenantId ?? "11111111-1111-1111-1111-111111111111",
        legalEntityId: identity.legalEntityId ?? "22222222-2222-2222-2222-222222222222",
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
        principalId: identity.principalId ?? "00000000-0000-0000-0000-000000000001",
        tenantId: identity.tenantId ?? "11111111-1111-1111-1111-111111111111",
        legalEntityId: identity.legalEntityId ?? "22222222-2222-2222-2222-222222222222",
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
        principalId: identity.principalId ?? "00000000-0000-0000-0000-000000000001",
        tenantId: identity.tenantId ?? "11111111-1111-1111-1111-111111111111",
        legalEntityId: identity.legalEntityId ?? "22222222-2222-2222-2222-222222222222",
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
        principalId: identity.principalId ?? "00000000-0000-0000-0000-000000000001",
        tenantId: identity.tenantId ?? "11111111-1111-1111-1111-111111111111",
        legalEntityId: identity.legalEntityId ?? "22222222-2222-2222-2222-222222222222",
      },
      category: String(body.category ?? "PROCUREMENT"),
      period: body.period ?? "MONTHLY",
      thresholdAmount: Number(body.thresholdAmount ?? body.threshold_amount ?? 0),
      currencyCode: String(body.currencyCode ?? body.currency_code ?? "GBP"),
    });
    return toJsonResponse(res);
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
  if (endpoint === "filing-tracker/requirements") {
    const res = await createFilingRequirement(body, identity);
    return toJsonResponse(res);
  }
  if (endpoint === "exception-escalation/exceptions") {
    const res = await createEscalatedException(body, identity);
    return toJsonResponse(res);
  }

  return NextResponse.json({ error: `POST handler not implemented for ${endpoint}` }, { status: 404 });
}
