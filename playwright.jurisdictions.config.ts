import { defineConfig } from "@playwright/test";

// UI e2e of /admin/jurisdictions (JR-FE-3) against a RUNNING console and the
// live jurisdiction-rules-svc stack. Unlike playwright.config.ts it starts no
// server and builds no assistant service:
//
//   1. the backend stack is up (postgres, kafka, redis, mtls-management,
//      identity-context, tenant-entity-registry, access-control,
//      authorization, jurisdiction-rules with a pack signing key, workflow);
//   2. the console runs (`next start`), with ALLOW_DEMO_CREDENTIALS=true;
//   3. three demo principals hold JURISDICTION_* grants on the platform scope
//      (admin, legal counsel, tax officer): a pack is certified by someone
//      other than its author, compiler, test author and reviewers.
//
//   CONSOLE_URL=http://127.0.0.1:3100 npx playwright test -c playwright.jurisdictions.config.ts
//
// When the service is not reachable the suite skips and says why.
export default defineConfig({
  testDir: "tests/e2e/console",
  testMatch: /jurisdictions\.spec\.ts$/,
  outputDir: "test-results/e2e-jurisdictions",
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.CONSOLE_URL ?? "http://127.0.0.1:3100",
    channel: "msedge",
    trace: "retain-on-failure",
    viewport: { width: 1600, height: 1200 },
  },
});
