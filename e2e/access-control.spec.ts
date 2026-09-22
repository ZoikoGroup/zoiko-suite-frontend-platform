import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  login,
  resetMock,
  resetAccessControlMock,
  armAccessControlRefusal,
  armAccessControlReplay,
  ACCESS_CONTROL_MOCK_URL,
} from "./helpers";

// End-to-end coverage of the role and permission-bundle definition half of
// /admin/access-control, against a hermetic mock of access-control-svc
// (e2e/mock/access-control-service.mjs), per TESTING.md §19.
//
// WHAT THESE SPECS ARE FOR
//
// The Go suite proves the service's rules — the handlers, the store against
// real Postgres with row-level security actually binding, the transactional
// outbox — and scripts/audit.sh proves them again against a running stack.
// These prove what neither can see: that the CONSOLE sends the canonical §4
// headers the service's envelope middleware demands on writes, that it reads
// the fields it renders out of the real response shape, and that its banner
// tells the operator a different story for each outcome the register can
// produce.
//
// That last one is the point. Three of this service's outcomes look alike from
// a status code and mean opposite things to whoever is reading:
//
//   * 201 vs 200 on a create. One defined a role; the other found the role a
//     previous attempt with this key already defined. The service answered 201
//     to both until this pass, so the console's "replayed" branch — written
//     correctly all along — had never once been reachable.
//   * 409 vs 503. A role_code somebody already used is the operator's to
//     resolve in a second; a store that cannot be reached is nobody's. Both
//     arrived as 503 store_unavailable, with the raw Postgres SQLSTATE in the
//     body.
//   * 503 on a RETIREMENT. This is the one that must never read as a blip: the
//     retirement did not happen, so the role is still granting everything it
//     grants today.
//
// The evaluation-plane panels further down that page belong to
// authorization-svc, which this hermetic run does not stand up. The page is
// built to degrade to a named warning when that read fails, and the first spec
// below asserts the warning appears rather than pretending it does not — a
// suite that silently tolerated an empty panel would also tolerate a broken
// one.

const SEED_ROLE_WITH_BUNDLE = "ac000000-0000-4000-8000-000000000001";
const SEED_BUNDLE_CODE = "AP_FULL";

test.beforeEach(async () => {
  await resetMock();
  await resetAccessControlMock();
});

