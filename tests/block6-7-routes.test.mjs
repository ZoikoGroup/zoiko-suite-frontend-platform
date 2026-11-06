// Route guard for the Block 6/7 clients.
//
// Run: npm test
//
// Each of these paths was called by the console while the backend
// (fix/blocks-6-10) did not serve it, so the action failed with 404 in the
// browser. This fails if any comes back, and checks the replacements exist.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const DEAD = [
  ["lib/api/contracts.ts", /\/v1\/contracts\/\$\{[^}]+\}\/submit[`"]/, "contract /submit (use /submit-review)"],
  ["lib/api/contracts.ts", /\/activate[`"]/, "contract /activate (use approve → send-for-signature → record-execution)"],
  ["lib/api/legal.ts", /\/pass[`"]/, "resolution /pass (use open-voting → vote → close-voting)"],
  ["lib/api/commercial-ops.ts", /\/api\/v1\/workflows/, "procurement /api/v1/workflows (use /v1/procurement-cases)"],
  ["lib/api/compliance.ts", /"\/v1\/filings"/, "filing tracker /v1/filings"],
  ["lib/api/compliance.ts", /"\/v1\/evaluations"|"\/v1\/evaluate"/, "compliance status /v1/evaluations"],
  ["lib/api/compliance.ts", /"\/v1\/exceptions"|`\/v1\/exceptions\//, "exception escalation /v1/exceptions"],
];

const REQUIRED = [
  ["lib/api/contracts.ts", ["/submit-review", "/approve", "/send-for-signature", "/record-execution", "/amend", "/renew"]],
  ["lib/api/legal.ts", ["/open-voting", "/vote", "/close-voting", "/quorum", "/roster"]],
  ["lib/api/purchase-requests.ts", ["/submit", "/approve", "/reject", "/cancel", "/available-actions", "expected_version"]],
  ["lib/api/commercial-ops.ts", ["/v1/procurement-cases", "/approve", "/reject", "/issue-order"]],
  ["lib/api/compliance.ts", ["/v1/filing-tracker/requirements", "/v1/compliance-status/evaluate", "/v1/exception-escalation/exceptions"]],
];

test("no Block 6/7 client calls a route the backend does not serve", () => {
  const found = DEAD.filter(([file, re]) => re.test(read(file))).map(([file, , what]) => `${file}: ${what}`);
  assert.deepEqual(found, []);
});

test("Block 6/7 clients call the backend's lifecycle routes", () => {
  const missing = [];
  for (const [file, needles] of REQUIRED) {
    const src = read(file);
    for (const n of needles) if (!src.includes(n)) missing.push(`${file}: ${n}`);
  }
  assert.deepEqual(missing, []);
});

test("purchase-request decisions always send expected_version", () => {
  const src = read("lib/api/purchase-requests.ts");
  for (const fn of ["approvePurchaseRequest", "rejectPurchaseRequest", "cancelPurchaseRequest", "submitPurchaseRequestForApproval"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`)).split("\nexport ")[0];
    assert.match(body, /expected_version/, `${fn} must send expected_version`);
  }
});

// A successful "Open voting" refreshes the resolution to OPEN, so the component
// renders its OPEN branch next. The confirmation ("Voting is open for N
// voters…") lives in openState and was only rendered in the PROPOSED branch,
// so it vanished the moment it succeeded.
test("open-voting confirmation is rendered once the resolution is OPEN", () => {
  const src = read("components/admin/legal/ResolutionActions.tsx");
  const openBranch = src.slice(src.indexOf("// OPEN\n"));
  assert.ok(openBranch.length < src.length, "OPEN branch marker not found");
  assert.match(openBranch, /<ActionFeedback state=\{openState\} \/>/);
});

test("/api/v1 proxy never substitutes a default identity", () => {
  const src = read("app/api/v1/[...path]/route.ts");
  assert.doesNotMatch(src, /session\?\.(principalId|tenantId|legalEntityId) \?\? "/);
  assert.match(src, /if \(!identity\) return UNAUTHENTICATED\(\)/);
});
