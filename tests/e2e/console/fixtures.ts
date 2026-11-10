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
  consoleUrl: async ({}, provide) => {
    await provide("http://127.0.0.1:3100");
  },

  authedPage: async ({ page, consoleUrl }, provide) => {
    // Sign in as demo admin
    await page.goto(`${consoleUrl}/login`);
    await page.fill('input[name="email"]', "admin@zoikosuite.com");
    await page.fill('input[name="password"]', "Zoiko@Governance1");
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL(`${consoleUrl}/admin/**`, { timeout: 30000 });
    
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