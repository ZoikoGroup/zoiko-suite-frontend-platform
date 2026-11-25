// Finance process timeline counts: each stage reads the list its title names,
// and a failed read shows as unavailable rather than 0.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIMELINE_SOURCES,
  stepCountFromResponse,
  stepCountLabel,
} from "../lib/finance-timeline-counts.ts";

test("each stage reads its own service's list, not the ledger's journals", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(TIMELINE_SOURCES).map(([k, v]) => [k, v.path])),
    {
      "ar-invoice": "ar-invoices",
      "gl-posting": "journals?status=FINALIZED",
      "bank-rec": "bank-reconciliation/statement-lines?status=MATCHED",
      "ap-settle": "ap-invoices?status=PAYMENT_REQUESTED",
      intercompany: "intercompany/entries",
      close: "fiscal-periods",
    },
  );
  for (const { path } of Object.values(TIMELINE_SOURCES)) {
    assert.doesNotMatch(path, /journal-entries|cash-positions/);
  }
});

test("a response is counted under its own key", () => {
  assert.deepEqual(stepCountFromResponse({ journals: [1, 2, 3], page_limit: 200 }, "journals"), {
    count: 3,
    capped: false,
  });
  assert.deepEqual(stepCountFromResponse({ fiscal_periods: [], page_limit: null }, "fiscal_periods"), {
    count: 0,
    capped: false,
  });
});

test("a full page is marked as possibly more", () => {
  const c = stepCountFromResponse({ invoices: new Array(200).fill({}), page_limit: 200 }, "invoices");
  assert.deepEqual(c, { count: 200, capped: true });
  assert.equal(stepCountLabel(c), "200+ items");
});

test("an unreadable response is unavailable, not zero", () => {
  assert.equal(stepCountFromResponse(null, "journals"), null);
  assert.equal(stepCountFromResponse({ error: "x" }, "journals"), null);
  // The old code took the first array under any key.
  assert.equal(stepCountFromResponse({ other: [1, 2] }, "journals"), null);
  assert.equal(stepCountLabel(null), "unavailable");
  assert.equal(stepCountLabel({ count: 0, capped: false }), "0 items");
});
