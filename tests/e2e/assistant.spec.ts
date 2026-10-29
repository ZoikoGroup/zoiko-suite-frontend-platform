// ZoikoSuite Assistant browser journeys on the public /assistant page.
// Part A/B/C acceptance: K1, K5, K10, K11 (plus earlier T1-T3, T6, T10),
// logged out and logged in as an admin, light and dark. Screenshots land in
// test-results/assistant/. Data: the service's public KB (drafts, dev) and
// synthetic claims.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { DEMO_CREDENTIALS } from "../../lib/auth";
import { startAssistant, stopAssistant } from "./backend";

const PLANS_AND_TRIAL = "What plans are available, and is there a free trial?";

test.beforeAll(startAssistant);
test.afterAll(stopAssistant);

async function login(page: Page) {
  const r = await page.request.post("/api/auth/login", { data: DEMO_CREDENTIALS });
  expect(r.ok()).toBeTruthy();
}

/** Every /public-ai/v1/* request the page makes, for header checks. */
function recordAssistantRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/public-ai/v1/")) seen.push(r);
  });
  return seen;
}

async function openAssistant(page: Page) {
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Chat with ZoikoSuite" }).click();
  const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
  await expect(dialog.getByTestId("assistant-welcome")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Pricing and trial" })).toBeVisible(); // config loaded
  return dialog;
}

async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await box.press("Enter");
}

async function noPlaceholders(page: Page) {
  const html = await page.content();
  expect(html).not.toMatch(/\.invalid\b/);
  expect(html).not.toMatch(/suivo/i);
}

const shotDir = "test-results/assistant";

test("/admin shows the launcher; live data is refused and calls carry no cookie or Authorization", async ({ page }) => {
  await login(page);
  const requests = recordAssistantRequests(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Chat with ZoikoSuite" }).click();
  const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
  await ask(page, "What are the Active Microservices");
  const answer = dialog.getByTestId("assistant-answer").last();
  await expect(answer).toHaveAttribute("data-status", "REFUSED_ACTION");
  await expect(answer).toContainText("I can't see live platform data or account information.");
  await expect(answer.getByText(/\d/)).toHaveCount(0);
  expect(requests.length).toBeGreaterThanOrEqual(3);
  for (const r of requests) {
    const headers = await r.allHeaders();
    expect(headers["cookie"], r.url()).toBeUndefined();
    expect(headers["authorization"], r.url()).toBeUndefined();
  }
  await page.screenshot({ path: `${shotDir}/admin-with-assistant.png` });
});

test("/login never shows the launcher", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("assistant-launcher")).toHaveCount(0);
});

