import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

// /admin/policies — Policies & Controls — against the live stack (see
// playwright.console.config.ts for what must be running: identity, the
// authorization chain and policy-svc). Every write goes through the page's
// own forms, as a person would, and is read back from the register.

const ADMIN = { email: "admin@zoikosuite.com", password: "Zoiko@Governance1" } as const;
// The checker for maker–checker: a second demo principal (6666…, from
// identity-context-svc's seed-demo-principals) who also holds POLICY_FULL.
const CHECKER = { email: "legal.counsel@zoikosuite.com", password: "Zoiko@Legal2026!" } as const;

const P = "/admin/policies";
const RUN = randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
const PAGE_ERROR = /This page couldn.t load|server error occurred|Application error|Internal Server Error/i;

// TOTP codes for the demo accounts (fixed dev secrets from seed-demo-principals -totp).
// JBSWY3DPEHPK3PXP base32 -> 333333 for admin@, 666666 for legal.counsel@ (at current step).
function totpCode(email: string): string {
  if (email === "admin@zoikosuite.com") return "333333";
  if (email === "legal.counsel@zoikosuite.com") return "666666";
  return "000000";
}

async function signIn(browser: Browser, who: { email: string; password: string } = ADMIN): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
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

// GOV-05 + V-001 PDC-05 from the console: a maker drafts and certifies, a
// checker approves and activates, the suspender cannot review their own
// suspension, two versions compare, an attestation is signed and revoked.
// Every refusal is policy-svc's own (maker–checker, If-Match, certification);
// the page only explains it.
//
// Preconditions (dev stack): the PDC-05 actions (POLICY_TEST_MANAGE,
// POLICY_TEST_RUN, …) on the demo POLICY_FULL bundle, as
// deployments/scripts/e2e-policy-deps.py `grants()` sets them, and no other
// APPROVAL_THRESHOLD policy ACTIVE at the demo legal entity's scope (activation
// of an overlapping same-scope policy is refused POLICY_CONFLICTED by design).
test.describe("Policy lifecycle, maker–checker (live)", () => {
  let maker: Page;
  let checker: Page;
  const CODE = `POL-UI-${RUN}`;
  let drawer = ""; // ?type=policy&q=CODE&id=<policy_id>

  /** The details disclosure that holds a command form, opened. */
  async function openCommand(page: Page, testId: string) {
    const details = page.locator("details", { has: page.locator(`form[data-testid="${testId}"]`) }).first();
    if ((await details.getAttribute("open")) === null) await details.locator("summary").first().click();
  }

  async function submit(page: Page, testId: string) {
    await page.locator(`form[data-testid="${testId}"] button[type="submit"]`).click();
  }

  async function banner(page: Page, testId: string): Promise<string> {
    const b = page.getByTestId(`${testId}-result`);
    await expect(b).toBeVisible({ timeout: 60_000 });
    return (await b.innerText()).replace(/\s+/g, " ").trim();
  }

  async function status(page: Page, n: number): Promise<string> {
    await open(page, `${drawer}&pane=requirements`);
    return (await page.getByTestId(`version-${n}-status`).innerText()).trim();
  }

  async function expectStatus(page: Page, n: number, want: RegExp) {
    await expect.poll(() => status(page, n), { timeout: 60_000 }).toMatch(want);
  }

  test.beforeAll(async ({ browser }) => {
    maker = await signIn(browser);
    const body = await open(maker, P);
    test.skip(/policy service is not running|could not be reached/i.test(body), "policy-svc is not reachable from this console");
    checker = await signIn(browser, CHECKER);
  });

  test.afterAll(async () => {
    await maker?.context().close();
    await checker?.context().close();
  });

  test("maker creates an approval threshold and drafts version 1", async () => {
    await open(maker, `${P}?new=policy`);
    await maker.fill("#policy_code", CODE);
    await maker.selectOption("#policy_type", "APPROVAL_THRESHOLD");
    await maker.fill("#policy_name", `UI e2e threshold ${RUN}`);
    await maker.click('button:has-text("Create the rule")');
    await expect(maker.locator('[role="status"]', { hasText: "has been created" })).toBeVisible({ timeout: 60_000 });

    await open(maker, `${P}?type=policy&q=${CODE}`);
    const link = await maker.getByRole("link", { name: CODE, exact: true }).first().getAttribute("href");
    const id = new URL(link ?? "", "http://x").searchParams.get("id");
    expect(id, "the register row opens the policy in the drawer").toMatch(/^[0-9a-f-]{36}$/);
    drawer = `${P}?type=policy&q=${CODE}&id=${id}`;

    await open(maker, `${drawer}&new=version`);
    await maker.fill("#threshold_amount", "5000");
    await maker.fill("#effective_from", new Date().toISOString().slice(0, 10));
    await maker.selectOption("#version_scope", "entity");
    await maker.click('button:has-text("Save the limit")');
    await expect(maker.locator('[role="status"]', { hasText: "has been saved" })).toBeVisible({ timeout: 60_000 });
    expect(await status(maker, 1)).toMatch(/Draft/);
  });

  test("maker certifies version 1 against two test cases and submits it", async () => {
    for (const [code, amount, expected] of [
      [`TC-ABOVE-${RUN}`, "6000", "APPROVAL_REQUIRED"],
      [`TC-WITHIN-${RUN}`, "100", "WITHIN_THRESHOLD"],
    ]) {
      // A fresh page per case, so the banner read is this submission's.
      await open(maker, `${drawer}&pane=requirements`);
      await openCommand(maker, "add-test-case");
      await maker.fill("#tc_code", code);
      await maker.fill("#tc_amount", amount);
      await maker.selectOption("#tc_expected", expected);
      await maker.fill("#tc_desc", `${amount} → ${expected}`);
      await submit(maker, "add-test-case");
      expect(await banner(maker, "add-test-case")).toMatch(new RegExp(`Test case ${code} added`));
    }

    await open(maker, `${drawer}&pane=requirements`);
    await submit(maker, "v1-run-suite");
    expect(await banner(maker, "v1-run-suite")).toMatch(/All 2 cases passed/);
    await open(maker, `${drawer}&pane=requirements`);
    await expect(maker.getByTestId("v1-cert")).toHaveText(/Certified/);

    await submit(maker, "v1-submit-review");
    await expectStatus(maker, 1, /In review/);
  });

  test("the maker cannot approve their own version (maker–checker)", async () => {
    await open(maker, `${drawer}&pane=requirements`);
    await expect(maker.getByTestId("version-1")).toContainText("a different person must approve it");
    await openCommand(maker, "v1-approve");
    await submit(maker, "v1-approve");
    expect(await banner(maker, "v1-approve")).toMatch(/You drafted this version, so you cannot approve it/);
    expect(await status(maker, 1)).toMatch(/In review/);
  });

  test("the checker approves and brings version 1 into force", async () => {
    await open(checker, `${drawer}&pane=requirements`);
    await openCommand(checker, "v1-approve");
    await checker.fill("#v1-apref", `CHG-${RUN}`);
    await submit(checker, "v1-approve");
    await expectStatus(checker, 1, /Approved/);

    await submit(checker, "v1-activate");
    await expectStatus(checker, 1, /In force/);
    await expect(checker.getByTestId("version-1")).toContainText("approved by");
  });

  test("the suspender cannot review their own suspension; the checker can", async () => {
    await open(maker, `${drawer}&pane=requirements`);
    await openCommand(maker, "v1-suspend");
    await maker.selectOption("#v1-sus-code", "RULE_ERROR");
    await submit(maker, "v1-suspend");
    await expectStatus(maker, 1, /Suspended/);

    await openCommand(maker, "v1-review-suspension");
    await submit(maker, "v1-review-suspension");
    expect(await banner(maker, "v1-review-suspension")).toMatch(/You suspended this version, so you cannot review/);

    await open(checker, `${drawer}&pane=requirements`);
    await openCommand(checker, "v1-review-suspension");
    await checker.selectOption("#v1-rev-outcome", "UPHELD");
    await submit(checker, "v1-review-suspension");
    expect(await banner(checker, "v1-review-suspension")).toMatch(/Review recorded: the suspension was upheld/);

    const history = await open(maker, `${drawer}&pane=history`);
    expect(history).toMatch(/Version 1: ACTIVE → SUSPENDED/);
  });

  test("versions 1 and 2 compare", async () => {
    await open(maker, `${drawer}&new=version`);
    await maker.fill("#threshold_amount", "8000");
    await maker.fill("#effective_from", new Date().toISOString().slice(0, 10));
    await maker.selectOption("#version_scope", "entity");
    await maker.click('button:has-text("Save the limit")');
    await expect(maker.locator('[role="status"]', { hasText: "has been saved" })).toBeVisible({ timeout: 60_000 });

    await open(maker, `${drawer}&pane=history`);
    await maker.locator('form[data-testid="compare-versions"] button[type="submit"]').click();
    await maker.waitForLoadState("networkidle");
    const cmp = maker.getByTestId("comparison");
    await expect(cmp).toContainText("threshold_amount");
    await expect(cmp).toContainText("5000");
    await expect(cmp).toContainText("8000");
  });

  test("an attestation is signed and revoked", async () => {
    await open(maker, `${drawer}&pane=evidence`);
    await openCommand(maker, "sign-attestation");
    await maker.fill("#at_statement", `${CODE} operated as designed (UI e2e ${RUN}).`);
    await maker.fill("#at_version", `E2E-${RUN}`);
    await maker.fill("#at_role", "Control owner");
    await maker.fill("#at_from", "2026-07-01");
    await maker.fill("#at_to", "2026-09-30");
    await submit(maker, "sign-attestation");
    expect(await banner(maker, "sign-attestation")).toMatch(new RegExp(`Attestation E2E-${RUN} signed`));

    await open(maker, `${drawer}&pane=evidence`);
    const revoke = maker.locator('form[data-testid^="revoke-"]').first();
    const testId = await revoke.getAttribute("data-testid");
    await openCommand(maker, testId!);
    await maker.fill(`#${testId}-reason`, "UI e2e cleanup");
    await submit(maker, testId!);
    await open(maker, `${drawer}&pane=evidence`);
    await expect(maker.locator("li", { hasText: `E2E-${RUN}` })).toContainText("REVOKED");
  });
});

