import { describe, expect, it } from "vitest";
import type { ApiError, ApiWriteResult } from "../client";
import { EVALUATORS, recordedAnswer, type Recorded, type ResolverDecision } from "./runtime";

type Answer = Recorded<"decision", Partial<ResolverDecision>>;
const http = (status: number, body: unknown): ApiWriteResult<Answer> => ({ ok: false, error: { kind: "http", status, message: `x (${status})`, body } as ApiError });

describe("recordedAnswer", () => {
  const unsupported = { decision_id: "d-1", replayed: false, decision: { outcome: "UNSUPPORTED_JURISDICTION", explanation: ["no eligible pack covers XX"] } };

  it("returns a 2xx answer as it is", () => {
    const r: ApiWriteResult<Answer> = { ok: true, status: 200, data: { decision_id: "d-0", replayed: false, decision: { outcome: "RESOLVED" } } };
    expect(recordedAnswer(r)).toEqual(r.data);
  });

  it("reads a recorded negative outcome (422, 409) as the answer, not as a failure", () => {
    expect(recordedAnswer(http(422, unsupported))).toEqual(unsupported);
    expect(recordedAnswer(http(409, { ...unsupported, decision: { outcome: "AMBIGUOUS" } }))?.decision.outcome).toBe("AMBIGUOUS");
  });

  it("leaves a real problem (no decision recorded) to the caller", () => {
    expect(recordedAnswer(http(400, { code: "missing_field", detail: "effective_at is required" }))).toBeNull();
    expect(recordedAnswer(http(409, { code: "idempotency_conflict" }))).toBeNull();
    expect(recordedAnswer(http(503, { code: "pack_unverified", decision_id: "d-9" }))).toBeNull();
    expect(recordedAnswer({ ok: false, error: { kind: "unreachable", message: "" } })).toBeNull();
  });
});

describe("EVALUATORS", () => {
  it("gives every evaluator a JSON example that names its jurisdiction", () => {
    for (const [kind, e] of Object.entries(EVALUATORS)) {
      const body = JSON.parse(e.example) as Record<string, unknown>;
      expect(body.jurisdiction, kind).toBeTypeOf("string");
    }
  });
});
