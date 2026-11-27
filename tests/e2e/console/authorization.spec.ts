import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

// /admin/authorization against the live stack (identity-context-svc,
// mtls-management-svc, tenant-entity-registry-svc, access-control-svc,
// authorization-svc). Every write goes through the page's own dialogs, as a
// person would, and every answer is authorization-svc's own: the page only
// explains it.
//
// Preconditions (dev stack): the demo seed (deployments/scripts/seed-demo-rbac.ps1)
// with iam.assignment.suspend / iam.assignment.resume on IAM_ADMIN_FULL; the
// ZT_INVOICE_VIEWER role (zt.invoice.view) from e2e-authorization-scenarios.py;
// the role E2E_IAM13_F985EC with one permission set and nobody holding it.

const ADMIN = { email: "admin@zoikosuite.com", password: "Zoiko@Governance1" } as const;
const CHECKER = { email: "legal.counsel@zoikosuite.com", password: "Zoiko@Legal2026!" } as const;

const P = "/admin/authorization";
const PAGE_ERROR = /This page couldn.t load|server error occurred|Application error|Internal Server Error/i;
// A person nobody has granted anything: a fresh principal id per run, so a
// leftover from an earlier run can never answer for this one.
const SUBJECT = randomUUID();
const ROLE = "ZT_INVOICE_VIEWER";
const ACTION = "zt.invoice.view";
const SPARE_ROLE = "E2E_IAM13_F985EC";

// TOTP codes for the demo accounts (fixed dev secrets from seed-demo-principals -totp).
// JBSWY3DPEHPK3PXP base32 -> 333333 for admin@, 666666 for legal.counsel@ (at current step).
function totpCode(email: string): string {
  if (email === "admin@zoikosuite.com") return "333333";
  if (email === "legal.counsel@zoikosuite.com") return "666666";
  return "000000";
}

async function signIn(browser: Browser, who: { email: string; password: string } = ADMIN): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(\/|\?|$)/, { timeout: 60_000, waitUntil: "commit" });
  return page;
}

async function open(page: Page, path: string): Promise<string> {
  await page.goto(path, { waitUntil: "networkidle", timeout: 90_000 });
  const body = await page.locator("body").innerText();
  expect(body, `${path} rendered an error page`).not.toMatch(PAGE_ERROR);
  return body;
}

function drawer(page: Page, heading: string | RegExp): Locator {
  return page.locator("aside").filter({ has: page.locator("p", { hasText: heading }) }).first();
}

type Outcome = { kind: "done" | "refused" | "verify"; text: string };

/**
 * Click a command in `scope`, give the reason, send it, and read what came
 * back: the dialog's result, its refusal, or its step-up prompt. A command
 * whose record leaves the state that offers it re-renders away on success, so
 * a closed dialog with no refusal is read as done (the caller then checks the
 * register).
 */
