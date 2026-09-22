import { expect, test, type Locator, type Page } from "@playwright/test";
import { login } from "./helpers";

// E2E for /admin/settings, the console surface over configuration-feature-flag-svc.
//
// Against e2e/mock/configuration-service.mjs, not the real service. What is
// proved here is the half the Go suite structurally cannot reach: that the
// console sends the canonical §4 envelope, reads what it renders out of the real
// response shape, and — the part that matters most on this service — tells the
// operator the truth about what was and was not recorded.
//
// This service has two properties that are trivially easy for a console to get
// wrong, and both are invisible when it does:
//
//   1. A 200 and a 201 are BOTH success and mean opposite things. 201 recorded a
//      new version; 200 means the value already equalled what was submitted and
//      NOTHING was written. A console that renders both as "saved" tells an
//      operator it recorded a change it did not record.
//
//   2. A flag is not described by `enabled` alone. One enabled at 25% is on for
//      a quarter of people; one DISABLED at 40% is off for everyone, the share
//      being dormant rather than partial. Showing the two columns side by side
//      leaves the reader to combine them, which is the step they get wrong.
//
// Both forms on this page carry the same submit label, and both tables the same
// shape, so every locator below is scoped to its own form or table rather than
// taken from the page. An unscoped getByRole here resolves to two elements and
// fails in strict mode — which is the correct failure, but it is noise rather
// than a finding.

const MOCK_URL = `http://localhost:${process.env.CONFIGURATION_MOCK_PORT ?? 18096}`;

async function resetConfigurationMock(): Promise<void> {
  await fetch(`${MOCK_URL}/_e2e/reset`, { method: "POST" });
}

