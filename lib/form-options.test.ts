// The register pick-lists for an evidence manifest (filing preparation) and a
// bank reconciliation run (reconciliation intelligence): what each asks the
// service, what it offers, and that a failed read is reported, not hidden.

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiGet: (...args: unknown[]) => apiGet(...args) }));

const { evidenceManifestOptions, reconciliationRunOptions } = await import("./form-options");

const ENTITY = "6f1c2a3b-0000-4000-8000-000000000001";
const identity = { tenantId: "t-1", principalId: "p-1", legalEntityId: ENTITY };

beforeEach(() => apiGet.mockReset());

describe("evidenceManifestOptions", () => {
  it("reads the entity's manifests and offers only GENERATED ones", async () => {
    apiGet.mockResolvedValue({
      ok: true,
      data: [
        { manifest_id: "m-gen", scenario_type: "TAX_FILING", status: "GENERATED", requested_at: "2026-10-01T00:00:00Z", generated_at: "2026-10-02T00:00:00Z" },
        { manifest_id: "m-pending", scenario_type: "TAX_FILING", status: "PENDING", requested_at: "2026-10-03T00:00:00Z" },
        { manifest_id: "m-failed", scenario_type: "TAX_FILING", status: "FAILED", requested_at: "2026-10-04T00:00:00Z" },
      ],
    });
    const res = await evidenceManifestOptions(identity);
    expect(apiGet).toHaveBeenCalledWith("evidenceManifest", "/v1/evidence-manifests", {
      identity,
      query: { legal_entity_id: ENTITY, limit: 200 },
    });
    expect(res).toEqual({ ok: true, items: [{ value: "m-gen", label: "TAX_FILING · 2026-10-02 · m-gen" }] });
  });

  it("reports the service's refusal", async () => {
    apiGet.mockResolvedValue({ ok: false, error: { message: "evidence-manifest-svc returned 403" } });
    expect(await evidenceManifestOptions(identity)).toEqual({ ok: false, error: "evidence-manifest-svc returned 403" });
  });

  it("asks nothing without a legal entity in the session", async () => {
    const res = await evidenceManifestOptions({ tenantId: "t-1", principalId: "p-1" });
    expect(res.ok).toBe(false);
    expect(apiGet).not.toHaveBeenCalled();
  });
});

describe("reconciliationRunOptions", () => {
  const today = new Date("2026-11-23T10:00:00Z");

  it("asks period-status for the past year and offers each account's latest and latest certified run once", async () => {
    apiGet.mockResolvedValue({
      ok: true,
      data: {
        legal_entity_id: ENTITY,
        accounts: [
          {
            bank_account_id: "acct-aaaaaaaa-1",
            latest_run: { run_id: "run-open-0001", statement_date: "2026-11-01", status: "OPEN" },
            latest_certified: { run_id: "run-cert-0001", statement_date: "2026-10-01", status: "CERTIFIED" },
          },
          // The latest run is also the latest certified one: offered once.
          { bank_account_id: "acct-bbbbbbbb-2", latest_run: { run_id: "run-same-0002", statement_date: "2026-09-30", status: "CERTIFIED" }, latest_certified: { run_id: "run-same-0002", statement_date: "2026-09-30", status: "CERTIFIED" } },
          // An account with no run in the period.
          { bank_account_id: "acct-cccccccc-3" },
        ],
      },
    });
    const res = await reconciliationRunOptions(identity, today);
    expect(apiGet).toHaveBeenCalledWith("bankReconciliation", "/v1/reconciliation-runs/period-status", {
      identity,
      query: { legal_entity_id: ENTITY, period_start: "2025-11-23", period_end: "2026-11-23" },
    });
    expect(res.ok && res.items.map((o) => o.value)).toEqual(["run-open-0001", "run-cert-0001", "run-same-0002"]);
    expect(res.ok && res.items[0].label).toBe("Account acct-aaa · 2026-11-01 · OPEN · run-open");
  });

  it("reports the service's refusal", async () => {
    apiGet.mockResolvedValue({ ok: false, error: { message: "bank-reconciliation-svc returned 404" } });
    expect(await reconciliationRunOptions(identity, today)).toEqual({ ok: false, error: "bank-reconciliation-svc returned 404" });
  });

  it("asks nothing without a legal entity in the session", async () => {
    const res = await reconciliationRunOptions({ tenantId: "t-1", principalId: "p-1" }, today);
    expect(res.ok).toBe(false);
    expect(apiGet).not.toHaveBeenCalled();
  });
});
