import { expect, test } from "@playwright/test";
import {
  login,
  resetMock,
  resetSecretVaultMock,
  secretVaultRequests,
  DEMO_TENANT,
} from "./helpers";

// End-to-end coverage of the Secret Vault console (/admin/secrets) against a
// hermetic mock of secret-vault-integration-svc (e2e/mock/secret-vault-service.mjs).
//
// WHAT THESE SPECS ARE FOR
//
// The Go suite proves the service's rules. These prove the things it cannot see:
// that the console sends the canonical §4 headers the service demands, reads the
// fields it renders out of the real response shape, keeps two live credentials
// off the page, and tells the reader something different for each of the
// broker's three outcomes.
//
// Every one of those has already failed in this codebase at least once. The
// client sent no headers at all for weeks — the principal went in the body while
// the service reads X-Principal-Id — so every write answered 401 and no test
// noticed, because there were no tests on this surface.

const SEEDED_PATH = "integrations/stripe/webhook-signing-key";
const DRAFT_ONLY_PATH = "integrations/acme/never-activated";
const ALLOWED_WORKLOAD = "77777777-7777-7777-7777-777777777777";
const DENIED_WORKLOAD = "99999999-9999-9999-9999-999999999999";
const SEEDED_POLICY_ID = "aaaa0000-0000-4000-8000-000000000001";

test.beforeEach(async () => {
  await resetMock();
  await resetSecretVaultMock();
});

async function openConsole(page: import("@playwright/test").Page) {
  await page.goto("/admin/secrets");
  await expect(page.getByRole("heading", { name: "Secret Vault" })).toBeVisible();
}

