import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import type { CallerIdentity } from "@/lib/api/envelope";

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
  evaluateDetermination,
  createVATReturn,
  createCorporateTaxReturn,
  createWithholdingObligation,
  createFilingDraft,
  createTaxAuthorityInterface,
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
    const res = await listPurchaseRequests(identity);
    return NextResponse.json({ purchase_requests: res.ok ? res.data : [] });
  }
  if (endpoint === "spend-controls/limits") {
    const res = await listSpendLimits(identity);
    return NextResponse.json({ spend_limits: res.ok ? res.data : [] });
  }
  if (endpoint === "vendor-checks") {
    const res = await listVendorChecks(identity);
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
    const res = await listEvidenceRequirements(identity);
    return NextResponse.json({ requirements: res.ok ? res.data : [] });
  }

  // ── Configuration / Service Inputs ─────────────────────────────────────────
  if (endpoint === "config/feature-flags") {
    const res = await listFeatureFlags(identity);
    return NextResponse.json({ feature_flags: res.ok ? res.data : [] });
  }
  if (endpoint === "config/entries") {
    const res = await listConfigEntries(identity);
    return NextResponse.json({ config_entries: res.ok ? res.data : [] });
  }

  // ── Delegations ────────────────────────────────────────────────────────────
  if (endpoint === "delegations") {
    const res = await listDelegations(identity);
    return NextResponse.json({ delegations: res.ok ? res.data : [] });
  }

  // ── Secret Vault ───────────────────────────────────────────────────────────
  if (endpoint === "secrets/leases") {
    const res = await listLeases(identity);
    return NextResponse.json({ leases: res.ok ? res.data : [] });
  }
  if (endpoint === "secrets/policies") {
    const res = await listApplicableSecretPolicyVersions(identity);
    return NextResponse.json({ policies: res.ok ? res.data : [] });
  }
  if (endpoint === "secrets/audit") {
    const res = await listSecretAudit(identity);
    return NextResponse.json({ audit_events: res.ok ? res.data : [] });
  }

  return NextResponse.json({ error: `Not found: ${endpoint}` }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  const identity = await resolveIdentity(req);
  const body = await req.json().catch(() => ({}));

  // ── Tax Domain ─────────────────────────────────────────────────────────────
  if (endpoint === "tax-rules") {
    const res = await createTaxRule(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "tax-determinations") {
    const res = await evaluateDetermination(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "vat-returns") {
    const res = await createVATReturn(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "corporate-tax-returns") {
    const res = await createCorporateTaxReturn(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "withholding-tax") {
    const res = await createWithholdingObligation(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "filing-preparation/drafts") {
    const res = await createFilingDraft(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "tax-authority/interfaces") {
    const res = await createTaxAuthorityInterface(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }

  // ── Legal Domain ───────────────────────────────────────────────────────────
  if (endpoint === "contracts") {
    const res = await draftContract(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "clauses") {
    const res = await createClause(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "meetings") {
    const res = await createBoardMeeting(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "corporate-actions") {
    const res = await createCorporateAction(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }

  // ── Commercial Ops Domain ──────────────────────────────────────────────────
  if (endpoint === "purchase-orders") {
    const res = await issuePurchaseOrder(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "spend-controls/policies") {
    const res = await createSpendPolicy(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }

  // ── Compliance Domain ──────────────────────────────────────────────────────
  if (endpoint === "filing-tracker/requirements") {
    const res = await createFilingRequirement(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }
  if (endpoint === "exception-escalation/exceptions") {
    const res = await createEscalatedException(body, identity);
    return NextResponse.json(res.data, { status: res.status });
  }

  return NextResponse.json({ error: `POST handler not implemented for ${endpoint}` }, { status: 404 });
}
