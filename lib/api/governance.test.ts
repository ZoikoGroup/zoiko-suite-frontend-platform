import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decisionTitle,
  explainDecisionError,
  getDecisionStats,
  listDecisionRecords,
  recordDecision,
  splitRuleBasis,
  statusView,
} from "./governance";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const identity = { principalId: "p-1", tenantId: "t-1", legalEntityId: "e-1" };

describe("governance presentation", () => {
  it("labels each status category, and an unmapped outcome as itself — never as approved", () => {
    expect(statusView({ status_category: "APPROVED", outcome: "GRANTED" })).toEqual({ label: "Approved", tone: "success" });
    expect(statusView({ status_category: "PENDING", outcome: "IN_PROGRESS" }).label).toBe("In Progress");
    expect(statusView({ status_category: "ESCALATED", outcome: "APPROVAL_REQUIRED" }).tone).toBe("danger");
    expect(statusView({ status_category: "DENIED", outcome: "DENIED" }).label).toBe("Denied");
    const odd = statusView({ status_category: "OTHER", outcome: "MAYBE_LATER" });
    expect(odd.tone).toBe("neutral");
    expect(odd.label).not.toBe("Approved");
  });

  it("names a decision by its title, else its action type in words", () => {
    expect(decisionTitle({ title: "Approve renewal", action_type: "X" })).toBe("Approve renewal");
    expect(decisionTitle({ title: null, action_type: "VENDOR_CONTRACT_RENEWAL" })).toMatch(/vendor contract renewal/i);
  });

  it("splits a rule basis on its first colon only", () => {
    expect(splitRuleBasis("POLICY:v2:extra")).toEqual({ rule: "POLICY", reference: "v2:extra" });
    expect(splitRuleBasis("NO-COLON")).toEqual({ rule: "NO-COLON" });
  });

  it("explains refusals by their problem code", () => {
    expect(explainDecisionError({ status: 409, message: "x", body: { code: "NOTHING_TO_SEAL" } })).toMatch(/already sealed/);
    expect(explainDecisionError({ status: 403, message: "x", body: { code: "AUTHORIZATION_DENIED" } })).toMatch(/permission/);
  });
});

describe("governance client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the register with a purpose of access and every filter", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { records: [], total_count: 0, next_cursor: "", limit: 10, offset: 20 }));
    const r = await listDecisionRecords({ domain: "FINANCE_TAX", status: "PENDING", q: "GD-2026-0001", limit: 10, offset: 20 }, identity);
    expect(r.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("domain=FINANCE_TAX");
    expect(String(url)).toContain("status=PENDING");
    expect(String(url)).toContain("offset=20");
    expect((init.headers as Record<string, string>)["X-Purpose-Context"]).toBe("GOVERNANCE_AUDIT");
    expect((init.headers as Record<string, string>)["X-Tenant-Id"]).toBe("t-1");
  });

  it("refuses a register response with no records array as malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, [{ decision_id: "legacy-array" }]));
    const r = await listDecisionRecords({}, identity);
    expect(r.ok).toBe(false);
  });

  it("records a decision with a generated id, an idempotency key, and the causation in body and header alike", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(201, { decision_id: "d", display_ref: "GD-2026-0001" }));
    const r = await recordDecision(
      { actionType: "X", outcome: "APPROVED", ruleBasis: "R", legalEntityId: "e-2", causationId: "parent", tags: ["a"], priority: "HIGH" },
      identity,
    );
    expect(r.ok && r.status).toBe(201);
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(String(init.body));
    expect(body.decision_id).toMatch(/[0-9a-f-]{36}/);
    expect(body.causation_id).toBe("parent");
    expect(headers["X-Causation-Id"]).toBe("parent");
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(headers["X-Legal-Entity-Id"]).toBe("e-2");
    expect(body.legal_entity_id).toBe("e-2");
  });

  it("builds the overview stats from the summary endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(200, {
        totals: { total: 10, approved: 6, pending: 1, escalated: 2, denied: 1, other: 0 },
        previous_totals: { total: 4, approved: 3, pending: 0, escalated: 1, denied: 0, other: 0 },
        trend: [{ date: "2026-11-10", total: 10, approved: 6, pending: 1, escalated: 2, denied: 1, other: 0 }],
      }),
    );
    const r = await getDecisionStats(14, identity);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.total).toBe(10);
    expect(r.data.authorized).toBe(6);
    expect(r.data.escalated).toBe(3);
    expect(r.data.denied).toBe(1);
    expect(r.data.exceptionDelta).toBe(4 - 1);
    expect(r.data.trend[0]).toMatchObject({ authorized: 6, escalated: 4 });
  });
});
