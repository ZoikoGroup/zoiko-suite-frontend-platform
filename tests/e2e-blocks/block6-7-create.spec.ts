// Browser journeys for the Block 6-7 create workflows against a live
// verification stack. Each form is filled and submitted in the browser
// (Server Actions), the success shows the service's own record, a reload lists
// it, invalid input is refused with the service's message, and another
// tenant's session sees none of it.
//
// The GB journey creates a VAT rule for GB picked from the jurisdiction
// register, activates it from the rules panel, and runs a GB/B2C determination
// that the service answers with that rule and a computed amount.

import crypto from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test, type BrowserHealth } from "./browser-health";
import { ID, TAG, TODAY, consoleApi, list, liveOnly, seed, sessionValue, signIn } from "./live";

liveOnly();

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function open(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
}

async function reload(page: Page) {
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/** A form, by its submit button (pages repeat input ids across forms). */
const formOf = (page: Page | Locator, button: string) =>
  page.locator("form").filter({ has: page.getByRole("button", { name: button, exact: true }) });

/** A header modal, by its heading. */
const modalOf = (page: Page, heading: string) =>
  page.locator("div.rounded-2xl").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

/** The outcome banner after a submit. */
const outcome = (scope: Page | Locator, text: string | RegExp) => scope.getByRole("status").filter({ hasText: text });

/**
 * Pick GB in a jurisdiction <select>: the option whose label is GB's code and
 * name, as jurisdiction-rules-svc registers it. Returns the value it sent (the
 * register's UUID), so the test can check what the services stored.
 */
async function pickGB(select: Locator): Promise<string> {
  const option = select.locator("option").filter({ hasText: /^GB — / });
  await expect(option, "GB is in the jurisdiction register").toHaveCount(1);
  const value = (await option.getAttribute("value")) ?? "";
  expect(value).toMatch(/^[0-9a-f-]{36}$/);
  await select.selectOption(value);
  return value;
}

/** Turn off the browser's required-field check so the service's own refusal is reached. */
async function skipBrowserValidation(form: Locator) {
  await form.evaluate((f) => {
    (f as HTMLFormElement).noValidate = true;
  });
}

/** Another tenant's session renders the page and the API without these records. */
async function otherTenantSeesNone(
  browser: Browser,
  browserHealth: BrowserHealth,
  path: string,
  texts: string[],
  api?: { endpoint: string; key: string },
) {
  const other = await browser.newContext();
  const session = sessionValue(ID.principal, ID.otherTenant, ID.otherEntity);
  await signIn(other, session);
  const page = await other.newPage();
  browserHealth.watch(page);
  await open(page, path);
  for (const t of texts) await expect(page.getByText(t), `${path} leaks ${t} to another tenant`).toHaveCount(0);
  if (api) {
    const res = await consoleApi(page.request, "GET", api.endpoint, undefined, session);
    expect(res.status).toBe(200);
    expect(JSON.stringify(list(res.json, api.key))).not.toContain(texts[0]);
  }
  await other.close();
}

// ── Block 6: legal ──────────────────────────────────────────────────────────

test("legal: record an obligation; it is listed, a blank title is refused by the service, another tenant sees nothing", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/legal");
  const form = formOf(page, "Record obligation");
  const title = `ui obligation ${TAG}`;
  await form.locator("#obl-source-type").selectOption("CONTRACT");
  await form.locator("#obl-source-id").fill(crypto.randomUUID());
  await form.locator("#obl-risk").selectOption("HIGH");
  await form.locator("#obl-title").fill(title);
  await form.locator("#obl-due").fill("2026-12-31");
  await form.locator("#obl-effective-from").fill(TODAY);
  await form.getByRole("button", { name: "Record obligation", exact: true }).click();

  const ok = outcome(page, /Obligation obg-[0-9a-f-]+ recorded as PLANNED/);
  await expect(ok).toBeVisible({ timeout: 15_000 });
  await expect(ok.getByText(title)).toBeVisible();
  await expect(ok.getByText("CONTRACTUAL")).toBeVisible();
  const id = (await ok.textContent())!.match(/obg-[0-9a-f-]+/)![0];

  await reload(page);
  await expect(page.getByText(id).first()).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
  const listed = list((await consoleApi(page.request, "GET", "obligations")).json, "obligations");
  const row = listed.find((o) => o.obligation_id === id);
  expect(row?.legal_entity_id).toBe(ID.entity);
  expect(row?.created_by).toBe(ID.principal);

  const again = formOf(page, "Record obligation");
  await skipBrowserValidation(again);
  await again.locator("#obl-source-type").selectOption("CONTRACT");
  await again.locator("#obl-source-id").fill(crypto.randomUUID());
  await again.locator("#obl-risk").selectOption("LOW");
  await again.locator("#obl-due").fill("2026-12-31");
  await again.locator("#obl-effective-from").fill(TODAY);
  await again.getByRole("button", { name: "Record obligation", exact: true }).click();
  await expect(outcome(page, "title, due_date, and obligation_type are required")).toBeVisible({ timeout: 15_000 });

  await otherTenantSeesNone(browser, browserHealth, "/admin/legal", [title, id], { endpoint: "obligations", key: "obligations" });
});

