import { defineConfig, devices } from "@playwright/test";

// E2E for the identity-context-svc console surface.
//
// The stack is hermetic: a Node mock of identity-context-svc (e2e/mock/) plays
// the :8080 contract on :18080, and Next.js runs with ZOIKO_IDENTITY_CONTEXT_URL
// pointed at it. No Postgres, Redis, Kafka, or the Traefik gateway required.
//
// workers=1 on purpose: the mock is a single in-memory store, and the suite is
// small enough that serial execution is both deterministic and fast. Tests also
// reset the mock in beforeEach via POST /_e2e/reset, so each case starts from
// the same pristine seed regardless of run order.

const MOCK_PORT = Number(process.env.IDENTITY_MOCK_PORT ?? 18080);
const APP_PORT = Number(process.env.ZOIKO_APP_PORT ?? 3100);
const BASE_URL = `http://localhost:${APP_PORT}`;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node e2e/mock/identity-context-service.mjs`,
      port: MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(MOCK_PORT) },
    },
    {
      command: `npm run dev -- --port ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ZOIKO_IDENTITY_CONTEXT_URL: MOCK_URL,
        ZOIKO_DEMO_TENANT_ID: "11111111-1111-1111-1111-111111111111",
      },
    },
  ],
});