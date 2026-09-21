import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  login,
  resetMock,
  resetDelegatedAuthorityMock,
  delegatedAuthorityRequests,
  ADMIN_PRINCIPAL,
  DEMO_TENANT,
  LEGAL_ENTITY,
  DELEGATED_AUTHORITY_MOCK_URL,
} from "./helpers";

// End-to-end coverage of the Delegated Authority console (/admin/delegations)
// against a hermetic mock of delegated-authority-svc
// (e2e/mock/delegated-authority-service.mjs), per TESTING.md §19.
//
// WHAT THESE SPECS ARE FOR
//
// The Go suite proves the service's rules (handlers, store against real
// Postgres, outbox). These prove the things it cannot see: that the console
// sends the canonical §4 headers the service's envelope middleware demands on
// writes, that its banner tells the reader a different story for each of the
// register's outcomes — a replay that changed nothing must not read as a new
// grant, a governance refusal must not read as an error — and that a revoke is
// terminal and recorded, never a delete.
//
// The page's grant form mints its own correlation id on every server render,
// so the REPLAY path (a retry reusing the same idempotency key) is not
// reachable by clicking the button twice: the refresh that follows a successful
// grant re-renders the form with a fresh key. The replay case pins the hidden
// correlation input to a fixed value for both submissions — the exact
// double-click that the page's own design comments describe ("a retry of the
// same submission reuses it and replays") — and asserts the console reports the
// 200 as "nothing was written", not as a second grant.

const COLLEAGUE = "44444444-4444-4444-4444-444444444444";
const OTHER_PRINCIPAL = "88888888-8888-8888-8888-888888888888";
const THIRD_PRINCIPAL = "99999999-9999-9999-9999-999999999999";
// A fixed idempotency key for the replay case, in real UUID shape.
const PINNED_CORRELATION = "aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaaaa";

test.beforeEach(async () => {
  await resetMock();
  await resetDelegatedAuthorityMock();
});

/** The signed-in admin's grant form, located by the button inside it. */
function grantForm(page: Page): Locator {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: "Grant delegation" }),
  });
}

/** The register's body rows. The page carries exactly one table. */
function registerRows(page: Page): Locator {
  return page.locator("tbody tr");
}

async function openConsole(page: Page): Promise<void> {
  await page.goto("/admin/delegations");
  await expect(page.getByRole("heading", { name: "Delegated Authority" })).toBeVisible();
}

async function fillGrant(
  form: Locator,
  { delegator = ADMIN_PRINCIPAL, delegate, action, from = "2026-10-01T09:00", to = "2026-10-08T09:00" }: {
    delegator?: string;
    delegate: string;
    action: string;
    from?: string;
    to?: string;
  },
): Promise<void> {
  await form.getByLabel(/Delegator/).fill(delegator);
  await form.getByLabel(/Delegate/).fill(delegate);
  await form.getByLabel("Action type").fill(action);
  await form.getByLabel("Effective from").fill(from);
  await form.getByLabel("Effective to").fill(to);
}

