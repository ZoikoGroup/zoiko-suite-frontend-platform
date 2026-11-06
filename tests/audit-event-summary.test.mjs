// audit-event-store-svc response handling: a failed or malformed read must be
// an error, never an empty log, never a verified chain, never invented figures.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEventListResponse, parseVerifyResponse } from "../lib/api/audit-event-summary.ts";

test("event list: counts come from the service's own fields", () => {
  const res = parseEventListResponse({
    events: [{ status: "AUTHORIZED" }, { status: "DENIED" }, { status: "ESCALATED" }, { status: "AUTHORIZED" }],
    total: 57,
    hash_chain_valid: true,
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.summary, {
    totalEvents: 57,
    returnedEvents: 4,
    hashChainVerified: true,
    authorizedCount: 2,
    escalatedCount: 1,
    deniedCount: 1,
  });
  assert.equal("throughputPerMin" in res.summary, false);
});

test("event list: a broken chain is reported as broken", () => {
  const res = parseEventListResponse({ events: [], total: 0, hash_chain_valid: false });
  assert.equal(res.ok, true);
  assert.equal(res.summary.hashChainVerified, false);
});

test("event list: missing hash_chain_valid is an error, not a verified chain", () => {
  const res = parseEventListResponse({ events: [], total: 0 });
  assert.equal(res.ok, false);
});

test("event list: a bare array or null is an error, not an empty log", () => {
  assert.equal(parseEventListResponse([]).ok, false);
  assert.equal(parseEventListResponse(null).ok, false);
  assert.equal(parseEventListResponse({ events: "x", hash_chain_valid: true }).ok, false);
});

test("verify: only an explicit verified:true passes", () => {
  const ok = parseVerifyResponse({ verified: true, checkedEvents: 12, checked_events: 12, timestamp: "2026-10-29T10:00:00Z" });
  assert.deepEqual(ok, { ok: true, verified: true, checkedEvents: 12, timestamp: "2026-10-29T10:00:00Z" });

  const broken = parseVerifyResponse({ verified: false, checked_events: 3, timestamp: "2026-10-29T10:00:00Z" });
  assert.equal(broken.ok, true);
  assert.equal(broken.verified, false);
  assert.equal(broken.checkedEvents, 3);
});

test("verify: no verdict is an error, not a pass", () => {
  // The old client treated anything not explicitly false as intact.
  assert.equal(parseVerifyResponse({}).ok, false);
  assert.equal(parseVerifyResponse({ status: "INGESTED" }).ok, false);
  assert.equal(parseVerifyResponse({ verified: "true", checkedEvents: 1, timestamp: "t" }).ok, false);
  assert.equal(parseVerifyResponse(null).ok, false);
  assert.equal(parseVerifyResponse({ verified: true, timestamp: "t" }).ok, false);
});
