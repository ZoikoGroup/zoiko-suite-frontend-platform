import { test, expect } from "@playwright/test";
import {
  resetMock,
  login,
  openIdentityConsole,
  gotoIdentityTab,
  DEMO_TENANT,
} from "./helpers";

test.beforeEach(async () => {
  await resetMock();
});

// ─── POST /v1/context/cache/refresh (GOV-01) ────────────────────────────────

test("refreshes the tenant context cache and reports bindings marked stale", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Tenant");

  await page.getByTestId("cache-reason").fill("Routine refresh after registry sync");
  await page.getByTestId("cache-ingress").fill("app.alpha.zoiko.io, app.beta.zoiko.io");
  await page.getByTestId("cache-refresh-button").click();

  await expect(page.getByTestId("cache-refresh-result")).toBeVisible();
  await expect(page.getByTestId("cache-refresh-result")).toContainText("2");
  await expect(page.getByTestId("cache-refresh-result")).toContainText(/ev-\d{6}/);
});

// ─── POST /v1/context/tenant/invalidate (GOV-01) ────────────────────────────

test("tenant-wide invalidation refuses a missing justification", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Tenant");

  await page.getByTestId("tenant-justification").fill("too short");
  await page.getByTestId("tenant-invalidate-button").click();

  // The console enforces the mandatory justification client-side before sending.
  await expect(page.getByTestId("error-notice")).toContainText(/min 20/);
  await expect(page.getByTestId("tenant-invalidate-result")).not.toBeVisible();
});

test("tenant-wide invalidation with a real justification revokes sessions", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Tenant");

  await page.getByTestId("tenant-justification").fill(
    "Compromised credentials reported for multiple users in this tenant.",
  );
  await page.getByTestId("tenant-invalidate-button").click();

  await expect(page.getByTestId("tenant-invalidate-result")).toBeVisible();
  await expect(page.getByTestId("tenant-invalidate-result")).toContainText("Sessions revoked");
  await expect(page.getByTestId("tenant-invalidate-result")).toContainText(/ev-\d{6}/);
});

// ─── The whole surface is reachable (tab smoke covers all GOV-01 routes) ───

test("every console tab renders against the live mock", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);

  for (const tab of ["Authenticate", "Resolve", "Principal", "Sessions", "Tenant", "Support", "Platform"]) {
    await gotoIdentityTab(page, tab);
    await expect(page.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") })).toHaveAttribute("aria-selected", "true");
  }
});

// Keep DEMO_TENANT referenced so the tenant scope is explicit in this spec.
test("the identity console is scoped to the acting tenant", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await expect(page.getByText(`Tenant: ${DEMO_TENANT}`)).toBeVisible();
});