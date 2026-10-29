// ZoikoSuite Assistant UI/UX against Document 01 (§06, §07 W01, §08 W02,
// §10 S00–S09, §17). The public-ai API is mocked per test so every state is
// deterministic; the real service is exercised by assistant.spec.ts.
// Route URLs in the mocks are the public pages Document 10 lists.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const shotDir = "test-results/ui";
const ZS = "https://www.zoikosuite.com";

type Env = Record<string, unknown>;

const CONFIG = {
  config_revision: "mock",
  assistant_display_name: "ZoikoSuite Assistant",
  capabilities: {},
  supported_locales: ["en-US"],
  market_choices: ["US", "GB"],
  public_routes: [
    { route_key: "pricing", url: `${ZS}/pricing` },
    { route_key: "core_modules", url: `${ZS}/core-modules` },
  ],
  citation_links: [
    { url_key: "legal", url: `${ZS}/core-modules`, title: "Legal and Contracts" },
    { url_key: "pricing", url: `${ZS}/pricing`, title: "Plans and trials" },
    { url_key: "areas", url: "", title: "ZoikoSuite areas" },
  ],
  privacy_notice_key: "privacy-notice-pending-dpo",
};

let n = 0;
function env(over: Env): Env {
  n += 1;
  return {
    schema_version: "1.0",
    turn_id: `pub_t_mock${n}`,
    request_id: `req_mock_${n.toString().padStart(4, "0")}`,
    turn_sequence: n,
    status: "ANSWERED",
    intent_id: "I19",
    text: "",
    citations: [],
    actions: [],
    knowledge_release_id: "kb-mock",
    policy_version: "pub-policy-1.0",
    answer_class: "PROCESS_EXPLANATION",
    reason: "ANSWERED",
    ...over,
  };
}

const LONG = Array.from({ length: 28 }, (_, i) => `Line ${i + 1} of a long, approved answer about ZoikoSuite areas.`).join("\n");

// Message → envelope. Messages are the visible test prompts below.
function reply(message: string): Env | "abort" {
  const m = message.toLowerCase();
  if (m.includes("legal")) {
    return env({
      text: "Legal and Contracts governs commercial agreements, corporate actions, board resolutions and legal obligations.\n\n- **Approval-bound** execution\n- Records kept as `evidence`",
      status_label: "VERIFIED",
      answer_class: "VERIFIED_FACT",
      citations: [
        { source_version_id: "kb-legal-v1", claim_ids: [], url_key: "legal" },
        { source_version_id: "kb-areas-v1", claim_ids: [], url_key: "areas" },
      ],
      actions: [{ type: "OPEN_OFFICIAL_ROUTE", route_key: "core_modules" }],
    });
  }
  if (m.includes("long")) return env({ text: LONG, citations: [{ source_version_id: "kb-areas-v1", claim_ids: [], url_key: "areas" }] });
  if (m.includes("plans")) {
    return env({
      status: "CLARIFY",
      intent_id: "I05",
      secondary_intent_id: "I06",
      text: "Which country are you evaluating ZoikoSuite for?",
      status_label: "MARKET_DEPENDENT",
      answer_class: "STATUS_QUALIFIED",
      reason: "MARKET_REQUIRED",
      clarification: { slot: "market_code", question: "Which country are you evaluating ZoikoSuite for?", options: ["US", "GB", "OTHER", "GENERAL_OVERVIEW"] },
    });
  }
  if (m.includes("soc 2")) {
    return env({
      status: "ABSTAIN",
      intent_id: "I12",
      text: "I couldn't verify that from approved ZoikoSuite sources, so I won't guess.",
      answer_class: "HANDOFF_UNKNOWN",
      reason: "NO_EVIDENCE",
      actions: [{ type: "OPEN_OFFICIAL_ROUTE", route_key: "pricing" }],
    });
  }
  if (m.includes("invoices")) {
    return env({
      status: "REFUSED_ACTION",
      intent_id: "X01",
      text: "I can't access account, financial, payroll or employee records. Please sign in to ZoikoSuite or contact support through the official support page.",
      answer_class: "HANDOFF_UNKNOWN",
      reason: "PRIVATE_DATA",
      actions: [{ type: "OPEN_OFFICIAL_ROUTE", route_key: "pricing" }],
    });
  }
  if (m.includes("demo")) {
    return env({
      status: "HANDOFF",
      intent_id: "I08",
      text: "You can request a demo through ZoikoSuite's official demo page. I haven't booked anything for you.",
      answer_class: "HANDOFF_UNKNOWN",
      reason: "ROUTE_ONLY",
      actions: [{ type: "OPEN_OFFICIAL_ROUTE", route_key: "demo" }],
    });
  }
  if (m.includes("fail")) return "abort";
  return env({ text: "ZoikoSuite modules cover areas including Finance and Payments, Legal and Contracts and Tax.", citations: [{ source_version_id: "kb-areas-v1", claim_ids: [], url_key: "areas" }] });
}