async function openConsole(page: Page): Promise<void> {
  await page.goto("/admin/access-control");
  await expect(page.getByRole("heading", { name: /Roles & Access Control/i }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** A form located by the button inside it — the page carries many. */
function formWithButton(page: Page, name: string | RegExp): Locator {
  return page.locator("form").filter({ has: page.getByRole("button", { name }) });
}

const defineRoleForm = (page: Page) => formWithButton(page, "Define role");
const updateRoleForm = (page: Page) => formWithButton(page, "Apply change");
const attachBundleForm = (page: Page) => formWithButton(page, /Attach bundle|Attach/ );

async function fillDefineRole(
  form: Locator,
  { code, name, scope = "TENANT" }: { code: string; name: string; scope?: string },
): Promise<void> {
  await form.locator("#role_code").fill(code);
  await form.locator("#role_name").fill(name);
  await form.locator("#role_scope_type").selectOption(scope);
}

// ─── The catalogue ───────────────────────────────────────────────────────────

test("the catalogue renders every definition, retired ones included", async ({ page }) => {
  await login(page);
  await openConsole(page);

  // All three seeded roles, and the counts that summarise them. A retired role
  // that vanished from the register would be the worst kind of wrong here:
  // the reader would conclude the tenant never defined it.
  await expect(page.getByText("FINANCE_APPROVER").first()).toBeVisible();
  await expect(page.getByText("READ_ONLY_AUDITOR").first()).toBeVisible();
  await expect(page.getByText("LEGACY_POSTER").first()).toBeVisible();

  // The bundle attached to the first role is read from the FLAT endpoint —
  // /v1/permission-bundles, one tenant-scoped read across every role. The panel
  // used to fan out one request per role because that endpoint did not exist.
  await expect(page.getByText(SEED_BUNDLE_CODE).first()).toBeVisible();
});

test("a failed authorization-svc read is named, and leaves the definition panels working", async ({
  page,
}) => {
  await login(page);
  await openConsole(page);

  // authorization-svc is genuinely absent in this hermetic run. The page must
  // say so in terms an operator can act on, and must not let that failure take
  // the panels that do not depend on it.
  await expect(
    page.getByText(/Could not read the live plane from authorization-svc/i),
  ).toBeVisible();
  await expect(page.getByText("FINANCE_APPROVER").first()).toBeVisible();
  await expect(defineRoleForm(page)).toBeVisible();
});

// ─── Defining a role ─────────────────────────────────────────────────────────

test("defining a role reports it created, and it appears in the catalogue", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = defineRoleForm(page);
  await fillDefineRole(form, { code: "TREASURY_APPROVER", name: "Treasury Approver" });
  await form.getByRole("button", { name: "Define role" }).click();

  await expect(form.getByText(/defined and provisioned into authorization-svc/i)).toBeVisible();
  // The sentence that matters more than the confirmation: a new role grants
  // nothing at all until a bundle is attached to it.
  await expect(form.getByText(/grants nothing until a permission bundle is attached/i)).toBeVisible();

  await expect(page.getByText("TREASURY_APPROVER").first()).toBeVisible();
});

test("the role code is upper-cased and underscored before it is sent", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = defineRoleForm(page);
  // A code is the string every service's authz check names, so a lower-case or
  // spaced entry would become a grant that matches nothing rather than an
  // error. The console normalises rather than letting that through.
  await fillDefineRole(form, { code: "treasury analyst", name: "Treasury Analyst" });
  await form.getByRole("button", { name: "Define role" }).click();

  await expect(form.getByText(/TREASURY_ANALYST/)).toBeVisible();
});

test("a replayed create reports that nothing was written, not a second role", async ({ page }) => {
  await login(page);
  await openConsole(page);

  // FINANCE_APPROVER is seeded. Arming a 200 for the next create reproduces
  // exactly what the service answers when this correlation id already defined
  // it — see armAccessControlReplay for why the browser cannot reach that path
  // by itself, and where the service's own idempotency is proved instead.
  await armAccessControlReplay("FINANCE_APPROVER");

  const form = defineRoleForm(page);
  await fillDefineRole(form, { code: "FINANCE_APPROVER", name: "Finance Approver" });
  await form.getByRole("button", { name: "Define role" }).click();

  // "Nothing was written again" — not a second confirmation of a creation that
  // did not happen. This branch of the console was written correctly from the
  // start and had never once been reachable, because the service answered 201
  // to a replay as well as to a create.
  await expect(form.getByText(/already created FINANCE_APPROVER/i)).toBeVisible();
  await expect(form.getByText(/Nothing was written again/i)).toBeVisible();
  await expect(form.getByText(/defined and provisioned/i)).toHaveCount(0);

  // And there is still exactly one role by that code.
  const rows = await fetch(`${ACCESS_CONTROL_MOCK_URL}/v1/role-definitions/`, {
    headers: {
      "x-tenant-id": "11111111-1111-1111-1111-111111111111",
      "x-principal-id": "33333333-3333-3333-3333-333333333333",
      "x-request-id": "spec",
      "x-correlation-id": "spec",
      "x-source-channel": "system",
    },
  }).then((r) => r.json());
  expect(rows.filter((r: { role_code: string }) => r.role_code === "FINANCE_APPROVER")).toHaveLength(
    1,
  );
});

test("a duplicate role code is explained as a duplicate, not as an outage", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = defineRoleForm(page);
  // FINANCE_APPROVER is seeded. A second definition of it is the operator's to
  // resolve; it used to arrive as 503 store_unavailable with a raw Postgres
  // SQLSTATE, which reads as "the database is down" and is nobody's to resolve.
  await fillDefineRole(form, { code: "FINANCE_APPROVER", name: "Finance Approver Two" });
  await form.getByRole("button", { name: "Define role" }).click();

  await expect(form.getByText(/already/i)).toBeVisible();
  await expect(form.getByText(/store unavailable|could not be reached/i)).toHaveCount(0);
});

test("a denied write says which grant is missing and where it is needed", async ({ page }) => {
  await login(page);
  await openConsole(page);

  await armAccessControlRefusal({
    status: 403,
    error_code: "forbidden",
    error_message: "authorization denied for this access control action",
  });

  const form = defineRoleForm(page);
  await fillDefineRole(form, { code: "DENIED_PROBE", name: "Denied Probe" });
  await form.getByRole("button", { name: "Define role" }).click();

  // The refusal depends on a grant only authorization-svc knows about, so the
  // console cannot check it — which is exactly when a bare error string leaves
  // the reader with nothing to do next.
  await expect(form.getByText(/You hold no ROLE_MANAGE grant on this legal entity/i)).toBeVisible();
  await expect(form.getByText(/per entity, not platform-wide/i)).toBeVisible();
});

// ─── Retiring a role ─────────────────────────────────────────────────────────

test("retiring a role reports the enforcement consequence, not just the record", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = updateRoleForm(page);
  await form.locator("#role_definition_id").selectOption(SEED_ROLE_WITH_BUNDLE);
  await form.locator("#status").selectOption("RETIRED");
  await form.getByRole("button", { name: "Apply change" }).click();

  // Matched on the sentence, not on the word: "RETIRED" is also an <option>
  // in this form's own status select, so a looser locator asserts nothing.
  await expect(
    form.getByText(/has cleared its active flag, so it now grants nothing/i),
  ).toBeVisible();
  // .last(): the same phrase appears in this form's own static hint above the
  // status select, so an unqualified locator matches two elements and would
  // pass on the hint alone — proving nothing about the response.
  await expect(form.getByText(/reactivating restores exactly the access/i).last()).toBeVisible();
});

