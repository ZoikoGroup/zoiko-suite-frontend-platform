// Browser journeys for the Blocks 8-10 create workflows (Server Actions),
// against a live verification stack. For each form: fill it in the browser,
// submit, see the record the service returned (id and status), reload and
// find it listed, see an invalid submission refused with the service's own
// message, and confirm another tenant sees none of it.
//
// Run: npm run build, then
//   ZOIKO_LIVE_E2E=1 ZOIKO_E2E_GATEWAY=http://127.0.0.1:18180 npx playwright test -c playwright.blocks.config.ts block8-10-create

import crypto from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./browser-health";
import { ID, TAG, consoleApi, list, liveOnly, sessionValue, signIn } from "./live";

liveOnly();
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/** Names created here, by page, for the cross-tenant check at the end. */
const created: Record<string, string[]> = {};
const remember = (path: string, name: string) => (created[path] ??= []).push(name);

async function open(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A control by its label, with or without the "(optional)" suffix. */
const field = (scope: Locator, label: string) => scope.getByLabel(new RegExp(`^\\s*${esc(label)}(\\s*\\(optional\\))?\\s*$`));

type Value = string | boolean;

async function fill(form: Locator, values: [string, Value][]) {
  for (const [label, value] of values) {
    const control = field(form, label);
    if (typeof value === "boolean") {
      if (value) await control.check();
      else await control.uncheck();
      continue;
    }
    const tag = await control.evaluate((el) => el.tagName);
    if (tag === "SELECT") await control.selectOption(value);
    else await control.fill(value);
  }
}

/** The create form titled `title` (button + form + result), opened. */
async function openForm(scope: Page | Locator, title: string) {
  const box = scope.locator(`[data-create-form="${title}"]`).first();
  const form = box.getByRole("form", { name: title });
  if ((await form.count()) === 0) await box.getByRole("button", { name: title, exact: true }).click();
  await expect(form).toBeVisible();
  return { box, form };
}

/** Submit and return the id the service gave the record. */
async function submitOk(box: Locator, form: Locator, submit: string, idLabel: string) {
  await form.getByRole("button", { name: submit }).click();
  const status = box.getByRole("status");
  await expect(status, "the service's record is shown").toContainText(/HTTP 20[01]/, { timeout: 20_000 });
  const id = (await status.locator(`dd[data-field="${idLabel}"]`).textContent())?.trim() ?? "";
  expect(id, `${idLabel} returned by the service`).not.toBe("");
  return id;
}

async function submitRefused(box: Locator, form: Locator, submit: string, message: RegExp) {
  await form.getByRole("button", { name: submit }).click();
  await expect(box.getByRole("alert"), "the refusal is shown as given").toContainText(message, { timeout: 20_000 });
}

type Case = {
  name: string;
  path: string;
  title: string;
  submit: string;
  idLabel: string;
  /** A value unique to this run that the panel lists after a reload. */
  listed: string;
  valid: [string, Value][];
  /** An input the service (or, where it checks nothing, the form) refuses, and the message expected. */
  invalid: [string, Value][];
  refusal: RegExp;
  /** Optional extra check on the result, e.g. the status the service set. */
  status?: RegExp;
  /** The console's proxy read that lists it: [path, list key, field holding `listed`]. */
  api?: [string, string, string];
};

const CASES: Case[] = [
  {
    name: "anomaly-detection: create a rule",
    path: "/admin/intelligence",
    title: "New anomaly rule",
    submit: "Create rule",
    idLabel: "Rule ID",
    listed: `rule-ui-${TAG}`,
    valid: [["Rule name", `rule-ui-${TAG}`], ["Domain", "FINANCE"], ["Metric type", "AMOUNT"], ["Threshold value", "3"], ["Z-score cutoff", "2.5"]],
    invalid: [["Rule name", `rule-bad-${TAG}`], ["Domain", "FINANCE"], ["Metric type", "AMOUNT"], ["Threshold value", "3"], ["Z-score cutoff", "150"]],
    refusal: /HTTP 422.*z_score_cutoff must be between 0 and 100/,
  },
  {
    name: "anomaly-detection: record an observation (OPEN anomaly)",
    path: "/admin/intelligence",
    title: "Record an observation",
    submit: "Submit observation",
    idLabel: "Anomaly ID",
    listed: `src-ui-${TAG}`,
    api: ["intelligence/anomalies", "anomalies", "source_entity_id"],
    valid: [["Domain", "FINANCE"], ["Source entity", `src-ui-${TAG}`], ["Metric type", "AMOUNT"], ["Observed value", "9000"], ["Expected value", "1000"], ["Standard deviation", "100"]],
    invalid: [["Domain", "FINANCE"], ["Source entity", `src-bad-${TAG}`], ["Metric type", "AMOUNT"], ["Observed value", "1"], ["Expected value", "1"], ["Standard deviation", "-5"]],
    refusal: /HTTP 422.*std_deviation cannot be negative/,
    status: /OPEN/,
  },
  {
    name: "forecasting: generate a forecast",
    path: "/admin/intelligence",
    title: "Generate forecast",
    submit: "Generate",
    idLabel: "Forecast ID",
    listed: `fc-ui-${TAG}`,
    api: ["intelligence/forecasts", "forecasts", "model_name"],
    valid: [["Model name", `fc-ui-${TAG}`], ["Domain", "CASH_FLOW"], ["Historical data", "100, 110, 125, 130"], ["Historical start date", "2026-01-01"]],
    invalid: [["Model name", `fc-bad-${TAG}`], ["Domain", "CASH_FLOW"], ["Historical data", "100"], ["Historical start date", "2026-01-01"]],
    refusal: /HTTP 422.*at least 2 historical data points/,
    status: /CALCULATED/,
  },
  {
    name: "compliance-risk-scoring: calculate a score from entered counts",
    path: "/admin/intelligence",
    title: "Calculate risk score",
    submit: "Calculate",
    idLabel: "Score ID",
    listed: `risk-ui-${TAG}`,
    api: ["intelligence/risk-scores", "scores", "assessment_name"],
    valid: [["Assessment name", `risk-ui-${TAG}`], ["Open obligations", "2"], ["Policy violations", "0"], ["Audit exceptions", "1"], ["Privacy incidents", "0"], ["Tax penalties", "0"]],
    invalid: [["Assessment name", `risk-bad-${TAG}`], ["Open obligations", "-1"], ["Policy violations", "0"], ["Audit exceptions", "0"], ["Privacy incidents", "0"], ["Tax penalties", "0"]],
    refusal: /HTTP 400.*validation/,
  },
  {
    name: "reconciliation-intelligence: analyze a run",
    path: "/admin/intelligence",
    title: "Analyze a reconciliation run",
    submit: "Analyze",
    idLabel: "Job ID",
    listed: `recon-ui-${TAG}`,
    api: ["intelligence/reconciliations", "reconciliations", "job_name"],
    valid: [["Job name", `recon-ui-${TAG}`], ["Bank reconciliation run ID", crypto.randomUUID()]],
    invalid: [["Job name", `recon-bad-${TAG}`], ["Bank reconciliation run ID", "not-a-uuid"]],
    refusal: /HTTP 400.*must be a UUID/,
  },
  {
    name: "reporting-orchestration: create a report definition (DRAFT)",
    path: "/admin/intelligence",
    title: "New report definition",
    submit: "Create definition",
    idLabel: "Definition ID",
    listed: `rpt-ui-${TAG}`,
    api: ["intelligence/reports", "reports", "report_name"],
    valid: [["Report name", `rpt-ui-${TAG}`], ["Report type", "FINANCIAL_SUMMARY"], ["Output format", "CSV"], ["Data sources", "general-ledger-svc"]],
    invalid: [["Report name", "r".repeat(129)], ["Report type", "CASH_FLOW"], ["Output format", "CSV"], ["Data sources", "general-ledger-svc"]],
    refusal: /HTTP 400.*at most 128 characters/,
    status: /DRAFT/,
  },
  {
    name: "decision-support: request a precedent-engine recommendation",
    path: "/admin/intelligence",
    title: "Request a recommendation",
    submit: "Request",
    idLabel: "Recommendation ID",
    listed: `jr-ui-${TAG}`,
    api: ["intelligence/recommendations", "recommendations", "subject_reference"],
    valid: [["Subject type", "JOURNAL"], ["Subject reference", `jr-ui-${TAG}`], ["Action type", "REVIEW"], ["Oversight class", "O1"]],
    // decision-support-svc validates every field the form offers, so the
    // form's own required-field check is what refuses here.
    invalid: [["Subject type", "JOURNAL"], ["Action type", "REVIEW"], ["Oversight class", "O1"]],
    refusal: /Subject reference is required/,
  },
  {
    name: "key-management: register BYOK key metadata",
    path: "/admin/security",
    title: "Register key metadata",
    submit: "Register metadata",
    idLabel: "Key ID",
    listed: `alias-create-${TAG}`,
    api: ["security/keys", "keys", "key_alias"],
    valid: [["Key alias", `alias-create-${TAG}`], ["Key model", "BYOK"], ["Key provider", "AWS_KMS"], ["External key reference (ARN / key URI)", `arn:aws:kms:eu-west-2:111122223333:key/${crypto.randomUUID()}`]],
    invalid: [["Key alias", `alias-bad-${TAG}`], ["Key model", "BYOK"], ["Key provider", "AWS_KMS"]],
    refusal: /HTTP 400.*external_key_arn is required for BYOK\/HYOK/,
    status: /ENABLED/,
  },
  {
    name: "connectivity-api-bridge: register a bridge",
    path: "/admin/integration",
    title: "Register bridge",
    submit: "Register bridge",
    idLabel: "Bridge ID",
    listed: `br-create-${TAG}`,
    api: ["integration/connections", "connections", "bridge_name"],
    valid: [["Bridge name", `br-create-${TAG}`], ["Provider name", "Acme"], ["Protocol", "REST"], ["Endpoint URL", "https://api.example.com"], ["Auth type", "OAUTH2"]],
    invalid: [["Bridge name", `br-bad-${TAG}`], ["Provider name", "Acme"], ["Protocol", "REST"], ["Endpoint URL", "not-a-url"], ["Auth type", "OAUTH2"]],
    refusal: /HTTP 400.*endpoint_url must be an absolute URL/,
  },
  {
    name: "banking-connector: register a bank connection",
    path: "/admin/integration",
    title: "Register bank connection",
    submit: "Register connection",
    idLabel: "Connection ID",
    listed: `Bank-ui-${TAG}`,
    api: ["integration/banking", "connections", "bank_name"],
    valid: [["Bank name", `Bank-ui-${TAG}`], ["BIC", "BARCGB22"], ["Account number", "12345678"], ["IBAN", "GB33BUKB20201555555555"], ["Currency", "GBP"], ["Account type", "CURRENT"]],
    // banking-connector-svc checks only legal_entity_id and bank_name, both
    // always sent; a missing BIC is refused by the form.
    invalid: [["Bank name", `Bank-bad-${TAG}`], ["Account number", "1"], ["Currency", "GBP"]],
    refusal: /BIC is required/,
  },
  {
    name: "hris-connector: register an HRIS integration",
    path: "/admin/integration",
    title: "Register HRIS integration",
    submit: "Register integration",
    idLabel: "Integration ID",
    listed: `HR-ui-${TAG}`,
    api: ["integration/hris", "connections", "provider_name"],
    valid: [["Provider name", `HR-ui-${TAG}`], ["Sync type", "EMPLOYEES"], ["Direction", "INBOUND"], ["API endpoint", "https://hr.example.com/api"]],
    invalid: [["Provider name", `HR-bad-${TAG}`], ["Sync type", "EMPLOYEES"], ["Direction", "INBOUND"]],
    refusal: /API endpoint is required/,
    status: /PENDING/,
  },
  {
    name: "external-data-feed: subscribe to a feed",
    path: "/admin/integration",
    title: "Subscribe to a data feed",
    submit: "Subscribe",
    idLabel: "Feed ID",
    listed: `EUR${TAG.toUpperCase()}`,
    api: ["integration/feeds", "subscriptions", "symbol"],
    valid: [["Provider", "ECB"], ["Feed type", "FX_RATE"], ["Symbol", `EUR${TAG.toUpperCase()}`]],
    invalid: [["Provider", "ECB"], ["Feed type", "FX_RATE"]],
    refusal: /Symbol is required/,
  },
  {
    name: "tax-authority-interface: register an interface",
    path: "/admin/tax",
    title: "Register authority interface",
    submit: "Register interface",
    idLabel: "Interface ID",
    listed: `HMRC-ui-${TAG}`,
    api: ["tax-authority/interfaces", "tax_authority_interfaces", "authority_name"],
    valid: [["Jurisdiction", "GB"], ["Authority name", `HMRC-ui-${TAG}`]],
    invalid: [["Jurisdiction", "GB"], ["Authority name", `HMRC-bad-${TAG}`], ["Provider key", `not-a-connector-${TAG}`]],
    refusal: /HTTP 400.*connector_id must be the id of an approved connector/,
    status: /ACTIVE/,
  },
];

const OTHER = () => sessionValue(ID.principal, ID.otherTenant, ID.otherEntity);

for (const c of CASES) {
  test(`${c.name}: created in the browser, listed after reload, invalid input refused`, async ({ page, request }) => {
    await open(page, c.path);
    const { box, form } = await openForm(page, c.title);
    await fill(form, c.valid);
    const id = await submitOk(box, form, c.submit, c.idLabel);
    if (c.status) await expect(box.getByRole("status")).toContainText(c.status);
    remember(c.path, c.listed);

    // The form stays open and blank after a success; an invalid entry is refused.
    await fill(form, c.invalid);
    await submitRefused(box, form, c.submit, c.refusal);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(c.listed).first(), `${c.path} lists ${c.listed} after a reload`).toBeVisible({ timeout: 20_000 });
    expect(id.length).toBeGreaterThan(0);

    // The same record through the console's own read, for this tenant only.
    if (c.api) {
      const [read, key, prop] = c.api;
      const mine = await consoleApi(request, "GET", read);
      expect(mine.status, read).toBe(200);
      expect(list(mine.json, key).map((r) => String(r[prop])), `${read} lists ${c.listed}`).toContain(c.listed);
      const theirs = await consoleApi(request, "GET", read, undefined, OTHER());
      expect(theirs.status, read).toBe(200);
      expect(list(theirs.json, key).map((r) => String(r[prop])), `${read} leaks ${c.listed}`).not.toContain(c.listed);
    }
  });
}

