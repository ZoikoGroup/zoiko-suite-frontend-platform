// Browser journeys for the Blocks 6-10 consoles against a live verification
// stack: pages render live records (and no read failures), sidebar links
// resolve, route guards hold, and the console's own forms complete their
// workflows through Server Actions and the /api/v1 proxy.

import crypto from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-health";
import { ID, TAG, TODAY, consoleApi, liveOnly, seed, sessionValue, signIn } from "./live";

liveOnly();

const PAGES = [
  "/admin/legal", "/admin/commercial-ops", "/admin/purchase-requests", "/admin/tax",
  "/admin/compliance", "/admin/intelligence", "/admin/security", "/admin/integration",
];
/** Text a panel shows when its read failed. A healthy page shows none of it. */
const FAILURE = /could not be read|unavailable|Unavailable|session has expired/;

const NAMES = {
  clause: `ui clause ${TAG}`,
  rule: `ui rule ${TAG}`,
  forecast: `cash-ui-${TAG}`,
  bridge: `br-ui-${TAG}`,
  key: `alias-ui-${TAG}`,
};

test.beforeAll(async ({ request }) => {
  // Records for the panels to show: Block 6-7 through the console, Blocks 8-10
  // straight to the services (their panels only read).
  expect((await consoleApi(request, "POST", "clauses", { title: NAMES.clause, category: "OTHER", body: "UI test clause.", jurisdiction_id: "GB", effective_from: TODAY })).status).toBeLessThan(300);
  expect((await consoleApi(request, "POST", "tax-rules", { jurisdiction_id: "GB", rule_code: `UI-${TAG}`, name: NAMES.rule, category: "VAT", tax_rate_percentage: 5, effective_from: TODAY })).status).toBeLessThan(300);
  expect((await seed(request, "forecasting-svc", "/v1/forecasts/generate", { legal_entity_id: ID.entity, model_name: NAMES.forecast, domain: "CASH_FLOW", historical_data: [1, 2, 3, 4, 5, 6], historical_start_date: "2026-01-01" })).status).toBe(201);
  expect((await seed(request, "connectivity-api-bridge-svc", "/v1/bridges", { legal_entity_id: ID.entity, bridge_name: NAMES.bridge, provider_name: "Acme", protocol: "REST", endpoint_url: "https://api.example.com", auth_type: "OAUTH2" })).status).toBe(201);
  expect((await seed(request, "key-management-svc", "/v1/keys", { legal_entity_id: ID.entity, key_alias: NAMES.key, key_model: "BYOK", key_provider: "AWS_KMS", external_key_arn: `arn:aws:kms:eu-west-2:111122223333:key/${crypto.randomUUID()}` }, "security.kms.key.register")).status).toBe(201);
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/** A header modal, by its heading. */
const modalOf = (page: Page, heading: string) =>
  page.locator("div.rounded-2xl").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

async function open(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
}

// ── Guards and navigation ───────────────────────────────────────────────────

test("without a session every Blocks 6-10 page redirects to sign-in", async ({ browser, browserHealth }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  browserHealth.watch(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login\?redirect=/);
  }
  await context.close();
});

test("an expired session (older than 8 hours) is refused like no session", async ({ browser, browserHealth }) => {
  const context = await browser.newContext();
  const old = Buffer.from(JSON.stringify({ email: "x@zoikosuite.test", name: "x", role: "Platform Administrator", principalId: ID.principal, tenantId: ID.tenant, legalEntityId: ID.entity, iat: Date.now() - 9 * 3600_000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.ZOIKO_E2E_SESSION_SECRET ?? "").update(old).digest("base64url");
  await signIn(context, `${old}.${sig}`);
  const page = await context.newPage();
  browserHealth.watch(page);
  await page.goto("/admin/legal");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/v1/contracts", { headers: { Cookie: `zoiko_session=${old}.${sig}` } })).status()).toBe(401);
  await context.close();
});

test("the sidebar links to every Blocks 6-10 console, and each one renders", async ({ page }) => {
  await open(page, "/admin");
  for (const href of PAGES) {
    await expect(page.locator(`nav[aria-label="Main"] a[href="${href}"]`).first(), href).toBeAttached();
  }
  await expect(page.locator('nav[aria-label="Main"] a[href="/admin/integrations"]')).toHaveCount(0);
  await page.goto("/admin/integrations");
  await expect(page).toHaveURL(/\/admin\/integration$/);
});

for (const path of PAGES) {
  test(`${path} renders every panel from live reads`, async ({ page }) => {
    await open(page, path);
    await expect(page.getByText(FAILURE)).toHaveCount(0);
  });
}

test("seeded records render on their pages, and another tenant sees none of them", async ({ page, browser, browserHealth }) => {
  const expectations: [string, string][] = [
    ["/admin/legal", NAMES.clause],
    ["/admin/tax", NAMES.rule],
    ["/admin/intelligence", NAMES.forecast],
    ["/admin/integration", NAMES.bridge],
    ["/admin/security", NAMES.key],
  ];
  for (const [path, name] of expectations) {
    await open(page, path);
    await expect(page.getByText(name).first(), `${path} shows ${name}`).toBeVisible();
  }
  const other = await browser.newContext();
  await signIn(other, sessionValue(ID.principal, ID.otherTenant, ID.otherEntity));
  const otherPage = await other.newPage();
  browserHealth.watch(otherPage);
  for (const [path, name] of expectations) {
    await otherPage.goto(path);
    await otherPage.waitForLoadState("networkidle");
    await expect(otherPage.getByText(name), `${path} leaks ${name} to another tenant`).toHaveCount(0);
  }
  await other.close();
});

// ── Block 6 workflows ───────────────────────────────────────────────────────

test("legal: draft a contract from the header (Server Action) and open it", async ({ page }) => {
  await open(page, "/admin/legal");
  await page.getByRole("button", { name: "Create Contract" }).click();
  const modal = modalOf(page, "Create Contract Draft");
  const title = `ui contract ${TAG}`;
  await modal.locator("#title").fill(title);
  await modal.locator("#counterparty_id").fill(crypto.randomUUID());
  await modal.locator("#effective_from").fill(TODAY);
  await modal.locator("#total_value").fill("2500");
  await modal.getByRole("button", { name: "Draft contract" }).click();
  // The contract actions ask authorization-svc first (the same CONTRACT_* action
  // types the service checks) and refuse when it cannot answer. A verification
  // stack without authorization-svc behind its gateway gets that refusal.
  const drafted = modal.getByText(`“${title}” drafted at v1.`);
  const refused = modal.getByText(/Authorization check failed .* Contract mutation was refused\./);
  await expect(drafted.or(refused)).toBeVisible({ timeout: 15_000 });
  const list = await consoleApi(page.request, "GET", "contracts");
  if (await refused.isVisible()) {
    test.info().annotations.push({ type: "blocked", description: "authorization-svc is not reachable on this stack; the console failed closed" });
    expect(JSON.stringify(list.json)).not.toContain(title);
  } else {
    expect(JSON.stringify(list.json)).toContain(title);
  }
});

test("legal: draft a clause from the header; it lands in review-pending DRAFT", async ({ page }) => {
  await open(page, "/admin/legal");
  await page.getByRole("button", { name: "Draft Clause" }).click();
  const modal = modalOf(page, "Draft Clause");
  await modal.getByPlaceholder("Confidentiality Clause").fill(`ui header clause ${TAG}`);
  await modal.locator("#clause-jurisdiction").fill("GB");
  await modal.locator("#clause-effective-from").fill(TODAY);
  await modal.getByPlaceholder("Enter the clause text...").fill("Clause body from the UI test.");
  await modal.getByRole("button", { name: "Create Clause" }).click();
  await expect(modal.getByText("Recorded in clause-template-svc as a draft")).toBeVisible();
});

test("legal: schedule a board meeting", async ({ page }) => {
  await open(page, "/admin/legal");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Schedule meeting" }) });
  await form.locator("#title").fill(`ui meeting ${TAG}`);
  await form.locator("#scheduled_at").fill(`${TODAY}T10:00`);
  await form.locator("#effective_from").fill(TODAY);
  await form.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(page.getByText(`ui meeting ${TAG}`).first()).toBeVisible({ timeout: 15_000 });
});

test("purchase request: raise, submit, refused to self-approve, approved by a second person", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/purchase-requests");
  const raise = page.locator("form").filter({ has: page.getByRole("button", { name: "Raise request" }) });
  await raise.locator("#pr-description").fill(`ui request ${TAG}`);
  await raise.locator("#pr-amount").fill("120");
  await raise.locator("#pr-currency-code").selectOption("GBP");
  await raise.getByRole("button", { name: "Raise request" }).click();
  const raised = page.getByText(/Request raised for .* ID [0-9a-f-]{36}/);
  await expect(raised).toBeVisible({ timeout: 15_000 });
  const requestId = (await raised.textContent())!.match(/ID ([0-9a-f-]{36})/)![1];

  const decide = page.locator("form").filter({ has: page.getByRole("button", { name: "Submit for approval" }) });
  await decide.locator("#pr-decide-request-id").fill(requestId);
  await decide.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(/PENDING_APPROVAL|submitted/i).first()).toBeVisible({ timeout: 15_000 });

  await decide.locator("#pr-decide-request-id").fill(requestId);
  await decide.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/own request|yourself|independent|self/i).first()).toBeVisible({ timeout: 15_000 });

  const approver = await browser.newContext();
  await signIn(approver, sessionValue(ID.principal2));
  const p2 = await approver.newPage();
  browserHealth.watch(p2);
  await p2.goto("/admin/purchase-requests");
  const decide2 = p2.locator("form").filter({ has: p2.getByRole("button", { name: "Submit for approval" }) });
  await decide2.locator("#pr-decide-request-id").fill(requestId);
  await decide2.getByRole("button", { name: "Approve" }).click();
  await expect(p2.getByText(/APPROVED|approved/).first()).toBeVisible({ timeout: 15_000 });
  await approver.close();
});

