// Client panel reads: a failed read is an error, never an empty register.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { listFromResponse } from "../lib/panel-fetch.ts";

test("a 2xx response yields the list under its key", () => {
  assert.deepEqual(listFromResponse(200, { forecasts: [{ id: "f1" }], page_limit: null }, "forecasts", "forecasting-svc"), [
    { id: "f1" },
  ]);
  assert.deepEqual(listFromResponse(200, { forecasts: [] }, "forecasts", "forecasting-svc"), []);
});

test("an upstream refusal is an error carrying the proxy's reason", () => {
  assert.throws(
    () => listFromResponse(403, { error: "authorization denied", kind: "http" }, "keys", "key-management-svc"),
    /key-management-svc: authorization denied/,
  );
  assert.throws(() => listFromResponse(502, { kind: "unreachable" }, "keys", "key-management-svc"), /HTTP 502/);
});

test("an expired session is reported as such", () => {
  assert.throws(() => listFromResponse(401, { error: "unauthenticated" }, "keys", "svc"), /session has expired/);
});

test("a 200 without the expected list is an error, not an empty register", () => {
  // The old proxy answered every failure as { key: [] }; the old panels also
  // read json.key ?? [] from any shape.
  assert.throws(() => listFromResponse(200, { other: [] }, "keys", "svc"), /without a "keys" list/);
  assert.throws(() => listFromResponse(200, null, "keys", "svc"), /without a "keys" list/);
});
