import { describe, expect, it } from "vitest";

import { writeAllowed } from "@/lib/api/public-ai-proxy";

const url = "http://localhost:3000/public-ai/v1/turns";

// Doc 05 CT-004: a write must show it comes from this app; the console's
// approved Origin is never lent to a caller that showed none.
describe("writeAllowed", () => {
  it.each([
    ["POST", {}, false],
    ["DELETE", {}, false],
    ["POST", { origin: "http://localhost:3000" }, true],
    ["POST", { origin: "https://evil.example" }, false],
    ["POST", { origin: "null" }, false],
    ["DELETE", { "sec-fetch-site": "same-origin" }, true],
    ["POST", { "sec-fetch-site": "same-site" }, false],
    ["POST", { "sec-fetch-site": "none" }, false],
    ["GET", {}, true],
  ] as const)("%s %o → %s", (method, headers, want) => {
    expect(writeAllowed(method, new Headers(headers as Record<string, string>), url)).toBe(want);
  });
});
