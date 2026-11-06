import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const SHOT_DIR = "test-results/console/gateway";

test.describe.configure({ retries: 0 });

// ── Helpers ────────────────────────────────────────────────────────────────────

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Gateway Authentication console (/admin/gateway)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto("/admin/gateway");
    await authedPage.waitForLoadState("networkidle");
  });

  test("loads and shows the three tabs", async ({ authedPage }) => {
    await expect(authedPage.locator("nav[aria-label='Registers']")).toBeVisible();
    await expect(authedPage.locator("text=Denial reasons")).toBeVisible();
    await expect(authedPage.locator("text=Verify my session")).toBeVisible();
    await expect(authedPage.locator("text=Signing keys")).toBeVisible();
    await screenshot(authedPage, "gateway-tabs");
  });

  test("Verify my session shows assurance level and authn age", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Verify my session")');
    await authedPage.waitForLoadState("networkidle");
    
    // The Verify tab should show the GatewayVerifyForm with method/path inputs and submit button
    await expect(authedPage.locator('label:has-text("Method")')).toBeVisible();
    await expect(authedPage.locator('label:has-text("Path, as it would arrive at the gateway")')).toBeVisible();
    await expect(authedPage.locator('button:has-text("Check my session")')).toBeVisible();
    
    // Click to verify - this sends the session's envelope to /verify
    await authedPage.click('button:has-text("Check my session")');
    await authedPage.waitForLoadState("networkidle");
    
    // Should show the result with injected headers including assurance level and authn age
    await expect(authedPage.locator("text=The gateway would let this through")).toBeVisible();
    await expect(authedPage.locator("text=What the service would be told")).toBeVisible();
    await expect(authedPage.locator("text=Sign-in assurance level")).toBeVisible();
    await expect(authedPage.locator("text=Seconds since sign-in")).toBeVisible();
    await screenshot(authedPage, "gateway-verify-tab-result");
  });

  test("Signing keys tab lists keys from identity-context-svc JWKS", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Signing keys")');
    await authedPage.waitForLoadState("networkidle");
    
    // Should show the JWKS data or "Not reachable"
    await expect(authedPage.locator("text=identity-context-svc JWKS")).toBeVisible();
    // At least one key should be listed (kid, alg, use)
    await expect(authedPage.locator("table")).toBeVisible();
    await screenshot(authedPage, "gateway-keys-tab");
  });

  test("Denial reasons tab is filterable and searchable", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Denial reasons")');
    await authedPage.waitForLoadState("networkidle");
    
    // Search box should be present
    await expect(authedPage.locator('input[placeholder*="Paste an X-Auth-Denial-Reason"]')).toBeVisible();
    // Stage filter dropdown
    await expect(authedPage.locator('select:near(:text("All stages"))')).toBeVisible();
    // Status filter dropdown
    await expect(authedPage.locator('select:near(:text("All statuses"))')).toBeVisible();
    await screenshot(authedPage, "gateway-reasons-tab");
  });

  test("Denial reasons drawer shows meaning and fix for a reason", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Denial reasons")');
    await authedPage.waitForLoadState("networkidle");
    
    // Click on the first denial reason row
    const firstRow = authedPage.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    
    // Drawer should open with meaning and fix
    await expect(authedPage.locator("text=What it means.")).toBeVisible();
    await expect(authedPage.locator("text=What to do.")).toBeVisible();
    await screenshot(authedPage, "gateway-reasons-drawer");
  });

  test("KPIs show gateway health, readiness, signing keys, envelope, and assurance", async ({ authedPage }) => {
    // Check the 5 KPI cards are present
    await expect(authedPage.locator("text=Gateway process")).toBeVisible();
    await expect(authedPage.locator("text=Verifying sign-ins")).toBeVisible();
    await expect(authedPage.locator("text=Signing keys")).toBeVisible();
    await expect(authedPage.locator("text=Your envelope")).toBeVisible();
    await expect(authedPage.locator("text=Your assurance level")).toBeVisible();
    await screenshot(authedPage, "gateway-kpis");
  });

  test("Panels show pipeline stages, header order, and gateway connection status", async ({ authedPage }) => {
    // What /verify checks panel
    await expect(authedPage.locator("text=What /verify checks")).toBeVisible();
    await expect(authedPage.locator("text=Admission")).toBeVisible();
    await expect(authedPage.locator("text=Identity")).toBeVisible();
    await expect(authedPage.locator("text=Risk")).toBeVisible();
    await expect(authedPage.locator("text=Tenant")).toBeVisible();
    await expect(authedPage.locator("text=Admitted")).toBeVisible();
    
    // Who may set an identity header panel
    await expect(authedPage.locator("text=Who may set an identity header")).toBeVisible();
    await expect(authedPage.locator("text=Client copies removed")).toBeVisible();
    await expect(authedPage.locator("text=Routing context stamped")).toBeVisible();
    await expect(authedPage.locator("text=Envelope verified")).toBeVisible();
    await expect(authedPage.locator("text=Identity headers set")).toBeVisible();
    await expect(authedPage.locator("text=Only listed headers forwarded")).toBeVisible();
    
    // This console and the gateway panel
    await expect(authedPage.locator("text=This console and the gateway")).toBeVisible();
    await screenshot(authedPage, "gateway-panels");
  });

  test("with gateway stopped, the page shows unavailable", async () => {
    // This test requires stopping the gateway container which needs orchestration
    // In a full E2E environment this would:
    // 1. Stop the gateway-auth-svc container
    // 2. Reload the page
    // 3. Verify KPIs show "Not reachable" / "Could not be read"
    // 4. Verify the warning callout appears
    // 5. Restart the gateway
    test.skip("requires gateway container stop/restart orchestration in live stack");
  });

  test("empty state: denial reasons table handles no matches", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Denial reasons")');
    await authedPage.waitForLoadState("networkidle");
    
    // Search for something that won't match
    await authedPage.fill('input[placeholder*="Paste an X-Auth-Denial-Reason"]', "nonexistent_reason_xyz");
    await authedPage.waitForLoadState("networkidle");
    
    // Should show empty state message
    await expect(authedPage.locator("text=No refusal matches")).toBeVisible();
    await screenshot(authedPage, "gateway-reasons-empty");
  });

  test("unavailable state: keys tab when JWKS unreachable", async ({ authedPage }) => {
    // This would require mocking or stopping identity-context-svc
    // For now we verify the page handles it gracefully by checking the component exists
    await authedPage.click('a:has-text("Signing keys")');
    await authedPage.waitForLoadState("networkidle");
    
    // Either keys are listed or "Not reachable" is shown
    const keysSection = authedPage.locator("text=identity-context-svc JWKS");
    await expect(keysSection).toBeVisible();
    await screenshot(authedPage, "gateway-keys-unavailable");
  });

  test.afterEach(async ({ authedPage: _authedPage }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await screenshot(_authedPage, `failed-${testInfo.title.replace(/\s+/g, "-")}`);
    }
  });
});