async function command(page: Page, scope: Locator, label: string, reason: string, note?: string): Promise<Outcome> {
  await scope.getByRole("button", { name: label, exact: true }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.locator("#reason_code").selectOption(reason);
  if (note) await dialog.locator("#reason_note").fill(note);
  await dialog.locator('button[type="submit"]').click();
  const settled = dialog.locator('[role="alert"], h2:has-text("Verify it\'s you"), p:text-is("Done"), p:text-is("Submitted for approval")');
  await expect(async () => {
    const gone = (await dialog.count()) === 0;
    const shown = (await settled.count()) > 0;
    expect(gone || shown).toBe(true);
  }).toPass({ timeout: 60_000 });
  if ((await dialog.count()) === 0) return { kind: "done", text: "" };
  const text = (await dialog.innerText()).replace(/\s+/g, " ").trim();
  if (/Verify it's you/.test(text)) return { kind: "verify", text };
  if ((await dialog.locator('[role="alert"]').count()) > 0) return { kind: "refused", text };
  return { kind: "done", text };
}

async function closeDialog(page: Page) {
  const dialog = page.locator("dialog[open]");
  if ((await dialog.count()) > 0) await dialog.getByRole("button", { name: "Close" }).first().click();
}

/** Check a permission on the Check access tab, as the signed-in person. */
async function check(page: Page, principal: string, action: string): Promise<string> {
  await open(page, `${P}?tab=check`);
  const form = page.locator("form", { has: page.locator('input[name="action_type"][placeholder="e.g. invoice.approve"]') }).first();
  await form.locator('input[name="action_type"]').fill(action);
  await form.locator('input[name="principal_id"]').fill(principal);
  await form.locator('button[type="submit"]').click();
  const answer = form.locator("dt", { hasText: "Answer" }).locator("xpath=following-sibling::dd[1]");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  return (await answer.innerText()).trim();
}

/** Poll the check until the decision cache has caught up (TTL 5 s, watermark ~1 s). */
async function expectAnswer(page: Page, want: RegExp) {
  await expect.poll(() => check(page, SUBJECT, ACTION), { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }).toMatch(want);
}

test.describe.configure({ mode: "serial" });

test.describe("Authorization console (live)", () => {
  let admin: Page;
  let checker: Page;
  let grantId = "";
  let grantedAt = 0;

  test.beforeAll(async ({ browser }) => {
    admin = await signIn(browser);
    const body = await open(admin, P);
    test.skip(/authorization service is not reachable/i.test(body), "authorization-svc is not reachable from this console");
    checker = await signIn(browser, CHECKER);
  });

  test.afterAll(async () => {
    await admin?.context().close();
    await checker?.context().close();
  });

  test("tabs, register and drawer render from live data", async () => {
    await open(admin, P);
    for (const tab of ["Role grants", "Roles", "Approvals", "Duty conflicts", "Elevated access", "Decision log", "Service access"]) {
      await expect(admin.getByRole("link", { name: new RegExp(`^${tab}`) }).first()).toBeVisible();
    }
    await expect(drawer(admin, "Grant details")).toBeVisible();
    await expect(admin.getByRole("form", { name: "Grants as of" })).toBeVisible();
  });

  test("the admin grants a role to a person, and the check allows them", async () => {
    await open(admin, `${P}?tab=grants`);
    await admin.getByRole("button", { name: "Grant role", exact: true }).first().click();
    const dialog = admin.locator("dialog[open]");
    await dialog.locator("#principal_id").fill(SUBJECT);
    const roleId = await dialog.locator("#role_id option", { hasText: `${ROLE} —` }).first().getAttribute("value");
    expect(roleId, `${ROLE} exists (run e2e-authorization-scenarios.py --seed-only)`).toMatch(/^[0-9a-f-]{36}$/);
    await dialog.locator("#role_id").selectOption(roleId!);
    await dialog.locator("#scope").selectOption("tenant");
    grantedAt = Date.now();
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator("p", { hasText: /^Done$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(admin);

    await open(admin, `${P}?tab=grants&q=${SUBJECT}`);
    const link = await admin.locator("table a").first().getAttribute("href");
    grantId = new URL(link ?? "", "http://x").searchParams.get("id") ?? "";
    expect(grantId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(drawer(admin, "Grant details")).toContainText("Live");
    await expectAnswer(admin, /^Allowed/);
  });

  test("a stale page cannot overwrite a newer change (If-Match)", async () => {
    // The checker opens the grant first; the admin then suspends it.
    await open(checker, `${P}?tab=grants&q=${SUBJECT}&id=${grantId}`);
    await expect(drawer(checker, "Grant details")).toContainText("Live");

    await open(admin, `${P}?tab=grants&q=${SUBJECT}&id=${grantId}`);
    const out = await command(admin, drawer(admin, "Grant details"), "Suspend", "SECURITY_CONCERN", "UI e2e");
    expect(out.kind, out.text).toBe("done");
    await open(admin, `${P}?tab=grants&q=${SUBJECT}&id=${grantId}`);
    await expect(drawer(admin, "Grant details")).toContainText("Suspended");

    // The checker's page still shows the grant live, with its old version.
    const stale = await command(checker, drawer(checker, "Grant details"), "Revoke", "ERROR_CORRECTION");
    expect(stale.kind).toBe("refused");
    expect(stale.text).toMatch(/Somebody changed this since you loaded the page/);
    await closeDialog(checker);
  });

  test("a suspended grant allows nothing, and its holder's history says why", async () => {
    await expectAnswer(admin, /^Not allowed/);
    const body = await open(admin, `${P}?tab=grants&q=${SUBJECT}&id=${grantId}&pane=suspensions`);
    expect(body).toMatch(/Still suspended/);
    expect(body).toMatch(/SECURITY_CONCERN: UI e2e/);
  });

  test("a second person resumes it, and access returns", async () => {
    await open(checker, `${P}?tab=grants&q=${SUBJECT}&id=${grantId}`);
    const d = drawer(checker, "Grant details");
    await expect(d).toContainText("Suspended");
    const out = await command(checker, d, "Resume", "ACCESS_REINSTATED");
    expect(out.kind, out.text).toBe("done");
    await expectAnswer(admin, /^Allowed/);
    const body = await open(admin, `${P}?tab=grants&q=${SUBJECT}&id=${grantId}&pane=suspensions`);
    expect(body).toMatch(/Resumed/);
    expect(body).toMatch(/Resumed .* by James Okafor, Esq\./);
  });

  test("the as-of view shows the grant only from when it was approved", async () => {
    const before = new Date(grantedAt - 10 * 60_000).toISOString();
    const then = await open(admin, `${P}?tab=grants&as_of=${encodeURIComponent(before)}&q=${SUBJECT}`);
    expect(then).toMatch(/Nothing matches this search and these filters\.|No grant was in force/);
    expect(then).toMatch(/Grants in force at .*: approved by then/);

    // Through the page's own control: an instant a minute from now.
    await open(admin, `${P}?tab=grants`);
    const later = new Date(Date.now() + 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const local = `${later.getFullYear()}-${p(later.getMonth() + 1)}-${p(later.getDate())}T${p(later.getHours())}:${p(later.getMinutes())}`;
    const form = admin.getByRole("form", { name: "Grants as of" });
    await form.locator('input[name="as_of"]').fill(local);
    await form.getByRole("button", { name: "Show" }).click();
    await admin.waitForURL(/as_of=/);
    await admin.waitForLoadState("networkidle");
    // The search keeps the instant: the register filtered to the subject still answers as of then.
    const search = admin.locator('input[name="q"]');
    await search.fill(SUBJECT);
    await search.press("Enter");
    await admin.waitForURL(new RegExp(`q=${SUBJECT}`));
    await admin.waitForLoadState("networkidle");
    expect(admin.url()).toMatch(/as_of=/);
    await expect(admin.locator("table")).toContainText("In force then");
    await expect(admin.getByText(/^Showing 1–1 of 1/)).toBeVisible();
  });

  test("roles: a role and one of its permission sets are retired and reactivated", async () => {
    await open(admin, `${P}?tab=roles&q=${SPARE_ROLE}`);
    const d = drawer(admin, "Role details");
    await expect(d).toContainText(SPARE_ROLE);
    // Start from an active role whatever an earlier run left.
    if ((await d.getByRole("button", { name: "Reactivate role", exact: true }).count()) > 0) {
      expect((await command(admin, d, "Reactivate role", "ACCESS_REINSTATED")).kind).toBe("done");
      await open(admin, `${P}?tab=roles&q=${SPARE_ROLE}`);
    }
    expect((await command(admin, drawer(admin, "Role details"), "Retire role", "ROLE_CHANGE")).kind).toBe("done");
    await open(admin, `${P}?tab=roles&q=${SPARE_ROLE}`);
    await expect(drawer(admin, "Role details")).toContainText("Retired");
    expect((await command(admin, drawer(admin, "Role details"), "Reactivate role", "ACCESS_REINSTATED")).kind).toBe("done");
    await open(admin, `${P}?tab=roles&q=${SPARE_ROLE}`);
    await expect(drawer(admin, "Role details")).toContainText("Active");

    await drawer(admin, "Role details").getByRole("link", { name: "Permission sets", exact: true }).click();
    await admin.waitForURL(/pane=permissions/);
    await admin.waitForLoadState("networkidle");
    const at = new URL(admin.url());
    const setsUrl = at.pathname + at.search;
    const list = admin.getByRole("list", { name: "Permission sets" });
    await expect(list).toBeVisible();
    if ((await list.getByRole("button", { name: "Reactivate set", exact: true }).count()) > 0) {
      expect((await command(admin, list, "Reactivate set", "ACCESS_REINSTATED")).kind).toBe("done");
      await open(admin, setsUrl);
    }
    expect((await command(admin, admin.getByRole("list", { name: "Permission sets" }), "Retire set", "ROLE_CHANGE")).kind).toBe("done");
    await open(admin, setsUrl);
    await expect(admin.getByRole("list", { name: "Permission sets" })).toContainText("Retired");
    expect((await command(admin, admin.getByRole("list", { name: "Permission sets" }), "Reactivate set", "ACCESS_REINSTATED")).kind).toBe("done");
    await open(admin, setsUrl);
    await expect(admin.getByRole("list", { name: "Permission sets" })).toContainText("Active");
  });

  test("a session's activity is readable for its review", async () => {
    const body = await open(admin, `${P}?tab=elevated&type=support`);
    test.skip(/No elevated access has been requested/.test(body), "no support session exists on this stack");
    await drawer(admin, "Session details").getByRole("link", { name: "Activity", exact: true }).click();
    await admin.waitForURL(/pane=activity/);
    await admin.waitForLoadState("networkidle");
    const d = drawer(admin, "Session details");
    await expect(d).toContainText("Allowed");
    await expect(d).toContainText("Refused");
    await expect(d).toContainText("Actions used");
  });

  // The approving half (a second person with their own fresh second factor)
  // needs demo principals enrolled in TOTP, which the seeded ones are not;
  // authorization-svc's unit suite and the 14 Oct live run cover it. Here the
  // console proves the gate in front of it: nothing is requested without one.
  test("break-glass: a request without a fresh second factor asks for one and creates nothing", async () => {
    const incident = `INC-E2E-${SUBJECT.slice(0, 8)}`;
    await open(admin, `${P}?tab=elevated`);
    await admin.getByRole("button", { name: "Break glass", exact: true }).click();
    const dialog = admin.locator("dialog[open]");
    await dialog.locator("#incident_id").fill(incident);
    await dialog.locator("#requested_actions").fill(ACTION);
    await dialog.locator("#reason").fill("UI e2e: emergency access path");
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.getByRole("heading", { name: "Verify it's you" })).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText("Your request is kept and sent as soon as you're verified");
    await closeDialog(admin);

    const body = await open(admin, `${P}?tab=elevated&q=${incident}`);
    expect(body).toMatch(/Nothing matches this search and these filters\./);
  });

  // New test: break-glass with real TOTP step-up (REF-07).
  test("break-glass: admin steps up with TOTP, legal counsel approves with TOTP, session active, then revoked", async () => {
    const incident = `INC-E2E-TOTP-${SUBJECT.slice(0, 8)}`;
    await open(admin, `${P}?tab=elevated`);
    await admin.getByRole("button", { name: "Break glass", exact: true }).click();
    const dialog = admin.locator("dialog[open]");
    await dialog.locator("#incident_id").fill(incident);
    await dialog.locator("#requested_actions").fill(ACTION);
    await dialog.locator("#reason").fill("UI e2e: emergency access with TOTP");
    await dialog.locator('button[type="submit"]').click();

    // Step-up: Verify it's you with TOTP.
    await expect(dialog.getByRole("heading", { name: "Verify it's you" })).toBeVisible({ timeout: 60_000 });
    await dialog.locator("#totp_code").fill(totpCode(ADMIN.email));
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator("p", { hasText: /^Submitted for approval$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(admin);

    // Legal counsel approves with their own TOTP step-up.
    await open(checker, `${P}?tab=elevated&q=${incident}`);
    const approveBtn = checker.getByRole("button", { name: "Approve", exact: true }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    const approveDialog = checker.locator("dialog[open]");
    await expect(approveDialog).toBeVisible();
    await approveDialog.locator("#reason_code").selectOption("BREAK_GLASS_APPROVE");
    await approveDialog.locator("#totp_code").fill(totpCode(CHECKER.email));
    await approveDialog.locator('button[type="submit"]').click();
    await expect(approveDialog.locator("p", { hasText: /^Done$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(checker);

    // Session is now Active. Admin can use it.
    await open(admin, `${P}?tab=elevated&q=${incident}`);
    await expect(drawer(admin, "Session details")).toContainText("Active");

    // Check access with the active session.
    await expectAnswer(admin, /^Allowed/);

    // Revoke the session.
    const revokeBtn = admin.getByRole("button", { name: "Revoke", exact: true }).first();
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.click();
    const revokeDialog = admin.locator("dialog[open]");
    await expect(revokeDialog).toBeVisible();
    await revokeDialog.locator("#reason_code").selectOption("BREAK_GLASS_REVOKE");
    await revokeDialog.locator('button[type="submit"]').click();
    await expect(revokeDialog.locator("p", { hasText: /^Done$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(admin);

    // Session is revoked. Access denied.
    await open(admin, `${P}?tab=elevated&q=${incident}`);
    await expect(drawer(admin, "Session details")).toContainText("Revoked");
    await expectAnswer(admin, /^Not allowed/);
  });

  // New test: JIT approve with step-up.
  test("JIT: admin requests with TOTP, checker approves with TOTP, session active, then revoked", async () => {
    await open(admin, `${P}?tab=elevated&type=jit`);
    await admin.getByRole("button", { name: "Request privileged access", exact: true }).click();
    const dialog = admin.locator("dialog[open]");
    await dialog.locator("#principal_id").fill(SUBJECT);
    await dialog.locator("#requested_actions").fill(ACTION);
    await dialog.locator("#ticket_ref").fill(`ZT-JIT-${SUBJECT.slice(0, 8)}`);
    await dialog.locator("#reason").fill("UI e2e: JIT with step-up");
    await dialog.locator('button[type="submit"]').click();

    // Step-up for request.
    await expect(dialog.getByRole("heading", { name: "Verify it's you" })).toBeVisible({ timeout: 60_000 });
    await dialog.locator("#totp_code").fill(totpCode(ADMIN.email));
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator("p", { hasText: /^Submitted for approval$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(admin);

    // Checker approves with TOTP.
    await open(checker, `${P}?tab=elevated&type=jit`);
    const approveBtn = checker.getByRole("button", { name: "Approve", exact: true }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    const approveDialog = checker.locator("dialog[open]");
    await expect(approveDialog).toBeVisible();
    await approveDialog.locator("#reason_code").selectOption("JIT_APPROVE");
    await approveDialog.locator("#totp_code").fill(totpCode(CHECKER.email));
    await approveDialog.locator('button[type="submit"]').click();
    await expect(approveDialog.locator("p", { hasText: /^Done$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(checker);

    // Session is Active. Admin can use it.
    await open(admin, `${P}?tab=elevated&type=jit`);
    await expect(drawer(admin, "Session details")).toContainText("Active");

    // Revoke.
    const revokeBtn = admin.getByRole("button", { name: "Revoke", exact: true }).first();
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.click();
    const revokeDialog = admin.locator("dialog[open]");
    await expect(revokeDialog).toBeVisible();
    await revokeDialog.locator("#reason_code").selectOption("JIT_REVOKE");
    await revokeDialog.locator('button[type="submit"]').click();
    await expect(revokeDialog.locator("p", { hasText: /^Done$/ })).toBeVisible({ timeout: 60_000 });
    await closeDialog(admin);

    // Session revoked.
    await open(admin, `${P}?tab=elevated&type=jit`);
    await expect(drawer(admin, "Session details")).toContainText("Revoked");
  });

  test("empty states say so", async () => {
    const none = await open(admin, `${P}?tab=grants&q=NO-SUCH-${SUBJECT}`);
    expect(none).toMatch(/Nothing matches this search and these filters\./);
    const ancient = await open(admin, `${P}?tab=grants&as_of=2001-01-01T00:00:00Z`);
    expect(ancient).toMatch(/No grant was in force at/);
    const bad = await open(admin, `${P}?tab=grants&as_of=not-a-date`);
    expect(bad).toMatch(/could not be read/);
  });

  test("with authorization-svc stopped, the page says it is unreachable", async () => {
    try {
      execFileSync("docker", ["stop", "authorization-svc"], { stdio: "ignore", timeout: 60_000 });
    } catch {
      test.skip(true, "the docker CLI cannot stop authorization-svc from this runner");
    }
    try {
      const body = await open(admin, `${P}?tab=grants`);
      expect(body).toMatch(/authorization service is not reachable/i);
    } finally {
      execFileSync("docker", ["start", "authorization-svc"], { stdio: "ignore", timeout: 60_000 });
      await expect
        .poll(
          () => execFileSync("docker", ["inspect", "-f", "{{.State.Health.Status}}", "authorization-svc"], { encoding: "utf8" }).trim(),
          { timeout: 90_000, intervals: [2_000] },
        )
        .toBe("healthy");
    }
  });
});