// ── mTLS: the private key is shown once ───────────────────────────────────────

test("mtls-management: issue a certificate; the private key is shown once and gone after closing", async ({ page }) => {
  await open(page, "/admin/security");
  await page.getByRole("button", { name: "Issue certificate" }).click();
  const dialog = page.getByRole("dialog", { name: "Issue mTLS certificate" });

  // Required fields are checked before anything is sent.
  await dialog.getByRole("button", { name: "Issue", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Service name is required.");

  const cn = `svc-ui-${TAG}.zoiko.local`;
  await dialog.getByLabel("Service name").fill(`svc-ui-${TAG}`);
  await dialog.getByLabel("Common name").fill(cn);
  await dialog.getByLabel("Rotation days").fill("30");
  await dialog.getByRole("button", { name: "Issue", exact: true }).click();

  await expect(dialog.getByRole("status")).toContainText("HTTP 201", { timeout: 20_000 });
  await expect(dialog.getByText(/Copy the private key now/)).toBeVisible();
  const key = await dialog.getByLabel("Private key (shown once)").inputValue();
  expect(key).toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  const body = key.split("\n").find((l) => l.length > 40 && !l.startsWith("-----")) ?? key.slice(40, 100);

  // Never stored in the browser or put in the URL.
  const stored = await page.evaluate(() => {
    const dump = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`).join("\n");
    return dump(localStorage) + dump(sessionStorage);
  });
  expect(stored).not.toContain(body);
  expect(page.url()).not.toContain(body);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByLabel("Private key (shown once)")).toHaveCount(0);
  expect(await page.content()).not.toContain(body);

  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await page.content(), "the key is not in the page after a reload").not.toContain(body);
  await expect(page.getByText(cn).first(), "the certificate is listed").toBeVisible({ timeout: 20_000 });
  remember("/admin/security", cn);
});

// ── SIEM: exporter, test event, the "no external delivery" caveat ─────────────

test("siem-integration: register an exporter, record a test event, see it per exporter with the no-delivery caveat", async ({ page }) => {
  await open(page, "/admin/security");
  const exporterName = `exp-ui-${TAG}`;

  // An auth token cannot be sealed on this stack: the 503 is shown as given.
  {
    const { box, form } = await openForm(page, "Register SIEM exporter");
    await fill(form, [["Exporter name", `exp-token-${TAG}`], ["Platform", "SPLUNK"], ["Endpoint URL", "https://splunk.example.com:8088"], ["Auth token", "not-stored"]]);
    await submitRefused(box, form, "Register exporter", /HTTP 503.*no credential sealing key is configured/);
  }

  const { box, form } = await openForm(page, "Register SIEM exporter");
  await fill(form, [["Exporter name", exporterName], ["Platform", "SPLUNK"], ["Endpoint URL", "https://splunk.example.com:8088"]]);
  await submitOk(box, form, "Register exporter", "Exporter ID");
  await expect(box.getByRole("status")).toContainText("ACTIVE");
  remember("/admin/security", exporterName);

  const exporter = page.getByRole("region", { name: `Exporter ${exporterName}` });
  await expect(exporter).toBeVisible({ timeout: 20_000 });
  await expect(exporter.locator('[data-field="events-recorded"]')).toContainText("Events recorded: 0");

  const ev = await openForm(exporter, "Send test event");
  await expect(field(ev.form, "Source service")).toHaveValue("zoiko-console");
  const message = `msg-ui-${TAG}`;
  // Required fields are refused before anything is sent.
  await fill(ev.form, [["Event type", "ui.test"], ["Severity", "HIGH"]]);
  await submitRefused(ev.box, ev.form, "Record event", /Message is required/);
  await fill(ev.form, [["Event type", "ui.test"], ["Severity", "HIGH"], ["Message", message]]);
  await submitOk(ev.box, ev.form, "Record event", "Event ID");
  await expect(ev.box.getByRole("status")).toContainText("no external delivery is configured");

  const row = exporter.locator("li").filter({ hasText: message });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("recorded by siem-integration-svc — no external delivery is configured");
  await expect(exporter.locator('[data-field="events-recorded"]')).toContainText("Events recorded: 1", { timeout: 20_000 });

  await page.reload();
  await page.waitForLoadState("networkidle");
  const after = page.getByRole("region", { name: `Exporter ${exporterName}` });
  await expect(after.locator('[data-field="events-recorded"]')).toContainText("Events recorded: 1", { timeout: 20_000 });
  await after.getByRole("button", { name: "Recorded events" }).click();
  const listed = after.locator("li").filter({ hasText: message });
  await expect(listed).toBeVisible({ timeout: 20_000 });
  await expect(listed).toContainText("no external delivery is configured (stored status: DELIVERED)");

  // The stored status never appears on its own.
  const text = await page.locator("body").innerText();
  const delivered = text.match(/DELIVERED/g)?.length ?? 0;
  const caveated = text.match(/no external delivery is configured \(stored status: DELIVERED\)/g)?.length ?? 0;
  expect(delivered, "every DELIVERED is beside the no-delivery caveat").toBe(caveated);
});

// ── E-signature: profiles live; envelopes refused (503) ───────────────────────

test("esignature: create a signature profile, activate it, retire it; another tenant cannot read it", async ({ page, browser, browserHealth }) => {
  await open(page, "/admin/integration");
  const section = page.getByRole("region", { name: "Signature profiles" });
  await section.getByRole("button", { name: "New signature profile" }).click();
  const form = section.getByRole("form", { name: "New signature profile" });

  await fill(form, [["Assurance level", "AES"], ["Identity requirement", "EMAIL_ONLY"]]);
  await form.getByRole("button", { name: "Create profile" }).click();
  await expect(section.getByRole("alert")).toContainText("Jurisdiction is required.");

  await fill(form, [["Assurance level", "AES"], ["Jurisdiction", "GB"], ["Identity requirement", "EMAIL_ONLY"], ["Witness required", true]]);
  await form.getByRole("button", { name: "Create profile" }).click();
  const idCell = section.locator('dd[data-field="Profile ID"]');
  await expect(idCell).toHaveText(/[0-9a-f-]{36}/, { timeout: 20_000 });
  const profileId = (await idCell.textContent())!.trim();

  const row = section.locator(`li[data-profile-id="${profileId}"]`);
  await expect(row.locator('[data-field="profile-status"]')).toHaveText("DRAFT", { timeout: 20_000 });
  await row.getByRole("button", { name: "Activate" }).click();
  await expect(row.locator('[data-field="profile-status"]')).toHaveText("ACTIVE", { timeout: 20_000 });
  await row.getByRole("button", { name: "Retire" }).click();
  await expect(row.locator('[data-field="profile-status"]')).toHaveText("RETIRED", { timeout: 20_000 });

  // The service has no profile list: after a reload it is read back by id.
  await page.reload();
  await page.waitForLoadState("networkidle");
  const again = page.getByRole("region", { name: "Signature profiles" });
  await again.getByLabel("Profile ID").fill(profileId);
  await again.getByRole("button", { name: "Look up" }).click();
  await expect(again.locator(`li[data-profile-id="${profileId}"] [data-field="profile-status"]`)).toHaveText("RETIRED", { timeout: 20_000 });

  const other = await browser.newContext();
  await signIn(other, OTHER());
  const otherPage = await other.newPage();
  browserHealth.watch(otherPage);
  await otherPage.goto("/admin/integration");
  await otherPage.waitForLoadState("networkidle");
  const theirs = otherPage.getByRole("region", { name: "Signature profiles" });
  await theirs.getByLabel("Profile ID").fill(profileId);
  await theirs.getByRole("button", { name: "Look up" }).click();
  await expect(theirs.getByRole("alert")).toContainText(/HTTP 404.*signature profile not found/, { timeout: 20_000 });
  await other.close();
});

test("esignature: sending an envelope shows the service's 503 refusal, never a sent envelope", async ({ page }) => {
  await open(page, "/admin/integration");
  const { box, form } = await openForm(page, "Send envelope");
  await fill(form, [["Document title", `nda-ui-${TAG}`], ["Signer name", "UI Signer"], ["Signer email", "signer@example.com"], ["Provider", "DOCUSIGN"]]);
  await submitRefused(box, form, "Send envelope", /HTTP 503.*esignature_provider_not_configured/);
  await expect(box.getByRole("status")).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(`nda-ui-${TAG}`)).toHaveCount(0);
});

// ── Key management: disable from the panel ────────────────────────────────────

test("key-management: disable a registered key from its row", async ({ page }) => {
  await open(page, "/admin/security");
  const alias = `alias-create-${TAG}`;
  const row = page.locator("div").filter({ hasText: alias }).filter({ has: page.getByRole("button", { name: "Rotate" }) }).last();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Disable" }).click();
  await row.getByRole("button", { name: "Confirm disable" }).click();
  await expect(page.getByRole("status").filter({ hasText: "key disabled" })).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  const after = page.locator("div").filter({ hasText: alias }).filter({ has: page.getByRole("button", { name: "Rotate" }) }).last();
  await expect(after.getByText("DISABLED", { exact: true })).toBeVisible({ timeout: 20_000 });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

test("another tenant sees none of the records created above", async ({ browser, browserHealth }) => {
  expect(Object.keys(created).length, "the create tests ran first").toBeGreaterThan(0);
  const other = await browser.newContext();
  await signIn(other, OTHER());
  const page = await other.newPage();
  browserHealth.watch(page);
  for (const [path, names] of Object.entries(created)) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const name of names) {
      await expect(page.getByText(name), `${path} leaks ${name} to another tenant`).toHaveCount(0);
    }
  }
  await other.close();
});
