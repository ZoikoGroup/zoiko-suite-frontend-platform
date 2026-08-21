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
} from "@/lib/api/tax";
import { listContracts, listClauses, listObligations, listBoardMeetings, listCorporateActions, listCounterparties } from "@/lib/api/legal";
import { listCashPositions, getFinanceSummaryStats } from "@/lib/api/finance";
import { listJournals } from "@/lib/api/general-ledger";
import { listPurchaseOrders, listSpendLimits } from "@/lib/api/commercial-ops";
import { listPayrollRuns, listCompensationStructures, listBenefitPlans, listPayrollTaxProfiles, listPayrollExceptions } from "@/lib/api/payroll";
import { listEmployees, listLeaveRequests, listDepartments, listWorkforceAlerts } from "@/lib/api/hr";
import { listFilingRequirements, listComplianceEvaluations, listEscalatedExceptions } from "@/lib/api/compliance";

/**
 * Read-through for the client components that refresh a domain panel.
 *
 * THIS ROUTE HAD NO SESSION CHECK AND TOOK ITS TENANT FROM A REQUEST HEADER.
 * `callerIdentity` read X-Tenant-Id straight off the incoming browser request
 * and fell back to a hardcoded demo tenant — so anything that could reach the
 * console's port could read any tenant's tax rules, contracts, obligations,
 * payroll, workforce, compliance and finance data by setting one header, and
 * every read ran as a hardcoded principal regardless of who was signed in.
 *
 * This is the same defect, in a second file, as the /api/backend/[...path] proxy
 * deleted during the receivables pass. This one has live consumers, so it is
 * fixed rather than removed: the session is verified here, and the identity
 * forwarded downstream comes from that session and nowhere else.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  const identity = await sessionIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
  // journal-entries reads general-ledger-svc for real now. It used to serve two
  // hardcoded rows, so a caller of this endpoint was handed sample data with
  // nothing marking it as such — the one failure mode worse than an empty list.
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

  return NextResponse.json({ message: `Endpoint /v1/${endpoint} handled by Zoiko Suite Next.js API Gateway`, status: "ACTIVE" });
}

/**
 * WRITES ARE NOT IMPLEMENTED HERE, and they never were.
 *
 * POST used to answer 201 with `{"status": "CREATED", "message": "Resource
 * created/processed successfully"}` and PUT 200 "UPDATED" — after writing
 * NOTHING. No backend call, no store, nothing. Every caller that trusted the
 * status code reported a successful write to the user for an operation that had
 * not happened: the Finance console's "Post Journal Entry" showed an invented
 * journal id, and the Tax console's rule form showed a created rule whose
 * `rule_id` was undefined because no such field ever came back.
 *
 * A 501 is the truthful answer, and it is deliberately not a 200: a caller
 * cannot distinguish a write it must retry from one that succeeded if the
 * failure is dressed as success. Writes belong in Server Actions, which verify
 * the session and call the owning service's typed client — see
 * app/admin/finance/actions.ts for the pattern.
 */
function notImplemented(endpoint: string, verb: string) {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        `${verb} /v1/${endpoint} does not write anything. This console route is read-only; ` +
        "it used to answer as though the write had succeeded. Use the domain's Server Action instead.",
    },
    { status: 501 },
  );
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return notImplemented(path.join("/"), "POST");
}

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return notImplemented(path.join("/"), "PUT");
}

/**
 * The caller's identity, from the verified session cookie.
 *
 * This replaced a function that read X-Tenant-Id and X-Principal-Id off the
 * incoming request and defaulted them to hardcoded demo values. A browser can
 * set any header it likes, so that made the tenant scope of every read below a
 * caller-chosen value — and the default meant an unauthenticated request was
 * served as the demo tenant rather than refused.
 */
async function sessionIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) return null;
  return {
    tenantId: session.tenantId,
    principalId: session.principalId,
    legalEntityId: session.legalEntityId,
  };
}