async function mockApi(page: Page, opts: { delayMs?: number; failTurns?: () => boolean } = {}) {
  await page.route("**/public-ai/v1/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/public-ai/v1/", "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "config") return json(CONFIG);
    if (path === "sessions") return json({ schema_version: "1.0", session_id: "pub_s_mock", session_grant: "grant", expires_at: "", policy_version: "p", capabilities: {} }, 201);
    if (path.startsWith("sessions/")) return route.fulfill({ status: 204 });
    if (path === "turns") {
      const body = JSON.parse(req.postData() ?? "{}") as { message: string };
      const r = reply(body.message);
      if (r === "abort" || opts.failTurns?.()) return route.abort("failed");
      if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
      return json(r);
    }
    return route.fulfill({ status: 204 });
  });
}

async function open(page: Page) {
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Chat with ZoikoSuite" }).click();
  const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
  await expect(dialog.getByTestId("assistant-welcome")).toBeVisible();
  return dialog;
}

async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await box.press("Enter");
}

async function size(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), name: e.getAttribute("aria-label") ?? e.textContent?.trim() };
  }));
}

// Mock page chrome the launcher must not cover (Doc01 W01-A).
async function addPageChrome(page: Page) {
  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.dataset.cookieBanner = "";
    banner.textContent = "We use essential cookies only.";
    Object.assign(banner.style, { position: "fixed", left: "0", right: "0", bottom: "48px", height: "56px", background: "#fde68a", color: "#000", zIndex: "40" });
    const footer = document.createElement("div");
    footer.dataset.stickyFooter = "";
    footer.textContent = "Sticky footer";
    Object.assign(footer.style, { position: "fixed", left: "0", right: "0", bottom: "0", height: "48px", background: "#e2e8f0", color: "#000", zIndex: "40" });
    document.body.append(footer, banner);
  });
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const VIEWPORTS = [
  { name: "320x640", width: 320, height: 640, touch: true },
  { name: "375x812", width: 375, height: 812, touch: true },
  { name: "430x932", width: 430, height: 932, touch: true },
  { name: "768x1024", width: 768, height: 1024, touch: true },
  { name: "1280x800", width: 1280, height: 800, touch: false },
  { name: "1920x1080", width: 1920, height: 1080, touch: false },
  { name: "640x400 (200% zoom of 1280x800)", width: 640, height: 400, touch: false },
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch && vp.width < 768 });

    test("layout: no horizontal scroll, one-line header, reachable controls, launcher clear of page chrome", async ({ page }) => {
      await mockApi(page);
      await page.goto("/assistant");
      await addPageChrome(page);
      const launcher = page.getByTestId("assistant-launcher");
      await expect(async () => {
        const l = (await launcher.boundingBox())!;
        for (const sel of ["[data-cookie-banner]", "[data-sticky-footer]"]) {
          expect(overlaps(l, (await page.locator(sel).boundingBox())!), `launcher overlaps ${sel}`).toBe(false);
        }
      }).toPass();
      const l = (await launcher.boundingBox())!;
      expect(Math.min(l.width, l.height)).toBeGreaterThanOrEqual(44);

      await launcher.click();
      const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
      await expect(dialog.getByTestId("assistant-welcome")).toBeVisible();
      await ask(page, "What does Legal and Contracts do?");
      await expect(dialog.getByTestId("assistant-answer")).toBeVisible();

      const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(doc.sw).toBeLessThanOrEqual(doc.cw);
      const panel = await dialog.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(panel.sw).toBeLessThanOrEqual(panel.cw);

      const title = dialog.getByRole("heading", { name: "ZoikoSuite Assistant" });
      const t = await title.evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight), sw: el.scrollWidth, cw: el.clientWidth }));
      expect(Math.round(t.h / t.lh)).toBe(1);
      expect(t.sw).toBeLessThanOrEqual(t.cw);
      const sub = dialog.getByTestId("assistant-subtitle");
      const s = await sub.evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight), sw: el.scrollWidth, cw: el.clientWidth }));
      expect(Math.round(s.h / s.lh)).toBe(1);
      expect(s.sw).toBeLessThanOrEqual(s.cw);

      const vh = vp.height;
      for (const loc of [dialog.getByRole("button", { name: "Close chat" }), dialog.getByRole("textbox", { name: "Message" }), dialog.getByRole("button", { name: "Send message" })]) {
        await expect(loc).toBeVisible();
        const b = (await loc.boundingBox())!;
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height).toBeLessThanOrEqual(vh + 1);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
      }
      await page.screenshot({ path: `${shotDir}/viewport-${vp.width}x${vp.height}.png` });
    });
  });
}

