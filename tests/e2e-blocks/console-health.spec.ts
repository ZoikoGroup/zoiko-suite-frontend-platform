// Browser console errors and failed requests on the Blocks 6-10 pages.
//
// Every page is loaded, then reloaded, as a signed-in test tenant. The
// browserHealth fixture (./browser-health) fails the test on any console
// error, page error, 4xx/5xx response or failed request. The first test
// proves the fixture detects each of those, so a pass means something.

import { expect, test } from "./browser-health";
import { liveOnly, signIn } from "./live";

liveOnly();

const PAGES = [
  "/admin/legal", "/admin/commercial-ops", "/admin/purchase-requests", "/admin/tax",
  "/admin/compliance", "/admin/intelligence", "/admin/security", "/admin/integration",
  "/admin/migrations", "/admin/service-inputs",
];

test("the browser-health check detects console errors, page errors and failed requests", async ({ page, context, browserHealth }) => {
  await signIn(context);
  await page.goto("/admin/security");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => console.error("browser-health probe"));
  await page.evaluate(() => { setTimeout(() => { throw new Error("browser-health probe throw"); }, 0); });
  await page.evaluate(() => fetch("/api/v1/security/keys/browser-health-probe/rotate", { method: "POST" }));
  await page.evaluate(() => fetch("http://127.0.0.1:1/browser-health-probe").catch(() => undefined));
  await expect.poll(() => browserHealth.issues.length).toBeGreaterThanOrEqual(4);

  const all = browserHealth.issues.join("\n");
  expect(all).toMatch(/console error: browser-health probe/);
  expect(all).toMatch(/page error: browser-health probe throw/);
  expect(all).toMatch(/HTTP (404|400) POST .*browser-health-probe\/rotate/);
  expect(all).toMatch(/request failed: GET http:\/\/127\.0\.0\.1:1\/browser-health-probe/);
  // Provoked on purpose: allowed, so the fixture's own assertion passes.
  browserHealth.allow(/browser-health-probe|browser-health probe/);
});

for (const path of PAGES) {
  test(`${path}: no console errors and no failed requests`, async ({ page, context }) => {
    await signIn(context);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    // Once more, to catch errors on a second render (hydration, effects).
    await page.reload();
    await page.waitForLoadState("networkidle");
  });
}
