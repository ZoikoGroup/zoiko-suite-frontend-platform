import { test, expect } from "@playwright/test";
import {
  resetMock,
  login,
  openIdentityConsole,
  gotoIdentityTab,
  ADMIN_PRINCIPAL,
  OTHER_TENANT_PRINCIPAL,
} from "./helpers";

test.beforeEach(async () => {
  await resetMock();
});

// ─── GET /v1/principals/{id} + roles + delegations ──────────────────────────

test("loads a principal profile with its role assignments and delegations", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Principal");

  await page.getByTestId("principal-id").fill(ADMIN_PRINCIPAL);
  await page.getByTestId("principal-load").click();

  await expect(page.getByTestId("principal-result")).toBeVisible();
  await expect(page.getByTestId("principal-result")).toContainText("Lingaraj (Super Admin)");
  await expect(page.getByTestId("principal-result")).toContainText("admin@zoikosuite.com");
  await expect(page.getByTestId("principal-result").getByText("ACTIVE").first()).toBeVisible();

  // Two seeded role assignments.
  await expect(page.getByTestId("roles-table").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("roles-table")).toContainText("role-platform-admin");
  await expect(page.getByTestId("roles-table")).toContainText("role-identity-admin");

  // Two seeded delegated authority grants where the admin is the delegate.
  await expect(page.getByTestId("delegations-table").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("delegations-table")).toContainText("MONETARY: 250000");
});

test("a principal in another tenant answers 404 — no cross-tenant enumeration", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Principal");

  await page.getByTestId("principal-id").fill(OTHER_TENANT_PRINCIPAL);
  await page.getByTestId("principal-load").click();

  await expect(page.getByTestId("error-notice")).toContainText("principal not found");
  await expect(page.getByTestId("principal-result")).not.toBeVisible();
});

// ─── PUT /v1/principals/{id}/status ─────────────────────────────────────────

test("transitions a principal's status and reflects the new value", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Principal");

  await page.getByTestId("principal-id").fill(ADMIN_PRINCIPAL);
  await page.getByTestId("principal-load").click();
  await expect(page.getByTestId("principal-result")).toBeVisible();

  await page.getByTestId("status-select").selectOption("SUSPENDED");
  await page.getByTestId("status-update").click();

  await expect(page.getByTestId("status-message")).toContainText("Status updated to SUSPENDED");
  await expect(page.getByTestId("principal-result").getByText("SUSPENDED").first()).toBeVisible();
});