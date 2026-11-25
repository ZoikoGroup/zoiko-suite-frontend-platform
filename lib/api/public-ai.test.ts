import { afterEach, describe, expect, it, vi } from "vitest";
import { askAssistant } from "./public-ai";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

describe("assistant client logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("an expired session (401) is a warning, not an error: the widget renews the session and resends", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(401, { code: "publicai.session_expired" }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await askAssistant("grant", "pub_s_1", "11111111-1111-4111-8111-111111111111", "hi");
    expect(r.ok).toBe(false);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("a server fault (5xx) is still an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(503, { code: "publicai.unavailable" }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await askAssistant("grant", "pub_s_1", "11111111-1111-4111-8111-111111111111", "hi");
    expect(error).toHaveBeenCalledOnce();
  });
});
