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
// ─── secret-vault-integration-svc mock ────────────────────────────────────────

const SECRET_VAULT_MOCK_URL =
  process.env.SECRET_VAULT_MOCK_URL ??
  `http://localhost:${process.env.SECRET_VAULT_MOCK_PORT ?? 18087}`;

/** Restore the secret-vault mock's pristine seed. Run alongside resetMock(). */
export async function resetSecretVaultMock(): Promise<void> {
  await fetch(`${SECRET_VAULT_MOCK_URL}/_e2e/reset`, { method: "POST" });
}

export type RecordedRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON body, for asserts on what a write actually submitted. */
  body?: unknown;
};

/**
 * Requests the console actually sent to secret-vault-integration-svc, optionally
 * filtered by method and path.
 *
 * Asserting on rendered output alone cannot catch a header defect: the console
 * shipped for weeks sending none of the canonical §4 headers, and every page
 * still rendered — it was every WRITE that answered 401. This is how a spec sees
 * the wire.
 */
export async function secretVaultRequests(
  method?: string,
  path?: string,
): Promise<RecordedRequest[]> {
  const response = await fetch(`${SECRET_VAULT_MOCK_URL}/_e2e/requests`);
  const all = (await response.json()) as RecordedRequest[];
  return all.filter(
    (r) => (method ? r.method === method : true) && (path ? r.path === path : true),
  );
}

// ─── delegated-authority-svc mock ─────────────────────────────────────────────

const DELEGATED_AUTHORITY_MOCK_URL =
  process.env.DELEGATED_AUTHORITY_MOCK_URL ??
  `http://localhost:${process.env.DELEGATED_AUTHORITY_MOCK_PORT ?? 18086}`;

export { DELEGATED_AUTHORITY_MOCK_URL };

/** Restore the delegated-authority mock's pristine seed. Run in beforeEach. */
export async function resetDelegatedAuthorityMock(): Promise<void> {
  await fetch(`${DELEGATED_AUTHORITY_MOCK_URL}/_e2e/reset`, { method: "POST" });
}

/**
 * Requests the console actually sent to delegated-authority-svc, optionally
 * filtered by method and path.
 *
 * Same purpose as secretVaultRequests: a header defect cannot be seen on the
 * page — the console once shipped sending none of the canonical §4 headers and
 * every panel still rendered, because it was every WRITE that answered 401
 * once enforcement turned on. This is how a spec sees the wire.
 */
export async function delegatedAuthorityRequests(
  method?: string,
  path?: string,
): Promise<RecordedRequest[]> {
  const response = await fetch(`${DELEGATED_AUTHORITY_MOCK_URL}/_e2e/requests`);
  const all = (await response.json()) as RecordedRequest[];
  return all.filter(
    (r) => (method ? r.method === method : true) && (path ? r.path === path : true),
  );
}

// ─── tenant-entity-registry-svc mock (gateway-auth's frontend contract) ──────

const TENANT_REGISTRY_MOCK_URL =
  process.env.TENANT_REGISTRY_MOCK_URL ??
  `http://localhost:${process.env.TENANT_REGISTRY_MOCK_PORT ?? 18081}`;

/** Restore the registry mock's pristine seed, gateway mode included. */
export async function resetTenantRegistryMock(): Promise<void> {
  await fetch(`${TENANT_REGISTRY_MOCK_URL}/_e2e/reset`, { method: "POST" });
}

/**
 * Put the simulated gateway into a refusal mode for subsequent requests.
 *
 * "denied" and "unresolved" are what gateway-auth-svc puts in X-Tenant-Context
 * when GOV-01 resolution refuses or cannot complete. Traefik returns an
 * unsuccessful ForwardAuth reply verbatim, so from the console's side they
 * arrive on the response to whichever backend it was addressing — which is why
 * the registry mock, not a gateway mock, is where this is injected.
 */
export async function setGatewayContext(
  mode: "none" | "denied" | "unresolved",
): Promise<void> {
  await fetch(`${TENANT_REGISTRY_MOCK_URL}/_e2e/tenant-context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}
