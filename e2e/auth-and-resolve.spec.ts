import { test, expect } from "@playwright/test";
import {
  resetMock,
  login,
  openIdentityConsole,
  gotoIdentityTab,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  DEMO_TENANT,
  LEGAL_ENTITY,
} from "./helpers";

test.beforeEach(async () => {
  await resetMock();
});

// ─── Login (two-hop authenticate → resolve) ─────────────────────────────────

test("signs in through the two-hop identity flow and lands on the admin console", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/admin/);
});

test("rejects an unknown password uniformly (same message as any other rejection)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("DefinitelyWrongPassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

// ─── POST /v1/authenticate tab ──────────────────────────────────────────────

test("authenticate tab exchanges a password for a short-lived bearer token", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Authenticate");

  await page.getByTestId("auth-tenant").fill(DEMO_TENANT);
  await page.getByTestId("auth-email").fill(ADMIN_EMAIL);
  await page.getByTestId("auth-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("authenticate-button").click();

  await expect(page.getByTestId("authenticate-result")).toBeVisible();
  const token = await page.getByTestId("auth-token").inputValue();
  expect(token.startsWith("t_")).toBe(true);
  await expect(page.getByText("300s")).toBeVisible();
  await expect(page.getByText(ADMIN_PRINCIPAL_ID_LITERAL, { exact: true })).toBeVisible();
});

// ─── POST /v1/context/resolve tab ───────────────────────────────────────────

test("resolve tab exchanges the bearer token for a signed envelope and decodes it", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);

  // Get a token from the authenticate tab.
  await gotoIdentityTab(page, "Authenticate");
  await page.getByTestId("auth-tenant").fill(DEMO_TENANT);
  await page.getByTestId("auth-email").fill(ADMIN_EMAIL);
  await page.getByTestId("auth-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("authenticate-button").click();
  await expect(page.getByTestId("authenticate-result")).toBeVisible();
  const token = await page.getByTestId("auth-token").inputValue();

  // Resolve it.
  await gotoIdentityTab(page, "Resolve");
  await page.getByTestId("resolve-bearer").fill(token);
  await page.getByTestId("resolve-entity").fill(LEGAL_ENTITY);
  await page.getByTestId("resolve-button").click();

  await expect(page.getByTestId("resolve-result")).toBeVisible();
  await expect(page.getByTestId("resolve-evidence")).toContainText(/ev-\d{6}/);
  await expect(page.getByTestId("resolve-session-id")).toContainText(/sess-\d{5}/);
  await expect(page.getByTestId("resolve-envelope")).toHaveValue(/^ey/);

  // Decoded claims panel: principal name and trust posture are rendered.
  await expect(page.getByTestId("resolve-result").getByText("Lingaraj (Super Admin)")).toBeVisible();
  await expect(page.getByTestId("resolve-result").getByText("STANDARD")).toBeVisible();
});

test("resolve tab refuses a call with neither token nor SAML assertion", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);

  await gotoIdentityTab(page, "Resolve");
  await page.getByTestId("resolve-entity").fill(LEGAL_ENTITY);
  await page.getByTestId("resolve-button").click();

  await expect(page.getByTestId("error-notice")).toContainText(/bearer token or a SAML assertion/);
});

const ADMIN_PRINCIPAL_ID_LITERAL = "33333333-3333-3333-3333-333333333333";