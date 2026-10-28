// Assistant widget state machine (Suivo master prompt §9.2, Doc 01 §06):
// S00 Closed → S01 Welcome → S02 Composing → S03 Waiting → S04 Answered /
// S05 Uncertain / S06 Safety boundary / S07 Escalation / S08 Error or
// unavailable → S09 End. Pure and dependency-free so it runs under
// `node --test` (state.test.mjs) without a test framework.

export type UIState =
  | "S00_CLOSED"
  | "S01_WELCOME"
  | "S02_COMPOSING"
  | "S03_WAITING"
  | "S04_ANSWERED"
  | "S05_UNCERTAIN"
  | "S06_SAFETY"
  | "S07_ESCALATION"
  | "S08_ERROR"
  | "S09_END";

export type TurnStatus = "ANSWERED" | "CLARIFY" | "REFUSED_ACTION" | "ABSTAIN" | "HANDOFF" | "UNAVAILABLE";

export type UIEvent =
  | { type: "OPEN"; hasMessages: boolean; waiting: boolean }
  | { type: "CLOSE" }
  | { type: "TYPE" }
  | { type: "SEND" }
  | { type: "RESPONSE"; status: TurnStatus }
  | { type: "FAIL" }
  | { type: "CANCEL" }
  | { type: "END" };

/** Every API status maps to exactly one UI state. */
export const STATUS_STATE: Record<TurnStatus, UIState> = {
  ANSWERED: "S04_ANSWERED",
  CLARIFY: "S05_UNCERTAIN",
  ABSTAIN: "S05_UNCERTAIN",
  REFUSED_ACTION: "S06_SAFETY",
  HANDOFF: "S07_ESCALATION",
  UNAVAILABLE: "S08_ERROR",
};

export function reduce(state: UIState, event: UIEvent): UIState {
  switch (event.type) {
    case "OPEN":
      if (state !== "S00_CLOSED") return state;
      if (event.waiting) return "S03_WAITING";
      return event.hasMessages ? "S02_COMPOSING" : "S01_WELCOME";
    case "CLOSE":
      return "S00_CLOSED";
    case "TYPE":
      // Typing never interrupts a turn in flight and never opens the panel.
      return state === "S00_CLOSED" || state === "S03_WAITING" ? state : "S02_COMPOSING";
    case "SEND":
      return state === "S00_CLOSED" || state === "S03_WAITING" ? state : "S03_WAITING";
    case "RESPONSE":
      // A reply that lands after the panel closed or the turn was cancelled
      // does not reopen or change anything.
      return state === "S03_WAITING" ? STATUS_STATE[event.status] : state;
    case "FAIL":
      return state === "S03_WAITING" ? "S08_ERROR" : state;
    case "CANCEL":
      return state === "S03_WAITING" ? "S02_COMPOSING" : state;
    case "END":
      return state === "S00_CLOSED" ? state : "S09_END";
  }
}

// Pre-send check (master prompt §9.4): warn before a draft that looks like a
// secret or personal identifier leaves the browser. The service redacts too;
// this only stops the visitor sending it in the first place.
const SENSITIVE: RegExp[] = [
  /\b(?:password|passcode|passwd|pwd|pin|otp|one[- ]time code|verification code|security code|cvv|cvc)\b\s*(?:is\b|:|=)\s*\S+/i,
  /\b(?:\d[ -]?){13,19}\b/, // card-like digit runs
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/, // IBAN
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
  /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/i, // UK NINO
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b/, // API keys
  /\b(?:sort code|routing number|account number)\b\s*(?:is|:)?\s*[\d -]{6,}/i,
];

export function looksSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text));
}