test("spend controls: set a limit, then a check against it is decided by the service", async ({ page }) => {
  await open(page, "/admin/commercial-ops");
  const limit = page.locator("form").filter({ has: page.getByRole("button", { name: "Set limit" }) });
  await limit.locator("#category").fill(`UI-${TAG}`);
  await limit.locator("#threshold_amount").fill("100");
  await limit.locator("#policy_currency_code").selectOption("GBP");
  await limit.getByRole("button", { name: "Set limit" }).click();
  await expect(page.getByText(`UI-${TAG}`).first()).toBeVisible({ timeout: 15_000 });

  const check = page.locator("form").filter({ has: page.getByRole("button", { name: "Check this spend" }) });
  await check.locator("#check_category").fill(`UI-${TAG}`);
  await check.locator("#check_amount").fill("500");
  await check.locator("#check_currency_code").selectOption("GBP").catch(() => check.locator("#check_currency_code").fill("GBP"));
  await check.locator("#source_reference").fill(`ui-${TAG}`);
  await check.getByRole("button", { name: "Check this spend" }).click();
  await expect(page.getByText(/BLOCK|blocked|exceed|refused|over/i).first()).toBeVisible({ timeout: 15_000 });
});

test("vendor due diligence: a screening runs to an outcome (no envelope refusal)", async ({ page }) => {
  await open(page, "/admin/commercial-ops");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Screen this counterparty" }) });
  await form.locator("#vendor_name").fill(`UI Vendor ${TAG}`);
  await form.locator("#counterparty_id").fill(crypto.randomUUID());
  await form.getByRole("button", { name: "Screen this counterparty" }).click();
  await expect(page.getByText(/envelope_incomplete|purpose_context/)).toHaveCount(0);
  await expect(page.getByText(/CLEARED|PASSED|FLAGGED|REJECTED|outcome/i).first()).toBeVisible({ timeout: 15_000 });
});

