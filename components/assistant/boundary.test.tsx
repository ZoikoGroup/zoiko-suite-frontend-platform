// Part B: the assistant mounts only on public paths, and nothing it sends can
// carry the site's identity: the browser client omits credentials and adds
// no Authorization, and the same-origin route forwards only allowlisted
// headers (never Cookie or Authorization) and never returns Set-Cookie.

import { afterEach, describe, expect, it, vi } from "vitest";
import { askAssistant, loadAssistantConfig, startAssistantSession } from "@/lib/api/public-ai";
import { allowedPath, forwardHeaders, responseHeaders, upstreamURL } from "@/lib/api/public-ai-proxy";
import { ACTIVE_PUBLIC_PATHS, PREPARED_PUBLIC_PATHS, isAssistantPath } from "./mount";

afterEach(() => vi.unstubAllGlobals());

describe("mounting", () => {
  it("is active on /assistant and the admin console, never on sign-in", () => {
    expect(ACTIVE_PUBLIC_PATHS).toEqual(["/assistant", "/admin"]);
    for (const p of ["/assistant", "/admin", "/admin/tax", "/admin/overview"]) expect(isAssistantPath(p)).toBe(true);
    for (const p of ["/login", "/", "/pricing", "/administrator"]) expect(isAssistantPath(p)).toBe(false);
  });

  it("prepared public-site paths work once the public site activates them", () => {
    for (const p of PREPARED_PUBLIC_PATHS) expect(isAssistantPath(p, PREPARED_PUBLIC_PATHS)).toBe(true);
    expect(isAssistantPath("/login", [...PREPARED_PUBLIC_PATHS, "/login"])).toBe(false);
  });
});

describe("browser client", () => {
  it("calls same-origin /public-ai/v1 with credentials omit and no Authorization", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await loadAssistantConfig();
    await startAssistantSession("11111111-1111-4111-8111-111111111111");
    await askAssistant("grant", "pub_s_1", "22222222-2222-4222-8222-222222222222", "What is Tax?");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(url.startsWith("/public-ai/v1/")).toBe(true);
      expect(init.credentials).toBe("omit");
      const names = Object.keys(init.headers as Record<string, string>).map((h) => h.toLowerCase());
      expect(names).not.toContain("authorization");
      expect(names).not.toContain("cookie");
      for (const n of names) expect(["accept", "content-type", "idempotency-key", "x-public-chat-session"]).toContain(n);
    }
  });
});

describe("same-origin route", () => {
  it("forwards only the assistant's headers and the console origin", () => {
    const incoming = new Headers({
      cookie: "zoiko_session=secret",
      authorization: "Bearer token",
      "x-principal-id": "admin",
      "x-tenant-id": "t1",
      "content-type": "application/json",
      "idempotency-key": "k",
      "x-public-chat-session": "grant",
      origin: "http://evil.example",
    });
    const out = forwardHeaders(incoming, { ZOIKO_PUBLIC_AI_ORIGIN: "http://localhost:3000" });
    expect(out.get("cookie")).toBeNull();
    expect(out.get("authorization")).toBeNull();
    expect(out.get("x-principal-id")).toBeNull();
    expect(out.get("x-tenant-id")).toBeNull();
    expect(out.get("origin")).toBe("http://localhost:3000");
    expect(out.get("idempotency-key")).toBe("k");
    expect(out.get("x-public-chat-session")).toBe("grant");
    expect(out.get("x-forwarded-for")).toBeNull();
  });

  it("forwards only the visitor's own address for rate limiting", () => {
    const via = (h: Record<string, string>) => forwardHeaders(new Headers(h), {}).get("x-forwarded-for");
    expect(via({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
    expect(via({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" })).toBe("203.0.113.7");
    expect(via({ "x-forwarded-for": "2001:db8::1" })).toBe("2001:db8::1");
    expect(via({ "x-real-ip": "198.51.100.4" })).toBe("198.51.100.4");
    expect(via({ "x-forwarded-for": "<script>" })).toBeNull();
  });

  it("never returns Set-Cookie and only reaches the assistant's paths", () => {
    const back = responseHeaders(new Headers({ "set-cookie": "x=1", "content-type": "application/json", "x-request-id": "r" }));
    expect(back.get("set-cookie")).toBeNull();
    expect(back.get("x-request-id")).toBe("r");
    expect(allowedPath(["turns"])).toBe("turns");
    expect(allowedPath(["sessions", "pub_s_1"])).toBe("sessions/pub_s_1");
    for (const p of [["admin"], ["..", "admin"], ["sessions", "a", "b"], ["internal", "flags"]]) expect(allowedPath(p)).toBeNull();
    expect(upstreamURL("turns", { ZOIKO_PUBLIC_AI_URL: "http://127.0.0.1:8001/" })).toBe("http://127.0.0.1:8001/public-ai/v1/turns");
  });
});
