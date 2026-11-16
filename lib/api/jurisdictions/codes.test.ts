import { describe, expect, it } from "vitest";
import { CODE_PATTERNS, codeOf } from "./codes";

// What a person types, including each form's placeholder, must reach the
// service in the case its pattern accepts (the patterns mirror
// jurisdiction-rules-svc: handler/ops.go, handler/registry.go,
// domain/obligations.go, domain/payment_term.go, domain/registry.go,
// domain/rollout.go).
const TYPED: Record<keyof typeof CODE_PATTERNS, string[]> = {
  ring: ["CANARY", "canary", " Ring-1 "],
  region: ["EU-WEST", "eu-west", "Eu_West.2"],
  calendar: ["GB-ENG", "gb-eng"],
  key: ["JUR-PROD-2026", "jur-prod-2026", "kms:Key.1"],
  family: ["Country.GB", "country.gb"],
  pack: ["Jur.GB.Tax.Core", "jur.gb.tax.core"],
  term: ["net30", "NET30", "Net_60"],
  obligation: ["vat_return", "VAT_RETURN"],
};

describe("codeOf", () => {
  for (const [kind, inputs] of Object.entries(TYPED) as [keyof typeof CODE_PATTERNS, string[]][]) {
    for (const typed of inputs) {
      it(`${kind}: "${typed}" reaches the service in its case`, () => {
        expect(codeOf(kind, typed)).toMatch(CODE_PATTERNS[kind]);
      });
    }
  }

  it("leaves an empty optional code empty", () => {
    expect(codeOf("calendar", "")).toBe("");
    expect(codeOf("calendar", undefined)).toBeUndefined();
  });
});