test("legal: register a counterparty for GB; it is listed, a blank name is refused by the service, another tenant sees nothing", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/legal");
  const form = formOf(page, "Register counterparty");
  const name = `UI Counterparty ${TAG}`;
  await form.locator("#cp-name").fill(name);
  await form.locator("#cp-type").selectOption("VENDOR");
  const gb = await pickGB(form.locator("#cp-jurisdiction"));
  await form.locator("#cp-risk").selectOption("MEDIUM");
  await form.locator("#cp-effective-from").fill(TODAY);
  await form.getByRole("button", { name: "Register counterparty", exact: true }).click();

  const ok = outcome(page, /Counterparty cpty-[0-9a-f-]+ registered as ONBOARDING, compliance PENDING/);
  await expect(ok).toBeVisible({ timeout: 15_000 });
  await expect(ok.getByText(name)).toBeVisible();
  await expect(ok.getByText("GB — United Kingdom")).toBeVisible();
  const id = (await ok.textContent())!.match(/cpty-[0-9a-f-]+/)![0];

  await reload(page);
  await expect(page.getByText(id).first()).toBeVisible();
  const row = list((await consoleApi(page.request, "GET", "counterparties")).json, "counterparties").find((c) => c.counterparty_id === id);
  expect(row?.jurisdiction_id).toBe(gb);
  expect(row?.legal_entity_id).toBe(ID.entity);
  expect(row?.created_by).toBe(ID.principal);

  const again = formOf(page, "Register counterparty");
  await skipBrowserValidation(again);
  await again.locator("#cp-type").selectOption("VENDOR");
  await pickGB(again.locator("#cp-jurisdiction"));
  await again.locator("#cp-effective-from").fill(TODAY);
  await again.getByRole("button", { name: "Register counterparty", exact: true }).click();
  await expect(outcome(page, "name, counterparty_type, and jurisdiction_id are required")).toBeVisible({ timeout: 15_000 });

  await otherTenantSeesNone(browser, browserHealth, "/admin/legal", [name, id], { endpoint: "counterparties", key: "counterparties" });
});

test("legal: propose a corporate action; it is listed, an unknown resolution is refused by the service, another tenant sees nothing", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/legal");
  const form = formOf(page, "Propose action");
  const title = `ui corporate action ${TAG}`;
  await form.locator("#ca-title").fill(title);
  await form.locator("#ca-type").selectOption("NAME_CHANGE");
  await form.locator("#ca-effective-date").fill("2026-12-01");
  await form.getByRole("button", { name: "Propose action", exact: true }).click();

  const ok = outcome(page, /Corporate action act-[0-9a-f-]+ recorded as PROPOSED/);
  await expect(ok).toBeVisible({ timeout: 15_000 });
  await expect(ok.getByText(title)).toBeVisible();
  const id = (await ok.textContent())!.match(/act-[0-9a-f-]+/)![0];

  await reload(page);
  await expect(page.getByText(id).first()).toBeVisible();
  expect(JSON.stringify(list((await consoleApi(page.request, "GET", "corporate-actions")).json, "corporate_actions"))).toContain(id);

  const again = formOf(page, "Propose action");
  await again.locator("#ca-title").fill(`ui unauthorised action ${TAG}`);
  await again.locator("#ca-type").selectOption("SHARE_ISSUANCE");
  await again.locator("#ca-effective-date").fill("2026-12-01");
  await again.locator("#ca-resolution").fill(crypto.randomUUID());
  await again.getByRole("button", { name: "Propose action", exact: true }).click();
  await expect(outcome(page, "resolution_id does not exist in board-resolutions-svc")).toBeVisible({ timeout: 15_000 });

  await otherTenantSeesNone(browser, browserHealth, "/admin/legal", [title, id], { endpoint: "corporate-actions", key: "corporate_actions" });
});

