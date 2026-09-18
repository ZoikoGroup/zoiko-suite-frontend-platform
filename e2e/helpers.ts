import { expect, type Page } from "@playwright/test";

const MOCK_URL = process.env.IDENTITY_MOCK_URL ?? `http://localhost:${process.env.IDENTITY_MOCK_PORT ?? 18080}`;

export const ADMIN_EMAIL = "admin@zoikosuite.com";
export const ADMIN_PASSWORD = "Zoiko@Governance1";

export const DEMO_TENANT = "11111111-1111-1111-1111-111111111111";
export const ADMIN_PRINCIPAL = "33333333-3333-3333-3333-333333333333";
export const OTHER_TENANT_PRINCIPAL = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const LEGAL_ENTITY = "22222222-2222-2222-2222-222222222222";

/** Restore the mock's pristine seed. Run in beforeEach of every spec. */
export async function resetMock(): Promise<void> {
  await fetch(`${MOCK_URL}/_e2e/reset`, { method: "POST" });
}

/** Sign in through the real two-hop flow (mock authenticate + resolve). */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
}

export async function openIdentityConsole(page: Page): Promise<void> {
  await page.goto("/admin/identity");
  await expect(page.getByRole("heading", { name: /Identity Context Service/ })).toBeVisible();
}

/** Open a tab by its role=tab button. */
export async function gotoIdentityTab(page: Page, tab: string): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") }).click();
}

/**
 * Run the Authenticate → Resolve dance and return the created session context id,
 * which callers need for the Sessions tab.
 */
export async function createSessionViaConsole(page: Page): Promise<string> {
  // Authenticate
  await gotoIdentityTab(page, "Authenticate");
  await page.getByTestId("auth-tenant").fill(DEMO_TENANT);
  await page.getByTestId("auth-email").fill(ADMIN_EMAIL);
  await page.getByTestId("auth-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("authenticate-button").click();
  await expect(page.getByTestId("authenticate-result")).toBeVisible();
  const token = await page.getByTestId("auth-token").inputValue();
  expect(token.length).toBeGreaterThan(0);

  // Resolve
  await gotoIdentityTab(page, "Resolve");
  await page.getByTestId("resolve-bearer").fill(token);
  await page.getByTestId("resolve-entity").fill(LEGAL_ENTITY);
  await page.getByTestId("resolve-button").click();
  await expect(page.getByTestId("resolve-result")).toBeVisible();

  const sessionText = (await page.getByTestId("resolve-session-id").textContent()) ?? "";
  const sessionId = sessionText.match(/sess-\d{5}/)?.[0] ?? "";
  expect(sessionId).toMatch(/^sess-/);
  return sessionId;
}