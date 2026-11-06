// Static guards: a session acts only as what its signed cookie holds.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("the session's legal entity always wins over a request body", () => {
  // `{ legal_entity_id: session, ...body }` lets a body field override the
  // session's entity; the session value must come after any spread.
  for (const f of ["lib/api/integration.ts", "lib/api/security-trust.ts", "lib/api/intelligence.ts", "lib/api/legal.ts", "lib/api/tax.ts"]) {
    assert.doesNotMatch(read(f), /legal_entity_id: identity\??\.legalEntityId,\s*\.\.\./, `${f}: a spread after the session's legal entity`);
  }
});

test("a session never inherits the demo identity", () => {
  const auth = read("lib/auth.ts");
  const decode = auth.slice(auth.indexOf("export function decodeSession"), auth.indexOf("export function isPlatformAdmin"));
  assert.ok(decode.length > 0, "decodeSession not found");
  assert.doesNotMatch(decode, /DEMO_IDENTITY/, "decodeSession fills missing identity from DEMO_IDENTITY");
});