// ── Block 7: tax rules, activation and the GB determination ────────────────

test("tax GB journey: VAT rule for GB from the register, activated, then a GB/B2C determination applies it", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/tax");
  const ruleCode = `GB-VAT-${TAG}`;

  // 1. Create the rule from the header, GB picked from the select.
  await page.locator("#tax-action-new-rule").click();
  const ruleModal = modalOf(page, "New Tax Rule");
  const gb = await pickGB(ruleModal.locator("#rule-jurisdiction"));
  await ruleModal.locator("#rule-code").fill(ruleCode);
  await ruleModal.locator("#rule-category").selectOption("VAT");
  await ruleModal.locator("#rule-name").fill(`ui GB standard VAT ${TAG}`);
  await ruleModal.locator("#rule-rate").fill("20");
  await ruleModal.locator("#rule-effective-from").fill("2020-01-01");
  await ruleModal.getByRole("button", { name: "Create rule", exact: true }).click();
  const created = outcome(ruleModal, `Rule ${ruleCode} recorded by tax-rules-svc as DRAFT`);
  await expect(created).toBeVisible({ timeout: 15_000 });
  await expect(created.getByText("GB — United Kingdom")).toBeVisible();
  const ruleId = (await created.textContent())!.match(/trule-[0-9a-f-]+/)![0];
  await ruleModal.getByRole("button", { name: "Close" }).click();

  const stored = list((await consoleApi(page.request, "GET", "tax-rules")).json, "tax_rules").find((r) => r.rule_id === ruleId);
  expect(stored?.jurisdiction_id, "the rule is filed under the register's UUID, not a code").toBe(gb);

  // 2. While it is DRAFT the service refuses a determination for want of an ACTIVE rule.
  const runDetermination = async (tx: string) => {
    await page.locator("#tax-action-evaluate").click();
    const modal = modalOf(page, "Evaluate Determination");
    await pickGB(modal.locator("#det-jurisdiction_id"));
    await pickGB(modal.locator("#det-supply_jurisdiction_id"));
    await modal.locator("#det-tax_category").selectOption("VAT");
    await modal.locator("#det-transaction_id").fill(tx);
    await modal.locator("#det-gross_amount").fill("1000");
    await modal.locator("#det-currency").fill("GBP");
    await modal.locator("#det-seller_party_id").fill(`seller-${TAG}`);
    await modal.locator("#det-buyer_party_id").fill(`buyer-${TAG}`);
    await modal.locator("#det-supply_date").fill(TODAY);
    await modal.locator("#det-product_classification").fill("GENERAL_GOODS");
    await modal.locator("#det-supply_kind").selectOption("GOODS");
    await modal.locator("#det-supply_type").selectOption("B2C");
    await modal.getByRole("button", { name: "Run evaluation", exact: true }).click();
    return modal;
  };
  let modal = await runDetermination(`tx-draft-${TAG}`);
  await expect(outcome(modal, "no active tax rule found matching jurisdiction and category")).toBeVisible({ timeout: 15_000 });
  await modal.getByRole("button", { name: "Close" }).click();

  // 3. Activate it from the rules panel; the status shown is the service's.
  await reload(page);
  const row = page.locator("tr").filter({ hasText: ruleCode });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(row.getByRole("status").filter({ hasText: `Rule ${ruleCode} is now ACTIVE` })).toBeVisible({ timeout: 15_000 });
  await reload(page);
  await expect(page.locator("tr").filter({ hasText: ruleCode }).getByText("ACTIVE", { exact: true })).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: ruleCode }).getByRole("button", { name: "Activate", exact: true })).toHaveCount(0);

  // 4. The determination now applies that rule and computes the tax.
  const tx = `tx-gb-${TAG}`;
  modal = await runDetermination(tx);
  const det = outcome(modal, /Determination tdet-[0-9a-f-]+ recorded as /);
  await expect(det).toBeVisible({ timeout: 15_000 });
  await expect(det.getByText(ruleId)).toBeVisible();
  await expect(det.getByText("20%")).toBeVisible();
  await expect(det.getByText("200 GBP")).toBeVisible();
  const detId = (await det.textContent())!.match(/tdet-[0-9a-f-]+/)![0];
  await modal.getByRole("button", { name: "Close" }).click();

  await reload(page);
  const detRow = page.locator("tr").filter({ hasText: tx });
  await expect(detRow).toHaveCount(1);
  await expect(detRow.getByText(ruleId)).toBeVisible();
  await expect(detRow).toContainText(/200/);
  const listed = list((await consoleApi(page.request, "GET", "tax-determinations")).json, "determinations").find((d) => d.determination_id === detId);
  expect(listed?.rule_id).toBe(ruleId);
  expect(listed?.calculated_tax_amount).toBe(200);
  expect(listed?.supply_jurisdiction_id).toBe(gb);
  expect(listed?.evaluated_by).toBe(ID.principal);

  await otherTenantSeesNone(browser, browserHealth, "/admin/tax", [ruleCode, tx], { endpoint: "tax-rules", key: "tax_rules" });
});

