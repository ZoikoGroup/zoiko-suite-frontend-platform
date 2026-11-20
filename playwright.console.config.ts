import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// Browser journeys for ZoikoSuite admin console pages.
// They run against a built console (`next build && next start -p 3100`)
// and a live backend stack (started via docker compose).
// The installed Microsoft Edge is used, so no browser download is needed.

const CONSOLE_PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e/console",
  outputDir: "test-results/console",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: [["list"], ["html", { outputFolder: "test-results/console-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${CONSOLE_PORT}`,
    channel: "msedge",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    // Console tests run against a live backend; they are not mocked.
    // The env var below tells the console to sign in through the gateway.
  },
  webServer: {
    command: `npx next start -p ${CONSOLE_PORT}`,
    url: `http://127.0.0.1:${CONSOLE_PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ZOIKO_API_TIMEOUT_MS: "15000",
      ZOIKO_USE_GATEWAY: "true",
      LOGO_URL: "/logo.png",
      ALLOW_DEMO_CREDENTIALS: "true",
      ZOIKO_SESSION_SECRET: randomBytes(32).toString("hex"),
    },
  },
});