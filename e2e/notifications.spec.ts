import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ADMIN_PRINCIPAL,
  DEMO_TENANT,
  LEGAL_ENTITY,
  armNotificationRefusal,
  login,
  notificationRequests,
  resetNotificationMock,
} from "./helpers";

// E2E for /admin/notifications and the topbar bell — the console surface over
// notification-svc.
//
// Against e2e/mock/notification-service.mjs, not the real service. What is
// proved here is the half the Go suite structurally cannot reach: that the
// console sends the canonical §4 envelope, reads what it renders out of the real
// response shape, and — the part that matters most on THIS service — tells the
// operator the truth about what did and did not go out.
//
// ── Why that last one carries the weight here ────────────────────────────────
//
// Almost every interesting outcome on this service is a 2xx, so the console is
// the only place the difference can be made visible, and every way of getting
// it wrong is silent:
//
//   1. A FAILED delivery answers 201. 03-microservices.md §9.7 requires that
//      notification failure must not collapse the source workflow — a payroll
//      run that finalized correctly cannot be told it failed because an
//      employee has no address on file. A console reading the HTTP code reports
//      a notice as sent when it demonstrably was not.
//
//   2. A transient failure ALSO answers 201, with status PENDING and a schedule
//      on it. That is neither sent nor failed: the platform is still actively
//      delivering it. Rendering it as success claims a provider accepted a
//      notice that had just refused it; rendering it as FAILED reports a
//      payslip notice as undelivered while it is still going out.
//
//   3. A replay answers 200 with the ORIGINAL notification. Collapsing 200 and
//      201 into "sent" claims a second notice went out when nothing did.
//
//   4. What SENT is WORTH depends on the channel. IN_APP is genuinely delivered
//      — the register row is the delivery. EMAIL means a provider ACCEPTED the
//      message, and ZS-SVC-Y-001 §0.4 forbids reporting that as receipt. The
//      console is where an operator forms that belief.
//
// The bell is covered here too, and it is worth saying why it is not somebody
// else's spec: it renders on EVERY admin page, it polls the caller's own inbox
// rather than the register, and the previous one was decorative — a gold dot
// with `animate-ping` on unconditionally, for every user, with no onClick. A
// badge that is always lit says nothing and trains people to ignore the one
// place the platform has to tell them something is waiting.

const SEED_IN_APP_UNREAD = "Payroll cutoff approaching";
const SEED_IN_APP_READ = "Expense claim approved";
const SEED_EMAIL_SENT = "Invoice approval required";
const SEED_RETRYING = "Payslip available";
const SEED_FAILED = "We have received your registration";

async function openNotifications(page: Page): Promise<void> {
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
}

/** The send form, identified by a field only it has. */
const sendForm = (page: Page): Locator =>
  page.locator("form").filter({ has: page.getByLabel("Recipient principal id") });

/** The delivery register's table. */
const register = (page: Page): Locator => page.locator("table");

/** One register row, by its subject. */
const row = (page: Page, subject: string): Locator =>
  register(page).locator("tbody tr").filter({ hasText: subject });

/** The result banner the send form renders after a submission. */
const banner = (page: Page): Locator => sendForm(page).locator("[role='status'], [role='alert']").first();

test.beforeEach(async () => {
  await resetNotificationMock();
});

// ─── The register ─────────────────────────────────────────────────────────────

