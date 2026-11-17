// Browser journeys for the lifecycle actions after create (lib/lifecycle/catalog.ts),
// against a live verification stack under this run's tenant. Each journey
// starts from a record the service holds, clicks the row's buttons, and reads
// the service's answer: the new status after a re-read, or its refusal in its
// own words. Segregation of duties is exercised with a second principal.
//
// Run: npm run build, then
//   ZOIKO_LIVE_E2E=1 ZOIKO_E2E_GATEWAY=http://127.0.0.1:18180 npx playwright test -c playwright.blocks.config.ts lifecycle-actions

import crypto from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./browser-health";
import { ID, TAG, TODAY, consoleApi, list, liveOnly, seed, sessionValue, signIn } from "./live";

liveOnly();
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function open(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
}

/** The action block of one record, by its id. */
const row = (page: Page, id: string) => page.locator(`[data-row-actions="${id}"]`);

async function click(scope: Locator, label: string) {
  await scope.getByRole("button", { name: label, exact: true }).click();
}

async function expectAccepted(scope: Locator, status: string) {
  await expect(scope.getByRole("status")).toContainText(`now ${status}`, { timeout: 15_000 });
}

test("obligation: schedule, mark due, start work and mark satisfied", async ({ page, request }) => {
  const created = await seed(request, "obligation-tracking-svc", "/v1/obligations", {
    legal_entity_id: ID.entity,
    created_by: ID.principal,
    source_type: "CONTRACT",
    source_id: crypto.randomUUID(),
    title: `zv obligation ${TAG}`,
    obligation_type: "CONTRACTUAL",
    risk_level: "LOW",
    due_date: "2026-12-31",
    effective_from: TODAY,
  });
  expect(created.status).toBe(201);
  const id = String((created.json?.obligation as Record<string, unknown> | undefined)?.obligation_id ?? created.json?.obligation_id);

  await open(page, "/admin/legal");
  let actions = row(page, id);
  // PLANNED offers Schedule and Supersede only.
  await expect(actions.getByRole("button", { name: "Mark due", exact: true })).toHaveCount(0);
  await click(actions, "Schedule");
  // A required field left blank is refused before anything is sent.
  await actions.getByRole("form", { name: "Schedule" }).getByRole("button", { name: "Schedule" }).click();
  await expect(actions.getByRole("alert")).toContainText("Trigger is required");
  await actions.getByLabel(/^\s*Trigger/).fill("Contract signature");
  await actions.getByLabel(/How the due date is calculated/).fill("Fixed date");
  await actions.getByRole("form", { name: "Schedule" }).getByRole("button", { name: "Schedule" }).click();
  await expectAccepted(actions, "ACTIVE");

  for (const [label, status] of [["Mark due", "DUE"], ["Start work", "IN_PROGRESS"]] as const) {
    await open(page, "/admin/legal");
    actions = row(page, id);
    await click(actions, label);
    await expectAccepted(actions, status);
  }

  await open(page, "/admin/legal");
  actions = row(page, id);
  await click(actions, "Mark satisfied");
  // Irreversible: the first click only arms it.
  await expect(actions.getByRole("button", { name: "Confirm mark satisfied" })).toBeVisible();
  await click(actions, "Confirm mark satisfied");
  await expectAccepted(actions, "SATISFIED");

  // The service holds the new status; a settled obligation offers nothing more.
  await open(page, "/admin/legal");
  await expect(row(page, id)).toHaveCount(0);
});

