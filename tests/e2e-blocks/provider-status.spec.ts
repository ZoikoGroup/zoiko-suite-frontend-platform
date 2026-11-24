// Each Blocks 9-10 provider service's page says its outside provider is not
// connected (lib/provider-status.ts), beside the service's own records.

import { expect, test } from "./browser-health";
import { liveOnly, signIn } from "./live";

liveOnly();

const PAGES: [string, string[]][] = [
  ["/admin/tax", ["tax-authority-interface-svc"]],
  ["/admin/security", ["siem-integration-svc", "carta-svc", "key-management-svc"]],
  [
    "/admin/integration",
    ["banking-connector-svc", "hris-connector-svc", "esignature-integration-svc", "external-data-feed-svc"],
  ],
];

for (const [path, services] of PAGES) {
  test(`${path} states the provider status of ${services.join(", ")}`, async ({ page, context, browserHealth }) => {
    await signIn(context);
    browserHealth.watch(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const svc of services) {
      const note = page.locator(`[data-provider-status="${svc}"]`);
      await expect(note, `${path} shows ${svc}'s provider status`).toHaveCount(1, { timeout: 20_000 });
      await expect(note).toContainText("not connected.");
    }
  });
}