test.describe("delivery register", () => {
  test("renders every reading, and each one says something different", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    // SENT on IN_APP — the only channel that can honestly claim receipt.
    await expect(row(page, SEED_IN_APP_UNREAD)).toContainText("SENT");
    await expect(row(page, SEED_IN_APP_UNREAD)).toContainText("IN_APP");

    // SENT on EMAIL — a provider accepted it. The acceptance evidence is shown,
    // and the row must not claim receipt anywhere.
    await expect(row(page, SEED_EMAIL_SENT)).toContainText("SENT");
    await expect(row(page, SEED_EMAIL_SENT)).toContainText("250 2.0.0 Ok");

    // FAILED — recorded proof the notice did not go out, with the reason.
    await expect(row(page, SEED_FAILED)).toContainText("FAILED");
    await expect(row(page, SEED_FAILED)).toContainText("550 5.1.1 no such mailbox");
  });

  // The single most consequential rendering decision on this page. The row is
  // PENDING in the database; showing the raw status would put a plain "PENDING"
  // next to a failure reason, and showing FAILED would report a notice as
  // undelivered while the platform is still delivering it.
  test("a rescheduled delivery reads as RETRYING, not as FAILED and not as PENDING", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    const retrying = row(page, SEED_RETRYING);
    await expect(retrying).toContainText("RETRYING");
    await expect(retrying).not.toContainText("FAILED");

    // The reason is framed as the LAST attempt, not as a verdict, and the next
    // attempt is named — that is what makes it legible as "still going".
    await expect(retrying).toContainText("Attempt 2 failed");
    await expect(retrying).toContainText("greylisted");
    await expect(retrying).toContainText("Next attempt");
  });

  // "Which address did we actually use, and who vouched for it" is the whole
  // question when somebody says they never received a notice. §0.4 names an
  // address with no provenance as a thing this control plane exists to prevent.
  test("shows the address a notice went to, and marks a caller-supplied one", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    // Resolved from the identity authority: shown plainly, no marker.
    const resolved = row(page, SEED_EMAIL_SENT);
    await expect(resolved).toContainText("approver@zoikosuite.example");
    await expect(resolved).not.toContainText("caller-supplied");

    // Handed over in the request: marked, so the two never become
    // indistinguishable after the fact.
    const supplied = row(page, SEED_FAILED);
    await expect(supplied).toContainText("founder@northwind.example");
    await expect(supplied).toContainText("caller-supplied");

    // IN_APP has no endpoint outside the platform, and says so rather than
    // leaving a blank that reads as missing data.
    await expect(row(page, SEED_IN_APP_UNREAD)).toContainText("in-app");
  });

  // Read state is IN_APP only. The ABSENCE of a marker on an EMAIL row is not
  // "unread" — it is "unknowable", and showing "unread" there would be a claim
  // the platform has no basis for.
  test("read state appears on IN_APP rows only", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await expect(row(page, SEED_IN_APP_UNREAD)).toContainText("Unread");
    await expect(row(page, SEED_IN_APP_READ)).toContainText("Read ");
    await expect(row(page, SEED_EMAIL_SENT)).not.toContainText("Unread");
  });

  // The read is authorized against the legal entity, not merely filtered by
  // tenant. A request that omits it is a DIFFERENT read — the caller's own
  // inbox — so a console that forgot it would quietly show an operator only
  // their own notices and call it the register.
  test("the register read is scoped to the legal entity on the wire", async ({ page }) => {
    await login(page);
    await openNotifications(page);
    await expect(row(page, SEED_EMAIL_SENT)).toBeVisible();

    const reads = await notificationRequests("GET", "/v1/notifications");
    const registerRead = reads.find((r) => r.query.legal_entity_id);
    expect(registerRead, "the console never sent an entity-scoped register read").toBeTruthy();
    expect(registerRead?.query.legal_entity_id).toBe(LEGAL_ENTITY);
    expect(registerRead?.headers["x-tenant-id"]).toBe(DEMO_TENANT);
    expect(registerRead?.headers["x-principal-id"]).toBe(ADMIN_PRINCIPAL);
  });

  // An unreachable service is not an empty register. A console that renders a
  // 503 as "no notifications on record" tells an operator nothing was sent,
  // when in fact nobody knows what was sent.
  test("an unreachable register says so, rather than showing nothing", async ({ page }) => {
    await login(page);
    // Targeted at the REGISTER read alone, by the query parameter only it
    // carries. The same page load fetches the template catalogue and the bell's
    // two inbox calls, all against the same service, so an untargeted arm is
    // consumed by whichever lands first — and the spec then asserts against a
    // page where something entirely different failed. That passes or fails by
    // scheduling, which is worse than not testing it.
    await armNotificationRefusal({
      status: 503,
      error: "store_unavailable",
      message: "notification store unavailable",
      only: "any",
      path: "/v1/notifications",
      hasQuery: "legal_entity_id",
      times: 50,
    });
    await openNotifications(page);

    await expect(page.getByText(/Delivery register unavailable/i)).toBeVisible();
    await expect(page.getByText(/No notifications on record/i)).toHaveCount(0);
  });
});

