// Run: npm run test:assistant  (node --test; Node ≥ 22.18 strips TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduce, looksSensitive, STATUS_STATE } from "./state.ts";

const STATES = [
  "S00_CLOSED", "S01_WELCOME", "S02_COMPOSING", "S03_WAITING", "S04_ANSWERED",
  "S05_UNCERTAIN", "S06_SAFETY", "S07_ESCALATION", "S08_ERROR", "S09_END",
];
const STATUSES = ["ANSWERED", "CLARIFY", "REFUSED_ACTION", "ABSTAIN", "HANDOFF", "UNAVAILABLE"];
const EVENTS = [
  { type: "OPEN", hasMessages: false, waiting: false },
  { type: "OPEN", hasMessages: true, waiting: false },
  { type: "OPEN", hasMessages: true, waiting: true },
  { type: "CLOSE" }, { type: "TYPE" }, { type: "SEND" }, { type: "FAIL" }, { type: "CANCEL" }, { type: "END" },
  ...STATUSES.map((status) => ({ type: "RESPONSE", status })),
];

test("every API status maps to exactly one UI state", () => {
  for (const s of STATUSES) assert.ok(STATES.includes(STATUS_STATE[s]), s);
  assert.equal(Object.keys(STATUS_STATE).length, STATUSES.length);
});

test("reducer is total: every state × event lands in a known state", () => {
  for (const s of STATES) for (const e of EVENTS) assert.ok(STATES.includes(reduce(s, e)), `${s} + ${JSON.stringify(e)}`);
});

test("happy path: open, ask, answer, end", () => {
  let s = reduce("S00_CLOSED", { type: "OPEN", hasMessages: false, waiting: false });
  assert.equal(s, "S01_WELCOME");
  s = reduce(s, { type: "TYPE" });
  assert.equal(s, "S02_COMPOSING");
  s = reduce(s, { type: "SEND" });
  assert.equal(s, "S03_WAITING");
  assert.equal(reduce(s, { type: "RESPONSE", status: "ANSWERED" }), "S04_ANSWERED");
  assert.equal(reduce(s, { type: "RESPONSE", status: "CLARIFY" }), "S05_UNCERTAIN");
  assert.equal(reduce(s, { type: "RESPONSE", status: "REFUSED_ACTION" }), "S06_SAFETY");
  assert.equal(reduce(s, { type: "RESPONSE", status: "HANDOFF" }), "S07_ESCALATION");
  assert.equal(reduce(s, { type: "RESPONSE", status: "UNAVAILABLE" }), "S08_ERROR");
  assert.equal(reduce(s, { type: "FAIL" }), "S08_ERROR");
  assert.equal(reduce("S04_ANSWERED", { type: "END" }), "S09_END");
});

test("no second send while waiting, and no late output after cancel or close", () => {
  assert.equal(reduce("S03_WAITING", { type: "SEND" }), "S03_WAITING");
  assert.equal(reduce("S03_WAITING", { type: "TYPE" }), "S03_WAITING");
  const cancelled = reduce("S03_WAITING", { type: "CANCEL" });
  assert.equal(cancelled, "S02_COMPOSING");
  assert.equal(reduce(cancelled, { type: "RESPONSE", status: "ANSWERED" }), "S02_COMPOSING");
  assert.equal(reduce("S00_CLOSED", { type: "RESPONSE", status: "ANSWERED" }), "S00_CLOSED");
  assert.equal(reduce("S00_CLOSED", { type: "SEND" }), "S00_CLOSED");
});

test("reopening resumes where the visitor was", () => {
  assert.equal(reduce("S00_CLOSED", { type: "OPEN", hasMessages: true, waiting: false }), "S02_COMPOSING");
  assert.equal(reduce("S00_CLOSED", { type: "OPEN", hasMessages: true, waiting: true }), "S03_WAITING");
  assert.equal(reduce("S04_ANSWERED", { type: "OPEN", hasMessages: true, waiting: false }), "S04_ANSWERED");
});

test("pre-send warning catches secrets and identifiers", () => {
  for (const t of [
    "my password is Hunter2!",
    "OTP: 482913",
    "card 4111 1111 1111 1111",
    "IBAN GB82 WEST 1234 5698 7654 32",
    "ssn 123-45-6789",
    "NI number AB 12 34 56 C",
    "key sk_live_abcdef1234567890",
    "account number: 12345678",
  ]) assert.ok(looksSensitive(t), t);
});

test("pre-send warning ignores ordinary product questions", () => {
  for (const t of [
    "How much is the Growth plan in the UK?",
    "Do you support 2-factor sign-in?",
    "Can I manage 25 entities?",
    "Is there a 30-day trial?",
    "What does the password policy look like for admins?",
  ]) assert.equal(looksSensitive(t), false, t);
});