test.describe("target sizes on touch (375x812)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test("header controls, chips, send and CTA are at least 44 px", async ({ page }) => {
    await mockApi(page);
    const dialog = await open(page);
    for (const c of await size(page, ".za-header .za-control")) expect(Math.min(c.w, c.h), c.name ?? "").toBeGreaterThanOrEqual(44);
    for (const c of await size(page, "[data-testid=assistant-welcome] .za-chip")) expect(c.h, c.name ?? "").toBeGreaterThanOrEqual(44);
    expect((await dialog.getByTestId("assistant-welcome").locator(".za-chip").count())).toBeLessThanOrEqual(3); // Doc01: 2-3 chips on mobile
    await ask(page, "What does Legal and Contracts do?");
    const send = (await dialog.getByRole("button", { name: "Send message" }).boundingBox())!;
    expect(Math.min(send.width, send.height)).toBeGreaterThanOrEqual(44);
    const cta = (await dialog.locator(".za-cta").boundingBox())!;
    expect(cta.height).toBeGreaterThanOrEqual(44);
    const bubble = (await dialog.getByTestId("assistant-answer").boundingBox())!;
    expect(cta.width).toBeGreaterThan(bubble.width - 40); // full width on mobile
  });
});

test.describe("target sizes on a pointer desktop (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("controls >= 32, chips >= 40, send, CTA and launcher >= 44; four starter chips", async ({ page }) => {
    await mockApi(page);
    const dialog = await open(page);
    await page.mouse.move(10, 10); // no hover scale while measuring
    await expect.poll(async () => Math.round((await page.getByTestId("assistant-launcher").boundingBox())!.width)).toBe(64); // >= 1024 px
    const launcher = (await page.getByTestId("assistant-launcher").boundingBox())!;
    for (const c of await size(page, ".za-header .za-control")) expect(Math.min(c.w, c.h), c.name ?? "").toBeGreaterThanOrEqual(32);
    const chips = await size(page, "[data-testid=assistant-welcome] .za-chip");
    expect(chips.map((c) => c.name)).toEqual(["Pricing and trial", "Explore modules", "Book a demo", "Security and trust"]);
    for (const c of chips) expect(c.h).toBeGreaterThanOrEqual(40);
    await expect(dialog.getByRole("button", { name: "More topics" })).toBeVisible();
    await ask(page, "What does Legal and Contracts do?");
    expect((await dialog.locator(".za-cta").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const send = (await dialog.getByRole("button", { name: "Send message" }).boundingBox())!;
    expect(Math.min(send.width, send.height)).toBeGreaterThanOrEqual(44);
    for (const row of await size(page, ".za-source")) expect(row.h).toBeGreaterThanOrEqual(44);
    // Panel and launcher both visible, not overlapping (W01).
    const panel = (await dialog.boundingBox())!;
    expect(overlaps(panel, launcher)).toBe(false);
    expect(Math.round(panel.width)).toBe(400);
    await dialog.getByRole("button", { name: "Expand chat" }).click();
    await expect.poll(async () => Math.round((await dialog.boundingBox())!.width)).toBe(560);
  });
});

