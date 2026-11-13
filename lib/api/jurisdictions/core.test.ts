import { describe, expect, it, vi } from "vitest";
import type { ApiError } from "../client";
import { explainJurisdictionProblem, getVersioned, isRefusal, listAll, problemCode } from "./core";
import { transitionRule } from "./rules";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const problem = (status: number, code: string, detail = ""): ApiError => ({ kind: "http", status, message: `x (${status})`, body: { status, code, detail } });
const me = { principalId: "p-1", tenantId: "t-1", legalEntityId: "e-1", envelopeJwt: "a.b.c" };

describe("explainJurisdictionProblem", () => {
  it("turns the service's problem codes into sentences", () => {
    expect(explainJurisdictionProblem(problem(403, "self_approval_forbidden"))).toMatch(/author cannot activate/);
    expect(explainJurisdictionProblem(problem(412, "precondition_failed"))).toMatch(/Reload the page/);
    expect(explainJurisdictionProblem(problem(401, "identity_not_verified"))).toMatch(/verified sign-in/);
    expect(explainJurisdictionProblem(problem(503, "approval_service_unavailable"))).toMatch(/fail-closed/);
    expect(explainJurisdictionProblem(problem(403, "segregation_of_duties"))).toMatch(/second person/);
  });

  it("keeps workflow-svc's reason when an approval is not valid", () => {
    const text = explainJurisdictionProblem(problem(403, "approval_not_valid", "approval reference is not a valid approval of this rule: the approval is PENDING, not APPROVED"));
    expect(text).toMatch(/does not confirm/);
    expect(text).toMatch(/The approval is PENDING, not APPROVED\./);
  });

  it("names the missing field, and falls back on the detail for an unmapped invalid_ code", () => {
    expect(explainJurisdictionProblem(problem(400, "missing_field", "reason"))).toBe("A required field is empty: reason.");
    expect(explainJurisdictionProblem(problem(400, "invalid_ring_code", "ring_code must be UPPER_SNAKE"))).toBe("Ring_code must be UPPER_SNAKE.");
  });

  it("says unreachable and timeout plainly, and a 412 without a code still reads as a stale page", () => {
    expect(explainJurisdictionProblem({ kind: "unreachable", message: "" })).toMatch(/could not be reached/);
    expect(explainJurisdictionProblem({ kind: "timeout", message: "" })).toMatch(/did not answer in time/);
    expect(explainJurisdictionProblem({ kind: "http", status: 412, message: "" })).toMatch(/changed this record/);
  });

  it("treats a refusal (the control working) apart from a fault", () => {
    expect(isRefusal(problem(403, "unauthorized"))).toBe(true);
    expect(isRefusal(problem(409, "not_draft"))).toBe(true);
    expect(isRefusal(problem(503, "store_unavailable"))).toBe(false);
    expect(problemCode({ kind: "http", status: 400, message: "", body: { error: "legacy_code" } })).toBe("legacy_code");
  });
});

describe("listAll (API-4)", () => {
  it("follows next_cursor and sends filters as filter[name]", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { items: [{ id: 1 }], next_cursor: "c2", page_size: 200 }))
      .mockResolvedValueOnce(json(200, { items: [{ id: 2 }], page_size: 200 }));
    const r = await listAll<{ id: number }>("/v1/sources", undefined, { jurisdiction_id: "j-1", authority: undefined });
    expect(r).toEqual({ ok: true, data: [{ id: 1 }, { id: 2 }] });
    const first = new URL(String(fetch.mock.calls[0][0]));
    expect(first.searchParams.get("page_size")).toBe("200");
    expect(first.searchParams.get("filter[jurisdiction_id]")).toBe("j-1");
    expect(first.searchParams.has("filter[authority]")).toBe(false);
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("cursor")).toBe("c2");
  });

  it("reports a list without items as malformed, never as empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, [{ legacy: true }]));
    const r = await listAll("/v1/packs");
    expect(r.ok).toBe(false);
  });
});

describe("API-3 and J-02 headers", () => {
  it("reads the ETag a record was served at", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { source_id: "s" }, { ETag: '"4"' }));
    const r = await getVersioned<{ source_id: string }>("/v1/sources/s");
    expect(r.ok && r.data.etag).toBe('"4"');
  });

  it("activates a rule with If-Match from its row_version and the approval reference", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { jurisdiction_rule_id: "r", rule_status: "ACTIVE" }));
    await transitionRule({ jurisdiction_rule_id: "r", row_version: 3 }, { newStatus: "ACTIVE", approvalReference: "wf-1" }, me);
    const headers = (fetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["If-Match"]).toBe('"3"');
    expect(headers["X-Approval-Reference"]).toBe("wf-1");
    expect(headers.Authorization).toBe("Bearer a.b.c");
    expect(headers["Idempotency-Key"]).toBeTruthy();
  });
});
