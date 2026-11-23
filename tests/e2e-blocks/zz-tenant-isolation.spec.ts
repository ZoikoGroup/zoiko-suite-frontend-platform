// Tenant isolation for the Blocks 6-10 services that no other live spec checks
// across tenants: board resolutions, tax determinations, VAT returns, filing
// drafts, purchase requests and orders, vendor checks, CARTA assessments and
// procurement cases.
//
// Named zz- so it runs last (one worker, files in name order): the records it
// checks are the ones the earlier specs created for this run's tenant, plus a
// resolution and a purchase order it writes itself (no earlier spec makes one). Each
// read must return this tenant's records only, and the same read as another
// tenant must return none of them. A read with no record of this tenant fails
// rather than passing on nothing.

import { expect, test } from "./browser-health";
import crypto from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { GATEWAY, ID, TAG, TODAY, consoleApi, list, liveOnly, seed, sessionValue, signIn } from "./live";

liveOnly();

const OTHER = () => sessionValue(ID.principal, ID.otherTenant, ID.otherEntity);

/**
 * Records no earlier spec creates, written to the service for this tenant
 * before its read is checked: a board resolution (on a meeting) and a draft
 * purchase order.
 */
const PREPARE: Record<string, (request: APIRequestContext) => Promise<void>> = {
  resolutions: async (request) => {
    const meeting = await seed(request, "board-resolutions-svc", "/v1/meetings", {
      legal_entity_id: ID.entity, title: `Isolation meeting ${TAG}`, scheduled_at: new Date().toISOString(),
      effective_from: TODAY, created_by: ID.principal,
    });
    expect(meeting.status, JSON.stringify(meeting.json)).toBeLessThan(300);
    const resolution = await seed(request, "board-resolutions-svc", "/v1/resolutions", {
      meeting_id: String(meeting.json?.meeting_id), legal_entity_id: ID.entity, resolution_number: `ISO-${TAG}`,
      title: `Isolation resolution ${TAG}`, content: "Tenant isolation check.", category: "GOVERNANCE",
      effective_from: TODAY, created_by: ID.principal,
    });
    expect(resolution.status, JSON.stringify(resolution.json)).toBeLessThan(300);
  },
  "purchase-orders": async (request) => {
    const order = await seed(request, "purchase-order-svc", "/v1/purchase-orders/draft", {
      legal_entity_id: ID.entity, supplier_ref: `SUP-${TAG}`, currency_code: "GBP", correlation_id: crypto.randomUUID(),
      lines: [{ item_ref: `ITEM-${TAG}`, description: "Isolation check", quantity: 1, unit_price: 10, uom: "EA" }],
    });
    expect(order.status, JSON.stringify(order.json)).toBeLessThan(300);
  },
};

/** [console read (/api/v1/<read>), list key, id field] */
const READS: [string, string, string][] = [
  ["resolutions", "resolutions", "resolution_id"],
  ["tax-determinations", "determinations", "determination_id"],
  ["vat-returns", "vat_returns", "return_id"],
  ["filing-preparation/drafts", "filing_drafts", "draft_id"],
  ["purchase-requests", "purchase_requests", "request_id"],
  ["purchase-orders", "purchase_orders", "po_id"],
  ["vendor-checks", "vendor_checks", "check_id"],
  ["security/assessments", "assessments", "id"],
];

for (const [read, key, idField] of READS) {
  test(`${read}: this tenant reads only its own records, another tenant none of them`, async ({ request }) => {
    await PREPARE[read]?.(request);
    const mine = await consoleApi(request, "GET", read);
    expect(mine.status, JSON.stringify(mine.json)).toBe(200);
    const rows = list(mine.json, key);
    expect(rows.length, `${read}: the earlier specs created records for this tenant`).toBeGreaterThan(0);
    for (const r of rows) if (r.tenant_id !== undefined) expect(r.tenant_id, `${read} returned another tenant's row`).toBe(ID.tenant);
    const ids = rows.map((r) => String(r[idField]));
    expect(ids.every((id) => id && id !== "undefined"), `${read} rows carry ${idField}`).toBe(true);

    const theirs = await consoleApi(request, "GET", read, undefined, OTHER());
    expect(theirs.status, JSON.stringify(theirs.json)).toBe(200);
    const theirRows = list(theirs.json, key);
    for (const r of theirRows) expect(r.tenant_id, `${read} leaks a row of this tenant`).not.toBe(ID.tenant);
    const leaked = theirRows.map((r) => String(r[idField])).filter((id) => ids.includes(id));
    expect(leaked, `${read} leaks to another tenant`).toEqual([]);
  });
}

// procurement-workflow-svc has no console read route: the Commercial Ops page
// reads it on the server. Its cases are read from the service as this tenant,
// then the page is opened as another tenant and must show none of them.
test("procurement cases: none of this tenant's cases appear on another tenant's Commercial Ops page", async ({ request, browser, browserHealth }) => {
  const res = await request.get(`${GATEWAY}/procurement-workflow-svc/v1/procurement-cases`, {
    params: { legal_entity_id: ID.entity },
    headers: { "X-Tenant-Id": ID.tenant, "X-Principal-Id": ID.principal, "X-Legal-Entity-Id": ID.entity },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as unknown;
  const cases = (Array.isArray(body) ? body : ((body as Record<string, unknown>)?.cases as unknown[]) ?? []) as Record<string, unknown>[];
  expect(cases.length, "the earlier specs opened procurement cases for this tenant").toBeGreaterThan(0);

  const other = await browser.newContext();
  await signIn(other, OTHER());
  const page = await other.newPage();
  browserHealth.watch(page);
  await page.goto("/admin/commercial-ops");
  await page.waitForLoadState("networkidle");
  for (const c of cases) {
    await expect(page.getByText(String(c.case_id)), `case ${String(c.case_id)} leaks to another tenant`).toHaveCount(0);
    if (c.description) {
      await expect(page.getByText(String(c.description), { exact: true }), `"${String(c.description)}" leaks to another tenant`).toHaveCount(0);
    }
  }
  await other.close();
});