test.describe("composer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("Enter sends, Shift+Enter newline, grows to four lines then scrolls, IME never sends", async ({ page }) => {
    await mockApi(page);
    const dialog = await open(page);
    const box = page.getByRole("textbox", { name: "Message" });
    await box.fill("Line one");
    await box.press("Shift+Enter");
    await box.pressSequentially("Line two");
    expect(await box.inputValue()).toBe("Line one\nLine two");
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(0);
    const h1 = (await box.boundingBox())!.height;
    await box.fill("1\n2\n3\n4\n5\n6\n7");
    const grown = await box.evaluate((el) => ({ h: el.getBoundingClientRect().height, sh: el.scrollHeight, ch: el.clientHeight }));
    expect(grown.h).toBeGreaterThan(h1);
    expect(grown.h).toBeLessThanOrEqual(114);
    expect(grown.sh).toBeGreaterThan(grown.ch); // scrolls inside after four lines
    await box.fill("composing");
    await box.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })));
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(0);
    await box.press("Enter");
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(1);
  });

  test("Send becomes Stop while a turn runs; the composer stays editable; S02 is announced", async ({ page }) => {
    await mockApi(page, { delayMs: 1500 });
    const dialog = await open(page);
    await ask(page, "What does Legal and Contracts do?");
    await expect(dialog.getByTestId("assistant-thinking")).toBeVisible();
    await expect(page.getByTestId("assistant-announcer")).toContainText("Checking approved sources");
    await expect(dialog.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Message" })).toBeEditable();
    await dialog.getByRole("textbox", { name: "Message" }).fill("next question");
    await dialog.getByRole("textbox", { name: "Message" }).press("Enter"); // no double submit
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Stop" }).click();
    await expect(dialog.getByText("Stopped. Ask again whenever you're ready.")).toBeVisible();
  });

  test("sensitive-data warning sits above the composer; text stays editable; Remove it clears", async ({ page }) => {
    await mockApi(page);
    const dialog = await open(page);
    const box = dialog.getByRole("textbox", { name: "Message" });
    await box.fill("my password is hunter2x");
    const warn = dialog.getByTestId("assistant-sensitive");
    await expect(warn).toBeVisible();
    expect((await warn.boundingBox())!.y).toBeLessThan((await box.boundingBox())!.y);
    await expect(dialog.getByRole("button", { name: "Send message" })).toBeDisabled();
    await expect(box).toBeEditable();
    await dialog.getByRole("button", { name: "Remove it" }).click();
    await expect(box).toHaveValue("");
  });
});