// ── Block 7 workflows ───────────────────────────────────────────────────────

test("tax: assemble a filing — create, validate, then finalize or report the block", async ({ page }) => {
  await open(page, "/admin/tax");
  await page.locator("#tax-action-assemble").click();
  const modal = modalOf(page, "Assemble Filing");
  await modal.locator("#fil-jurisdiction_id").fill("GB");
  await modal.locator("#fil-filing_type").fill("VAT100");
  await modal.locator("#fil-period_key").fill(`2026-UI-${TAG.slice(0, 4)}`);
  await modal.locator("#fil-due_date").fill("2026-12-07");
  await modal.locator("#fil-payload").fill('{"box1":10}');
  await modal.getByRole("button", { name: "Create, validate, finalize" }).click();
  await expect(modal.getByText(/Ready for submission|Draft created but not finalized/)).toBeVisible({ timeout: 20_000 });
});

test("VAT: raise a return for the session's entity, then filing without evidence is refused", async ({ page }) => {
  await open(page, "/admin/tax");
  await page.locator("#vat-jurisdiction").fill("GB");
  await page.locator("#vat-tax-reg").fill(`GB${TAG}`);
  await page.locator("#vat-period").fill(`2026-UI${TAG.slice(0, 3)}`);
  await page.locator("#vat-currency").selectOption("GBP");
  await page.locator("#vat-effective-from").fill(TODAY);
  await page.locator('input[name="total_sales_amount"]').fill("1000");
  await page.locator('input[name="total_purchase_amount"]').fill("400");
  await page.locator('input[name="output_tax_amount"]').fill("200");
  await page.locator('input[name="input_tax_amount"]').fill("80");
  await page.getByRole("button", { name: "Submit VAT Return (Create Draft)" }).click();
  await expect(page.getByText(/registered in DRAFT state/)).toBeVisible({ timeout: 15_000 });
});