test("tax rules: a DRAFT is edited in place; an ACTIVE rule cannot be deprecated (409 shown verbatim); a duplicate code is refused", async ({ page }) => {
  await open(page, "/admin/tax");
  const ruleCode = `GB-EXC-${TAG}`;
  const createRule = async () => {
    await page.locator("#tax-action-new-rule").click();
    const m = modalOf(page, "New Tax Rule");
    await pickGB(m.locator("#rule-jurisdiction"));
    await m.locator("#rule-code").fill(ruleCode);
    await m.locator("#rule-category").selectOption("EXCISE");
    await m.locator("#rule-name").fill(`ui excise ${TAG}`);
    await m.locator("#rule-rate").fill("5");
    await m.locator("#rule-effective-from").fill("2020-01-01");
    await m.getByRole("button", { name: "Create rule", exact: true }).click();
    return m;
  };
  let m = await createRule();
  await expect(outcome(m, `Rule ${ruleCode} recorded by tax-rules-svc as DRAFT`)).toBeVisible({ timeout: 15_000 });
  await m.getByRole("button", { name: "Close" }).click();

  // The same code again is the service's 409.
  m = await createRule();
  await expect(outcome(m, "tax rule with this jurisdiction_id, rule_code and version already exists")).toBeVisible({ timeout: 15_000 });
  await m.getByRole("button", { name: "Close" }).click();

  // Edit the DRAFT: name, rate, end date.
  await reload(page);
  let row = page.locator("tr").filter({ hasText: ruleCode });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = row.locator("form").filter({ has: page.getByRole("button", { name: "Save draft" }) });
  await edit.getByLabel("Rule name").fill(`ui excise edited ${TAG}`);
  await edit.getByLabel("Tax rate (%)").fill("7.5");
  await edit.getByLabel("Effective to").fill("2030-12-31");
  await edit.getByRole("button", { name: "Save draft" }).click();
  await expect(row.getByRole("status").filter({ hasText: `Rule ${ruleCode} is now DRAFT (version 2)` })).toBeVisible({ timeout: 15_000 });
  await reload(page);
  row = page.locator("tr").filter({ hasText: ruleCode });
  await expect(row).toContainText(`ui excise edited ${TAG}`);
  await expect(row).toContainText("7.5%");
  await expect(row).toContainText("2030-12-31");

  // Activate, then try to deprecate: tax-rules-svc refuses any change to an ACTIVE rule.
  await row.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(row.getByRole("status").filter({ hasText: "is now ACTIVE" })).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Deprecate", exact: true }).click();
  await expect(row.getByRole("status").filter({ hasText: "tax-rules-svc answered 409: ACTIVE or DEPRECATED tax rules cannot be modified in place" })).toBeVisible({ timeout: 15_000 });
  await reload(page);
  await expect(page.locator("tr").filter({ hasText: ruleCode }).getByText("ACTIVE", { exact: true })).toBeVisible();
});