test.describe("mobile sheet (375x812)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("keyboard open keeps the composer visible (VisualViewport)", async ({ page }) => {
    await mockApi(page);
    const dialog = await open(page);
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      const h = window.innerHeight - 320;
      Object.defineProperty(vv, "height", { configurable: true, get: () => h });
      vv.dispatchEvent(new Event("resize"));
    });
    const box = (await dialog.getByRole("textbox", { name: "Message" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(812 - 320 + 1);
    await page.screenshot({ path: `${shotDir}/mobile-keyboard-open.png` });
  });

  test("Back closes the sheet, focus returns to the launcher, page scroll is restored", async ({ page }) => {
    await mockApi(page);
    await page.goto("/assistant");
    await page.evaluate(() => {
      document.body.style.minHeight = "3000px";
      window.scrollTo(0, 600);
    });
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: "Chat with ZoikoSuite" }).click();
    const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/assistant$/);
    await expect(page.getByRole("button", { name: "Chat with ZoikoSuite" })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe("scrolling", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a long answer opens at its start; Jump to latest when scrolled up; retention across close", async ({ page }) => {
    await mockApi(page);
    const dialog = await open(page);
    const convo = dialog.getByTestId("assistant-conversation");
    await ask(page, "Give me the long version");
    const answer = dialog.getByTestId("assistant-answer").last();
    await expect(answer).toContainText("Line 28");
    const a = (await answer.boundingBox())!;
    const c = (await convo.boundingBox())!;
    expect(a.y).toBeGreaterThanOrEqual(c.y - 1); // the START of the answer is visible
    expect(a.y).toBeLessThan(c.y + 80);

    await ask(page, "and the long one again");
    await expect(dialog.getByTestId("assistant-answer")).toHaveCount(2);
    await page.unroute("**/public-ai/v1/**");
    await mockApi(page, { delayMs: 1200 });
    await ask(page, "a third long reply");
    await expect(dialog.getByTestId("assistant-thinking")).toBeVisible();
    await convo.evaluate((el) => {
      el.scrollTop = 0; // the visitor scrolls up while the answer is on its way
      el.dispatchEvent(new Event("scroll"));
    });
    await expect(dialog.getByTestId("assistant-answer")).toHaveCount(3);
    await expect(dialog.getByTestId("assistant-jump")).toBeVisible();
    expect(await convo.evaluate((el) => el.scrollTop)).toBe(0); // not force-scrolled
    expect((await dialog.getByTestId("assistant-jump").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await dialog.getByTestId("assistant-jump").click();
    await expect(dialog.getByTestId("assistant-jump")).toHaveCount(0);

    await convo.evaluate((el) => {
      el.scrollTop = 200;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Chat with ZoikoSuite" }).click();
    await expect.poll(async () => page.getByTestId("assistant-conversation").evaluate((el) => el.scrollTop)).toBe(200);
  });

  test("retry never duplicates the visitor bubble (visual)", async ({ page }) => {
    let fail = true;
    await mockApi(page, { failTurns: () => fail });
    const dialog = await open(page);
    await ask(page, "What does Legal and Contracts do?");
    await expect(dialog.getByTestId("assistant-unavailable")).toBeVisible();
    fail = false;
    await dialog.getByRole("button", { name: "Try again" }).click();
    await expect(dialog.getByTestId("assistant-answer")).toBeVisible();
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(1);
    await expect(dialog).toHaveScreenshot("retry-single-bubble.png", { animations: "disabled" });
  });
});

test.describe("states S00-S09 and reduced motion", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("S00 closed: launcher only, no auto-open, no unread dot", async ({ page }) => {
    await mockApi(page);
    await page.goto("/assistant");
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("launcher-unread")).toHaveCount(0);
  });

  test("S02 respects prefers-reduced-motion (static dots)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApi(page, { delayMs: 1500 });
    const dialog = await open(page);
    await ask(page, "What does Legal and Contracts do?");
    const dot = dialog.locator(".za-dots span").first();
    await expect(dot).toBeVisible();
    expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await page.getByTestId("assistant-launcher").evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  });

  test("S03-S09 render their parts; S08 shows a reference and a working Try again; offline banner", async ({ page, context }) => {
    let fail = false;
    await mockApi(page, { failTurns: () => fail });
    const dialog = await open(page);

    await ask(page, "What does Legal and Contracts do?"); // S03
    const s3 = dialog.getByTestId("assistant-answer").last();
    await expect(s3).toHaveAttribute("data-status", "ANSWERED");
    await expect(s3.locator("strong")).toHaveText("Approval-bound"); // restricted markdown
    await expect(s3.locator("code")).toHaveText("evidence");
    await expect(s3.getByText("Verified")).toBeVisible();
    await expect(s3.locator(".za-source")).toHaveCount(2);
    await expect(s3.locator(".za-source").first()).not.toContainText("zoikosuite.com"); // no raw domain
    await expect(s3.locator(".za-cta")).toHaveCount(1);
    await expect(s3.getByRole("button", { name: "Yes, this was helpful" })).toBeVisible();

    await ask(page, "What plans are available?"); // S04
    await expect(dialog.getByRole("list", { name: "Choose an answer" }).getByRole("button")).toHaveText(["United States", "United Kingdom", "Other", "Show general overview"]);

    await ask(page, "Are you SOC 2 certified?"); // S05
    const s5 = dialog.getByTestId("assistant-answer").last();
    await expect(s5).toContainText("I couldn't verify that");
    await expect(s5.locator(".za-badge[data-tone=warn]")).toContainText("Unverified");
    await expect(s5.getByRole("button", { name: "Try again" })).toBeVisible();

    await ask(page, "Show my overdue invoices"); // S06
    const s6 = dialog.getByTestId("assistant-answer").last();
    await expect(s6).toHaveAttribute("data-tone", "warn");
    await expect(s6).toContainText("Not something I can do here");

    await ask(page, "I'd like a demo"); // S07
    const s7 = dialog.getByTestId("assistant-answer").last();
    await expect(s7).toContainText("official demo page");
    await expect(s7).not.toContainText(/minutes|hours|within|wait/i); // no wait time

    fail = true;
    await ask(page, "Tell me about Tax"); // S08
    const s8 = dialog.getByTestId("assistant-unavailable");
    await expect(s8).toHaveAttribute("data-tone", "error");
    await expect(s8.getByTestId("assistant-reference")).toContainText(/Reference:\s*\S+/);
    await expect(s8.getByRole("link", { name: /Pricing/ })).toBeVisible();
    await expect(s8.getByRole("button", { name: "Copy reference" })).toBeVisible();
    fail = false;
    await s8.getByRole("button", { name: "Try again" }).click();
    await expect(dialog.getByTestId("assistant-unavailable")).toHaveCount(0);
    await expect(dialog.getByTestId("visitor-bubble")).toHaveCount(6); // the retry reused its bubble

    await context.setOffline(true);
    await expect(dialog.getByTestId("assistant-offline")).toBeVisible();
    await context.setOffline(false);
    await expect(dialog.getByTestId("assistant-offline")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Clear chat" }).click(); // S09
    const end = dialog.getByTestId("assistant-end");
    await expect(end.getByRole("button", { name: "Yes, this chat was helpful" })).toBeVisible();
    await end.getByRole("button", { name: "No, this chat wasn't helpful" }).click();
    await expect(end.getByRole("button", { name: "Unclear" })).toBeVisible();
    await expect(end.getByRole("button", { name: "Retention notice" })).toBeVisible();
    await end.getByRole("button", { name: "Clear chat" }).click();
    await expect(dialog.getByTestId("assistant-welcome")).toBeVisible();
  });

  test("a reply that lands while closed shows the unread dot", async ({ page }) => {
    await mockApi(page, { delayMs: 800 });
    const dialog = await open(page);
    await ask(page, "What does Legal and Contracts do?");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("launcher-unread")).toBeVisible();
    await page.getByTestId("assistant-launcher").click();
    await expect(page.getByTestId("launcher-unread")).toHaveCount(0);
  });
});