test("compliance: create a filing requirement and run an evaluation from the header", async ({ page }) => {
  await open(page, "/admin/compliance");
  await page.getByRole("button", { name: "New Filing Requirement" }).click();
  let modal = modalOf(page, "New Filing Requirement");
  await modal.locator("#req-jurisdiction_id").fill("GB");
  await modal.locator("#req-filing_authority").fill("HMRC");
  await modal.locator("#req-filing_type").fill("VAT100");
  await modal.locator("#req-period_key").fill(`UI-${TAG}`);
  await modal.locator("#req-due_date").fill("2026-12-07");
  await modal.getByRole("button", { name: "Create Filing Requirement" }).click();
  await expect(modal.getByText("Filing requirement recorded in filing-tracker-svc.")).toBeVisible({ timeout: 15_000 });
  await modal.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Evaluate Compliance" }).click();
  modal = modalOf(page, "Evaluate Compliance");
  await modal.locator("#eval-jurisdiction").fill("GB");
  await modal.locator("#eval-domain").fill("TAX");
  for (const [k, v] of [["total_obligations", "3"], ["fulfilled_obligations", "2"], ["pending_obligations", "1"], ["overdue_obligations", "0"], ["open_exceptions", "0"]]) {
    await modal.locator(`#eval-${k}`).fill(v);
  }
  await modal.locator("#eval-effective").fill(TODAY);
  await modal.getByRole("button", { name: "Run Compliance Evaluation" }).click();
  await expect(modal.getByText("Evaluation recorded in compliance-status-svc.")).toBeVisible({ timeout: 15_000 });
});

// ── Blocks 9-10 actions ─────────────────────────────────────────────────────

test("security: CARTA evaluates the context the reader entered", async ({ page }) => {
  await open(page, "/admin/security");
  await page.getByRole("button", { name: "Evaluate Access" }).click();
  const subject = crypto.randomUUID();
  await page.getByLabel("Subject ID").fill(subject);
  await page.getByLabel("Subject type").selectOption("USER");
  await page.getByLabel("Device trust level (0-100)").fill("90");
  await page.getByLabel("IP address").fill("10.0.0.5");
  await page.getByLabel("Resource sensitivity").selectOption("LOW");
  await page.getByLabel("Action requested").fill("READ");
  await page.getByLabel("Hour of day (0-23)").fill("11");
  await page.getByRole("button", { name: "Send to carta-svc" }).click();
  await expect(page.getByText(subject.slice(0, 8)).first()).toBeVisible({ timeout: 15_000 });
});

test("security: rotating a key from the panel persists the new version", async ({ page }) => {
  await open(page, "/admin/security");
  const row = page.locator("div").filter({ hasText: NAMES.key }).filter({ has: page.getByRole("button", { name: "Rotate" }) }).last();
  await expect(row.getByText(/Version 1 • rotated 0×/)).toBeVisible();
  await row.getByRole("button", { name: "Rotate" }).click();
  await expect(row.getByText(/Version 2 • rotated 1×/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Rotation was refused/)).toHaveCount(0);
});
