import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";

// Governance Log console (/admin/governance) against the live local stack.
//
// The console is read-only (decision D-DL-2, 25 Nov 2026): every governance
// engine records its own decisions. These tests drive a real service path —
// policy-svc evaluates a payment above its approval threshold (ESCALATED,
// recorded by svc-policy), workflow-svc approves it (recorded by svc-workflow
// with the policy decision as its causation) — and then read both rows, the
// causation link, the evidence chain and the exports through the console, and
// check that no button writes to the ledger.
//
// Needs: governance-decision-log-svc, authorization-svc, identity-context-svc,
// tenant-entity-registry-svc, access-control-svc, policy-svc (an effective
// APPROVAL_THRESHOLD policy for the demo entity: run
// deployments/scripts/e2e-policy-deps.py once) and workflow-svc. The ledger is
// append-only: what these tests cause stays, by design.

test.describe.configure({ mode: "serial", retries: 0 });

const H = "http://127.0.0.1";
const TENANT = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const APPROVER = { email: "legal.counsel@zoikosuite.com", password: "Zoiko@Legal2026!" };
const ADMIN = { email: "admin@zoikosuite.com", password: "Zoiko@Governance1" };

type Envelope = { jwt: string; principalId: string };

function headers(env: Envelope, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.jwt}`,
    "X-Tenant-Id": TENANT,
    "X-Principal-Id": env.principalId,
    "X-Legal-Entity-Id": ENTITY,
    "X-Request-Id": randomUUID(),
    "X-Correlation-ID": `ui-e2e-gov-${randomUUID().slice(0, 8)}`,
    "X-Source-Channel": "api",
    ...extra,
  };
}

async function signIn(who: { email: string; password: string }): Promise<Envelope> {
  const auth = await fetch(`${H}:8080/v1/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: TENANT, email: who.email, password: who.password,
      client_id: "zoiko-console", client_secret: "local-dev-console-client-secret",
    }),
  });
  expect(auth.status, `sign in ${who.email}`).toBe(200);
  const { access_token } = (await auth.json()) as { access_token: string };
  const resolved = await fetch(`${H}:8080/v1/context/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Tenant-Id": TENANT, "X-Legal-Entity-Id": ENTITY,
      "X-Request-Id": randomUUID(), "X-Correlation-ID": randomUUID(), "Idempotency-Key": randomUUID(), "X-Source-Channel": "api",
    },
    body: JSON.stringify({ bearer_token: access_token, legal_entity_id: ENTITY }),
  });
  expect(resolved.status, `resolve ${who.email}`).toBe(200);
  const { envelope_jwt } = (await resolved.json()) as { envelope_jwt: string };
  // The envelope names its principal in its claims (principal.principal_id).
  const claims = JSON.parse(Buffer.from(envelope_jwt.split(".")[1], "base64url").toString("utf8")) as {
    principal?: { principal_id?: string };
  };
  const principalId = claims.principal?.principal_id ?? "";
  expect(principalId, `the envelope of ${who.email} names its principal`).not.toBe("");
  return { jwt: envelope_jwt, principalId };
}

async function healthy(port: number): Promise<boolean> {
  try {
    return (await fetch(`${H}:${port}/healthz`)).ok;
  } catch {
    return false;
  }
}

/** Polls the ledger (as the admin, through the API) until decisionId is recorded. */
async function inLedger(admin: Envelope, decisionId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${H}:8083/v1/decisions/${encodeURIComponent(decisionId)}`, {
      headers: headers(admin, { "X-Purpose-Context": "GOVERNANCE_AUDIT" }),
    });
    if (r.ok) return (await r.json()) as Record<string, unknown>;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`${decisionId} did not reach the ledger within 60 s`);
}

/** The ledger decision the workflow's approval wrote: the newest svc-workflow
 *  record naming causationId. */
