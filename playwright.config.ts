import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// Browser journeys for the ZoikoSuite Assistant (master prompt STEP 5:
// T0-T3, T6, T10, T13). They run against their own servers so they never
// touch a developer's running console (3000) or assistant service (8001):
//   - console: `next start` on 3100 (run `npm run build` first; `npm run test:e2e` does)
//   - assistant: public-ai-svc built from PUBLIC_AI_SVC_DIR, started per test file on 18181
// The installed Microsoft Edge is used, so no browser download is needed.
const CONSOLE_PORT = 3100;
const ASSISTANT_PORT = 18181; // keep in step with tests/e2e/backend.ts

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/e2e",
  workers: 1, // T10 stops and restarts the shared assistant service
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"], ["html", { outputFolder: "test-results/e2e-report", open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${CONSOLE_PORT}`,
    channel: "msedge",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    // Answers appear complete, so layout checks never measure a half-typed
    // reply; the typing reveal has its own test with motion turned on.
    reducedMotion: "reduce",
  },
  webServer: {
    command: `npx next start -p ${CONSOLE_PORT}`,
    url: `http://localhost:${CONSOLE_PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ZOIKO_PUBLIC_AI_URL: `http://127.0.0.1:${ASSISTANT_PORT}`,
      ZOIKO_PUBLIC_AI_ORIGIN: "http://localhost:3000",
      LOGO_URL: "/logo.png",
      // The suite signs in as the demo admin. Production builds refuse demo
      // accounts unless this is set (lib/auth.ts); it is set only for this
      // throwaway test server, never for a real environment.
      ALLOW_DEMO_CREDENTIALS: "true",
      // Production builds require a session secret; a fresh random one per
      // run, so no secret is stored in the repo.
      ZOIKO_SESSION_SECRET: randomBytes(32).toString("hex"),
    },
  },
});
