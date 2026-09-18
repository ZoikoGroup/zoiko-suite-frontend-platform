import { test, expect } from "@playwright/test";
import {
  resetMock,
  login,
  openIdentityConsole,
  gotoIdentityTab,
  createSessionViaConsole,
} from "./helpers";

test.beforeEach(async () => {
  await resetMock();
});

// ─── GET /v1/context/session/{id} ───────────────────────────────────────────

test("gets a session that was just resolved and re-reads the envelope", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  const sessionId = await createSessionViaConsole(page);

  await gotoIdentityTab(page, "Sessions");
  await page.getByTestId("session-id").fill(sessionId);
  await page.getByTestId("session-get").click();

  await expect(page.getByTestId("session-envelope")).toBeVisible();
  await expect(page.getByTestId("session-envelope")).toHaveValue(/^ey/);
});

// ─── GET /v1/context/session/{id}/explain (GOV-01) ─────────────────────────

test("explains a session: outcome RESOLVED with all six dimensions and their sources", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  const sessionId = await createSessionViaConsole(page);

  await gotoIdentityTab(page, "Sessions");
  await page.getByTestId("session-id").fill(sessionId);
  await page.getByTestId("session-explain").click();

  await expect(page.getByTestId("explain-result")).toBeVisible();
  await expect(page.getByTestId("explain-result")).toContainText("RESOLVED");
  await expect(page.getByTestId("dimensions-table").locator("tbody tr")).toHaveCount(6);

  const names = await page
    .getByTestId("dimensions-table")
    .locator("tbody tr")
    .locator("td:nth-child(2)")
    .allTextContents();
  expect(names).toEqual([
    "authenticated_principal",
    "tenant",
    "legal_entity_scope",
    "role_profile",
    "delegated_authority",
    "session_trust_posture",
  ]);

  await expect(page.getByTestId("dimensions-table")).toContainText("upstream:authorization-svc");
  await expect(page.getByTestId("dimensions-table")).toContainText("async-risk-cache");
});

// ─── POST /v1/context/session/{id}/invalidate ───────────────────────────────

test("invalidates a session, then a re-read reports the session gone", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  const sessionId = await createSessionViaConsole(page);

  await gotoIdentityTab(page, "Sessions");
  await page.getByTestId("session-id").fill(sessionId);
  await page.getByTestId("session-reason").selectOption("RISK_ESCALATION");
  await page.getByTestId("session-invalidate").click();

  await expect(page.getByTestId("session-notice")).toContainText("Session invalidated");

  // Re-read: the now-invalidated session answers 404.
  await page.getByTestId("session-get").click();
  await expect(page.getByTestId("session-notice")).toContainText("session not found or expired");
  await expect(page.getByTestId("session-envelope")).not.toBeVisible();
});

// ─── Invalidation feeds the explain record ──────────────────────────────────

test("after invalidation, explain reports outcome INVALIDATED", async ({ page }) => {
  await login(page);
  await openIdentityConsole(page);
  const sessionId = await createSessionViaConsole(page);

  await gotoIdentityTab(page, "Sessions");
  await page.getByTestId("session-id").fill(sessionId);
  await page.getByTestId("session-invalidate").click();
  await expect(page.getByTestId("session-notice")).toContainText("Session invalidated");

  await page.getByTestId("session-explain").click();
  await expect(page.getByTestId("explain-result")).toContainText("INVALIDATED");
});