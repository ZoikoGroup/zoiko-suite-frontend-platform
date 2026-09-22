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

// ─── access-control-svc mock ──────────────────────────────────────────────────

const ACCESS_CONTROL_MOCK_URL =
  process.env.ACCESS_CONTROL_MOCK_URL ??
  `http://localhost:${process.env.ACCESS_CONTROL_MOCK_PORT ?? 18137}`;

export { ACCESS_CONTROL_MOCK_URL };

/** Restore the access-control mock's pristine seed. Run alongside resetMock(). */
export async function resetAccessControlMock(): Promise<void> {
  await fetch(`${ACCESS_CONTROL_MOCK_URL}/_e2e/reset`, { method: "POST" });
}

/**
 * Make the access-control mock refuse the NEXT write, once.
 *
 * It exists so a spec can see how the console renders a refusal without making
 * the refusal the mock's normal behaviour. The refusals worth arming are the
 * ones the console cannot predict for itself — a 403 that depends on a grant
 * only authorization-svc knows about, and the 503 that means a retirement did
 * NOT reach the enforcement plane.
 */
export async function armAccessControlRefusal(refusal: {
  status: number;
  error_code: string;
  error_message: string;
}): Promise<void> {
  await fetch(`${ACCESS_CONTROL_MOCK_URL}/_e2e/arm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(refusal),
  });
}

/**
 * Make the next role create answer 200 with the role already holding roleCode —
 * exactly what access-control-svc answers when a correlation id has already
 * been used.
 *
 * Armed rather than driven from the browser because the browser cannot reach
 * that path: the page mints a fresh correlation id on every server render and
 * the hidden input carrying it is React-controlled, so a value written into the
 * DOM is reconciled away before the submission is serialised. The service's own
 * idempotency is proved in its Go suite and again live by scripts/audit.sh;
 * what this arms is the half only the console can get wrong.
 */
export async function armAccessControlReplay(roleCode: string): Promise<void> {
  await fetch(`${ACCESS_CONTROL_MOCK_URL}/_e2e/arm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: 200, replay_role_code: roleCode }),
  });
}

// ─── notification-svc mock ────────────────────────────────────────────────────

const NOTIFICATION_MOCK_URL =
  process.env.NOTIFICATION_MOCK_URL ??
  `http://localhost:${process.env.NOTIFICATION_MOCK_PORT ?? 18133}`;

export { NOTIFICATION_MOCK_URL };

/**
 * Restore the notification mock's pristine seed.
 *
 * Needed in the beforeEach of EVERY spec that signs in, not only the
 * notification one: the topbar bell polls the unread count and the unread list
 * on every admin page, so a spec that leaves a notice marked read changes what
 * the next spec's bell renders.
 */
export async function resetNotificationMock(): Promise<void> {
  await fetch(`${NOTIFICATION_MOCK_URL}/_e2e/reset`, { method: "POST" });
}

/**
 * Requests the console actually sent to notification-svc, optionally filtered by
 * method and path.
 *
 * Same purpose as secretVaultRequests, and it matters more here than anywhere
 * else in the suite. On this service almost every interesting outcome is a 2xx:
 * a FAILED delivery answers 201 by design, and so does one rescheduled after a
 * transient failure. Asserting on rendered output alone cannot see whether the
 * console sent a template alongside a subject (which the service refuses), or
 * whether it dropped the §4 headers on the write — the console once shipped
 * sending none of them, and every page still rendered because only WRITES
 * answered 401.
 */
export async function notificationRequests(
  method?: string,
  path?: string,
): Promise<RecordedRequest[]> {
  const response = await fetch(`${NOTIFICATION_MOCK_URL}/_e2e/requests`);
  const all = (await response.json()) as RecordedRequest[];
  return all.filter(
    (r) => (method ? r.method === method : true) && (path ? r.path === path : true),
  );
}

/**
 * Make the notification mock refuse the NEXT request, once.
 *
 * `only` decides which: "write" (the default) arms the send, "any" arms the
 * next request of either kind — which is how a spec reaches the register's
 * unreachable-service state, since that is a READ failing.
 *
 * Armed rather than provoked from the browser because these are refusals the
 * console cannot cause for itself: a 403 that depends on a NOTIFICATION_SEND
 * grant only authorization-svc knows about, and the 503 that means the register
 * could not be reached at all. Both have their own console copy, and both are
 * wrong in a way a user would act on — a 503 rendered as "no notifications"
 * tells an operator nothing was sent when nobody knows what was sent.
 */
export async function armNotificationRefusal(refusal: {
  status: number;
  error: string;
  message?: string;
  only?: "write" | "any";
  /**
   * Refuse only requests whose path starts with this. Not optional in
   * practice: one page load makes several calls here — the template catalogue,
   * the entity register, and the bell's count and list concurrently — so an
   * untargeted arm is consumed by whichever arrives first, and the spec then
   * asserts against a page where a different call failed.
   */
  path?: string;
  /**
   * Refuse only requests carrying this query parameter. It is what separates
   * the two GET reads that share a path: the entity REGISTER read carries
   * `legal_entity_id`, the bell's inbox read carries `unread_only`. Without it,
   * a spec proving the register degrades cleanly also takes the bell down —
   * intermittently, depending on which poll interleaved.
   */
  hasQuery?: string;
  /**
   * How many matching requests to refuse. More than one is usually right: the
   * bell reads its count and its list concurrently, and React re-invokes a
   * mount effect in development, so a single refusal is overwritten by the
   * succeeding load that follows it.
   */
  times?: number;
}): Promise<void> {
  await fetch(`${NOTIFICATION_MOCK_URL}/_e2e/arm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(refusal),
  });
}