// ── Block 7: corporate and withholding tax ─────────────────────────────────

test("corporate tax: raise a GB return; the service's computed figures are shown and listed, a duplicate year is refused, another tenant sees nothing", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/tax");
  const reg = `CT-${TAG}`;
  const fill = async () => {
    const form = formOf(page, "Raise return");
    await pickGB(form.locator("#ct-jurisdiction"));
    await form.locator("#ct-registration").fill(reg);
    await form.locator("#ct-fiscal-year").fill("2025");
    await form.locator("#ct-period-start").fill("2025-01-01");
    await form.locator("#ct-period-end").fill("2025-12-31");
    await form.locator("#ct-currency").fill("GBP");
    await form.locator("#ct-gross-revenue").fill("100000");
    await form.locator("#ct-deductions").fill("20000");
    await form.locator("#ct-rate").fill("25");
    await form.locator("#ct-credits").fill("1000");
    await form.locator("#ct-paid").fill("5000");
    await form.locator("#ct-effective-from").fill(TODAY);
    await form.getByRole("button", { name: "Raise return", exact: true }).click();
  };
  await fill();
  const ok = outcome(page, /Corporate tax return ctret-[0-9a-f-]+ for fiscal 2025 recorded as DRAFT/);
  await expect(ok).toBeVisible({ timeout: 15_000 });
  // Computed by corporate-tax-svc: (100000 − 20000) × 25% = 20000; − 1000 credits = 19000; − 5000 paid = 14000.
  await expect(ok.getByText("80,000 GBP")).toBeVisible();
  await expect(ok.getByText("19,000 GBP")).toBeVisible();
  await expect(ok.getByText("14,000 GBP")).toBeVisible();
  const id = (await ok.textContent())!.match(/ctret-[0-9a-f-]+/)![0];

  await reload(page);
  await expect(page.getByText(id).first()).toBeVisible();
  const row = list((await consoleApi(page.request, "GET", "corporate-tax-returns")).json, "corporate_tax_returns").find((r) => r.return_id === id);
  expect(row?.legal_entity_id).toBe(ID.entity);
  expect(row?.balance_due).toBe(14000);

  await fill();
  await expect(outcome(page, "corporate tax return for this entity, jurisdiction and fiscal year already exists")).toBeVisible({ timeout: 15_000 });

  await otherTenantSeesNone(browser, browserHealth, "/admin/tax", [id, reg], { endpoint: "corporate-tax-returns", key: "corporate_tax_returns" });
});