test.describe("Delegated Authority console", () => {
  test("register renders the entity read with seeded grants and labels terminal rows", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    // The session carries a legal entity, so the panel asks for the ENTITY-wide
    // register — and the demo bundle holds DELEGATION_VIEW, so it gets it. The
    // line above the table says which question was answered.
    await expect(page.getByText(/full register for this legal entity/)).toBeVisible();

    const rows = registerRows(page);
    await expect(rows).toHaveCount(4);
    // Each seed is present exactly once, with the status the mock pinned.
    for (const action of ["PO_ISSUE", "PAYMENT_APPROVE", "CONTRACT_SIGN", "INVOICE_APPROVE"]) {
      await expect(rows.filter({ hasText: action })).toHaveCount(1);
    }

    // The revoked and expired seeds are terminal: no revoke affordance, and the
    // row still stands — this register never deletes anything.
    await expect(page.locator("tbody tr", { hasText: "CONTRACT_SIGN" })).toContainText("terminal");
    await expect(page.locator("tbody tr", { hasText: "INVOICE_APPROVE" })).toContainText("terminal");
    // Active rows keep the revoke control.
    await expect(page.locator("tbody tr", { hasText: "PO_ISSUE" })).toContainText("Revoke");

    // The read carried the canonical identity headers and asked for THIS
    // entity — the fail-closed register read of §19.
    const reads = await delegatedAuthorityRequests("GET", "/v1/delegations/");
    expect(reads.length).toBeGreaterThan(0);
    const last = reads[reads.length - 1];
    expect(last.query.legal_entity_id).toBe(LEGAL_ENTITY);
    expect(last.headers["x-tenant-id"]).toBe(DEMO_TENANT);
    expect(last.headers["x-principal-id"]).toBe(ADMIN_PRINCIPAL);
  });

  test("granting your own authority shows a green banner and adds an ACTIVE row", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    const form = grantForm(page);
    // The delegator defaults to the signed-in principal: you may only delegate
    // your own authority, and the form must not invite anything else.
    await expect(form.getByLabel(/Delegator/)).toHaveValue(ADMIN_PRINCIPAL);
    await expect(form.getByLabel(/Legal entity/)).toHaveValue(LEGAL_ENTITY);

    await fillGrant(form, { delegate: COLLEAGUE, action: "PO_APPROVE" });
    await form.getByRole("button", { name: "Grant delegation" }).click();

    // A NEW grant reads as a success — "takes effect immediately" is the green
    // banner's tell, absent from the replay message below.
    // The banner is the visible <div role="status">; CopyableId ships its own
    // sr-only <span role="status"> for the clipboard announcement, so scope to
    // the div to address the banner, not the screen-reader span.
    const banner = form.locator('div[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("takes effect immediately");
    await expect(banner).toContainText(COLLEAGUE);

    // The register now has the new ACTIVE row, on this legal entity.
    await expect(registerRows(page)).toHaveCount(5);
    const granted = registerRows(page).filter({ hasText: "PO_APPROVE" });
    await expect(granted).toHaveCount(1);
    await expect(granted).toContainText("ACTIVE");
  });

  test("resubmitting the same correlation id reads as a replay, not a new grant", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    const form = grantForm(page);
    await fillGrant(form, { delegate: COLLEAGUE, action: "PO_APPROVE" });

    // Pin the idempotency key, then submit via the REAL button — twice.
    //
    // The correlation input is minted fresh on every server render, so the
    // replay path is only reachable by reusing the key deliberately: this pins
    // it to a fixed UUID just before each click, which is exactly the retry of
    // the same submission the service exists to collapse (INV-08). The refresh
    // after the first grant also clears the form's uncontrolled fields, so the
    // fields are re-entered before the second pass — the same data, the same
    // key, which is what makes the second click a replay and not a new grant.
    async function submitWithKey(key: string): Promise<void> {
      await form.evaluate((el, k) => {
        const input = (el as HTMLFormElement).querySelector<HTMLInputElement>('input[name="correlation_id"]');
        if (input) input.value = k;
      }, key);
      await form.getByRole("button", { name: "Grant delegation" }).click();
    }

    await submitWithKey(PINNED_CORRELATION);
    const firstBanner = form.locator('div[role="status"]');
    await expect(firstBanner).toContainText("takes effect immediately");
    await expect(registerRows(page)).toHaveCount(5);

    await fillGrant(form, { delegate: COLLEAGUE, action: "PO_APPROVE" });

    await submitWithKey(PINNED_CORRELATION);
    // On the wire, both submissions carried the SAME key — the mock could only
    // collapse the second into the first on (tenant, correlation_id). Poll, so
    // racing the async action does not flake.
    await expect
      .poll(() => delegatedAuthorityRequests("POST", "/v1/delegations/"))
      .toHaveLength(2);
    const writes = (await delegatedAuthorityRequests("POST", "/v1/delegations/")).map(
      (w) => (w.body as { correlation_id?: string }).correlation_id,
    );
    expect(writes).toEqual([PINNED_CORRELATION, PINNED_CORRELATION]);

    // Neutral, not green: 200 means the first submission's grant is unchanged,
    // and reporting it as a fresh grant would claim authority was just handed
    // out when nothing was.
    await expect(firstBanner).toContainText("nothing was written");
    await expect(firstBanner).toContainText("answered 200");
    await expect(firstBanner).not.toContainText("takes effect immediately");

    // Still one PO_APPROVE row: no second grant was created.
    await expect(registerRows(page)).toHaveCount(5);
    await expect(registerRows(page).filter({ hasText: "PO_APPROVE" })).toHaveCount(1);
  });

  test("self-dealing is refused before the round trip", async ({ page }) => {
    await login(page);
    await openConsole(page);

    const writesBefore = (await delegatedAuthorityRequests("POST", "/v1/delegations/")).length;

    // THE ESCALATION of §19: naming another principal as delegator and yourself
    // as delegate. The console can see the shape, so it refuses locally — an
    // amber governance answer, not a request that must round-trip to fail.
    const form = grantForm(page);
    await fillGrant(form, { delegator: OTHER_PRINCIPAL, delegate: ADMIN_PRINCIPAL, action: "PAYMENT_APPROVE" });
    await form.getByRole("button", { name: "Grant delegation" }).click();

    // The banner is the visible <div role="status">; CopyableId ships its own
    // sr-only <span role="status"> for the clipboard announcement, so scope to
    // the div to address the banner, not the screen-reader span.
    const banner = form.locator('div[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("hands you another principal's authority");
    await expect(banner).toContainText("beneficiary");

    // The local check means nothing ever reached the service: the refusal is
    // the console's own, and no write hit the wire for it.
    const writesAfter = (await delegatedAuthorityRequests("POST", "/v1/delegations/")).length;
    expect(writesAfter).toBe(writesBefore);
  });

  test("delegating on behalf of another principal is refused as delegator_mismatch", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    const form = grantForm(page);
    await fillGrant(form, { delegator: OTHER_PRINCIPAL, delegate: THIRD_PRINCIPAL, action: "PO_APPROVE" });
    await form.getByRole("button", { name: "Grant delegation" }).click();

    // 403 delegator_mismatch. The banner explains it is a governance answer —
    // naming someone else's authority needs DELEGATION_ADMINISTER — not a
    // permission fault to retry.
    // The banner is the visible <div role="status">; CopyableId ships its own
    // sr-only <span role="status"> for the clipboard announcement, so scope to
    // the div to address the banner, not the screen-reader span.
    const banner = form.locator('div[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("You can only delegate authority that is your own");
    await expect(banner).toContainText("DELEGATION_ADMINISTER");

    // Nothing was written.
    await expect(registerRows(page)).toHaveCount(4);
  });

  test("delegating an authority the delegator does not hold is refused", async ({ page }) => {
    await login(page);
    await openConsole(page);

    const form = grantForm(page);
    await fillGrant(form, { delegate: COLLEAGUE, action: "NUCLEAR_LAUNCH" });
    await form.getByRole("button", { name: "Grant delegation" }).click();

    // 403 delegator_lacks_authority: a delegation cannot manufacture authority.
    // The banner is the visible <div role="status">; CopyableId ships its own
    // sr-only <span role="status"> for the clipboard announcement, so scope to
    // the div to address the banner, not the screen-reader span.
    const banner = form.locator('div[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("The delegator does not hold this authority");
    await expect(registerRows(page)).toHaveCount(4);
  });

  test("revoking an ACTIVE delegation is terminal and records who revoked it", async ({
    page,
  }) => {
    await login(page);
    await openConsole(page);

    const row = registerRows(page).filter({ hasText: "PO_ISSUE" });
    await expect(row).toContainText("ACTIVE");
    await row.getByRole("button", { name: "Revoke" }).click();

    // The revoke banner lives inside the revoke button, which the refresh that
    // follows a successful revoke unmounts (the row is terminal, so the control
    // vanishes) — the message would be gone before it could be asserted. What
    // IS observable is what the wire and the refreshed row say, so assert those.
    await expect
      .poll(() =>
        (delegatedAuthorityRequests("POST")).then((rs) => rs.filter((r) => r.path.endsWith("/revoke")).length),
      )
      .toBeGreaterThan(0);
    const revokes = (await delegatedAuthorityRequests("POST")).filter((r) =>
      r.path.endsWith("/revoke"),
    );
    expect(revokes[revokes.length - 1].headers["x-principal-id"]).toBe(ADMIN_PRINCIPAL);

    // Terminal and RECORDED: the row flips to REVOKED naming the revoker, the
    // revoke control becomes "terminal", and the row is not deleted.
    await expect(row).toContainText("REVOKED");
    await expect(row).toContainText(`by ${ADMIN_PRINCIPAL}`);
    await expect(row).toContainText("terminal");
    await expect(row.getByRole("button", { name: "Revoke" })).toHaveCount(0);
    await expect(registerRows(page)).toHaveCount(4);

    // And a SECOND revoke of the now-terminal row is 409, not 200 — the UI
    // cannot drive this anymore (the control is gone), so this probe pins the
    // mock to the wire answer the Go suite already proves, keeping the page's
    // 409 → terminal rendering honest if the mock ever drifts.
    const second = await fetch(
      `${DELEGATED_AUTHORITY_MOCK_URL}/v1/delegations/de000000-0000-4000-8000-000000000001/revoke`,
      {
        method: "POST",
        headers: {
          "X-Tenant-Id": DEMO_TENANT,
          "X-Principal-Id": ADMIN_PRINCIPAL,
          "X-Legal-Entity-Id": LEGAL_ENTITY,
          "X-Request-Id": "e2e-second-revoke",
          "X-Correlation-ID": "e2e-second-revoke",
          "X-Source-Channel": "web",
          "Idempotency-Key": "e2e-second-revoke",
        },
      },
    );
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { error_code?: string };
    expect(secondBody.error_code).toBe("invalid_transition");
  });

  test("every write carries the canonical §4 headers the service demands", async ({ page }) => {
    await login(page);
    await openConsole(page);

    const form = grantForm(page);
    await fillGrant(form, { delegate: COLLEAGUE, action: "PO_APPROVE" });
    await form.getByRole("button", { name: "Grant delegation" }).click();
    await expect(registerRows(page)).toHaveCount(5);

    // The mock refuses a write missing any of these before a handler sees it, so
    // the success above already implies they were sent. Read them back anyway and
    // assert the VALUES: a wrong tenant id still passes a presence check while
    // writing into another tenant's register.
    const writes = await delegatedAuthorityRequests("POST", "/v1/delegations/");
    expect(writes.length).toBeGreaterThan(0);
    const headers = writes[writes.length - 1].headers;
    expect(headers["x-tenant-id"]).toBe(DEMO_TENANT);
    expect(headers["x-principal-id"]).toBe(ADMIN_PRINCIPAL);
    // Entity-scoped writes carry the entity on the wire, §4 INV-02.
    expect(headers["x-legal-entity-id"]).toBe(LEGAL_ENTITY);
    expect(headers["x-request-id"]).toBeTruthy();
    expect(headers["x-correlation-id"]).toBeTruthy();
    expect(headers["x-source-channel"]).toBe("web");
    // INV-08: a material write carries an idempotency key.
    expect(headers["idempotency-key"]).toBeTruthy();
  });

  // ── API-only refusals from TESTING.md §19 ──────────────────────────────────
  //
  // These steps are outside what the console can drive — there is no status
  // filter on the register panel, and the browser session always carries a
  // tenant — so the same cases are proven in the Go handler/store suites. These
  // probes pin THIS mock to the wire behavior the page-side tests above rely
  // on, so a drift in one cannot silently re-fake the other.

  test("the register's API-only refusals match the service (unknown status, unscoped read, missing tenant)", async () => {
    const canonical = (extra: Record<string, string> = {}) => ({
      "X-Tenant-Id": DEMO_TENANT,
      "X-Principal-Id": ADMIN_PRINCIPAL,
      ...extra,
    });

    // §19 step 8: a misspelled status filter is 400 unknown_status, never an
    // empty list.
    const misspelled = await fetch(`${DELEGATED_AUTHORITY_MOCK_URL}/v1/delegations/?status=ACTIVEE`, {
      headers: canonical(),
    });
    expect(misspelled.status).toBe(400);
    const misspelledBody = (await misspelled.json()) as { error_code?: string; error_message?: string };
    expect(misspelledBody.error_code).toBe("unknown_status");
    expect(misspelledBody.error_message).toContain("status must be one of");

    // §19 step 7: asking after another principal's delegations without an
    // entity scope is 403, not an empty list.
    const unscoped = await fetch(
      `${DELEGATED_AUTHORITY_MOCK_URL}/v1/delegations/?delegate_principal_id=${THIRD_PRINCIPAL}`,
      { headers: canonical() },
    );
    expect(unscoped.status).toBe(403);

    // §19 step 10: no tenant is 401, not 503.
    const tenantless = await fetch(`${DELEGATED_AUTHORITY_MOCK_URL}/v1/delegations/`, {
      headers: { "X-Principal-Id": ADMIN_PRINCIPAL },
    });
    expect(tenantless.status).toBe(401);
    const tenantlessBody = (await tenantless.json()) as { error_code?: string };
    expect(tenantlessBody.error_code).toBe("tenant_missing");
  });
});