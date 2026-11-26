import { afterEach, describe, expect, it, vi } from "vitest";
import {
  explainAuthzError,
  getAssignmentsAsOf,
  getSessionActivity,
  listAssignmentSuspensions,
  resumeRoleAssignment,
  suspendRoleAssignment,
} from "./authorization";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const me = { principalId: "p-1", tenantId: "t-1", legalEntityId: "e-1", envelopeJwt: "a.b.c" };
const grant = { principal_role_assignment_id: "a-1", version: 4 };

afterEach(() => vi.restoreAllMocks());

describe("assignment suspension (ORG-06)", () => {
  it("suspends with the reason, the note and the version the page showed", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ...grant, version: 5, suspended_at: "2026-11-18T10:00:00Z" }));
    const r = await suspendRoleAssignment({ identity: me, assignmentId: "a-1", reason: { reasonCode: "SECURITY_CONCERN", note: "phished", expectedVersion: 4 } });
    expect(r.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v1/admin/role-assignments/a-1/suspend");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ reason_code: "SECURITY_CONCERN", purpose: "phished", expected_version: 4 });
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer a.b.c");
  });

  it("resumes on its own route", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, grant));
    await resumeRoleAssignment({ identity: me, assignmentId: "a 1", reason: { reasonCode: "ACCESS_REINSTATED", expectedVersion: 5 } });
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe("/v1/admin/role-assignments/a%201/resume");
  });

  it("reports the holder's own resume as a refusal in words", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(403, { error: "self_resume_not_allowed", message: "an assignee cannot resume their own assignment" }));
    const r = await resumeRoleAssignment({ identity: me, assignmentId: "a-1", reason: { reasonCode: "ACCESS_REINSTATED", expectedVersion: 5 } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.status).toBe(403);
      expect(explainAuthzError(r.error)).toMatch(/cannot resume a grant you hold yourself/);
    }
  });

  it("reads a grant's suspension history", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, [{ suspension_id: "s-1", suspended_by: "p-2" }]));
    const r = await listAssignmentSuspensions(me, "a-1");
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe("/v1/admin/role-assignments/a-1/suspensions");
    expect(r.ok && r.data[0].suspension_id).toBe("s-1");
  });

  it("asks for the grants in force at one instant, for everyone unless a person is named", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { as_of: "2026-11-01T00:00:00Z", assignments: [] }));
    await getAssignmentsAsOf(me, { asOf: "2026-11-01T00:00:00.000Z" });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/admin/role-assignments/as-of");
    expect(url.searchParams.get("as_of")).toBe("2026-11-01T00:00:00.000Z");
    expect(url.searchParams.has("principal_id")).toBe(false);
    await getAssignmentsAsOf(me, { asOf: "2026-11-01", principalId: "p-9" });
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("principal_id")).toBe("p-9");
  });
});

describe("RFC 9457 refusals", () => {
  it("reads the problem's code, so a stale page says somebody changed the record", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "stale_version", detail: "the object has changed since the version you sent; re-read it and retry", status: 412 }), {
        status: 412,
        headers: { "Content-Type": "application/problem+json" },
      }),
    );
    const r = await suspendRoleAssignment({ identity: me, assignmentId: "a-1", reason: { reasonCode: "SECURITY_CONCERN", expectedVersion: 3 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(explainAuthzError(r.error)).toMatch(/Somebody changed this since you loaded the page/);
  });
});

describe("session activity", () => {
  it("reads each kind of session from its own route", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { granted: 0, denied: 0, decisions: [] }));
    await getSessionActivity(me, "privileged", "s-1");
    await getSessionActivity(me, "break_glass", "s-2");
    await getSessionActivity(me, "support", "s-3");
    expect(fetch.mock.calls.map((c) => new URL(String(c[0])).pathname)).toEqual([
      "/v1/admin/privileged-sessions/s-1/activity",
      "/v1/admin/break-glass-sessions/s-2/activity",
      "/v1/support/sessions/s-3/activity",
    ]);
  });
});