test("withholding: record an obligation for a registered counterparty in its own currency; listed, a blank reference is refused by the service, another tenant sees nothing", async ({ page, request, browser, browserHealth }) => {
  await open(page, "/admin/tax");
  const gbValue = await page.locator("#wht-jurisdiction option").filter({ hasText: /^GB — / }).getAttribute("value");
  const cpName = `UI Payee ${TAG}`;
  const cp = await seed(request, "counterparty-management-svc", "/v1/counterparties", {
    legal_entity_id: ID.entity, name: cpName, counterparty_type: "VENDOR", jurisdiction_id: gbValue,
    effective_from: TODAY, created_by: ID.principal,
  }, "legal.counterparty.maintenance");
  expect(cp.status).toBe(201);
  await reload(page);

  const ref = `PAY-${TAG}`;
  const form = formOf(page, "Record obligation");
  await pickGB(form.locator("#wht-jurisdiction"));
  await form.locator("#wht-counterparty").selectOption({ label: `${cpName} (VENDOR)` });
  await form.locator("#wht-payment-ref").fill(ref);
  await form.locator("#wht-payment-type").fill("ROYALTY");
  await form.locator("#wht-gross").fill("5000");
  await form.locator("#wht-rate").fill("20");
  await form.locator("#wht-currency").fill("EUR");
  await form.locator("#wht-effective-from").fill(TODAY);
  await form.getByRole("button", { name: "Record obligation", exact: true }).click();

  const ok = outcome(page, new RegExp(`Withholding obligation whto-[0-9a-f-]+ on ${ref} recorded as `));
  await expect(ok).toBeVisible({ timeout: 15_000 });
  await expect(ok.getByText("1,000 EUR")).toBeVisible();
  const id = (await ok.textContent())!.match(/whto-[0-9a-f-]+/)![0];

  await reload(page);
  const row = page.locator("tr").filter({ hasText: ref });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("EUR");
  const listed = list((await consoleApi(page.request, "GET", "withholding-tax")).json, "withholding_obligations").find((o) => o.obligation_id === id);
  expect(listed?.currency).toBe("EUR");
  expect(listed?.withheld_amount).toBe(1000);
  expect(listed?.counterparty_id).toBe(cp.json?.counterparty_id);
  expect(listed?.created_by).toBe(ID.principal);

  const again = formOf(page, "Record obligation");
  await skipBrowserValidation(again);
  await pickGB(again.locator("#wht-jurisdiction"));
  await again.locator("#wht-counterparty").selectOption({ label: `${cpName} (VENDOR)` });
  await again.locator("#wht-payment-type").fill("ROYALTY");
  await again.locator("#wht-gross").fill("10");
  await again.locator("#wht-rate").fill("5");
  await again.locator("#wht-currency").fill("EUR");
  await again.locator("#wht-effective-from").fill(TODAY);
  await again.getByRole("button", { name: "Record obligation", exact: true }).click();
  await expect(outcome(page, "legal_entity_id, jurisdiction_id, counterparty_id, and payment_reference are required")).toBeVisible({ timeout: 15_000 });

  await otherTenantSeesNone(browser, browserHealth, "/admin/tax", [ref, id], { endpoint: "withholding-tax", key: "withholding_obligations" });
});

// ── Block 7: compliance exception ───────────────────────────────────────────

test("compliance: raise an exception for GB; it is listed, a blank type is refused by the service, another tenant sees nothing", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/compliance");
  const form = formOf(page, "Raise exception");
  const description = `ui exception ${TAG}`;
  await pickGB(form.locator("#exc-jurisdiction"));
  await form.locator("#exc-type").fill("FILING_LATE");
  await form.locator("#exc-severity").selectOption("HIGH");
  await form.locator("#exc-linked-type").fill("FILING");
  await form.locator("#exc-linked-id").fill(`filing-${TAG}`);
  await form.locator("#exc-description").fill(description);
  await form.getByRole("button", { name: "Raise exception", exact: true }).click();

  const ok = outcome(page, /Exception case excase-[0-9a-f-]+ opened as OPEN/);
  await expect(ok).toBeVisible({ timeout: 15_000 });
  await expect(ok.getByText("FILING_LATE")).toBeVisible();
  await expect(ok.getByText("GB — United Kingdom")).toBeVisible();
  const id = (await ok.textContent())!.match(/excase-[0-9a-f-]+/)![0];

  await reload(page);
  await expect(page.getByText(id).first()).toBeVisible();
  await expect(page.getByText(description).first()).toBeVisible();
  const row = list((await consoleApi(page.request, "GET", "exception-escalation/exceptions")).json, "exceptions").find((e) => e.exception_case_id === id);
  expect(row?.created_by).toBe(ID.principal);
  expect(row?.legal_entity_id).toBe(ID.entity);

  const again = formOf(page, "Raise exception");
  await skipBrowserValidation(again);
  await pickGB(again.locator("#exc-jurisdiction"));
  await again.locator("#exc-severity").selectOption("LOW");
  await again.locator("#exc-linked-type").fill("FILING");
  await again.locator("#exc-linked-id").fill(`filing-${TAG}`);
  await again.locator("#exc-description").fill("no type");
  await again.getByRole("button", { name: "Raise exception", exact: true }).click();
  await expect(outcome(page, "legal_entity_id, jurisdiction_id, exception_type, linked_object_type, and linked_object_id are required")).toBeVisible({ timeout: 15_000 });

  await otherTenantSeesNone(browser, browserHealth, "/admin/compliance", [description, id], { endpoint: "exception-escalation/exceptions", key: "exceptions" });
});