// ─── Sending ──────────────────────────────────────────────────────────────────

test.describe("send form", () => {
  test("an IN_APP send reports delivery, and the notice joins the register", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("IN_APP");
    await sendForm(page).getByLabel("Subject").fill("Board pack circulated");
    await sendForm(page).getByLabel("Body").fill("The October board pack is available.");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();

    // IN_APP is delivered by being recorded, and the copy says exactly that —
    // no weaker hedge, because for this channel none is warranted.
    await expect(banner(page)).toContainText(/Delivered in-app/i);
    await expect(row(page, "Board pack circulated")).toContainText("SENT");
  });

  // §0.4: provider acceptance must never be reported as receipt. This is the
  // exact sentence an operator reads to form that belief.
  test("an EMAIL send reports ACCEPTANCE, never receipt", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("EMAIL");
    await sendForm(page).getByLabel("Subject").fill("Quarterly filing due");
    await sendForm(page).getByLabel("Recipient address override").fill("filer@zoikosuite.example");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();

    await expect(banner(page)).toContainText(/Accepted by the provider/i);
    await expect(banner(page)).toContainText(/Accepted is not received/i);
    // And the provenance of the address it used, since the operator supplied it.
    await expect(banner(page)).toContainText(/supplied with the request/i);
  });

  // WEBHOOK has no provider, by design — §1.3 puts machine-to-machine exchange
  // outside this service. The send answers 201 with status FAILED, and the
  // console must surface that as a failure rather than falling through to its
  // success branch on the 201.
  test("a WEBHOOK send is reported as FAILED despite the 201", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("WEBHOOK");
    await sendForm(page).getByLabel("Subject").fill("Machine callback");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();

    await expect(banner(page)).toContainText(/delivery FAILED/i);
    await expect(banner(page)).toContainText(/XIC|webhook delivery is not this service/i);
    // Recorded, not hidden: the failed delivery is evidence and must be on the
    // register.
    await expect(row(page, "Machine callback")).toContainText("FAILED");
  });

  // The service refuses a request carrying both a template and a subject with
  // 400 conflicting_content, because supplying each would leave it ambiguous
  // which one the recipient actually received.
  //
  // What is asserted here is that the form makes that request UNCONSTRUCTABLE
  // rather than merely refusing it after a round trip: choosing a template
  // disables the subject and body fields, and a disabled field is not
  // submitted. The action's own guard against the pair is the second line of
  // defence — Server Actions are reachable by direct POST, not only through
  // this UI — but a user driving the form can never reach it.
  test("choosing a template makes the conflicting request unconstructable", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    const before = (await notificationRequests("POST", "/v1/notifications")).length;

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel(/^Subject/).fill("My own subject");
    await sendForm(page).getByLabel("Template").selectOption("registration_received");

    // Both content fields go read-only the moment a template is chosen.
    await expect(sendForm(page).getByLabel(/^Subject/)).toBeDisabled();
    await expect(sendForm(page).getByLabel(/^Body/)).toBeDisabled();

    // And the template's required variables are enforced before anything is
    // sent, so an incomplete render never reaches the service either — the
    // service would refuse it with missing_template_variables, and refusing
    // beats sending a message with a blank organization name.
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();
    expect(
      (await notificationRequests("POST", "/v1/notifications")).length,
      "the console sent a template render with no variables",
    ).toBe(before);
    await expect(sendForm(page).getByLabel("Organization name")).toBeVisible();
  });

  // The catalogue is FETCHED, not hardcoded. The required-variable contracts
  // live in the service binary; a second copy in the console drifts the first
  // time one gains a variable, and the failure is a 400 on submit with no field
  // on the form to fix it.
  test("choosing a template draws its required variables from the service", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await sendForm(page).getByLabel("Template").selectOption("approved");
    // `approved` requires organization_name AND login_url — both from the
    // catalogue, neither hardcoded here or in the console.
    await expect(sendForm(page).getByLabel("Organization name")).toBeVisible();
    await expect(sendForm(page).getByLabel("Login url")).toBeVisible();

    // And the subject is the template's, which is why the field is disabled.
    await expect(sendForm(page).getByLabel(/^Subject/)).toBeDisabled();
  });

  test("a template send omits subject on the wire, and carries its variables", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("EMAIL");
    await sendForm(page).getByLabel("Recipient address override").fill("founder@northwind.example");
    await sendForm(page).getByLabel("Template").selectOption("registration_received");
    await sendForm(page).getByLabel("Organization name").fill("Northwind Trading Ltd");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();

    await expect(banner(page)).toContainText(/Accepted by the provider/i);

    const writes = await notificationRequests("POST", "/v1/notifications");
    const sent = writes[writes.length - 1]?.body as Record<string, unknown>;
    expect(sent.template).toBe("registration_received");
    expect(sent.variables).toEqual({ organization_name: "Northwind Trading Ltd" });
    // ABSENT, not empty. The service treats a non-empty subject alongside a
    // template as conflicting content and refuses the whole request, so an
    // empty string here would fail every template send.
    expect(sent).not.toHaveProperty("subject");
  });

  // SMS was accepted, resolved a recipient, and then failed every send — the one
  // channel that advertised a capability the platform does not have. Offering it
  // would produce a form that submits to a guaranteed 400.
  test("SMS is not offered as a channel", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    const options = await sendForm(page).getByLabel("Channel").locator("option").allInnerTexts();
    expect(options).toEqual(["EMAIL", "IN_APP", "WEBHOOK"]);
  });

  // Every write carries the canonical §4 envelope. The console shipped for weeks
  // sending none of these and every page still rendered, because only writes
  // answered 401 — nothing on screen could have caught it.
  test("a send carries the full §4 envelope on the wire", async ({ page }) => {
    await login(page);
    await openNotifications(page);

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("IN_APP");
    await sendForm(page).getByLabel("Subject").fill("Envelope check");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();
    await expect(banner(page)).toContainText(/Delivered in-app/i);

    const writes = await notificationRequests("POST", "/v1/notifications");
    const headers = writes[writes.length - 1]?.headers ?? {};
    expect(headers["x-tenant-id"]).toBe(DEMO_TENANT);
    expect(headers["x-principal-id"]).toBe(ADMIN_PRINCIPAL);
    expect(headers["idempotency-key"], "a write with no idempotency key is a 400").toBeTruthy();
    expect(headers["x-request-id"]).toBeTruthy();
    expect(headers["x-source-channel"]).toBeTruthy();

    // The send's OWN idempotency key is the body's correlation_id, which is a
    // different thing from the header and is what makes a retried submission
    // replay rather than send twice.
    const body = writes[writes.length - 1]?.body as Record<string, unknown>;
    expect(body.correlation_id, "a send with no correlation id can be delivered twice").toBeTruthy();
  });

  // A refusal that depends on a grant only authorization-svc knows about. The
  // console cannot predict it, and the copy has to distinguish it from the
  // OTHER grant — sending and reading are separate, and holding one does not
  // imply the other.
  test("a denied send explains which grant is missing", async ({ page }) => {
    await login(page);
    await openNotifications(page);
    await armNotificationRefusal({
      status: 403,
      error: "forbidden",
      message: "authorization denied for notification action",
    });

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("IN_APP");
    await sendForm(page).getByLabel("Subject").fill("Will be denied");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();

    await expect(banner(page)).toContainText(/NOTIFICATION_SEND/);
    await expect(banner(page)).toContainText(/NOTIFICATION_VIEW/);
  });

  // Fail-closed is not a denial, and an operator acts differently on each: one
  // means "you may not", the other means "we could not find out".
  test("an unverifiable authorization is reported as a fail-closed refusal", async ({ page }) => {
    await login(page);
    await openNotifications(page);
    await armNotificationRefusal({ status: 503, error: "authz_unavailable", message: "authz_unavailable" });

    await sendForm(page).getByLabel("Recipient principal id").fill(ADMIN_PRINCIPAL);
    await sendForm(page).getByLabel("Channel").selectOption("IN_APP");
    await sendForm(page).getByLabel("Subject").fill("Cannot verify");
    await sendForm(page).getByRole("button", { name: /Send notification/ }).click();

    await expect(banner(page)).toContainText(/fail-closed refusal, not a denial/i);
  });
});

