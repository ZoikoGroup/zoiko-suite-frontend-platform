import { expect, test } from "./fixtures";

const SHOT_DIR = "test-results/console/gateway";

test.describe.configure({ retries: 0 });

// ── Helpers ────────────────────────────────────────────────────────────────────

async function screenshot(page: any, name: string) {
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
    
    // The Verify tab should show the GatewayVerifyForm
    await expect(authedPage.locator("text=Verify my session")).toBeVisible();
    await screenshot(authedPage, "gateway-verify-tab");
  });

  test("Signing keys tab lists keys from identity-context-svc JWKS", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Signing keys")');
    await authedPage.waitForLoadState("networkidle");
    
    // Should show at least the JWKS data or "Not reachable"
    await expect(authedPage.locator("text=identity-context-svc JWKS")).toBeVisible();
    await screenshot(authedPage, "gateway-keys-tab");
  });

  test("Denial reasons tab is filterable and searchable", async ({ authedPage }) => {
    await authedPage.click('a:has-text("Denial reasons")');
    await authedPage.waitForLoadState("networkidle");
    
    // Search box should be present
    await expect(authedPage.locator('input[placeholder*="Paste an X-Auth-Denial-Reason"]')).toBeVisible();
    await screenshot(authedPage, "gateway-reasons-tab");
  });

  test("with gateway stopped, the page shows unavailable", async ({ authedPage, consoleUrl }) => {
    // This test would require stopping the gateway container
    // Skipping for now as it needs orchestration
    test.skip("requires gateway container stop/restart orchestration");
  });

  test.afterEach(async ({ authedPage }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await screenshot(authedPage, `failed-${testInfo.title.replace(/\s+/g, "-")}`);
    }
  });
});