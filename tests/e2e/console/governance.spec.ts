import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const SHOT_DIR = "test-results/console/governance";

test.describe.configure({ retries: 0 });

// ── Helpers ────────────────────────────────────────────────────────────────────

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Governance Decision Log console (/admin/governance)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto("/admin/governance");
    await authedPage.waitForLoadState("networkidle");
  });

  test("loads and shows all major sections", async ({ authedPage }) => {
    // Page header
    await expect(authedPage.locator("h1:has-text('Governance Log')")).toBeVisible();
    
    // What you are looking at card
    await expect(authedPage.locator("text=What you are looking at")).toBeVisible();
    
    // Decision log card with filters
    await expect(authedPage.locator("text=Decision log")).toBeVisible();
    await expect(authedPage.locator("text=Newest first")).toBeVisible();
    
    // Filter bar fields
    await expect(authedPage.locator('label:has-text("Action type")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Actor")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Legal entity")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Rule basis")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("From")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("To")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Per page")')).toBeVisible();
    
    // Apply filters button
    await expect(authedPage.locator('button:has-text("Apply filters")')).toBeVisible();
    
    // Look up a decision card
    await expect(authedPage.locator("text=Look up a decision")).toBeVisible();
    await expect(authedPage.locator('input[placeholder*="4f8c2a91"]')).toBeVisible();
    
    // Record a decision card
    await expect(authedPage.locator("text=Record a decision")).toBeVisible();
    await expect(authedPage.locator('label:has-text("Action type")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Outcome")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Rule basis")')).toBeVisible();
    
    await screenshot(authedPage, "governance-page-full");
  });

  test("decision log table renders with columns", async ({ authedPage }) => {
    // Wait for the decision log panel to load
    await authedPage.waitForLoadState("networkidle");
    
    // Table should be present (or empty state)
    const table = authedPage.locator("table").first();
    const emptyState = authedPage.locator("text=No decisions recorded yet");
    
    await expect(table.or(emptyState)).toBeVisible();
    
    // If table exists, check columns
    if (await table.isVisible()) {
      await expect(authedPage.locator("th:has-text('What was decided')")).toBeVisible();
      await expect(authedPage.locator("th:has-text('Outcome')")).toBeVisible();
      await expect(authedPage.locator("th:has-text('Why')")).toBeVisible();
      await expect(authedPage.locator("th:has-text('Triggered by')")).toBeVisible();
      await expect(authedPage.locator("th:has-text('Legal entity')")).toBeVisible();
      await expect(authedPage.locator("th:has-text('Decided')")).toBeVisible();
    }
    
    await screenshot(authedPage, "governance-decision-log");
  });

  test("filter bar submits and updates URL", async ({ authedPage }) => {
    // Fill in a filter
    await authedPage.fill('input[name="action"]', "PAYROLL_RELEASE");
    await authedPage.click('button:has-text("Apply filters")');
    await authedPage.waitForLoadState("networkidle");
    
    // URL should contain the filter
    await expect(authedPage).toHaveURL(/action=PAYROLL_RELEASE/);
    
    await screenshot(authedPage, "governance-filter-applied");
  });

  test("clear filters link works", async ({ authedPage }) => {
    // First apply a filter
    await authedPage.fill('input[name="action"]', "PAYROLL_RELEASE");
    await authedPage.click('button:has-text("Apply filters")');
    await authedPage.waitForLoadState("networkidle");
    
    // Click clear
    await authedPage.click('a:has-text("Clear")');
    await authedPage.waitForLoadState("networkidle");
    
    // URL should not have the filter
    await expect(authedPage).not.toHaveURL(/action=PAYROLL_RELEASE/);
  });

  test("cursor pagination works when next page exists", async ({ authedPage }) => {
    // Set a small page size to increase chance of pagination
    await authedPage.fill('input[name="limit"]', "5");
    await authedPage.click('button:has-text("Apply filters")');
    await authedPage.waitForLoadState("networkidle");
    
    // Check for pagination controls
    const nextButton = authedPage.locator('a:has-text("Next")').or(authedPage.locator('button:has-text("Next")'));
    const hasNext = await nextButton.isVisible();
    
    if (hasNext) {
      // Click next page
      await nextButton.click();
      await authedPage.waitForLoadState("networkidle");
      
      // URL should have cursor parameter
      await expect(authedPage).toHaveURL(/cursor=/);
      
      await screenshot(authedPage, "governance-page-2");
    }
  });

  test("decision lookup by ID", async ({ authedPage }) => {
    // Look for a decision ID in the table
    const firstRow = authedPage.locator("table tbody tr").first();
    let decisionId = "";
    
    if (await firstRow.isVisible()) {
      // Extract decision ID from the row
      const idCell = firstRow.locator("td").first();
      const codeText = await idCell.locator("code").first().textContent();
      if (codeText) {
        decisionId = codeText.trim();
      }
    }
    
    if (decisionId) {
      // Paste into lookup
      await authedPage.fill('input[name="decision_id"]', decisionId);
      await authedPage.click('button:has-text("Look up")');
      await authedPage.waitForLoadState("networkidle");
      
      // Should show decision summary
      await expect(authedPage.locator("text=Decision details")).toBeVisible();
      await screenshot(authedPage, "governance-lookup-result");
    } else {
      // No decisions in log, test with a fake ID
      await authedPage.fill('input[name="decision_id"]', "00000000-0000-0000-0000-000000000000");
      await authedPage.click('button:has-text("Look up")');
      await authedPage.waitForLoadState("networkidle");
      
      // Should show not found message
      await expect(authedPage.locator("text=No decision with that id is visible")).toBeVisible();
      await screenshot(authedPage, "governance-lookup-not-found");
    }
  });

  test("record a decision form validation", async ({ authedPage }) => {
    // Try to submit empty form
    await authedPage.click('button:has-text("Record decision")');
    await authedPage.waitForLoadState("networkidle");
    
    // Should show validation errors
    await expect(authedPage.locator("text=An action type is required")).toBeVisible();
    await expect(authedPage.locator("text=An outcome is required")).toBeVisible();
    await expect(authedPage.locator("text=A rule basis is required")).toBeVisible();
    
    await screenshot(authedPage, "governance-record-validation");
  });

  test("evidence ledger section renders (G-07)", async ({ authedPage }) => {
    // Evidence ledger card should be present
    await expect(authedPage.locator("text=Evidence ledger (G-07)")).toBeVisible();
    
    // Verify chain button
    await expect(authedPage.locator('button:has-text("Verify Chain")')).toBeVisible();
    
    // Export chain button
    await expect(authedPage.locator('button:has-text("Export Chain")')).toBeVisible();
    
    // Seal package form
    await expect(authedPage.locator("text=Seal Package")).toBeVisible();
    await expect(authedPage.locator('label:has-text("Last Decision ID")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Package ID")')).toBeVisible();
    await expect(authedPage.locator('button:has-text("Seal Package")')).toBeVisible();
    await expect(authedPage.locator('button:has-text("Get Package")')).toBeVisible();
    
    await screenshot(authedPage, "governance-evidence-ledger");
  });

  test("verify chain button works", async ({ authedPage }) => {
    // Click verify chain
    await authedPage.click('button:has-text("Verify Chain")');
    await authedPage.waitForLoadState("networkidle");
    
    // Should show result (either success or error)
    const success = authedPage.locator("text=Valid:");
    const error = authedPage.locator("text=Failed to verify");
    
    await expect(success.or(error)).toBeVisible({ timeout: 15000 });
    
    await screenshot(authedPage, "governance-verify-chain");
  });

  test("seal package validation", async ({ authedPage }) => {
    // Try to seal without last decision ID
    await authedPage.click('button:has-text("Seal Package")');
    await authedPage.waitForLoadState("networkidle");
    
    // Should show validation error
    await expect(authedPage.locator("text=Last decision ID is required")).toBeVisible();
    
    await screenshot(authedPage, "governance-seal-validation");
  });

  test.afterEach(async ({ authedPage: _authedPage }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await screenshot(_authedPage, `failed-${testInfo.title.replace(/\s+/g, "-")}`);
    }
  });
});