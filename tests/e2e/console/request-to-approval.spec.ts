import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Request → Governance Log → Workflows & Approvals, through the console only
// (25 Nov 2026, decision capture DL-2 / DL-7).
//
// 1. The requester (admin@) checks an amount over the approval threshold on
//    Policies & Controls. policy-svc decides APPROVAL_REQUIRED and records an
//    ESCALATED decision in the governance ledger as svc-policy.
// 2. The Governance Log shows that decision.
// 3. The requester follows "Start the approval": the start form carries the
//    decision as "Resolves governance decision" and names the approver.
// 4. The approver (legal.counsel@) finds it under My Approvals, opens it and
//    approves.
// 5. The workflow shows Approved with its history, and the Governance Log
//    lists the approval (svc-workflow) as a follow-up of the escalation.
//
// Needs the stack of governance.spec.ts: identity, tenant, access-control,
// authorization, governance-decision-log, policy-svc (with an effective
// APPROVAL_THRESHOLD policy for the demo entity) and workflow-svc. The ledger
// is append-only: what this causes stays, by design.

test.describe.configure({ mode: "serial", retries: 0 });

const H = "http://127.0.0.1";
const TENANT = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const REQUESTER = { email: "admin@zoikosuite.com", password: "Zoiko@Governance1" };
const APPROVER = { email: "legal.counsel@zoikosuite.com", password: "Zoiko@Legal2026!" };

const flow: { decisionId?: string; startHref?: string; workflowId?: string } = {};

async function healthy(port: number): Promise<boolean> {
  try {
    return (await fetch(`${H}:${port}/healthz`)).ok;
  } catch {
    return false;
  }
}

/** The approver's principal id, read from their signed envelope. */
async function principalOf(who: { email: string; password: string }): Promise<string> {
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
  expect(resolved.status).toBe(200);
  const { envelope_jwt } = (await resolved.json()) as { envelope_jwt: string };
  const claims = JSON.parse(Buffer.from(envelope_jwt.split(".")[1], "base64url").toString("utf8")) as {
    principal?: { principal_id?: string };
  };
  return claims.principal?.principal_id ?? "";
}

async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(\/|\?|$)/, { timeout: 60_000, waitUntil: "commit" });
}

/** Reloads until the page shows `text` (the ledger relays within seconds). */
async function until(page: Page, url: string, text: RegExp | string, seconds = 60): Promise<void> {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    await page.goto(url);
    if ((await page.getByText(text).count()) > 0) return;
    if (Date.now() > end) throw new Error(`${url} did not show ${text} within ${seconds} s`);
    await page.waitForTimeout(2000);
  }
}

test.beforeAll(async () => {
  test.skip(!(await healthy(8085)) || !(await healthy(8090)) || !(await healthy(8083)),
    "policy-svc (:8085), workflow-svc (:8090) and governance-decision-log-svc (:8083) must be up");
});

test("1. the requester checks an amount over the limit and the escalation reaches the Governance Log", async ({ page }) => {
  await signIn(page, REQUESTER);
  await page.goto("/admin/policies?new=evaluate");
  await page.selectOption("#eval_policy_type", "APPROVAL_THRESHOLD");
  await page.fill("#amount", "50000000");
  await page.getByRole("button", { name: "Check this amount" }).click();

  const start = page.getByTestId("start-approval");
  await expect(start).toBeVisible({ timeout: 30_000 });
  flow.startHref = (await start.getAttribute("href")) ?? "";
  flow.decisionId = new URL(flow.startHref, "http://console").searchParams.get("resolves") ?? "";
  expect(flow.decisionId).not.toBe("");

  const decisionPage = `/admin/governance/decisions/${encodeURIComponent(flow.decisionId)}`;
  await until(page, decisionPage, "svc-policy");
  await expect(page.getByText(/Escalated/i).first()).toBeVisible();
});

test("2. the requester starts the approval for that decision", async ({ page }) => {
  test.skip(!flow.startHref, "step 1 did not run");
  const approver = await principalOf(APPROVER);
  expect(approver).not.toBe("");

  await signIn(page, REQUESTER);
  await page.goto(flow.startHref!);
  await expect(page.locator("#sw-cause")).toHaveValue(flow.decisionId!);
  await expect(page.locator("#sw-type")).toHaveValue("THRESHOLD_APPROVAL");

  const pick = page.locator("#stage-0-approver");
  if ((await pick.evaluate((el) => el.tagName)) === "SELECT") await pick.selectOption(approver);
  else await pick.fill(approver);

  await page.getByRole("button", { name: "Start Workflow" }).click();
  const result = page.getByTestId("workflow-start-result");
  await expect(result).toContainText("Started THRESHOLD_APPROVAL", { timeout: 30_000 });
  const open = result.getByRole("link", { name: "Open the workflow" });
  flow.workflowId = ((await open.getAttribute("href")) ?? "").split("/").pop();
  expect(flow.workflowId).toMatch(/^[0-9a-f-]{36}$/);
});

test("3. the approver finds it under My Approvals, sees what it resolves, and approves", async ({ page }) => {
  test.skip(!flow.workflowId, "step 2 did not run");
  await signIn(page, APPROVER);
  await page.goto("/admin/workflows?tab=mine");
  await expect(page.locator(`a[href="/admin/workflows/${flow.workflowId}"]`).first()).toBeVisible({ timeout: 30_000 });

  await page.goto(`/admin/workflows/${flow.workflowId}`);
  await expect(page.getByText(/Resolves governance decision/).first()).toBeVisible();
  await page.getByTestId("workflow-decision").getByRole("button", { name: "Approve", exact: true }).first().click();
  await expect(page.getByTestId("workflow-decision-result").first()).toContainText("Approval recorded", { timeout: 30_000 });
});

test("4. the workflow is Approved and the Governance Log links the approval to the escalation", async ({ page }) => {
  test.skip(!flow.workflowId || !flow.decisionId, "steps 1-3 did not run");
  await signIn(page, REQUESTER);
  await page.goto(`/admin/workflows/${flow.workflowId}`);
  await expect(page.getByText(/Approved/).first()).toBeVisible();

  const decisionPage = `/admin/governance/decisions/${encodeURIComponent(flow.decisionId!)}`;
  await until(page, decisionPage, /Follow-ups \(1\)/);
  await expect(page.getByText(/Follow-ups \(1\)/)).toBeVisible();
});
