import { defineConfig, devices } from "@playwright/test";

// E2E for the admin console surfaces that have one.
//
// The stack is hermetic: Node mocks under e2e/mock/ play each backend service's
// contract on a high port, and Next.js runs with that service's ZOIKO_*_URL
// pointed at the mock. No Postgres, Redis, Kafka, or the Traefik gateway
// required.
//
//   identity-context-svc         :8080  -> :18080  (auth, principals, sessions)
//   secret-vault-integration-svc :8087  -> :18087  (the Secret Vault console)
//   tenant-entity-registry-svc   :8081  -> :18081  (and, through it,
//                                                   gateway-auth-svc's refusal
//                                                   signal — see that mock)
//   delegated-authority-svc      :8136  -> :18086  (the Delegated Authority
//                                                   console)
//
// workers=1 on purpose: the mock is a single in-memory store, and the suite is
// small enough that serial execution is both deterministic and fast. Tests also
// reset the mock in beforeEach via POST /_e2e/reset, so each case starts from
// the same pristine seed regardless of run order.

const MOCK_PORT = Number(process.env.IDENTITY_MOCK_PORT ?? 18080);
const SECRET_VAULT_MOCK_PORT = Number(process.env.SECRET_VAULT_MOCK_PORT ?? 18087);
const TENANT_REGISTRY_MOCK_PORT = Number(process.env.TENANT_REGISTRY_MOCK_PORT ?? 18081);
const DELEGATED_AUTHORITY_MOCK_PORT = Number(process.env.DELEGATED_AUTHORITY_MOCK_PORT ?? 18086);
const APP_PORT = Number(process.env.ZOIKO_APP_PORT ?? 3100);
const BASE_URL = `http://localhost:${APP_PORT}`;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;
const SECRET_VAULT_MOCK_URL = `http://localhost:${SECRET_VAULT_MOCK_PORT}`;
const TENANT_REGISTRY_MOCK_URL = `http://localhost:${TENANT_REGISTRY_MOCK_PORT}`;
const DELEGATED_AUTHORITY_MOCK_URL = `http://localhost:${DELEGATED_AUTHORITY_MOCK_PORT}`;

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
      command: `node e2e/mock/secret-vault-service.mjs`,
      port: SECRET_VAULT_MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(SECRET_VAULT_MOCK_PORT) },
    },
    {
      command: `node e2e/mock/tenant-registry-service.mjs`,
      port: TENANT_REGISTRY_MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(TENANT_REGISTRY_MOCK_PORT) },
    },
    {
      command: `node e2e/mock/delegated-authority-service.mjs`,
      port: DELEGATED_AUTHORITY_MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(DELEGATED_AUTHORITY_MOCK_PORT) },
    },
    {
      command: `npm run dev -- --port ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ZOIKO_IDENTITY_CONTEXT_URL: MOCK_URL,
        ZOIKO_SECRET_VAULT_URL: SECRET_VAULT_MOCK_URL,
        ZOIKO_TENANT_REGISTRY_URL: TENANT_REGISTRY_MOCK_URL,
        ZOIKO_DELEGATED_AUTHORITY_URL: DELEGATED_AUTHORITY_MOCK_URL,
        ZOIKO_DEMO_TENANT_ID: "11111111-1111-1111-1111-111111111111",
        // lib/api/config.ts defaults this to 1500ms, which is right against a
        // warm service and too tight against a Next dev server compiling a
        // route for the first time — the first visit to /admin/secrets would
        // time out and render empty panels.
        ZOIKO_API_TIMEOUT_MS: "15000",
      },
    },
  ],
});