// ─── The bell ─────────────────────────────────────────────────────────────────

test.describe("notification bell", () => {
  // The count comes from the unread-count endpoint, NOT from the length of the
  // preview list — that list is capped at 8, so deriving the badge from it would
  // tell a user with 40 unread notices that they had 8.
  test("shows the caller's real unread count", async ({ page }) => {
    await login(page);
    // One unread IN_APP notice in the seed addressed to the admin; the other is
    // already read, and the EMAIL rows can never be unread.
    await expect(page.getByRole("button", { name: /Notifications — 1 unread/ })).toBeVisible();
  });

  test("the dropdown lists the unread notices and links to the register", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /Notifications/ }).click();

    const menu = page.getByRole("menu");
    await expect(menu.getByText(SEED_IN_APP_UNREAD)).toBeVisible();
    // The already-read one must not be there: this is the unread list.
    await expect(menu.getByText(SEED_IN_APP_READ)).toHaveCount(0);
    await expect(menu.getByRole("link", { name: /Open the notification register/ })).toBeVisible();
  });

  test("acknowledging a notice clears it and decrements the badge", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /Notifications/ }).click();

    await page.getByRole("button", { name: `Mark "${SEED_IN_APP_UNREAD}" as read` }).click();

    // The badge goes, because nothing is unread any more.
    await expect(page.getByRole("button", { name: /Notifications — none unread/ })).toBeVisible();

    // And it went through the recipient's own mark-read route.
    //
    // Polled rather than read once. The bell updates OPTIMISTICALLY — it drops
    // the row and decrements before the server answers — so the badge
    // assertion above can be satisfied by a frame in which the request is
    // still in flight. Reading the journal at that instant finds nothing and
    // fails for a reason that has nothing to do with the behaviour.
    await expect
      .poll(async () => (await notificationRequests("POST")).some((r) => r.path.endsWith("/read")), {
        message: "the bell never sent a mark-read to the service",
      })
      .toBe(true);
  });

  // The bell reads the caller's OWN inbox, which is a different request from the
  // register read: no legal_entity_id, so the service forces the recipient
  // filter to the calling principal. A bell that sent the entity would be
  // showing the operator everyone's notices as if they were their own.
  test("the bell reads the caller's inbox, not the entity register", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("button", { name: /Notifications/ })).toBeVisible();

    const reads = await notificationRequests("GET", "/v1/notifications");
    const inboxRead = reads.find((r) => r.query.unread_only === "true");
    expect(inboxRead, "the bell never asked for the unread inbox").toBeTruthy();
    expect(inboxRead?.query.legal_entity_id).toBeUndefined();
  });

  // "0" and "we could not find out" are different facts, and only one of them
  // is safe to imply. A silent zero tells the user they have nothing waiting
  // when nobody knows whether they do.
  test("an unreadable inbox shows unknown, not zero", async ({ page }) => {
    // Every inbox read for the life of this test, not just the first two.
    //
    // Two reasons, and both are the kind of thing that makes a spec pass and
    // fail by scheduling. The bell reads its count and its unread list
    // CONCURRENTLY, so refusing one leaves the other succeeding and the badge
    // shows a number. And React re-invokes a mount effect in development, so
    // the bell loads twice on arrival — with a small count the later, succeeding
    // load simply overwrites the refused one and the error state disappears
    // before the assertion runs.
    //
    // A large count makes the inbox unreadable for as long as the test looks at
    // it, which is what the scenario actually is: the register is down, not
    // down for exactly two requests.
    await armNotificationRefusal({
      status: 503,
      error: "store_unavailable",
      only: "any",
      path: "/v1/notifications",
      times: 50,
    });
    await login(page);
    // Wait for the bell itself rather than for the page: the assertion below is
    // about what the BELL says, and on a dashboard that renders before the
    // bell's first load resolves, a bare visibility check races it.

    await expect(page.getByRole("button", { name: /inbox could not be read/ })).toBeVisible();
  });
});