test("a retirement that could not be propagated is not reported as a blip", async ({ page }) => {
  await login(page);
  await openConsole(page);

  await armAccessControlRefusal({
    status: 503,
    error_code: "authz_admin_unavailable",
    error_message: "authorization-svc admin API unavailable",
  });

  const form = updateRoleForm(page);
  await form.locator("#role_definition_id").selectOption(SEED_ROLE_WITH_BUNDLE);
  await form.locator("#status").selectOption("RETIRED");
  await form.getByRole("button", { name: "Apply change" }).click();

  // This is the one outcome a reader must not mistake for success. The role is
  // still granting every action it grants today, and the banner has to say so
  // rather than showing a generic "try again".
  await expect(form.getByText(/nothing was changed/i)).toBeVisible();
  await expect(form.getByText(/still granting|would leave the role still granting/i)).toBeVisible();
});

// ─── Bundles ─────────────────────────────────────────────────────────────────

test("attaching a bundle makes its actions visible on the role", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = attachBundleForm(page);
  await form.locator("#bundle_role_definition_id").selectOption(SEED_ROLE_WITH_BUNDLE);
  await form.locator("#bundle_code").fill("TREASURY_FULL");
  await form.locator("#permitted_actions").fill("PAYMENT_APPROVE, PAYMENT_RELEASE");
  await form.getByRole("button", { name: /Attach/ }).click();

  await expect(page.getByText("TREASURY_FULL").first()).toBeVisible();
  await expect(page.getByText(/PAYMENT_APPROVE/).first()).toBeVisible();
});

test("a duplicate bundle code on one role is refused", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = attachBundleForm(page);
  // Two bundles sharing a code on one role point at ONE grant in
  // authorization-svc, because its attach endpoint is an upsert-replace on
  // (role_id, bundle_code): the second silently replaced the first's actions,
  // and detaching either retired the bundle both of them described.
  await form.locator("#bundle_role_definition_id").selectOption(SEED_ROLE_WITH_BUNDLE);
  await form.locator("#bundle_code").fill(SEED_BUNDLE_CODE);
  await form.locator("#permitted_actions").fill("AP_INVOICE_APPROVE");
  await form.getByRole("button", { name: /Attach/ }).click();

  await expect(form.getByText(/already/i)).toBeVisible();
});

test("editing a bundle's actions saves the new set", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = formWithButton(page, "Save actions").first();
  await form.locator('textarea[name="permitted_actions"]').fill("AP_INVOICE_APPROVE, AP_INVOICE_VOID");
  await form.getByRole("button", { name: "Save actions" }).click();

  await expect(page.getByText(/AP_INVOICE_VOID/).first()).toBeVisible();
});

test("detaching needs an explicit confirmation and reports a withdrawal, not a deletion", async ({
  page,
}) => {
  await login(page);
  await openConsole(page);

  const form = formWithButton(page, "Detach bundle").first();

  // The settled state after a detach, not the banner: the write ends in
  // refresh(), and an inactive bundle renders this note INSTEAD of the detach
  // form — so the banner the submission produced is unmounted along with the
  // form that produced it. Asserting on the banner would be racing the refresh.
  const alreadyDetached = page.getByText(/Already detached — this bundle grants nothing/i);
  await expect(alreadyDetached).toHaveCount(0);

  // The confirmation is a required checkbox rather than a dialog, so a
  // dismissed prompt can never be mistaken for consent. Submitting without it
  // must not reach the service.
  await form.getByRole("button", { name: "Detach bundle" }).click();
  await expect(alreadyDetached).toHaveCount(0);

  await form.locator('input[name="confirm_detach"]').check();
  await form.getByRole("button", { name: "Detach bundle" }).click();

  // Withdrawn, not gone: the bundle keeps its contents so the same code can be
  // re-attached to restore exactly these actions, and the row stays in the
  // catalogue rather than disappearing from it.
  await expect(alreadyDetached).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(SEED_BUNDLE_CODE).first()).toBeVisible();
});

// ─── The contract the service enforces on the console ────────────────────────

test("writes carry the canonical envelope the service refuses without", async ({ page }) => {
  await login(page);
  await openConsole(page);

  const form = defineRoleForm(page);
  await fillDefineRole(form, { code: "ENVELOPE_PROBE", name: "Envelope Probe" });
  await form.getByRole("button", { name: "Define role" }).click();

  // The mock refuses a write missing any of tenant_id, actor_subject_id,
  // request_id, correlation_id, source_channel, idempotency_key or
  // legal_entity_id — 401 envelope_incomplete for the first two, 400 for the
  // rest, before any handler runs. A success here is the assertion: the
  // console sent all seven.
  await expect(form.getByText(/defined and provisioned/i)).toBeVisible();
  await expect(form.getByText(/envelope_incomplete/i)).toHaveCount(0);
});
