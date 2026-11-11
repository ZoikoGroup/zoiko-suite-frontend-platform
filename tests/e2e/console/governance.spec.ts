import { expect, test } from "./fixtures";

// Governance Log console (/admin/governance) against the live local stack:
// governance-decision-log-svc, authorization-svc, identity-context-svc,
// tenant-entity-registry-svc (and policy-svc for the replay row). Run
// deployments/scripts/seed-demo-rbac.ps1 first so the demo admin holds
// GOVERNANCE_DECISION_RECORD / _READ / _REPLAY and GOVERNANCE_EVIDENCE_SEAL.
// The ledger is append-only: what these tests record stays, by design.

test.describe.configure({ mode: "serial", retries: 0 });

test.describe("Governance Log console", () => {
  test("KPIs, the three panels and the register render from live data", async ({ authedPage: page }) => {
    await page.goto("/admin/governance");
    await expect(page.locator("h1", { hasText: "Governance Log" })).toBeVisible();
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

  test("New Decision records an immutable decision and the register shows it", async ({ authedPage: page }) => {
    const title = `UI e2e decision ${Date.now()}`;
    await page.goto("/admin/governance");
    await page.getByRole("button", { name: "New Decision" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("input[name='title']").fill(title);
    await dialog.locator("input[name='action_type']").fill("PROCUREMENT_LIMIT_INCREASE");
    await dialog.locator("select[name='outcome']").selectOption("PENDING");
    await dialog.locator("select[name='priority']").selectOption("HIGH");
    await dialog.locator("input[name='rule_basis']").fill("PROCUREMENT-POLICY:v2");
    await dialog.locator("button[type='submit']").click();
    await expect(dialog.getByText(/Decision recorded as GD-/)).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");

    await page.goto(`/admin/governance?q=${encodeURIComponent(title)}`);
    await expect(page.locator("table tbody tr")).toHaveCount(1);
    await expect(page.locator("table tbody tr").first()).toContainText("Procurement & Commercial");
    await expect(page.locator("table tbody tr").first()).toContainText("Pending");
  });

  test("the drawer resolves a pending decision with a follow-up, linked both ways", async ({ authedPage: page }) => {
    await page.goto("/admin/governance?status=PENDING");
    await page.locator("table tbody tr td:first-child a").first().click();
    await expect(page.getByText("Decision Details")).toBeVisible();
    await page.locator("aside").getByRole("button", { name: /Record Outcome|Record Follow-up/ }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("select[name='outcome']").selectOption("APPROVED");
    await dialog.locator("button[type='submit']").click();
    await expect(dialog.getByText(/Follow-up recorded as GD-/)).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator('nav[aria-label="Detail sections"] a', { hasText: "Approvals" }).click();
    await expect(page.locator("aside").getByText("Follow-ups")).toBeVisible();
    await expect(page.locator("aside a", { hasText: "Resolve:" }).first()).toBeVisible();
  });

  test("evidence: the record re-computes, the chain verifies, a package seals and verifies", async ({ authedPage: page }) => {
    await page.goto("/admin/governance");
    await page.locator("table tbody tr td:first-child a").first().click();
    await page.locator('nav[aria-label="Detail sections"] a', { hasText: "Evidence" }).click();
    await expect(page.locator("aside").getByText("Re-computes")).toBeVisible();

    await page.goto("/admin/governance?tab=evidence");
    await page.getByRole("button", { name: "Verify Chain" }).click();
    await page.locator("dialog[open] button[type='submit']").click();
    await expect(page.locator("dialog[open]").getByText(/The ledger is intact/)).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Seal Package" }).click();
    await page.locator("dialog[open] button[type='submit']").click();
    await expect(page.locator("dialog[open]").getByText(/sealed decisions 1–|already sealed/)).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");

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