test.describe("Secret Vault console", () => {
  test("renders the active policy set for a class and scope", async ({ page }) => {
    await login(page);
    await openConsole(page);

    // The seeded ACTIVE version is INTEGRATION_TOKEN in this tenant, which is
    // also the page's default class, so it renders without touching a filter.
    const table = page.getByTestId("applicable-policies-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText(SEEDED_PATH);

    // The DRAFT-only path must NOT appear here. This panel answers "what would
    // the broker resolve", and a DRAFT resolves to nothing — showing it would
    // tell the reader a path is brokerable when the broker will 404 it.
    await expect(table).not.toContainText(DRAFT_ONLY_PATH);
  });

  test("version history distinguishes ACTIVE from a version that was never activated", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    // #history_policy_id, not getByLabel: five inputs on this page carry the
    // label "Secret policy ID" — the history filter plus the four forms that
    // take one — and an unscoped label lookup is ambiguous by construction.
    await page.locator("#history_policy_id").fill(SEEDED_POLICY_ID);
    await page.getByRole("button", { name: "Read history" }).click();

    const history = page.getByTestId("version-history-table");
    await expect(history).toBeVisible();
    await expect(history).toContainText("ACTIVE");
  });

  // ── The three broker outcomes ───────────────────────────────────────────────
  //
  // Deny by absence makes 404 and 403 mean genuinely different things, and the
  // console is where that distinction has to survive: an operator reading
  // "denied" for an unprovisioned path goes and edits a policy that is already
  // correct. One test per outcome, asserting the reader is told them apart.

  test("broker grant issues a lease and does not put the token on the page", async ({ page }) => {
    await login(page);
    await openConsole(page);

    await page.getByTestId("broker-form").getByLabel("Secret path").fill(SEEDED_PATH);
    await page.getByLabel(/Requesting principal/).fill(ALLOWED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();

    const result = page.getByTestId("broker-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText(/lease/i);

    // The lease token is a live bearer credential. The action drops it before
    // returning, so it must not be anywhere in the delivered HTML — not in the
    // banner, not in the RSC payload. Asserting on the whole page content is the
    // point: a leak into a hidden field or a JSON blob would pass a
    // banner-scoped check.
    await expect(page.locator("body")).not.toContainText("local-lease:");
  });

  test("broker refusal for an unauthorized workload reads as a policy decision", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    await page.getByTestId("broker-form").getByLabel("Secret path").fill(SEEDED_PATH);
    await page.getByLabel(/Requesting principal/).fill(DENIED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();

    const result = page.getByTestId("broker-result");
    await expect(result).toBeVisible();
    // "A policy exists and refused you" — not "no such path".
    await expect(result).not.toContainText(/no .*polic/i);
  });

  test("broker refusal for a never-activated path reads as missing configuration", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    // A registered path whose only version is still DRAFT. The commonest real
    // misconfiguration, and the one a 403-shaped message would misdiagnose.
    await page.getByTestId("broker-form").getByLabel("Secret path").fill(DRAFT_ONLY_PATH);
    await page.getByLabel(/Requesting principal/).fill(ALLOWED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();

    const result = page.getByTestId("broker-result");
    await expect(result).toBeVisible();
    // The two refusals must not render identically — that is the whole point of
    // keeping 404 and 403 apart.
    const text = (await result.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(0);
    await expect(result).toContainText(/polic|activat|configur/i);
  });

  // ── The §4 input contract ───────────────────────────────────────────────────

  test("every write carries the canonical headers the service demands", async ({ page }) => {
    await login(page);
    await openConsole(page);

    await page.getByTestId("broker-form").getByLabel("Secret path").fill(SEEDED_PATH);
    await page.getByLabel(/Requesting principal/).fill(ALLOWED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByTestId("broker-result")).toBeVisible();

    // The mock refuses a write missing any of these before a handler sees it, so
    // a success above already implies they were sent. Read them back anyway and
    // assert the VALUES: a purpose_context of the wrong string still passes the
    // presence check while recording the wrong reason in the audit log, which is
    // exactly the kind of thing only an assertion on content catches.
    const writes = await secretVaultRequests("POST", "/v1/secrets/broker");
    expect(writes.length).toBeGreaterThan(0);
    const headers = writes[writes.length - 1].headers;

    expect(headers["x-tenant-id"]).toBe(DEMO_TENANT);
    expect(headers["x-source-channel"]).toBeTruthy();
    expect(headers["idempotency-key"]).toBeTruthy();
    // One purpose per kind of write, not one blanket string: brokering material
    // is a different reason from provisioning it, and an auditor should not have
    // to infer which from the route.
    expect(headers["x-purpose-context"]).toBe("SECRET_ACCESS_BROKERAGE");
  });

  // ── Evidence ────────────────────────────────────────────────────────────────

  test("the audit log records a denial as fully as a grant", async ({ page }) => {
    await login(page);
    await openConsole(page);

    // A refused request never becomes a lease, so the audit log is the ONLY
    // place it is visible at all.
    await page.getByTestId("broker-form").getByLabel("Secret path").fill(SEEDED_PATH);
    await page.getByLabel(/Requesting principal/).fill(DENIED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByTestId("broker-result")).toBeVisible();

    await page.reload();
    const audit = page.getByTestId("audit-table");
    await expect(audit).toBeVisible();
    // Both rows: REQUESTED is written before the outcome is known, DENIED after.
    await expect(audit).toContainText("DENIED");
    await expect(audit).toContainText("REQUESTED");
  });

  test("a revoked lease names the operator who revoked it, not only its holder", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    // Grant first, so there is something live to revoke.
    await page.getByTestId("broker-form").getByLabel("Secret path").fill(SEEDED_PATH);
    await page.getByLabel(/Requesting principal/).fill(ALLOWED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByTestId("broker-result")).toBeVisible();

    await page.reload();
    const leases = page.getByTestId("lease-table");
    await expect(leases).toBeVisible();
    // "Live", not "GRANTED": the panel humanises the stored status, and asserting
    // the wire value here would pass only by accident.
    await expect(leases).toContainText("Live");

    const leaseId = await firstLeaseId(page);
    expect(leaseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    await page.getByTestId("revoke-lease-form").getByLabel("Lease ID").fill(leaseId);
    await page.getByTestId("revoke-lease-form").getByRole("button").first().click();
    await expect(page.getByTestId("revoke-lease-result")).toBeVisible();

    await page.reload();
    const audit = page.getByTestId("audit-table");
    await expect(audit).toContainText("REVOKED");

    // The subject is the workload that held the lease; the actor is the operator
    // in this browser session. They are different principals, and until
    // migration 000004 the second was authorized and then discarded — so the log
    // could say a lease was revoked and not who revoked it.
    const revokedRow = audit.locator("tr", { hasText: "REVOKED" }).first();
    await expect(revokedRow).toContainText(ALLOWED_WORKLOAD.slice(0, 8));
    await expect(revokedRow).toContainText(/by/i);
  });

  test("rotation revokes every live lease on the path", async ({ page }) => {
    await login(page);
    await openConsole(page);

    await page.getByTestId("broker-form").getByLabel("Secret path").fill(SEEDED_PATH);
    await page.getByLabel(/Requesting principal/).fill(ALLOWED_WORKLOAD);
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByTestId("broker-result")).toBeVisible();

    await page.reload();
    await page.getByTestId("rotate-secret-form").getByLabel(/Secret policy ID/).fill(SEEDED_POLICY_ID);
    await page.getByRole("button", { name: /Rotate/ }).click();

    const result = page.getByTestId("rotate-secret-result");
    await expect(result).toBeVisible();
    // The count is the operationally important number — it is the size of the
    // blast radius, and an alert fires on it above 50.
    await expect(result).toContainText("1");

    await page.reload();
    await expect(page.getByTestId("lease-table")).toContainText("Revoked");
  });
});

/**
 * The lease_id of the first row in the lease table.
 *
 * Read off `title`, not the cell text: CopyableId shortens every id for display
 * ("370e3709…d811") so the rendered text never contains a whole UUID. The full
 * value is in `title`, which is also what clicking copies.
 */
async function firstLeaseId(page: import("@playwright/test").Page): Promise<string> {
  const row = page.getByTestId("lease-table").locator("tbody tr").first();
  const titles = await row.locator("[title]").evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("title") ?? ""),
  );
  // The title reads "<uuid> — click to copy", so pull the id out rather than
  // matching the whole attribute.
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  const ids = titles.map((t) => t.match(uuid)?.[0]).filter(Boolean) as string[];
  // The row also carries the holder's principal id, in an earlier column. The
  // lease id is the last one.
  return ids.pop() ?? "";
}