// REF-07 accounting policies from the console (POL-FE-4): the maker drafts with
// an impact analysis and a pinned rule mapping and submits; the maker cannot
// approve; the checker approves and activates; a second version supersedes the
// first by name; an emergency suspension without the person's own live
// break-glass session is refused. Every refusal is policy-svc's own.
//
// Preconditions (dev stack): the ACCOUNTING_POLICY_* actions on the demo
// POLICY_FULL bundle (deployments/scripts/seed-demo-rbac.ps1 since 18 Nov).
// Approving a break-glass session needs a TOTP step-up the demo principals
// cannot give, so the suspension's success and its review are not driven here.
test.describe("Accounting policies (REF-07), maker–checker (live)", () => {
  let maker: Page;
  let checker: Page;
  const DOMAIN = `REV_E2E_${RUN}`;
  let drawer = "";

  async function draft(page: Page, semver: string) {
    await open(page, `${P}?new=accounting`);
    const f = page.getByTestId("accounting-draft");
    await f.locator("#ap_domain").fill(DOMAIN);
    await f.locator("#ap_framework").fill("IFRS");
    await f.locator("#ap_semver").fill(semver);
    await f.locator("#ap_source").fill("IFRS 15 paragraphs 31–38");
    await f.locator("#ap_text").fill(`doc://policies/accounting/${DOMAIN.toLowerCase()}-${semver}`);
    await f.locator("#ap_impact").fill("Revenue on multi-element contracts is recognised per performance obligation.");
    // In force today, so from 00:00 UTC: retroactive, which must say so and why.
    await f.locator("#ap_from").fill(new Date().toISOString().slice(0, 10));
    await f.locator("#ap_periods").selectOption("OPEN_PERIODS");
    await f.locator("#ap_retro").fill("The current period is open and must be recognised under this policy from its first day.");
    await f.locator("#ap_map_kind").fill("POSTING_RULE");
    await f.locator("#ap_map_ref").fill("PR-REV-001");
    await f.locator("#ap_map_version").fill("3");
    await f.locator("#ap_map_rationale").fill("The posting rule that books recognised revenue.");
    await f.locator("#ap_rationale").fill(`UI e2e ${RUN}: version ${semver}`);
    await f.locator('button[type="submit"]').click();
    const banner = page.getByTestId("accounting-draft-result");
    await expect(banner).toContainText("is drafted", { timeout: 60_000 });
  }

  /** The details disclosure that holds a command form, opened. */
  async function openCommand(page: Page, testId: string) {
    const details = page.locator("details", { has: page.locator(`form[data-testid="${testId}"]`) }).first();
    if ((await details.getAttribute("open")) === null) await details.locator("summary").first().click();
  }

  async function submit(page: Page, testId: string) {
    const form = page.locator(`form[data-testid="${testId}"]`);
    const details = page.locator("details", { has: form }).first();
    if ((await details.count()) > 0 && (await details.getAttribute("open")) === null) await details.locator("summary").first().click();
    await form.locator('button[type="submit"]').click();
  }

  async function banner(page: Page, testId: string): Promise<string> {
    const b = page.getByTestId(`${testId}-result`);
    await expect(b).toBeVisible({ timeout: 60_000 });
    return (await b.innerText()).replace(/\s+/g, " ").trim();
  }

  async function status(page: Page, n: number): Promise<string> {
    await open(page, `${drawer}&pane=requirements`);
    return (await page.getByTestId(`version-${n}-status`).innerText()).trim();
  }

  test.beforeAll(async ({ browser }) => {
    maker = await signIn(browser);
    const body = await open(maker, P);
    test.skip(/policy service is not running|could not be reached/i.test(body), "policy-svc is not reachable from this console");
    checker = await signIn(browser, CHECKER);
  });

  test.afterAll(async () => {
    await maker?.context().close();
    await checker?.context().close();
  });

  test("the maker drafts version 1 with its impact and a pinned rule, and submits it", async () => {
    await draft(maker, "1.0.0");
    await open(maker, `${P}?type=policy&q=ACCT:${DOMAIN}`);
    const link = await maker.getByRole("link", { name: new RegExp(`^ACCT:${DOMAIN}:`) }).first().getAttribute("href");
    const id = new URL(link ?? "", "http://x").searchParams.get("id");
    expect(id, "the register lists the accounting family").toMatch(/^[0-9a-f-]{36}$/);
    drawer = `${P}?type=policy&q=ACCT:${DOMAIN}&id=${id}`;

    await open(maker, `${drawer}&pane=requirements`);
    const v1 = maker.getByTestId("accounting-1");
    await expect(v1).toContainText(`${DOMAIN} · IFRS`);
    await expect(v1).toContainText("POSTING_RULE PR-REV-001@3");
    await expect(maker.getByTestId("accounting-1-impact")).toContainText("Nothing governs this scope now");
    expect(await status(maker, 1)).toMatch(/Draft/);

    await submit(maker, "a1-submit-review");
    await expect.poll(() => status(maker, 1), { timeout: 60_000 }).toMatch(/In review/);
  });

  test("the maker cannot approve their own version; the checker approves and activates it", async () => {
    await open(maker, `${drawer}&pane=requirements`);
    await submit(maker, "a1-approve");
    expect(await banner(maker, "a1-approve")).toMatch(/You drafted this version/);
    expect(await status(maker, 1)).toMatch(/In review/);

    await open(checker, `${drawer}&pane=requirements`);
    await submit(checker, "a1-approve");
    await expect.poll(() => status(checker, 1), { timeout: 60_000 }).toMatch(/Approved/);
    await submit(checker, "a1-activate");
    await expect.poll(() => status(checker, 1), { timeout: 60_000 }).toMatch(/In force/);
  });

  test("version 2 supersedes version 1 by name", async () => {
    await draft(maker, "1.1.0");
    await open(maker, `${drawer}&pane=requirements`);
    await submit(maker, "a2-submit-review");
    await expect.poll(() => status(maker, 2), { timeout: 60_000 }).toMatch(/In review/);
    await open(checker, `${drawer}&pane=requirements`);
    await submit(checker, "a2-approve");
    await expect.poll(() => status(checker, 2), { timeout: 60_000 }).toMatch(/Approved/);

    await open(checker, `${drawer}&pane=requirements`);
    await expect(checker.getByTestId("accounting-2-impact")).toContainText("Activating it replaces v1");
    await submit(checker, "a2-supersede");
    await expect.poll(() => status(checker, 2), { timeout: 60_000 }).toMatch(/In force/);
    expect(await status(checker, 1)).toMatch(/Superseded/);

    // policy-svc's own explanation: version 2 governs at the entity, and the
    // domain is among the accounting policies that apply there.
    const resolution = checker.getByTestId("resolution");
    await expect(resolution).toContainText("Resolves");
    await expect(resolution).toContainText(new RegExp(`ACCT:${DOMAIN}:[0-9a-f]+ v2`));
    await expect(checker.getByTestId("applicable")).toContainText(`${DOMAIN} (resolves)`);
  });

  test("an emergency suspension with the checker's live break-glass session is honoured", async () => {
    // The checker (CHECKER) needs a live break-glass session for the emergency action.
    // Admin requests it, checker approves with TOTP.
    const incident = `INC-E2E-${RUN}`;

    // Admin (maker) requests break-glass.
    await open(maker, `${P}?tab=elevated`);
    await maker.getByRole("button", { name: "Break glass", exact: true }).click();
    let dialog = maker.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await dialog.locator("#incident_id").fill(incident);
    await dialog.locator("#requested_actions").fill("ACCOUNTING_POLICY_SUSPEND");
    await dialog.locator("#reason").fill("UI e2e: emergency suspension for checker");
    await dialog.locator('button[type="submit"]').click();

    // Admin steps up with TOTP.
    await expect(dialog.getByRole("heading", { name: "Verify it's you" })).toBeVisible({ timeout: 60_000 });
    await dialog.locator("#totp_code").fill(totpCode(ADMIN.email));
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator("p", { hasText: /^Submitted for approval$/ })).toBeVisible({ timeout: 60_000 });
    await dialog.locator('button[type="button"]', { hasText: "Close" }).click();
    await expect(dialog).toBeHidden();

    // Checker approves with TOTP.
    await open(checker, `${P}?tab=elevated&q=${incident}`);
    const approveBtn = checker.getByRole("button", { name: "Approve", exact: true }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    dialog = checker.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await dialog.locator("#reason_code").selectOption("BREAK_GLASS_APPROVE");
    await dialog.locator("#totp_code").fill(totpCode(CHECKER.email));
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator("p", { hasText: /^Done$/ })).toBeVisible({ timeout: 60_000 });
    await dialog.locator('button[type="button"]', { hasText: "Close" }).click();
    await expect(dialog).toBeHidden();

    // Get the session ID.
    await open(checker, `${P}?tab=elevated&q=${incident}`);
    const sessionLink = await checker.locator("table a").first().getAttribute("href");
    const sessionId = new URL(sessionLink ?? "", "http://x").searchParams.get("id") ?? "";
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    // Now the checker has a live break-glass session. Use it for emergency suspension.
    await open(checker, `${drawer}&pane=requirements`);
    const form = checker.locator('form[data-testid="a2-emergency-suspend"]');
    const details = checker.locator("details", { has: form }).first();
    if ((await details.getAttribute("open")) === null) await details.locator("summary").first().click();
    await form.locator('input[name="break_glass_session_id"]').fill(sessionId);
    await form.locator('select[name="reason_code"]').selectOption("RULE_ERROR");
    await form.locator('button[type="submit"]').click();
    expect(await banner(checker, "a2-emergency-suspend")).toMatch(/Emergency suspension recorded/);
    await expect.poll(() => status(checker, 2), { timeout: 60_000 }).toMatch(/Suspended/);

    // The suspension is reviewed by the maker (not the suspender).
    await open(maker, `${drawer}&pane=requirements`);
    await openCommand(maker, "a2-review-suspension");
    await maker.selectOption("#a2-rev-outcome", "UPHELD");
    await submit(maker, "a2-review-suspension");
    expect(await banner(maker, "a2-review-suspension")).toMatch(/Review recorded: the suspension was upheld/);

    const history = await open(maker, `${drawer}&pane=history`);
    expect(history).toMatch(/Version 2: IN FORCE → SUSPENDED/);

    // The old refusal cases: without a session or with a bad session, it's still refused.
    for (const session of ["", "00000000-0000-4000-8000-000000000bad"]) {
      await open(checker, `${drawer}&pane=requirements`);
      const form2 = checker.locator('form[data-testid="a2-emergency-suspend"]');
      const details2 = checker.locator("details", { has: form2 }).first();
      if ((await details2.getAttribute("open")) === null) await details2.locator("summary").first().click();
      if (session) await form2.locator('input[name="break_glass_session_id"]').fill(session);
      await form2.locator('select[name="reason_code"]').selectOption("RULE_ERROR");
      await form2.locator('button[type="submit"]').click();
      expect(await banner(checker, "a2-emergency-suspend")).toMatch(/honoured only under your own live break-glass session/);
    }
    // Status should still be Suspended (the successful suspension above is the last one).
    expect(await status(checker, 2)).toMatch(/Suspended/);
  });
});