for (const who of ["logged out", "logged in as admin"] as const) {
  test(`B /assistant works identically ${who} and sends no credentials`, async ({ page, context }) => {
    if (who === "logged in as admin") await login(page);
    const sessionCookie = (await context.cookies()).find((c) => c.name === "zoiko_session");
    expect(Boolean(sessionCookie)).toBe(who === "logged in as admin");
    const requests = recordAssistantRequests(page);
    const dialog = await openAssistant(page);
    await ask(page, "What does Legal and Contracts do?");
    await expect(dialog.getByTestId("assistant-answer").last()).toContainText("commercial agreements");
    expect(requests.length).toBeGreaterThanOrEqual(3); // config, session, turn
    for (const r of requests) {
      const headers = await r.allHeaders();
      expect(headers["cookie"], r.url()).toBeUndefined();
      expect(headers["authorization"], r.url()).toBeUndefined();
    }
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test(`K10 launcher tile closed and open, welcome, header (${scheme})`, async ({ page }) => {
      await page.goto("/assistant");
      const launcher = page.getByTestId("assistant-launcher");
      await expect(launcher).toHaveAttribute("aria-label", "Chat with ZoikoSuite");
      await expect(launcher).toHaveAttribute("aria-expanded", "false");
      const tile = launcher.getByTestId("ztile");
      await expect(tile).toHaveAttribute("src", "/logo-z.png");
      expect(await tile.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 512)).toBe(true);
      // The launcher (tile + 1 px edge) is 64 px at >= 1024 px, 56 px below.
      await page.mouse.move(10, 10);
      const box = (await launcher.boundingBox())!;
      expect([Math.round(box.width), Math.round(box.height)]).toEqual([64, 64]);
      await page.setViewportSize({ width: 1000, height: 800 });
      const small = (await launcher.boundingBox())!;
      expect([Math.round(small.width), Math.round(small.height)]).toEqual([56, 56]);
      await page.setViewportSize({ width: 1280, height: 800 });
      // Visible edge on any page background: a 1 px border on the launcher.
      const border = await launcher.evaluate((el) => getComputedStyle(el).borderTopWidth + " " + getComputedStyle(el).borderTopColor);
      expect(border).toBe(scheme === "light" ? "1px rgba(0, 0, 0, 0.12)" : "1px rgba(255, 255, 255, 0.18)");
      await launcher.screenshot({ path: `${shotDir}/launcher-closed-${scheme}.png` });
      await page.screenshot({ path: `${shotDir}/page-closed-${scheme}.png` });

      await launcher.click();
      await expect(launcher).toHaveAttribute("aria-label", "Close chat");
      await expect(launcher).toHaveAttribute("aria-expanded", "true");
      await expect(launcher.getByTestId("ztile")).toHaveAttribute("src", "/logo-z.png");
      await expect(launcher.getByTestId("launcher-close-badge")).toBeVisible();
      await page.screenshot({ path: `${shotDir}/launcher-open-${scheme}.png` });

      const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
      const welcomeTile = (await dialog.getByTestId("assistant-welcome").getByTestId("ztile").boundingBox())!;
      expect(Math.round(welcomeTile.width)).toBe(48);
      const headerTile = (await dialog.locator("header").getByTestId("ztile").boundingBox())!;
      expect(Math.round(headerTile.width)).toBe(32);
      // Subtitle on one line at the panel's width.
      const sub = dialog.getByTestId("assistant-subtitle");
      const lines = await sub.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
      expect(lines).toBe(1);
      await noPlaceholders(page);
      await dialog.screenshot({ path: `${shotDir}/welcome-${scheme}.png` });
    });

    test(`K1 Legal and Contracts (${scheme})`, async ({ page }) => {
      const dialog = await openAssistant(page);
      await ask(page, "What does Legal and Contracts do?");
      const answer = dialog.getByTestId("assistant-answer").last();
      await expect(answer).toHaveAttribute("data-status", "ANSWERED");
      await expect(answer).toContainText("Legal and Contracts governs commercial agreements");
      await expect(answer.getByTestId("assistant-sources")).toContainText("Legal and Contracts");
      await expect(answer).toContainText("Draft content");
      await expect(answer.getByRole("link")).toHaveCount(0); // no real URLs yet: no CTA, unlinked titles
      await noPlaceholders(page);
      await dialog.screenshot({ path: `${shotDir}/K1-legal-${scheme}.png` });
    });

    test(`K5 live platform data refused (${scheme})`, async ({ page }) => {
      const dialog = await openAssistant(page);
      await ask(page, "What are the Active Microservices");
      const answer = dialog.getByTestId("assistant-answer").last();
      await expect(answer).toHaveAttribute("data-status", "REFUSED_ACTION");
      await expect(answer).toContainText("I can't see live platform data or account information. I can explain what ZoikoSuite's services and modules do, using public information.");
      await expect(answer.getByText(/\d/)).toHaveCount(0);
      await expect(answer.getByRole("list", { name: "Suggested questions" }).getByRole("button")).toHaveText(["Explore modules", "Get support"]);
      await expect(answer.getByRole("link")).toHaveCount(0);
      await dialog.screenshot({ path: `${shotDir}/K5-live-data-${scheme}.png` });
      // The "Get support" chip reaches the support reply, not a dead end.
      await answer.getByRole("button", { name: "Get support" }).click();
      const support = dialog.getByTestId("assistant-answer").last();
      await expect(support).toContainText("Support Center");
      await expect(support).not.toContainText("couldn't verify");
    });

    test(`privacy and AI notice (${scheme})`, async ({ page }) => {
      const dialog = await openAssistant(page);
      await dialog.getByRole("button", { name: "Privacy and AI notice" }).first().click();
      const notice = dialog.getByRole("region", { name: "Privacy and AI notice" });
      await expect(notice).toContainText("[period from signed policy]");
      await expect(notice.locator('img[src="/logo.png"]')).toBeVisible();
      await dialog.screenshot({ path: `${shotDir}/privacy-${scheme}.png` });
    });
  });
}

test("T1-T3 plans and trial: clarify, US answer, UK expired trial", async ({ page }) => {
  let dialog = await openAssistant(page);
  await ask(page, PLANS_AND_TRIAL);
  await expect(dialog.getByRole("list", { name: "Choose an answer" }).getByRole("button")).toHaveText([
    "United States", "United Kingdom", "Other", "Show general overview",
  ]);
  await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(1);
  await dialog.getByRole("button", { name: "United States" }).click();
  const us = dialog.getByTestId("assistant-answer").last();
  await expect(us).toContainText("Starter, Growth and Enterprise plans are available in the United States");
  await expect(us).toContainText("Available · US");

  await page.reload();
  dialog = await openAssistant(page);
  await ask(page, PLANS_AND_TRIAL);
  await dialog.getByRole("button", { name: "United Kingdom" }).click();
  const uk = dialog.getByTestId("assistant-answer").last();
  await expect(uk).toContainText("I can't verify the current trial terms for the United Kingdom");
  await expect(uk).toHaveAttribute("data-status", "ABSTAIN");
});