test.describe("focus and keyboard", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("open → composer focused; Tab order header → conversation → composer → send; Esc returns focus", async ({ page }) => {
    await mockApi(page);
    await page.goto("/assistant");
    await page.getByTestId("assistant-launcher").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Send message" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("assistant-launcher")).toBeFocused();
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute("aria-label", "Chat with ZoikoSuite");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`contrast and visual regression (${scheme})`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });

    test(`axe and UI contrast (${scheme})`, async ({ page }) => {
      await mockApi(page);
      const dialog = await open(page);
      const scan = async () =>
        (await new AxeBuilder({ page }).include('[role="dialog"]').include('[data-testid="assistant-launcher"]').analyze()).violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        );
      expect(await scan()).toEqual([]);
      const qs = ["What does Legal and Contracts do?", "What plans are available?", "Are you SOC 2 certified?", "Show my overdue invoices", "I'd like a demo"];
      for (const [i, q] of qs.entries()) {
        await ask(page, q);
        await expect(dialog.getByTestId("assistant-answer")).toHaveCount(i + 1);
      }
      expect(await scan()).toEqual([]);
      // Non-text contrast (UI >= 3:1): control borders and focus ring on both surfaces.
      const ratios = await page.evaluate(() => {
        const css = getComputedStyle(document.querySelector(".za-panel")!);
        const hex = (v: string) => v.trim();
        const lum = (h: string) => {
          let x = h.trim().replace("#", "");
          if (x.length === 3) x = x.split("").map((c) => c + c).join(""); // minified #fff
          const n = parseInt(x, 16);
          const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
            const s = x / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const ratio = (a: string, b: string) => {
          const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
          return (x + 0.05) / (y + 0.05);
        };
        const v = (k: string) => css.getPropertyValue(k);
        return {
          controlOnSurface: ratio(v("--za-control-border"), v("--za-surface")),
          controlOnMuted: ratio(v("--za-control-border"), v("--za-surface-muted")),
          focusOnSurface: ratio(v("--za-focus"), v("--za-surface")),
          focusOnMuted: ratio(v("--za-focus"), v("--za-surface-muted")),
          userBubbleText: ratio(v("--za-user-bg"), "#ffffff"),
          warnText: ratio(v("--za-warn-text"), v("--za-warn-bg")),
          errorText: ratio(v("--za-error-text"), v("--za-error-bg")),
        };
      });
      for (const [k, r] of Object.entries(ratios)) expect(r, k).toBeGreaterThanOrEqual(k.endsWith("Text") ? 4.5 : 3);
    });

    test(`visual snapshots (${scheme})`, async ({ page }) => {
      // Reduced motion: the expand applies instantly, so text is not caught mid-reflow.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mockApi(page);
      await page.goto("/assistant");
      await expect(page.getByTestId("assistant-launcher")).toHaveScreenshot(`launcher-${scheme}.png`, { animations: "disabled" });
      await page.getByTestId("assistant-launcher").click();
      const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
      await expect(dialog.getByTestId("assistant-welcome")).toBeVisible();
      await expect(dialog).toHaveScreenshot(`welcome-${scheme}.png`, { animations: "disabled" });
      await ask(page, "What does Legal and Contracts do?");
      await expect(dialog.getByTestId("assistant-answer")).toBeVisible();
      await expect(dialog).toHaveScreenshot(`answer-${scheme}.png`, { animations: "disabled" });
      await ask(page, "What plans are available?");
      await expect(dialog.getByRole("list", { name: "Choose an answer" })).toBeVisible();
      await expect(dialog).toHaveScreenshot(`clarification-${scheme}.png`, { animations: "disabled" });
      await ask(page, "Show my overdue invoices");
      await expect(dialog.getByTestId("assistant-answer").last()).toHaveAttribute("data-status", "REFUSED_ACTION");
      await expect(dialog).toHaveScreenshot(`safety-${scheme}.png`, { animations: "disabled" });
      await ask(page, "This will fail");
      await expect(dialog.getByTestId("assistant-unavailable")).toBeVisible();
      await expect(dialog).toHaveScreenshot(`error-${scheme}.png`, { animations: "disabled", mask: [dialog.getByTestId("assistant-reference")] });
      await dialog.getByRole("button", { name: "Clear chat" }).click();
      await expect(dialog.getByTestId("assistant-end")).toBeVisible();
      await expect(dialog).toHaveScreenshot(`feedback-${scheme}.png`, { animations: "disabled", mask: [dialog.getByTestId("assistant-reference")] });
      await dialog.getByTestId("assistant-end").getByRole("button", { name: "Retention notice" }).click();
      await expect(dialog.getByRole("region", { name: "Privacy and AI notice" })).toBeVisible();
      await expect(dialog).toHaveScreenshot(`privacy-${scheme}.png`, { animations: "disabled", mask: [dialog.getByTestId("assistant-reference")] });
      await dialog.getByRole("button", { name: "Expand chat" }).click();
      await expect.poll(async () => Math.round((await dialog.boundingBox())!.width)).toBe(560);
      await page.mouse.move(5, 5); // no hover style under the pointer after the panel grows
      await dialog.getByTestId("assistant-conversation").evaluate((el) => {
        el.scrollTop = 0; // deterministic after the reflow
      });
      await expect(dialog).toHaveScreenshot(`expanded-${scheme}.png`, { animations: "disabled", mask: [dialog.getByTestId("assistant-reference")] });
    });
  });
}