async function approvalOf(admin: Envelope, causationId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${H}:8083/v1/decisions?actor=svc-workflow&limit=50`, {
      headers: headers(admin, { "X-Purpose-Context": "GOVERNANCE_AUDIT" }),
    });
    if (r.ok) {
      const page = (await r.json()) as { records: Record<string, unknown>[] };
      const hit = page.records.find((d) => d.causation_id === causationId);
      if (hit) return hit;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`no svc-workflow decision names ${causationId} as its cause within 60 s`);
}

const path: { policyDecision?: Record<string, unknown>; approval?: Record<string, unknown> } = {};

/** The fixture's console sign-in, for a test that must decide to skip first. */
async function signInConsole(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(\/|\?|$)/, { timeout: 60_000, waitUntil: "commit" });
}

test.describe("Governance Log console (read-only, D-DL-2)", () => {
  test("a service path: policy escalates, workflow approves, both reach the ledger linked", async () => {
    test.skip(!(await healthy(8085)) || !(await healthy(8090)), "policy-svc (:8085) and workflow-svc (:8090) must be up");
    const admin = await signIn(ADMIN);
    const approver = await signIn(APPROVER);

    const decisionId = `ui-e2e-pol-${randomUUID().slice(0, 12)}`;
    const ev = await fetch(`${H}:8085/v1/policies/evaluate`, {
      method: "POST",
      headers: headers(admin, { "X-Purpose-Context": "POLICY_REVIEW" }),
      body: JSON.stringify({
        policy_type: "APPROVAL_THRESHOLD", tenant_id: TENANT, legal_entity_id: ENTITY,
        action_context: { amount: 50_000_000 }, decision_id: decisionId,
      }),
    });
    expect([200, 201], `policy evaluate: ${await ev.clone().text()}`).toContain(ev.status);
    path.policyDecision = await inLedger(admin, decisionId);
    expect(path.policyDecision.actor_id).toBe("svc-policy");
    expect(path.policyDecision.status_category).toBe("ESCALATED");

    const wf = await fetch(`${H}:8090/v1/workflows`, {
      method: "POST",
      headers: headers(admin, { "Idempotency-Key": randomUUID(), "X-Causation-Id": decisionId }),
      body: JSON.stringify({
        tenant_id: TENANT, legal_entity_id: ENTITY, workflow_type: "PAYMENT_APPROVAL",
        stages: [{ approver_principal_id: approver.principalId }],
      }),
    });
    expect(wf.status, `start workflow: ${await wf.clone().text()}`).toBe(201);
    const { workflow_instance } = (await wf.json()) as { workflow_instance: { workflow_instance_id: string; causation_decision_id?: string } };
    expect(workflow_instance.causation_decision_id).toBe(decisionId);

    const act = await fetch(`${H}:8090/v1/workflows/${workflow_instance.workflow_instance_id}/actions`, {
      method: "POST",
      headers: headers(approver, { "Idempotency-Key": randomUUID() }),
      body: JSON.stringify({ action: "APPROVE", rationale: "UI e2e: within the delegated limit" }),
    });
    expect(act.status, `approve: ${await act.clone().text()}`).toBe(200);
    path.approval = await approvalOf(admin, decisionId);
    expect(path.approval.actor_id).toBe("svc-workflow");
  });

  test("the register shows both decisions and the drawer links the approval to the escalation", async ({ page }) => {
    // Skipped before signing in: the authedPage fixture would sign in first.
    test.skip(!path.policyDecision || !path.approval, "the service path did not run");
    await signInConsole(page);
    const policyRef = String(path.policyDecision!.display_ref);
    const approvalRef = String(path.approval!.display_ref);

    await page.goto(`/admin/governance?q=${encodeURIComponent(policyRef)}`);
    await expect(page.locator("table tbody tr").first()).toContainText("Escalated");
    await page.goto(`/admin/governance?q=${encodeURIComponent(approvalRef)}`);
    await expect(page.locator("table tbody tr").first()).toContainText("Approved");

    await page.goto(`/admin/governance?id=${encodeURIComponent(String(path.policyDecision!.decision_id))}&pane=approvals`);
    await expect(page.locator("aside").getByText("Follow-ups")).toBeVisible();
    await expect(page.locator("aside a", { hasText: approvalRef })).toBeVisible();
  });

  test("KPIs, the three panels and the register render from live data", async ({ authedPage: page }) => {
    await page.goto("/admin/governance");
    await expect(page.locator("h1", { hasText: "Governance Log" })).toBeVisible();
    await expect(page.getByText(/recorded automatically by the service that made it/)).toBeVisible();
    for (const label of ["Total Decisions", "Approved", "Pending", "Escalated", "Denied"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    for (const title of ["Decisions by Status", "Decisions by Domain", "Trend Over Time"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    for (const col of ["ID", "Decision / Title", "Domain", "Entity", "Status", "Priority", "Date & Time", "Jurisdiction", "User"]) {
      await expect(page.locator("th", { hasText: col }).first()).toBeVisible();
    }
  });

  test("no button writes to the ledger: no New Decision, Record Outcome, Replay or Seal", async ({ authedPage: page }) => {
    const writes = /^(New Decision|Record Outcome|Record Follow-up|Replay|Seal Package)$/;
    await page.goto("/admin/governance");
    await expect(page.getByRole("button", { name: writes })).toHaveCount(0);
    await page.locator("table tbody tr td:first-child a").first().click();
    for (const pane of ["Approvals", "Evidence"]) {
      await page.locator('nav[aria-label="Detail sections"] a', { hasText: pane }).click();
      await expect(page.getByRole("button", { name: writes })).toHaveCount(0);
    }
    await page.goto("/admin/governance?tab=evidence");
    await expect(page.getByRole("button", { name: writes })).toHaveCount(0);
    await page.goto("/admin/governance?tab=replays");
    await expect(page.getByRole("button", { name: writes })).toHaveCount(0);
  });

  test("evidence: the record re-computes, the chain and the newest package verify, evidence exports", async ({ authedPage: page }) => {
    await page.goto("/admin/governance");
    await page.locator("table tbody tr td:first-child a").first().click();
    await page.locator('nav[aria-label="Detail sections"] a', { hasText: "Evidence" }).click();
    await expect(page.locator("aside").getByText("Re-computes")).toBeVisible();

    await page.goto("/admin/governance?tab=evidence");
    await page.getByRole("button", { name: "Verify Chain" }).click();
    await page.locator("dialog[open] button[type='submit']").click();
    await expect(page.locator("dialog[open]").getByText(/The ledger is intact/)).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");

    const verifyPackage = page.getByRole("button", { name: "Verify Package" }).first();
    if (await verifyPackage.count()) {
      await verifyPackage.click();
      await page.locator("dialog[open] button[type='submit']").click();
      await expect(page.locator("dialog[open]").getByText(/verifies: decisions 1–/)).toBeVisible({ timeout: 60_000 });
      await page.keyboard.press("Escape");
    }

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export Evidence" }).click();
    expect((await download).suggestedFilename()).toMatch(/governance-evidence-.*\.json/);
  });

  test("replays tab and the register CSV export", async ({ authedPage: page }) => {
    await page.goto("/admin/governance?tab=replays");
    await expect(page.getByRole("link", { name: /Show mismatches only|show all/ })).toBeVisible();
    await page.goto("/admin/governance");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/governance-log-.*\.csv/);
  });
});
