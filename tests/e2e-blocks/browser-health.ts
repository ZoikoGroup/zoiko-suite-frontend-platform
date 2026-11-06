// Browser health for every live Blocks 6-10 browser test.
//
// An automatic fixture records, for each page of the test's context, every
// console error, uncaught page error, 4xx/5xx response and failed request,
// and fails the test at teardown if any occurred. Pages in contexts a test
// creates itself (a second tenant, a second approver) must be passed to
// `browserHealth.watch(page)`. A test that provokes an error on purpose
// declares it with `browserHealth.allow(/.../)`.
//
// Not counted: ERR_ABORTED (the browser cancelling its own prefetch or an
// in-flight request on navigation), and Chrome's "Failed to load resource"
// console line, which only repeats a failed response that is already
// recorded with its URL.

import { test as base, expect, type Page } from "@playwright/test";

export type BrowserHealth = {
  /** Everything recorded so far, including allowed and ignored entries. */
  issues: string[];
  allow(pattern: RegExp): void;
  watch(page: Page): void;
};

export const test = base.extend<{ browserHealth: BrowserHealth }>({
  browserHealth: [
    async ({ context }, use, testInfo) => {
      const issues: string[] = [];
      const ignored: string[] = [];
      const allowed: RegExp[] = [];
      const seen = new WeakSet<Page>();

      const watch = (page: Page) => {
        if (seen.has(page)) return;
        seen.add(page);
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const text = m.text();
          if (/^Failed to load resource/.test(text)) ignored.push(`console: ${text}`);
          else issues.push(`console error: ${text.slice(0, 400)}`);
        });
        page.on("pageerror", (e) => issues.push(`page error: ${e.message.slice(0, 400)}`));
        page.on("response", (r) => {
          if (r.status() >= 400) issues.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
        });
        page.on("requestfailed", (r) => {
          const line = `request failed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`;
          (/ERR_ABORTED/.test(line) ? ignored : issues).push(line);
        });
      };

      context.on("page", watch);
      for (const p of context.pages()) watch(p);

      await use({ issues, allow: (re) => allowed.push(re), watch });

      const unexpected = issues.filter((i) => !allowed.some((re) => re.test(i)));
      for (const i of issues) testInfo.annotations.push({ type: unexpected.includes(i) ? "browser-issue" : "browser-issue-allowed", description: i });
      testInfo.annotations.push({ type: "browser-ignored", description: String(ignored.length) });
      expect(unexpected, "console errors, page errors or failed requests in the browser").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
