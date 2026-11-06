import { describe, expect, it } from "vitest";
import { isPlaceholderUrl } from "./AssistantWidget";
import { maskForHistory } from "./state";

describe("tab history keeps no more than the service (Doc 06 §11, SEC-T044)", () => {
  it("masks contact details and secrets", () => {
    const out = maskForHistory("Email me at jane.doe@example.org or +44 20 7946 0958, password: hunter22");
    expect(out).not.toContain("jane.doe@example.org");
    expect(out).not.toContain("7946");
    expect(out).not.toContain("hunter22");
  });
  it("leaves an ordinary question alone", () => {
    expect(maskForHistory("How much is the Growth plan in the US?")).toBe("How much is the Growth plan in the US?");
  });
});

describe("only https pages are linked (Doc 06 §11)", () => {
  it.each(["http://www.zoikosuite.com/pricing", "javascript:alert(1)", "data:text/html,x", "https://pricing.invalid/x"])("%s is not linked", (u) => {
    expect(isPlaceholderUrl(u)).toBe(true);
  });
  it("links a real https page", () => {
    expect(isPlaceholderUrl("https://www.zoikosuite.com/pricing")).toBe(false);
  });
});
