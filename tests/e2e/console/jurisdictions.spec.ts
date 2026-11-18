import { generateKeyPairSync, randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

// JR-FE-3 · /admin/jurisdictions against the live stack (see
// playwright.jurisdictions.config.ts for what must be running). Every step
// goes through the command's own dialog, as a person would, and reads the
// result the dialog shows. Three people take part: the maker (admin), the
// checker (legal counsel) and an independent certifier (tax officer).

const USERS = {
  maker: { email: "admin@zoikosuite.com", password: "Zoiko@Governance1" },
  checker: { email: "legal.counsel@zoikosuite.com", password: "Zoiko@Legal2026!" },
  third: { email: "tax.officer@zoikosuite.com", password: "Zoiko@Tax2026!" },
} as const;
type Who = keyof typeof USERS;

const J = "/admin/jurisdictions";
const RUN = randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
const CODE = `E2E${RUN}`;
const PAGE_ERROR = /This page couldn.t load|server error occurred|Application error|Internal Server Error/i;

// Typed rule parameters (ZS-JUR-001 decision-rule parameters): rates are decimal strings.
const TAX_BANDS = JSON.stringify({ family: "TAX_BANDS", bands: [{ up_to: "1000", rate: "0.1" }, { up_to: null, rate: "0.2" }], rounding: { mode: "HALF_UP", scale: 2 } });
const EINVOICE_PROFILE = JSON.stringify({
  family: "EINVOICE_PROFILE",
  profile: {
    channel: "PEPPOL",
    document_type: "INVOICE",
    profile_version: "1.0",
    syntax: "UBL_XML",
    transmission_mode: "EXCHANGE",
    timing: { retry_window_hours: 72, correction_window_days: 30 },
    corrections: ["CREDIT_NOTE", "CANCEL"],
    dependencies: [{ kind: "SCHEMA", ref: "peppol.pint.ubl", version: "2026.1", valid_from: "2026-01-01", valid_to: "2026-12-31" }],
    semantic_mapping: [{ from: "invoice.number", to: "cbc:ID" }],
    lifecycle: {
      initial: "SUBMITTED",
      terminal: ["ACCEPTED", "REJECTED"],
      transitions: [["SUBMITTED", "PROCESSING"], ["SUBMITTED", "ACCEPTED"], ["SUBMITTED", "REJECTED"], ["PROCESSING", "PROCESSING"], ["PROCESSING", "ACCEPTED"], ["PROCESSING", "REJECTED"]],
      receipt_required: ["ACCEPTED"],
    },
  },
});

type Result = { status: "done" | "pending" | "refused" | "error" | "closed" | "other"; text: string; details: Record<string, string>; rows: string[] };

async function signIn(browser: Browser, who: Who): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  // Wait for hydration: an early click submits the form natively and never signs in.
  await page.waitForLoadState("networkidle");
  await page.fill("#email", USERS[who].email);
  await page.fill("#password", USERS[who].password);
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

/** Visible command buttons (a button followed by its dialog) with this label, optionally inside a row. */
async function triggers(page: Page, label: string, row?: string): Promise<number[]> {
  return page.evaluate(
    ([label, row]) => {
      const out: number[] = [];
      let i = 0;
      for (const d of document.querySelectorAll("dialog")) {
        const b = d.previousElementSibling as HTMLElement | null;
        if (!b || b.tagName !== "BUTTON") continue;
        b.setAttribute("data-trig", String(i));
        const text = b.innerText.replace(/\s+/g, " ").trim().replace(/^\+\s*/, "");
        const inRow = !row || (b.closest("li,tr")?.textContent ?? "").includes(row);
        if (b.getClientRects().length > 0 && text === label && inRow) out.push(i);
        i++;
      }
      return out;
    },
    [label, row ?? ""] as const,
  );
}

async function offered(page: Page, label: string): Promise<boolean> {
  return (await triggers(page, label)).length > 0;
}

/**
 * Open a command, fill its fields (a select by value, label or part of the
 * label; "__first__" picks its first option), submit, and read the result.
 */
async function run(page: Page, opts: { path?: string; button: string; row?: string; fields?: Record<string, string> }): Promise<Result> {
  if (opts.path) await open(page, opts.path);
  const idx = await triggers(page, opts.button, opts.row);
  expect(idx.length, `no "${opts.button}" button on ${page.url()}`).toBeGreaterThan(0);
  await page.locator(`[data-trig="${idx[0]}"]`).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("form").first().waitFor();
  for (const [name, value] of Object.entries(opts.fields ?? {})) {
    const el = dialog.locator(`[name="${name}"]`).first();
    expect(await el.count(), `no field "${name}" in "${opts.button}"`).toBe(1);
    if ((await el.evaluate((e) => e.tagName)) === "SELECT") {
      const options = await el.evaluate((e) => [...(e as HTMLSelectElement).options].map((o) => ({ v: o.value, t: o.text })));
      const hit =
        value === "__first__"
          ? options.find((o) => o.v)
          : (options.find((o) => o.v === value) ?? options.find((o) => o.t === value) ?? options.find((o) => o.t.includes(value) || (o.v && o.v.includes(value))));
      expect(hit, `no option "${value}" in "${name}": ${options.map((o) => o.t).join(" | ")}`).toBeTruthy();
      await el.selectOption(hit!.v);
    } else {
      await el.fill(value);
    }
  }
  await dialog.locator('button[type="submit"]').first().click();
  await page.waitForFunction(
    () => {
      const d = document.querySelector("dialog[open]") as HTMLElement | null;
      if (!d) return true;
      if (/Working…/.test(d.innerText)) return false;
      return !!d.querySelector('[role="alert"]') || /\bDone\b|Submitted for approval/.test(d.innerText);
    },
    null,
    { timeout: 120_000 },
  );
  const result = await page.evaluate((): Result => {
    const d = document.querySelector("dialog[open]") as HTMLElement | null;
    if (!d) return { status: "closed", text: "", details: {}, rows: [] };
    const alert = d.querySelector('[role="alert"]') as HTMLElement | null;
    const details = Object.fromEntries([...d.querySelectorAll("dl > div")].map((x) => [(x.children[0] as HTMLElement)?.innerText.trim(), (x.children[1] as HTMLElement)?.innerText.trim()]));
    const rows = [...d.querySelectorAll("table tr")].map((r) => (r as HTMLElement).innerText.replace(/\s+/g, " ").trim());
    const t = d.innerText;
    const status: Result["status"] = alert ? (/amber/.test(alert.className) ? "refused" : "error") : /Submitted for approval/.test(t) ? "pending" : /\bDone\b/.test(t) ? "done" : "other";
    const text = alert ? alert.innerText : ([...d.querySelectorAll("p")].map((p) => (p as HTMLElement).innerText).find((p) => p && !/^(Done|Submitted for approval)$/.test(p.trim())) ?? t);
    return { status, text: text.trim(), details, rows };
  });
  await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");
  return result;
}

/** Run a command and require one of the statuses; the message is the failure text. */
async function must(page: Page, want: Result["status"][], opts: Parameters<typeof run>[1]): Promise<Result> {
  const r = await run(page, opts);
  expect(want, `${opts.button}: ${r.status}: ${r.text}`).toContain(r.status);
  return r;
}

test.describe.configure({ mode: "serial" });

test.describe("Jurisdictions & Rules console (live)", () => {
  let maker: Page;
  let checker: Page;
  let third: Page;
  const S: Record<string, string> = {};

  test.beforeAll(async ({ browser }) => {
    maker = await signIn(browser, "maker");
    await maker.goto(J, { waitUntil: "networkidle" });
    const body = await maker.locator("body").innerText();
    test.skip(/The jurisdiction register unavailable|could not be reached/.test(body), "jurisdiction-rules-svc is not reachable from this console");
    checker = await signIn(browser, "checker");
    third = await signIn(browser, "third");
  });

  test.afterAll(async () => {
    for (const p of [maker, checker, third]) await p?.context().close();
  });

  test("a jurisdiction, and an import applied by a second person", async () => {
    const r = await must(maker, ["done"], {
      path: J,
      button: "New jurisdiction",
      fields: { jurisdiction_code: CODE, jurisdiction_name: `E2E ${RUN}`, jurisdiction_type: "COUNTRY", authority_type: "NATIONAL", effective_from: "2025-01-01" },
    });
    S.jid = r.details.Id;
    const imp = await must(maker, ["pending"], {
      path: J,
      button: "Propose import",
      fields: {
        source_standard: "ISO 3166-2",
        source_version: `e2e-${RUN}`,
        evidence_ref: `E2E-${RUN}`,
        summary: `E2E import ${RUN}`,
        items: JSON.stringify([{ action: "ADD", target: { code: `${CODE}-I`, type: "SUBDIVISION" }, jurisdiction_name: `E2E imported ${RUN}`, authority_type: "STATE", effective_from: "2026-01-01T00:00:00Z", parent: { code: CODE, type: "COUNTRY" } }]),
      },
    });
    await open(maker, `${J}?tab=history&id=import:${imp.details.Batch}`);
    expect(await offered(maker, "Approve and apply"), "the proposer approves their own import").toBe(false);
    const applied = await must(checker, ["done"], { path: `${J}?tab=history&id=import:${imp.details.Batch}`, button: "Approve and apply" });
    expect(applied.text).toMatch(/1 added/);
  });

  test("a source reviewed by a second person, and an approved interpretation", async () => {
    const src = await must(maker, ["pending"], {
      path: `${J}?tab=sources`,
      button: "Capture source",
      fields: { jurisdiction_id: CODE, authority: "E2E authority", source_type: "STATUTE", authority_level: "BINDING_LAW", title: `E2E Act ${RUN}`, location: `https://example.invalid/e2e/${RUN}`, snapshot_hash: `sha256:${randomBytes(32).toString("hex")}`, published_on: "2025-01-01", effective_on: "2025-01-01" },
    });
    S.sid = src.details["Source id"];
    await open(maker, `${J}?tab=sources&id=${S.sid}`);
    expect(await offered(maker, "Review source"), "the capturer reviews their own source").toBe(false);
    await must(checker, ["done"], { path: `${J}?tab=sources&id=${S.sid}`, button: "Review source" });
    await must(maker, ["done"], { path: `${J}?tab=sources`, button: "New regime", fields: { regime_code: "VAT", regime_name: "Value added tax" } });
    const interp = await must(maker, ["pending"], { path: `${J}?tab=sources&id=${S.sid}`, button: "Record interpretation", fields: { subject: "Standard rate", decision: "The standard rate applies.", rationale: "E2E" } });
    S.iid = interp.details["Interpretation id"];
    await must(maker, ["refused"], { path: `${J}?tab=sources`, button: "Approve interpretation", fields: { id: S.iid } });
    await must(checker, ["done"], { path: `${J}?tab=sources`, button: "Approve interpretation", fields: { id: S.iid } });
  });

  test("a rule proposed by one person and activated by another", async () => {
    const r = await must(maker, ["pending"], {
      path: `${J}?tab=rules`,
      button: "Propose rule change",
      fields: { jurisdiction_id: CODE, rule_domain: "TAX", rule_code: "STD", rule_name: `E2E standard rate ${RUN}`, effective_from: "2026-01-01", rule_payload: '{"applies": ["B2C"]}' },
    });
    S.rid = r.details["Rule id"];
    await must(maker, ["done"], { path: `${J}?tab=rules&id=${S.rid}&pane=provenance`, button: "Set provenance", fields: { regime_id: "VAT", interpretation_id: S.iid, source_ids: S.sid, precedence: "1", published_on: "2026-01-01" } });
    // Typed parameters, set while DRAFT (frozen once active): the pack calculates with them.
    await must(maker, ["done"], { path: `${J}?tab=rules&id=${S.rid}&pane=provenance`, button: "Set parameters", fields: { parameters: TAX_BANDS } });
    const ask = await must(maker, ["pending"], { path: `${J}?tab=rules&id=${S.rid}`, button: "Request approval", fields: { approver: "Legal" } });
    expect(ask.details["Approval reference"]).toMatch(/^[0-9a-f-]{36}$/);
    await open(maker, `${J}?tab=rules&id=${S.rid}`);
    expect(await offered(maker, "Approve and activate"), "the author activates their own rule").toBe(false);
    const act = await must(checker, ["done"], { path: `${J}?tab=rules&id=${S.rid}`, button: "Approve and activate" });
    expect(act.text).toMatch(/STD is ACTIVE/);
    const history = await open(checker, `${J}?tab=rules&id=${S.rid}&pane=history`);
    expect(history).toMatch(/ACTIVE/);
  });

  test("validate-action gives a diagnostic, never a guess", async () => {
    const r = await run(maker, { path: `${J}?tab=applicability`, button: "Validate an action", fields: { jurisdiction_id: CODE, action_type: "TAX.STD", entity_type: "SUBSIDIARY", effective_at: "2026-09-01" } });
    expect(["done", "refused"]).toContain(r.status);
    expect(r.text).toMatch(/^(Permitted|Not permitted)/);
  });

  test("business days from a published calendar", async () => {
    S.cal = `${CODE}-cal`.toLowerCase();
    const at = `${J}?tab=calendars&id=${S.cal}`;
    await must(maker, ["done"], { path: `${J}?tab=calendars`, button: "New calendar", fields: { calendar_code: S.cal.toUpperCase(), jurisdiction_id: CODE, authority: "E2E authority" } });
    const v1 = await must(maker, ["pending"], { path: at, button: "New version", fields: { effective_from: "2026-01-01", timezone: "Europe/London", weekend_days: "0 6", holidays: "2026-12-25 Christmas Day\n2026-12-28 Boxing Day (substitute)" } });
    S.calV1 = v1.details["Version id"];
    expect(S.calV1, "the new calendar version names its id").toMatch(/^[0-9a-f-]{36}$/);
    await open(checker, at);
    expect(await offered(checker, "Publish"), "Publish offered before a source is cited").toBe(false);
    await must(maker, ["done"], { path: at, button: "Set sources", fields: { version: "1", source_ids: S.sid } });
    await must(checker, ["done"], { path: at, button: "Publish" });
    const check = await must(maker, ["done"], { path: at, button: "Check a date", fields: { date: "2026-12-24", days: "2" } });
    expect(check.text).toMatch(/2 business day\(s\) later is 2026-12-30/);
  });

  test("a payment term's due date, with every step", async () => {
    S.term = `T${RUN}`;
    const at = (id = "") => `${J}?tab=terms&term=${S.term}${id ? `&id=${id}` : ""}`;
    await must(maker, ["done"], { path: `${J}?tab=terms`, button: "New payment term", fields: { term_code: S.term, term_name: "Net 30" } });
    await must(maker, ["pending"], {
      path: at(),
      button: "New version",
      fields: { basis_date_rule: "INVOICE_DATE", due_method: "NET_DAYS", due_days: "30", business_day_convention: "FOLLOWING", calendar_code: S.cal, effective_from: "2026-01-01", rationale: "E2E" },
    });
    await open(maker, at("1"));
    expect(await offered(maker, "Approve"), "the author approves their own term").toBe(false);
    await must(checker, ["done"], { path: at("1"), button: "Approve" });
    const due = await must(maker, ["done"], { path: at(), button: "Calculate due date", fields: { invoice_date: "2026-11-25" } });
    expect(due.text).toMatch(/^Due 2026-12-29/);
    expect(due.rows.length, "the explanation lists its steps").toBeGreaterThan(1);
  });

  test("a submission profile and an obligation rule, ready to be packed", async () => {
    // An e-invoice profile is a rule whose typed parameters are the profile.
    const p = await must(maker, ["pending"], {
      path: `${J}?tab=rules`,
      button: "Propose rule change",
      fields: { jurisdiction_id: CODE, rule_domain: "EINVOICE_PROFILE", rule_code: "PEPPOL_INVOICE", rule_name: `E2E e-invoice profile ${RUN}`, effective_from: "2026-01-01", rule_payload: '{"channel": "PEPPOL"}' },
    });
    S.pid = p.details["Rule id"];
    await must(maker, ["done"], { path: `${J}?tab=rules&id=${S.pid}&pane=provenance`, button: "Set provenance", fields: { regime_id: "VAT", interpretation_id: S.iid, source_ids: S.sid, precedence: "1", published_on: "2026-01-01" } });
    await must(maker, ["done"], { path: `${J}?tab=rules&id=${S.pid}&pane=provenance`, button: "Set parameters", fields: { parameters: EINVOICE_PROFILE } });
    await must(maker, ["pending"], { path: `${J}?tab=rules&id=${S.pid}`, button: "Request approval", fields: { approver: "Legal" } });
    const act = await must(checker, ["done"], { path: `${J}?tab=rules&id=${S.pid}`, button: "Approve and activate" });
    expect(act.text).toMatch(/PEPPOL_INVOICE is ACTIVE/);

    // A due-date rule counted on the published calendar, published by a second person.
    const o = await must(maker, ["pending"], {
      path: `${J}?tab=obligations`,
      button: "New obligation rule",
      fields: {
        jurisdiction_id: CODE,
        obligation_code: "VAT_RETURN",
        name: `E2E VAT return ${RUN}`,
        period_basis: "MONTHLY",
        anchor: "PERIOD_END",
        offset_months: "1",
        offset_days: "7",
        offset_to_month_end: "true",
        business_day_adjustment: "NEXT",
        calendar_code: S.cal,
        effective_from: "2026-01-01",
      },
    });
    S.oid = o.details["Obligation rule id"];
    expect(S.oid, "the new obligation rule names its id").toMatch(/^[0-9a-f-]{36}$/);
    await must(maker, ["done"], { path: `${J}?tab=obligations&id=${S.oid}`, button: "Set provenance", fields: { regime_id: "VAT", interpretation_id: S.iid, source_ids: S.sid } });
    await open(maker, `${J}?tab=obligations&id=${S.oid}`);
    expect(await offered(maker, "Publish"), "the author publishes their own obligation rule").toBe(false);
    await must(checker, ["done"], { path: `${J}?tab=obligations&id=${S.oid}`, button: "Publish" });
  });

  test("a pack signed, verified, certified by a third person, published, deployed and resolved", async () => {
    const pub = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
    S.key = `e2e-${RUN.toLowerCase()}`;
    await must(maker, ["done"], { path: `${J}?tab=packs`, button: "Register", fields: { key_ref: S.key, algorithm: "ed25519", public_key: pub } });
    await must(maker, ["done"], { path: `${J}?tab=packs`, button: "Retire", row: S.key, fields: { to: "retire", reason: "E2E key" } });
    await must(maker, ["done"], { path: `${J}?tab=packs`, button: "New ring", fields: { ring_code: `R${RUN}`, ordinal: String(10_000 + Math.floor(Math.random() * 80_000)), min_soak_seconds: "0" } });
    S.region = `reg${RUN.toLowerCase()}`;
    await must(maker, ["done"], { path: `${J}?tab=packs`, button: "New region", fields: { region_code: S.region.toUpperCase() } });

    S.ref = `jur.e2e${RUN.toLowerCase()}.tax.core`;
    const ver = "2026.11.1";
    const at = (pane = "") => `${J}?tab=packs&id=${S.ref}&ver=${ver}${pane ? `&pane=${pane}` : ""}`;
    await must(maker, ["done"], { path: `${J}?tab=packs`, button: "New pack", fields: { pack_ref: S.ref, pack_name: `E2E tax core ${RUN}`, owner: "Tax Engineering" } });
    await must(maker, ["done"], {
      path: `${J}?tab=packs&id=${S.ref}`,
      button: "New version",
      fields: { pack_version: ver, effective_from: "2026-01-01", jurisdiction_codes: CODE, regimes: "VAT", rule_modules: `${S.rid}\n${S.pid}`, calendar_modules: S.calV1, obligation_modules: S.oid },
    });
    await open(maker, at());
    expect(await offered(maker, "Compile"), "Compile offered on a DRAFT version").toBe(false);
    await must(maker, ["done"], { path: at(), button: "Submit for review" });
    await must(maker, ["done"], { path: at(), button: "Compile" });
    await must(maker, ["done"], { path: at(), button: "Sign" });
    const verified = await must(maker, ["done"], { path: at(), button: "Verify" });
    expect(verified.text).toMatch(/^Verified/);

    const kase = (id: string, cls: string, effectiveAt: string, expectOutcome: Record<string, string>, jurisdiction = CODE, domain = "TAX", code = "STD") => ({
      id,
      class: cls,
      description: id,
      input: { jurisdiction, rule_domain: domain, rule_code: code, effective_at: effectiveAt },
      expect: expectOutcome,
    });
    // TAX_BANDS: 10% up to 1000, 20% above, HALF_UP to 2 places. The harness
    // requires a golden calculation, each band limit, a rounded result and a refusal.
    const calc = (id: string, cls: string, amount: string, expectOutcome: Record<string, string>) => ({
      id,
      class: cls,
      description: id,
      input: { jurisdiction: CODE, rule_domain: "TAX", rule_code: "STD", effective_at: "2026-09-01T00:00:00Z", taxable_amount: amount },
      expect: { rule_id: S.rid, ...expectOutcome },
    });
    // The obligation: period end + 1 month to month end + 7 days, moved to the next business day.
    const due = (id: string, cls: string, input: Record<string, unknown>, expectOutcome: Record<string, string>) => ({
      id,
      class: cls,
      description: id,
      input: { jurisdiction: CODE, obligation_code: "VAT_RETURN", ...input },
      expect: expectOutcome,
    });
    const bundle = {
      bundle_version: "1",
      cases: [
        kase("golden", "GOLDEN", "2026-09-01T00:00:00Z", { outcome: "RESOLVED", rule_id: S.rid }),
        kase("starts", "BOUNDARY", "2026-01-01T00:00:00Z", { outcome: "RESOLVED", rule_id: S.rid }),
        kase("before", "BOUNDARY", "2025-12-31T23:59:59.999999999Z", { outcome: "NO_RULE" }),
        kase("outside", "NEGATIVE", "2026-09-01T00:00:00Z", { outcome: "UNSUPPORTED_JURISDICTION" }, "ZZ-NOT-IN-PACK"),
        calc("calc-golden", "GOLDEN", "5000", { outcome: "CALCULATED", tax_amount: "900.00" }),
        calc("calc-band", "BOUNDARY", "1000", { outcome: "CALCULATED", tax_amount: "100.00" }),
        calc("calc-rounded", "BOUNDARY", "1000.01", { outcome: "CALCULATED", tax_amount: "100.00" }),
        calc("calc-negative", "NEGATIVE", "-5", { outcome: "INVALID_FACTS" }),
        // JUR-T030: a stated value (here the profile version) is checked deliberately.
        kase("profile", "GOLDEN", "2026-09-01T00:00:00Z", { outcome: "RESOLVED", rule_id: S.pid, parameter_amount: "1.0" }, CODE, "EINVOICE_PROFILE", "PEPPOL_INVOICE"),
        kase("profile-starts", "BOUNDARY", "2026-01-01T00:00:00Z", { outcome: "RESOLVED", rule_id: S.pid }, CODE, "EINVOICE_PROFILE", "PEPPOL_INVOICE"),
        kase("profile-before", "BOUNDARY", "2025-12-31T23:59:59.999999999Z", { outcome: "NO_RULE" }, CODE, "EINVOICE_PROFILE", "PEPPOL_INVOICE"),
        due("due-golden", "GOLDEN", { period_end: "2026-08-31" }, { outcome: "DUE_DATE_CALCULATED", due_date: "2026-10-07", obligation_rule_id: S.oid }),
        // 2026-11-07 is a Saturday: the due date moves to Monday 2026-11-09.
        due("due-weekend", "BOUNDARY", { period_end: "2026-09-30" }, { outcome: "DUE_DATE_CALCULATED", due_date: "2026-11-09" }),
        due("due-extension", "NEGATIVE", { period_end: "2026-09-30", extension_days: 1, extension_evidence_ref: `E2E-${RUN}` }, { outcome: "EXTENSION_NOT_PERMITTED" }),
      ],
    };
    await must(maker, ["done"], { path: at("certification"), button: "Submit test bundle", fields: { bundle: JSON.stringify(bundle) } });
    const runResult = await must(maker, ["done"], { path: at("certification"), button: "Run tests" });
    expect(runResult.text).toMatch(/passed/);
    await open(maker, at("certification"));
    expect(await offered(maker, "Add review"), "the author reviews their own version").toBe(false);
    await must(checker, ["done"], { path: at("certification"), button: "Add review", fields: { role: "TAX", decision: "APPROVE", findings: "Golden and boundary cases checked" } });
    const certified = await run(third, { path: at("certification"), button: "Certify" });
    expect(certified.status, `certify: ${certified.text} (the tax officer needs JURISDICTION_* grants on the platform scope)`).toBe("done");
    await must(maker, ["done"], { path: at(), button: "Publish" });
    // The lowest ring first: the ring list is in rollout order.
    const deployed = await must(maker, ["done"], { path: at("release"), button: "Deploy", fields: { ring: "__first__", region: S.region } });
    expect(deployed.text).toMatch(/^Deployed to /);

    const resolved = await must(maker, ["done"], { path: `${J}?tab=applicability`, button: "Resolve a rule", fields: { jurisdiction: CODE, rule_domain: "TAX", rule_code: "STD", effective_at: "2026-09-01" } });
    expect(resolved.details.Outcome).toBe("RESOLVED");
    expect(resolved.details.Pack).toBe(`${S.ref}@${ver}`);
  });

  test("positive answers from the released pack: a calculation, a due date and a submission", async () => {
    const calcResult = await must(maker, ["done"], {
      path: `${J}?tab=applicability`,
      button: "Evaluate",
      fields: {
        kind: "calculation",
        body: JSON.stringify({ jurisdiction: CODE, rule_domain: "TAX", rule_code: "STD", effective_at: "2026-09-01T00:00:00Z", taxable_amount: "1500", currency: "GBP" }),
      },
    });
    expect(calcResult.text).toMatch(/calculated/i);
    expect(Object.values(calcResult.details)).toContain("200.00");

    const dueResult = await must(maker, ["done"], {
      path: `${J}?tab=obligations&id=${S.oid}`,
      button: "Calculate a due date",
      fields: { body: JSON.stringify({ jurisdiction: CODE, obligation_code: "VAT_RETURN", period_end: "2026-09-30" }) },
    });
    expect(dueResult.text).toMatch(/due date calculated/i);
    // Saturday 2026-11-07 moved to Monday; the answer states the instant the due day ends.
    expect(Object.values(dueResult.details).join(" ")).toMatch(/2026-11-09/);

    const sub = await must(maker, ["done"], {
      path: `${J}?tab=applicability`,
      button: "Register submission",
      fields: { jurisdiction: CODE, kind: "EINVOICE", profile_code: "PEPPOL_INVOICE", subject_ref: `INV-E2E-${RUN}`, payload_hash: `sha256:${randomBytes(32).toString("hex")}` },
    });
    expect(sub.text).toMatch(/^Submission registered as /);
    expect(sub.details["Submission id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("a negative answer is shown with its recorded decision", async () => {
    const r = await must(maker, ["refused"], { path: `${J}?tab=applicability`, button: "Resolve a rule", fields: { jurisdiction: "ZZ-NOT-A-JURISDICTION", rule_domain: "TAX", rule_code: "STD" } });
    expect(r.text).toMatch(/unsupported jurisdiction/);
    expect(r.text).toMatch(/Recorded as decision [0-9a-f-]{36}/);
  });

  test("empty and unavailable states say so", async () => {
    const empty = await open(maker, `${J}?q=NO-SUCH-JURISDICTION-${RUN}`);
    expect(empty).toMatch(/Nothing matches this search and these filters\./);
    const term = await open(maker, `${J}?tab=terms&term=NOSUCH${RUN}`);
    expect(term).toMatch(new RegExp(`Payment term NOSUCH${RUN} unavailable\\.`));
    const op = await open(maker, `${J}?tab=packs&op=00000000-0000-4000-8000-000000000000`);
    expect(op).toMatch(/No such operation\./);
  });
});
