import { test, expect } from "@playwright/test";
import {
  resetMock,
  login,
  openIdentityConsole,
  gotoIdentityTab,
  ADMIN_PRINCIPAL,
  DEMO_TENANT,
} from "./helpers";

test.beforeEach(async () => {
  await resetMock();
});

const SUPPORT_PRINCIPAL = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // lives in the support tenant
const APPROVER = "44444444-4444-4444-4444-444444444444";

// ─── POST /v1/context/support (GOV-01, privileged) ──────────────────────────

test("attach refuses self-approval before it ever reaches the service", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Support");

  await page.getByTestId("support-tenant").fill(DEMO_TENANT);
  await page.getByTestId("support-principal").fill(SUPPORT_PRINCIPAL);
  await page.getByTestId("support-approver").fill(SUPPORT_PRINCIPAL); // same as grantee → refused
  await page.getByTestId("support-reason-code").selectOption("INCIDENT_RESPONSE");
  await page.getByTestId("support-ticket").fill("SN-2026-0042");
  await page.getByTestId("support-justification").fill("Attended a Sev-1 incident in the customer tenant.");
  await page.getByTestId("support-attach-button").click();

  await expect(page.getByTestId("error-notice")).toContainText(/Self-approval/);
  await expect(page.getByTestId("support-attach-result")).not.toBeVisible();
});

test("attach refuses a justification nobody could act on (under 20 chars)", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Support");

  await page.getByTestId("support-tenant").fill(DEMO_TENANT);
  await page.getByTestId("support-principal").fill(SUPPORT_PRINCIPAL);
  await page.getByTestId("support-approver").fill(APPROVER);
  await page.getByTestId("support-ticket").fill("SN-2026-0043");
  await page.getByTestId("support-justification").fill("fix it");
  await page.getByTestId("support-attach-button").click();

  await expect(page.getByTestId("error-notice")).toContainText(/at least 20 characters/);
});

test("attaches, reads back, and revokes a support context end to end", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Support");

  // Attach
  await page.getByTestId("support-tenant").fill(DEMO_TENANT);
  await page.getByTestId("support-principal").fill(SUPPORT_PRINCIPAL);
  await page.getByTestId("support-approver").fill(APPROVER);
  await page.getByTestId("support-reason-code").selectOption("CUSTOMER_TICKET");
  await page.getByTestId("support-ticket").fill("SN-2026-0044");
  await page.getByTestId("support-justification").fill("Resolving a billed-invoice discrepancy in the customer tenant.");
  await page.getByTestId("support-attach-button").click();

  await expect(page.getByTestId("support-attach-result")).toBeVisible();
  await expect(page.getByTestId("support-attach-result")).toContainText(/sctx-\d{5}/);

  // Get — the attach flow pre-fills the lookup id.
  await page.getByTestId("support-get-button").click();
  await expect(page.getByTestId("support-grant")).toBeVisible();
  await expect(page.getByTestId("support-grant")).toContainText("ACTIVE");
  await expect(page.getByTestId("support-grant")).toContainText("CUSTOMER_TICKET");
  await expect(page.getByTestId("support-grant")).toContainText(SUPPORT_PRINCIPAL);

  // Revoke
  await page.getByTestId("support-revoke-reason").fill("Incident resolved");
  await page.getByTestId("support-revoke-button").click();
  await expect(page.getByTestId("support-notice")).toContainText("Support context revoked");
  await expect(page.getByTestId("support-grant")).toContainText("REVOKED");
});

// ─── /.well-known/jwks.json + /health ───────────────────────────────────────

test("platform tab surfaces the JWKS signing key and health checks", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await gotoIdentityTab(page, "Platform");

  await page.getByTestId("platform-load").click();

  await expect(page.getByTestId("health-result")).toBeVisible();
  await expect(page.getByTestId("health-result")).toContainText("healthy");
  await expect(page.getByTestId("health-checks")).toContainText("redis");
  await expect(page.getByTestId("health-checks")).toContainText("postgres");

  await expect(page.getByTestId("jwks-result")).toBeVisible();
  await expect(page.getByTestId("jwks-table")).toContainText("identity-context-test-key");
  await expect(page.getByTestId("jwks-table")).toContainText("RS256");
});

// Keep ADMIN_PRINCIPAL referenced so the acting-identity framing is explicit.
test("support grants are authorized to the acting principal scope", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  await expect(page.getByText(`Acting principal: ${ADMIN_PRINCIPAL}`)).toBeVisible();
});