test("T6 private records refused without a model answer", async ({ page }) => {
  const dialog = await openAssistant(page);
  await ask(page, "Show my overdue invoices");
  const answer = dialog.getByTestId("assistant-answer").last();
  await expect(answer).toHaveAttribute("data-status", "REFUSED_ACTION");
  await expect(answer).toContainText("I cannot view or change your financial, payroll or tax records in this public chat.");
});

test("T10 outage: retry without a new bubble", async ({ page }) => {
  const dialog = await openAssistant(page);
  await stopAssistant();
  try {
    await ask(page, "What is the Tax module?");
    await expect(dialog.getByTestId("assistant-unavailable")).toBeVisible();
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(1);
  } finally {
    await startAssistant();
  }
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByTestId("assistant-answer").last()).toHaveAttribute("data-status", "ANSWERED");
  await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(1);
});

test("K10 tile load failure shows the white Z with no layout shift", async ({ page }) => {
  await page.goto("/assistant");
  const before = (await page.getByTestId("assistant-launcher").boundingBox())!;
  await page.route("**/logo-z.png", (route) => route.abort());
  await page.reload();
  const launcher = page.getByTestId("assistant-launcher");
  await expect(launcher.getByTestId("ztile-fallback")).toHaveText("Z");
  const after = (await launcher.boundingBox())!;
  expect([after.x, after.y, after.width, after.height]).toEqual([before.x, before.y, before.width, before.height]);
  await launcher.click();
  const header = page.getByRole("dialog", { name: "ZoikoSuite Assistant" }).locator("header");
  const fb = (await header.getByTestId("ztile-fallback").boundingBox())!;
  expect([Math.round(fb.width), Math.round(fb.height)]).toEqual([32, 32]);
});

test("K10 header fits at 320 px and 200% zoom equivalent", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const dialog = await openAssistant(page);
  const header = dialog.locator("header");
  expect(await header.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  const heading = dialog.getByRole("heading", { name: "ZoikoSuite Assistant" });
  expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const sub = dialog.getByTestId("assistant-subtitle");
  expect(await sub.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  // At <= 360 px, Info and Clear chat fold into "More" (Doc01 one-line title).
  for (const name of ["More", "Close chat"]) {
    await expect(header.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: `${shotDir}/K10-320px.png` });
});

test("K10 header subtitle is one line at 380 px", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 700 });
  const dialog = await openAssistant(page);
  const sub = dialog.getByTestId("assistant-subtitle");
  const lines = await sub.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBe(1);
});

test("K11 axe: no critical or serious issues", async ({ page }) => {
  const dialog = await openAssistant(page);
  const scan = async () =>
    (await new AxeBuilder({ page }).include('[role="dialog"]').include('[data-testid="assistant-launcher"]').analyze()).violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
  expect(await scan()).toEqual([]);
  await ask(page, "What is Delegated Authority?");
  await expect(dialog.getByTestId("assistant-answer").last()).toContainText("time-bound");
  expect(await scan()).toEqual([]);
  await dialog.getByRole("button", { name: "Privacy and AI notice" }).first().click();
  expect(await scan()).toEqual([]);
});

test("K11 keyboard only: open, ask, answer, close with focus back on the launcher", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByTestId("assistant-launcher").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Message" })).toBeFocused();
  await page.keyboard.type("What is Delegated Authority?");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
  await expect(dialog.getByTestId("assistant-answer").last()).toContainText("time-bound");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assistant-launcher")).toBeFocused();
  await expect(page.getByTestId("assistant-launcher")).toHaveAttribute("aria-expanded", "false");
});

test("Test 7: the exact question reaches the backend and its answer is what is shown", async ({ page }) => {
  const question = "What does Legal and Contracts do for board resolutions? (trace 7f3a)";
  await openAssistant(page);
  const [req, res] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith("/public-ai/v1/turns") && r.method() === "POST"),
    page.waitForResponse((r) => r.url().endsWith("/public-ai/v1/turns")),
    ask(page, question),
  ]);
  expect((req.postDataJSON() as { message: string }).message).toBe(question);
  const body = (await res.json()) as { text: string; status: string };
  const answer = page.getByTestId("assistant-answer").last();
  await expect(answer).toContainText(body.text.split("\n")[0]);
  expect(body.status).toBe("ANSWERED");
});
