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
//   configuration-feature-flag-svc :8086 -> :18096  (the feature-flag and
//                                                   configuration half of
//                                                   /admin/settings)
//   notification-svc             :8133  -> :18133  (the delivery register and
//                                                   the send form at
//                                                   /admin/notifications, plus
//                                                   the topbar bell, which is
//                                                   on EVERY admin page)
//   access-control-svc           :8137  -> :18137  (the role and permission-
//                                                   bundle definitions half of
//                                                   /admin/access-control; the
//                                                   evaluation-plane panels on
//                                                   that page belong to
//                                                   authorization-svc and
//                                                   degrade to a named warning
//                                                   without it, which the spec
//                                                   asserts rather than hides)
//
// workers=1 on purpose: the mock is a single in-memory store, and the suite is
// small enough that serial execution is both deterministic and fast. Tests also
// reset the mock in beforeEach via POST /_e2e/reset, so each case starts from
// the same pristine seed regardless of run order.

const MOCK_PORT = Number(process.env.IDENTITY_MOCK_PORT ?? 18080);
const SECRET_VAULT_MOCK_PORT = Number(process.env.SECRET_VAULT_MOCK_PORT ?? 18087);
const TENANT_REGISTRY_MOCK_PORT = Number(process.env.TENANT_REGISTRY_MOCK_PORT ?? 18081);
const DELEGATED_AUTHORITY_MOCK_PORT = Number(process.env.DELEGATED_AUTHORITY_MOCK_PORT ?? 18086);
const ACCESS_CONTROL_MOCK_PORT = Number(process.env.ACCESS_CONTROL_MOCK_PORT ?? 18137);
// 18133 mirrors the real 8133 for legibility. It does NOT clash with the
// service's own host port: the hermetic suite never starts a container, and the
// mock binds loopback only.
//
// Worth knowing that 8133 itself is contested in the real stack —
// exception-escalation-svc binds it in docker-compose.phase5.yml — so a
// developer running BOTH would have the console reach whichever came up. That
// is a backend port allocation to resolve; it cannot reach this suite, which is
// the point of pinning the mock here rather than at the service's own port.
const NOTIFICATION_MOCK_PORT = Number(process.env.NOTIFICATION_MOCK_PORT ?? 18133);
// 18096, not 18086: the delegated-authority mock already holds 18086, and two
// webServer entries on one port make Playwright reuse whichever bound first —
// so /admin/settings would have been served a delegation API and the spec would
// have failed on a page that was fine.
const CONFIGURATION_MOCK_PORT = Number(process.env.CONFIGURATION_MOCK_PORT ?? 18096);
const APP_PORT = Number(process.env.ZOIKO_APP_PORT ?? 3100);
const BASE_URL = `http://localhost:${APP_PORT}`;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;
const SECRET_VAULT_MOCK_URL = `http://localhost:${SECRET_VAULT_MOCK_PORT}`;
const TENANT_REGISTRY_MOCK_URL = `http://localhost:${TENANT_REGISTRY_MOCK_PORT}`;
const DELEGATED_AUTHORITY_MOCK_URL = `http://localhost:${DELEGATED_AUTHORITY_MOCK_PORT}`;
const ACCESS_CONTROL_MOCK_URL = `http://localhost:${ACCESS_CONTROL_MOCK_PORT}`;
const NOTIFICATION_MOCK_URL = `http://localhost:${NOTIFICATION_MOCK_PORT}`;
const CONFIGURATION_MOCK_URL = `http://localhost:${CONFIGURATION_MOCK_PORT}`;
// A port nothing listens on, on purpose.
//
// /admin/access-control reads authorization-svc for the grants, SoD rules and
// the evaluation plane, and there is no mock for it in this suite. Left at its
// default the console reaches the REAL service on :8089 whenever a developer
// happens to have the stack up, so the page renders differently depending on
// what is running on the machine — and the spec that asserts the page degrades
// cleanly without it would pass or fail by accident. Pointing it at a closed
// port makes the degradation deterministic and the suite honest about what it
// covers: the definition half, which is access-control-svc's own.
const AUTHORIZATION_ABSENT_URL = "http://127.0.0.1:1";

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
      command: `node e2e/mock/access-control-service.mjs`,
      port: ACCESS_CONTROL_MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(ACCESS_CONTROL_MOCK_PORT) },
    },
    {
      command: `node e2e/mock/configuration-service.mjs`,
      port: CONFIGURATION_MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(CONFIGURATION_MOCK_PORT) },
    },
    {
      command: `node e2e/mock/notification-service.mjs`,
      port: NOTIFICATION_MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(NOTIFICATION_MOCK_PORT) },
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
        ZOIKO_ACCESS_CONTROL_URL: ACCESS_CONTROL_MOCK_URL,
        ZOIKO_CONFIGURATION_URL: CONFIGURATION_MOCK_URL,
        // The bell polls this on EVERY admin page, so without it every spec in
        // the suite would make a real call to :8133 — which is either nothing
        // (a slow timeout on each page load) or, if the developer has the stack
        // up, exception-escalation-svc answering on the same port.
        ZOIKO_NOTIFICATION_URL: NOTIFICATION_MOCK_URL,
        ZOIKO_AUTHORIZATION_URL: AUTHORIZATION_ABSENT_URL,
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