test("forecast: submit, approval refused to the submitter, approved by a second principal", async ({ page, context, request }) => {
  const created = await seed(request, "forecasting-svc", "/v1/forecasts/generate", {
    legal_entity_id: ID.entity,
    model_name: `zv lifecycle ${TAG}`,
    domain: "CASH_FLOW",
    historical_data: [1, 2, 3, 4, 5, 6],
    historical_start_date: "2026-01-01",
  });
  expect(created.status).toBe(201);
  const id = String(created.json?.id);

  await open(page, "/admin/intelligence");
  let actions = row(page, id);
  await click(actions, "Submit for review");
  await expectAccepted(actions, "REVIEWED");

  // The same principal may not approve what it submitted: the service's 403 is shown.
  await expect(actions.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await click(actions, "Approve");
  await expect(actions.getByRole("alert")).toContainText("HTTP 403");

  await context.clearCookies();
  await signIn(context, sessionValue(ID.principal2));
  await open(page, "/admin/intelligence");
  actions = row(page, id);
  await click(actions, "Approve");
  await expectAccepted(actions, "APPROVED");
});

test("recommendation: reject needs a reason and is recorded", async ({ page, request }) => {
  const created = await seed(request, "decision-support-svc", "/v1/recommendations", {
    legal_entity_id: ID.entity,
    subject_type: "VENDOR",
    subject_reference: `zv-${TAG}`,
    action_type: "APPROVE_VENDOR",
    oversight_class: "O1",
  });
  expect(created.status).toBe(201);
  const id = String(created.json?.recommendation_id);

  await open(page, "/admin/intelligence");
  const actions = row(page, id);
  await click(actions, "Reject");
  await actions.getByLabel(/^\s*Reason/).fill(`not supported by evidence ${TAG}`);
  await actions.getByRole("form", { name: "Reject" }).getByRole("button", { name: "Reject" }).click();
  await expectAccepted(actions, "REJECTED");

  const after = await consoleApi(request, "GET", "intelligence/recommendations");
  expect(list(after.json, "recommendations").find((r) => r.recommendation_id === id)?.status).toBe("REJECTED");
});

test("compliance gap: recorded through the form and resolved", async ({ page }) => {
  await open(page, "/admin/compliance");
  await page.getByRole("button", { name: "Record a compliance gap" }).click();
  const form = page.getByRole("form", { name: "Record a compliance gap" });
  const jurisdiction = form.getByLabel(/^\s*Jurisdiction/);
  const options = await jurisdiction.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  test.skip(options.length === 0, "the jurisdiction register has no entries on this stack");
  await jurisdiction.selectOption(options[0]);
  await form.getByLabel(/^\s*Compliance domain/).fill("TAX");
  await form.getByLabel(/^\s*Gap type/).fill(`MISSING_FILING_${TAG}`);
  await form.getByRole("button", { name: "Record gap" }).click();
  await expect(page.getByText("compliance-status-svc recorded it.")).toBeVisible({ timeout: 15_000 });

  await open(page, "/admin/compliance");
  const gapRow = page.getByRole("row").filter({ hasText: `MISSING_FILING_${TAG}` });
  await expect(gapRow).toHaveCount(1);
  const actions = gapRow.locator("[data-row-actions]");
  await click(actions, "Resolve");
  await actions.getByLabel(/Remediation notes/).fill("Filed late; penalty accepted.");
  await actions.getByRole("form", { name: "Resolve" }).getByRole("button", { name: "Resolve" }).click();
  await expectAccepted(actions, "RESOLVED");

  // Another tenant sees none of it.
  await page.context().clearCookies();
  await signIn(page.context(), sessionValue(ID.principal, ID.otherTenant, ID.otherEntity));
  await open(page, "/admin/compliance");
  await expect(page.getByText(`MISSING_FILING_${TAG}`)).toHaveCount(0);
});

test("bridge: a refused submit shows the service's reason", async ({ page, request }) => {
  const created = await seed(request, "connectivity-api-bridge-svc", "/v1/bridges", {
    legal_entity_id: ID.entity,
    bridge_name: `zv bridge ${TAG}`,
    provider_name: "Acme",
    protocol: "REST",
    endpoint_url: "https://api.example.com",
    auth_type: "OAUTH2",
  });
  expect(created.status).toBe(201);
  const id = String(created.json?.bridge_id);

  await open(page, "/admin/integration");
  const actions = row(page, id);
  await click(actions, "Submit for approval");
  // The bridge has no purpose configured; connectivity-api-bridge-svc refuses and says why.
  await expect(actions.getByRole("alert")).toContainText("HTTP 400");
  await expect(actions.getByRole("alert")).toContainText(/purpose/i);
});
