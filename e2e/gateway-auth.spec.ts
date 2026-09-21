import { expect, test, type Page } from "@playwright/test";
import { login, resetMock, resetTenantRegistryMock, setGatewayContext } from "./helpers";

// End-to-end coverage of gateway-auth-svc's FRONTEND contract.
//
// WHAT THIS SERVICE'S FRONTEND CONTRACT ACTUALLY IS
//
// gateway-auth-svc has no console page and correctly should not: it is a
// Traefik ForwardAuth callout with one machine endpoint that application code
// never calls directly. Its contract with the console is a refusal signal.
//
// When the gateway refuses a request before Traefik forwards it, Traefik
// returns that reply to the client verbatim — status, body and headers — so it
// surfaces on whichever backend call the console was making, carrying
//
//     403 + X-Tenant-Context: denied      the registry decided; re-auth won't help
//     503 + X-Tenant-Context: unresolved  no decision exists; retry
//
// lib/api/client.ts reads that header off every response and
// app/admin/tenants/failures.ts turns it into what the reader sees.
//
// That whole path had no test coverage. It matters because it reuses 403 and
// 503 — the same statuses a backend uses for entirely unrelated reasons, with
// entirely different fixes. Get it wrong and the console tells someone their
// principal lacks a grant when the real cause is a suspended tenant, sending
// them to an RBAC screen that will never help.

test.beforeEach(async () => {
  await resetMock();
  await resetTenantRegistryMock();
});

async function openTenants(page: Page) {
  await page.goto("/admin/tenants");
  await expect(page.getByTestId("update-entity-form")).toBeVisible({ timeout: 30_000 });
}

/** Submit the entity update form, which is one of the few actions whose
 *  supported-failure list includes "tenant-context". */
async function submitEntityUpdate(page: Page) {
  await page.locator("#update_legal_name").fill("Zoiko Group UK Limited");
  await page.getByRole("button", { name: /Update entity/ }).click();
  await expect(page.getByTestId("update-entity-result")).toBeVisible();
  return (await page.getByTestId("update-entity-result").textContent()) ?? "";
}

test.describe("gateway-auth-svc refusals as the console renders them", () => {
  test("a request the gateway never refuses succeeds normally", async ({ page }) => {
    await login(page);
    await openTenants(page);

    // The control case. Without it the two refusal tests below would pass
    // against a form that was broken for some unrelated reason.
    const text = await submitEntityUpdate(page);
    expect(text).not.toMatch(/gateway/i);
    // "updated", not the entity id: LabelledId shortens ids for display
    // ("22222222…2222"), so the rendered text never contains a whole UUID.
    await expect(page.getByTestId("update-entity-result")).toContainText(/updated/i);
  });

  test("a GOV-01 denial is not reported as a permissions problem", async ({ page }) => {
    await login(page);
    await openTenants(page);

    await setGatewayContext("denied");
    const text = await submitEntityUpdate(page);

    // It must name the gateway and the tenant's state.
    expect(text).toMatch(/gateway/i);
    expect(text).toMatch(/tenant/i);
    // And it must NOT send the reader after a grant. This is the actual
    // failure mode: a 403 that looks like every other 403, so the console says
    // "authorization-svc refused your principal" and someone spends an
    // afternoon in the RBAC screens.
    expect(text).not.toMatch(/authorization-svc/i);
    expect(text).toMatch(/not a permissions problem/i);
  });

  test("an unresolvable tenant context reads as retry, not as refused", async ({ page }) => {
    await login(page);
    await openTenants(page);

    await setGatewayContext("unresolved");
    const text = await submitEntityUpdate(page);

    // 503 here means no decision was obtained, so nothing was written and the
    // caller should retry. Reporting it as a refusal would be false: the
    // gateway did not decide anything.
    expect(text).toMatch(/retry|could not reach/i);
    expect(text).toMatch(/nothing was written/i);
    expect(text).not.toMatch(/not a permissions problem/i);
  });

  test("the two refusals do not render identically", async ({ page }) => {
    await login(page);
    await openTenants(page);

    await setGatewayContext("denied");
    const denied = await submitEntityUpdate(page);

    // Let the gateway through again before reloading: the page's own reads go
    // through it too, so leaving it in refusal mode means the form never
    // renders and the failure looks like a broken page rather than a refused
    // one.
    await setGatewayContext("none");
    await page.reload();
    await expect(page.getByTestId("update-entity-form")).toBeVisible({ timeout: 30_000 });
    await setGatewayContext("unresolved");
    const unresolved = await submitEntityUpdate(page);

    // The whole point of the gateway carrying two distinct signals. If these
    // ever collapse into one message, the distinction the service goes to
    // trouble to make has been thrown away at the last step.
    expect(denied).not.toEqual(unresolved);
  });
});