/** Arm a single refusal for the next write, then let the mock return to normal. */
async function armRefusal(body: Record<string, unknown>): Promise<void> {
  await fetch(`${MOCK_URL}/_e2e/arm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function openSettings(page: Page): Promise<void> {
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
}

/** The feature-flag form, identified by a field only it has. */
const flagForm = (page: Page): Locator =>
  page.locator("form").filter({ has: page.getByLabel("Which feature") });

/** The config-value form, likewise. */
const configForm = (page: Page): Locator =>
  page.locator("form").filter({ has: page.getByLabel("Which setting") });

/** The flags table, identified by the column only it has. */
const flagTable = (page: Page): Locator =>
  page.locator("table").filter({ hasText: "Is it on?" });

const configTable = (page: Page): Locator =>
  page.locator("table").filter({ hasText: "What it is set to" });

async function saveFlag(page: Page): Promise<void> {
  await flagForm(page).getByRole("button", { name: "Save this setting" }).click();
}

async function saveConfig(page: Page): Promise<void> {
  await configForm(page).getByRole("button", { name: "Save this setting" }).click();
}

test.beforeEach(async () => {
  await resetConfigurationMock();
});

test.describe("feature flags", () => {
  // The four states of a flag, all on screen at once. Each is a different
  // sentence, and "Enabled: true, 40%" is the wrong answer for two of them.
  test("reads every flag state in plain English, not as raw columns", async ({ page }) => {
    await login(page);
    await openSettings(page);

    const table = flagTable(page);
    await expect(table).toBeVisible();

    // On at 100% — everyone has it.
    await expect(table.locator("tr", { hasText: "payroll.new_ui" })).toContainText(
      "On for everyone",
    );

    // On at 25% — a partial release. The share is live and must be stated.
    const partial = table.locator("tr", { hasText: "expenses.receipt_scan" });
    await expect(partial).toContainText("On — 25%");
    await expect(partial).toContainText("Reaching 25% of people");

    // DISABLED at 40% — off for EVERYONE. This is the one a two-column
    // rendering gets wrong: the 40% is dormant, not a partial rollout.
    const offDespiteShare = table.locator("tr", { hasText: "treasury.fx_preview" });
    await expect(offDespiteShare).toContainText("Off");
    await expect(offDespiteShare).not.toContainText("Reaching 40%");

    // On at 0% — switched on and reaching nobody, the normal start of a staged
    // release. "Enabled" alone would read as "people have this".
    await expect(table.locator("tr", { hasText: "ledger.staged_close" })).toContainText(
      "On — nobody yet",
    );
  });

  // tenant_id null is not a missing value — it is the environment-wide default,
  // which applies to every organisation that has not set its own.
  test("distinguishes an organisation's own flag from the environment-wide default", async ({
    page,
  }) => {
    await login(page);
    await openSettings(page);

    const table = flagTable(page);
    await expect(table.locator("tr", { hasText: "payroll.new_ui" })).toContainText(
      "This organisation only",
    );
    await expect(table.locator("tr", { hasText: "ledger.staged_close" })).toContainText(
      "Everyone in this environment",
    );
  });

  test("records a new flag and reports what was actually stored", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await page.getByLabel("Which feature").fill("checkout.new_flow");
    await page.getByLabel(/Share of people who get it/).fill("30");
    await saveFlag(page);

    // The banner reads the RECORDED row back, rather than restating the form's
    // inputs — the two differ whenever the service defaults something.
    await expect(flagForm(page).getByText(/^Saved\./)).toBeVisible();
    await expect(flagTable(page).locator("tr", { hasText: "checkout.new_flow" })).toContainText(
      "On — 30%",
    );
  });

  // THE distinction on this service. Submitting the state that is already in
  // force writes nothing, and the console must say so rather than claim a save.
  test("says nothing was written when the submitted state already matched", async ({ page }) => {
    await login(page);
    await openSettings(page);

    // payroll.new_ui is seeded on at 100%, which is what this form submits by
    // default (ticked, blank share).
    await page.getByLabel("Which feature").fill("payroll.new_ui");
    await saveFlag(page);

    await expect(flagForm(page).getByText(/Nothing to change/)).toBeVisible();
    await expect(flagForm(page).getByText(/no new version was recorded/)).toBeVisible();
  });

  test("toggling a flag from the table switches it and keeps its share", async ({ page }) => {
    await login(page);
    await openSettings(page);

    // expenses.receipt_scan is on at 25%. Switching it off must not reset the
    // share — the row carries it back so a toggle is not also an edit.
    await page.getByRole("button", { name: /Switch off expenses\.receipt_scan/ }).click();

    const row = flagTable(page).locator("tr", { hasText: "expenses.receipt_scan" });
    await expect(row).toContainText("Off");
    // Off, and the dormant share is still reported as what WOULD apply.
    await expect(row).toContainText("Would reach 25% if switched on");
  });
});

test.describe("configuration values", () => {
  test("renders each value shape as what it is", async ({ page }) => {
    await login(page);
    await openSettings(page);

    const table = configTable(page);
    await expect(table.locator("tr", { hasText: "payroll.release.batch_size" })).toContainText(
      "250",
    );
    await expect(table.locator("tr", { hasText: "close.cutoff_timezone" })).toContainText(
      "Europe/London",
    );
    // A structured value is described rather than clipped: a half-shown setting
    // reads as the whole setting.
    await expect(table.locator("tr", { hasText: "notifications.digest" })).toContainText(
      /A setting with 2 parts/,
    );
  });

  // The service stores jsonb and refuses a bare token, so typing a timezone used
  // to come back as "the value must be valid JSON. A bare string needs quotes" —
  // which asks a non-developer to know a wire format in order to set a timezone.
  test("accepts plain text as a value and states the assumption it made", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await page.getByLabel("Which setting").fill("close.cutoff_city");
    await page.getByLabel("What it should be set to").fill("Lisbon");
    await saveConfig(page);

    await expect(configForm(page).getByText(/Saved as the text "Lisbon"/)).toBeVisible();
  });

  // The other half of that rule: a half-typed structure must NOT be rescued into
  // a string, because storing it as text records something the services reading
  // it cannot use — silently, and under the reader's own key.
  test("refuses a broken structure rather than storing it as text", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await page.getByLabel("Which setting").fill("notifications.digest");
    await page.getByLabel("What it should be set to").fill('{ "hour": 17');
    await saveConfig(page);

    await expect(configForm(page).getByText(/could not be read/)).toBeVisible();
    await expect(configForm(page).getByText(/missing bracket, comma, or quote mark/)).toBeVisible();
  });
});

test.describe("exact-scope lookup", () => {
  // The single most misread response this service produces. A tenant-scoped miss
  // does NOT fall back to the environment-wide default, so "not found" here says
  // nothing about whether the setting is set — and the console has to say so, or
  // the reader concludes it is unset and sets it again at the wrong scope.
  test("a miss explains that it checked one scope and nothing else", async ({ page }) => {
    await login(page);
    await openSettings(page);

    // ledger.staged_close exists ONLY as the environment-wide default, so asking
    // about this organisation is a genuine miss at that exact tuple.
    await page
      .getByPlaceholder("checkout.new_flow local this-organisation")
      .fill("ledger.staged_close local this-organisation");
    await page.getByRole("button", { name: "Check this feature" }).click();

    await expect(page.getByText(/Nothing has been recorded/)).toBeVisible();
    // And it points at the scope that does hold a value.
    await expect(page.getByText(/ledger\.staged_close local everyone/)).toBeVisible();
  });

  test("the same lookup at the scope that holds it answers in plain English", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await page
      .getByPlaceholder("checkout.new_flow local this-organisation")
      .fill("ledger.staged_close local everyone");
    await page.getByRole("button", { name: "Check this feature" }).click();

    await expect(page.getByText(/switched on, but nobody has it yet/)).toBeVisible();
  });

  // A scope word the lookup does not understand used to fall through to the
  // global default, so the reader was answered about a scope they had not asked
  // about — and the miss message then told them to try the one they had just
  // been given.
  test("an unrecognised scope word is refused rather than guessed", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await page
      .getByPlaceholder("payroll.cutoff_hour local this-organisation")
      .fill("payroll.release.batch_size local sometimes");
    await page.getByRole("button", { name: "Check this setting" }).click();

    await expect(page.getByText(/is not a scope this lookup understands/)).toBeVisible();
  });
});

test.describe("refusals", () => {
  // Every refusal below is a rule the console cannot check for itself, which is
  // exactly when a bare status line leaves the reader with nothing to do next.

  test("a denied authorization says the change was not written", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await armRefusal({ status: 403, error: "authorization_denied", action: "FEATURE_FLAG_WRITE" });
    await page.getByLabel("Which feature").fill("audit.denied_flow");
    await saveFlag(page);

    await expect(flagForm(page).getByText(/not permitted to change configuration/)).toBeVisible();
    await expect(flagForm(page).getByText(/Nothing was written/)).toBeVisible();
  });

  // Fail-closed, explained. The change was refused rather than allowed
  // unchecked, and that difference is the whole posture.
  test("an unavailable permission check says it refused rather than allowed", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await armRefusal({ status: 503, error: "authz_unavailable" });
    await page.getByLabel("Which feature").fill("audit.unavailable_flow");
    await saveFlag(page);

    await expect(flagForm(page).getByText(/refused rather than allowed unchecked/)).toBeVisible();
  });

  // A lost race is not a fault. Nothing of the caller's was written and
  // resubmitting goes through, which is the one thing the operator needs told.
  test("a concurrent write says to submit it again", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await armRefusal({ status: 409, error: "scope_race_conflict" });
    await page.getByLabel("Which feature").fill("audit.raced_flow");
    await saveFlag(page);

    await expect(flagForm(page).getByText(/submit it again/)).toBeVisible();
  });

  test("an out-of-range share is refused before it reaches the service", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await page.getByLabel("Which feature").fill("audit.range_flow");

    // The browser's own min/max validation is turned off for this submission on
    // purpose. It is a real first line of defence and it stays in the markup,
    // but it is not the check that matters: a Server Action is reachable by
    // direct POST, not only through this form, so the range has to hold on the
    // server. Leaving client validation on would mean this test proved only
    // that Chrome enforces a max attribute.
    await flagForm(page).evaluate((form) => (form as HTMLFormElement).noValidate = true);
    await page
      .getByLabel(/Share of people who get it/)
      .evaluate((el) => ((el as HTMLInputElement).value = "150"));
    await saveFlag(page);

    await expect(flagForm(page).getByText(/between 0 and 100/)).toBeVisible();
  });

  test("a store outage says nothing was written", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await armRefusal({ status: 503, error: "store_unavailable" });
    await page.getByLabel("Which feature").fill("audit.store_flow");
    await saveFlag(page);

    await expect(flagForm(page).getByText(/could not reach its database/)).toBeVisible();
  });
});
