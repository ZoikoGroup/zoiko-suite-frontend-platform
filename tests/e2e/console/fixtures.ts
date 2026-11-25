import { test as base, type Page } from "@playwright/test";
import type { SessionIdentity } from "@/lib/auth";

// Console test fixtures: authenticated page, backend health checks, and shared data.

type Fixtures = {
  /** Page signed in as the demo admin through the gateway. */
  authedPage: Page;
  /** Current session identity from the auth cookie. */
  session: SessionIdentity;
  /** Base URL of the running console. */
  consoleUrl: string;
};

export const test = base.extend<Fixtures>({
  // The console under test: the configured baseURL (the suite's own
  // `next start` on 3100 by default).
  consoleUrl: async ({ baseURL }, provide) => {
    await provide(baseURL ?? "http://localhost:3100");
  },

  authedPage: async ({ page, consoleUrl }, provide) => {
    // Sign in as demo admin
    await page.goto(`${consoleUrl}/login`);
    // Wait for hydration: on a cold dev server a click before it submits the
    // form natively (GET /login?) and never signs in.
    await page.waitForLoadState("networkidle");
    await page.fill('#email', "admin@zoikosuite.com");
    await page.fill('#password', "Zoiko@Governance1");
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    // A regex, not "/admin/**": the landing page is /admin itself, which that
    // glob never matched, so every console spec timed out at sign-in.
    await page.waitForURL(/\/admin(\/|\?|$)/, { timeout: 60000, waitUntil: "commit" });
    
    await provide(page);
  },

  session: async ({ authedPage }, provide) => {
    // Extract session from the page's auth cookie / local storage
    const session = await authedPage.evaluate(() => {
      const cookie = document.cookie.split('; ').find(c => c.startsWith('zoiko_session='));
      if (cookie) {
        try {
          return JSON.parse(decodeURIComponent(cookie.split('=')[1]));
        } catch {
          return null;
        }
      }
      return null;
    });
    await provide(session || { principalId: "33333333-3333-3333-3333-333333333333", tenantId: "11111111-1111-1111-1111-111111111111", legalEntityId: "22222222-2222-2222-2222-222222222222" });
  },
});

export { expect } from "@playwright/test";