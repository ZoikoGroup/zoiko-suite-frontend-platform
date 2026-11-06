import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

// Live end-to-end suite for the Blocks 6-10 consoles (tests/e2e-blocks).
//
// It drives the built console against a real backend through its gateway and
// WRITES test records, so it is opt-in and must only point at a verification
// stack (the zv-* stack: gateway http://127.0.0.1:18180), never production:
//
//   npm run build
//   ZOIKO_LIVE_E2E=1 ZOIKO_E2E_GATEWAY=http://127.0.0.1:18180 npx playwright test -c playwright.blocks.config.ts
//
// Every run uses a freshly generated tenant, legal entity and two principals,
// so it never reads or writes anyone else's records. Sessions are signed with
// a per-run secret shared with the server below.
const CONSOLE_PORT = 3192;
const GATEWAY = process.env.ZOIKO_E2E_GATEWAY ?? "http://127.0.0.1:18180";

process.env.ZOIKO_E2E_SESSION_SECRET ??= randomBytes(32).toString("hex");
process.env.ZOIKO_E2E_GATEWAY = GATEWAY;
process.env.ZOIKO_E2E_TENANT ??= randomUUID();
process.env.ZOIKO_E2E_ENTITY ??= randomUUID();
process.env.ZOIKO_E2E_PRINCIPAL ??= randomUUID();
process.env.ZOIKO_E2E_PRINCIPAL_2 ??= randomUUID();
process.env.ZOIKO_E2E_OTHER_TENANT ??= randomUUID();
process.env.ZOIKO_E2E_OTHER_ENTITY ??= randomUUID();

const live = process.env.ZOIKO_LIVE_E2E === "1";

export default defineConfig({
  testDir: "tests/e2e-blocks",
  outputDir: "test-results/e2e-blocks",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-blocks/results.json" }]],
  use: {
    baseURL: `http://localhost:${CONSOLE_PORT}`,
    channel: "msedge",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: live
    ? {
        command: `npx next start -p ${CONSOLE_PORT}`,
        url: `http://localhost:${CONSOLE_PORT}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ZOIKO_USE_GATEWAY: "true",
          ZOIKO_GATEWAY_URL: GATEWAY,
          ZOIKO_SERVICECTL: "false",
          ZOIKO_API_TIMEOUT_MS: "10000",
          ZOIKO_SESSION_SECRET: process.env.ZOIKO_E2E_SESSION_SECRET,
        },
      }
    : undefined,
});
