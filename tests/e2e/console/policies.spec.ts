import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

// /admin/policies — Policies & Controls — against the live stack (see
// playwright.console.config.ts for what must be running: identity, the
// authorization chain and policy-svc). Every write goes through the page's
// own forms, as a person would, and is read back from the register.

const ADMIN = { email: "admin@zoikosuite.com", password: "Zoiko@Governance1" } as const;

const P = "/admin/policies";
const RUN = randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
const PAGE_ERROR = /This page couldn.t load|server error occurred|Application error|Internal Server Error/i;

async function signIn(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(\/|\?|$)/, { timeout: 60_000, waitUntil: "commit" });
  return page;
}

async function open(page: Page, path: string): Promise<string> {
  await page.goto(path, { waitUntil: "networkidle", timeout: 90_000 });
  const body = await page.locator("body").innerText();
  expect(body, `${path} rendered an error page`).not.toMatch(PAGE_ERROR);
  return body;
}

/** The form's own result banner, once the submit has finished. */
async function result(page: Page, form: string): Promise<string> {
  const banner = page.locator(`${form} [role="status"]`).filter({ hasText: /\S/ });
  await expect(banner.first()).toBeVisible({ timeout: 60_000 });
  return (await banner.first().innerText()).replace(/\s+/g, " ").trim();
}

test.describe.configure({ mode: "serial" });

test.describe("Policies & Controls (live)", () => {
  let page: Page;
  const CODE = `CT-E2E-${RUN}`;

  test.beforeAll(async ({ browser }) => {
    page = await signIn(browser);
    const body = await open(page, P);
    test.skip(/policy service is not running|could not be reached/i.test(body), "policy-svc is not reachable from this console");
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test("KPIs, panels, register and drawer render from live data", async () => {
    await open(page, P);
    await expect(page.locator("h1", { hasText: "Policies & Controls" })).toBeVisible();
    for (const label of ["Total Policies", "Total Controls", "Compliant Controls", "Control Issues", "Review Overdue"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    for (const title of ["Control Effectiveness by Domain", "Policies by Status", "Control Reviews"]) {
      await expect(page.locator("h2", { hasText: title })).toBeVisible();
    }
    for (const h of ["Policy / Control ID", "Title", "Domain", "Type", "Status", "Effectiveness", "Owner", "Next Review"]) {
      await expect(page.locator("th", { hasText: h }).first()).toBeVisible();
    }
    // The first row opens in the drawer, with its four sections.
    const drawer = page.locator('aside[aria-label="Policy / Control Details"]');
    await expect(drawer).toBeVisible();
    for (const pane of ["Overview", "Requirements", "Evidence", "History"]) {
      await expect(drawer.getByRole("link", { name: pane, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/^Showing 1–\d+ of \d+$/)).toBeVisible();
  });

  test("define a control test through New Policy / Control", async () => {
    await open(page, `${P}?new=control`);
    await page.fill("#ct_control_ref", `FIN-E2E-${RUN}`);
    await page.fill("#ct_test_code", CODE);
    await page.selectOption("#ct_frequency", "QUARTERLY");
    await page.fill("#ct_title", `E2E control ${RUN}`);
    await page.fill("#ct_methodology", "Re-perform on a sample and trace each item to its approval record.");
    await page.click('button:has-text("Define control test")');
    expect(await result(page, "form:has(#ct_test_code)")).toMatch(new RegExp(`Control test ${CODE} is defined`));

    const body = await open(page, `${P}?type=control&q=${CODE}`);
    expect(body).toContain(CODE);
    expect(body).toMatch(/Finance & Tax/);
    expect(body).toMatch(/Not Tested/);
  });

  test("record a test result and read the effectiveness back", async () => {
    await open(page, `${P}?type=control&q=${CODE}`);
    await page.click(`a:has-text("${CODE}")`);
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    url.searchParams.set("pane", "evidence");
    await open(page, url.pathname + url.search);
    await page.fill("#ex_from", "2026-07-01");
    await page.fill("#ex_to", "2026-09-30");
    await page.selectOption("#ex_result", "NOT_EFFECTIVE");
    await page.click('button:has-text("Record test result")');
    expect(await result(page, "form:has(#ex_result)")).toMatch(/Test result NOT_EFFECTIVE recorded/);

    const body = await open(page, `${P}?type=control&q=${CODE}&eff=issues`);
    expect(body).toContain(CODE);
    expect(body).toMatch(/Ineffective/);
  });

  test("filters and export", async () => {
    const policies = await open(page, `${P}?type=policy`);
    expect(policies).not.toContain(CODE);
    const r = await page.context().request.get(`${P}/export?type=control&q=${CODE}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/text\/csv/);
    const csv = await r.text();
    expect(csv.split("\r\n")[0]).toContain("ID,Record ID,Kind,Title,Domain");
    expect(csv).toContain(CODE);
  });

  test("empty states say so", async () => {
    const empty = await open(page, `${P}?q=NO-SUCH-RECORD-${RUN}`);
    expect(empty).toMatch(/No policy or control matches these filters\./);
  });
});