// State gallery for Design: every state at 1280, 768 and 375, light and dark.
for (const width of [1280, 768, 375]) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`state gallery ${width} ${scheme}`, () => {
      const mobile = width < 768;
      test.use({ colorScheme: scheme, viewport: { width, height: mobile ? 812 : width === 768 ? 1024 : 800 }, hasTouch: width <= 768, isMobile: mobile });
      test(`states ${width} ${scheme}`, async ({ page }) => {
        let fail = false;
        await mockApi(page, { failTurns: () => fail });
        const dir = `${shotDir}/states/${width}-${scheme}`;
        await page.goto("/assistant");
        await page.screenshot({ path: `${dir}/S00-closed.png` });
        await page.getByTestId("assistant-launcher").click();
        const dialog = page.getByRole("dialog", { name: "ZoikoSuite Assistant" });
        await expect(dialog.getByTestId("assistant-welcome")).toBeVisible();
        await page.screenshot({ path: `${dir}/S01-welcome.png` });
        const steps: [string, string, () => Promise<void>][] = [
          ["S03-grounded-answer", "What does Legal and Contracts do?", async () => { await expect(dialog.getByTestId("assistant-answer").last()).toHaveAttribute("data-status", "ANSWERED"); }],
          ["S04-clarification", "What plans are available?", async () => { await expect(dialog.getByRole("list", { name: "Choose an answer" })).toBeVisible(); }],
          ["S05-uncertain", "Are you SOC 2 certified?", async () => { await expect(dialog.getByTestId("assistant-answer").last()).toHaveAttribute("data-status", "ABSTAIN"); }],
          ["S06-safety", "Show my overdue invoices", async () => { await expect(dialog.getByTestId("assistant-answer").last()).toHaveAttribute("data-status", "REFUSED_ACTION"); }],
          ["S07-escalation", "I'd like a demo", async () => { await expect(dialog.getByTestId("assistant-answer").last()).toHaveAttribute("data-status", "HANDOFF"); }],
        ];
        for (const [name, q, ready] of steps) {
          await ask(page, q);
          await ready();
          await dialog.getByTestId("assistant-answer").last().scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${dir}/${name}.png` });
        }
        fail = true;
        await ask(page, "This will fail");
        await expect(dialog.getByTestId("assistant-unavailable")).toBeVisible();
        await dialog.getByTestId("assistant-unavailable").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${dir}/S08-error.png` });
        fail = false;
        await page.unroute("**/public-ai/v1/**");
        await mockApi(page, { delayMs: 2500 });
        await ask(page, "What does Legal and Contracts do?");
        await expect(dialog.getByTestId("assistant-thinking")).toBeVisible();
        await page.screenshot({ path: `${dir}/S02-thinking.png` });
        await expect(dialog.getByTestId("assistant-thinking")).toHaveCount(0, { timeout: 10_000 });
        const touch = width <= 768;
        if (touch) await dialog.getByRole("button", { name: "More", exact: true }).click();
        await dialog.getByRole(touch ? "menuitem" : "button", { name: "Clear chat" }).click();
        await expect(dialog.getByTestId("assistant-end")).toBeVisible();
        await dialog.getByTestId("assistant-end").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${dir}/S09-end-feedback.png` });
      });
    });
  }
}
