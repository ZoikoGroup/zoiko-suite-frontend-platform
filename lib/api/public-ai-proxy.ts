// Same-origin pass-through from the browser's /public-ai/v1/* calls to
// public-ai-svc. Pure helpers, so the header rules are unit-tested.
//
// Only the assistant's own headers cross: cookies, Authorization and every
// other request header are dropped, and Set-Cookie never comes back. The
// service sees the console's configured Origin, never a console identity.

const DEFAULT_URL = "http://127.0.0.1:8001";
const DEFAULT_ORIGIN = "http://localhost:3000";

/** Request headers forwarded to the service (lower-case). */
export const FORWARD_REQUEST_HEADERS = ["accept", "content-type", "idempotency-key", "if-none-match", "x-public-chat-session", "traceparent"];
/** Response headers returned to the browser (lower-case). */
export const FORWARD_RESPONSE_HEADERS = ["content-type", "x-request-id", "retry-after", "cache-control", "etag"];

/** Paths the browser may reach, relative to /public-ai/v1. */
const ALLOWED = [
  /^health\/public$/,
  /^config$/,
  /^menu$/,
  /^sessions$/,
  /^sessions\/[A-Za-z0-9_-]{1,128}$/,
  /^turns$/,
  /^turns\/[A-Za-z0-9_-]{1,128}\/feedback$/,
  /^handoffs$/,
];

export function allowedPath(segments: string[]): string | null {
  const path = segments.join("/");
  return ALLOWED.some((re) => re.test(path)) ? path : null;
}

export function upstreamURL(path: string, env: Record<string, string | undefined> = process.env): string {
  return `${(env.ZOIKO_PUBLIC_AI_URL ?? DEFAULT_URL).replace(/\/+$/, "")}/public-ai/v1/${path}`;
}

/**
 * The visitor's address for the service's per-IP rate limit: the right-most
 * X-Forwarded-For entry, i.e. the one added by the hop in front of this
 * server (the edge, or Next itself in dev). Entries further left are
 * client-supplied and dropped. The service believes it only because this
 * server is in PUBLIC_AI_TRUSTED_PROXIES. The console must sit behind an
 * edge that sets X-Forwarded-For; otherwise the per-session limit still holds.
 */
export function visitorIP(incoming: Headers): string | null {
  const hops = (incoming.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const ip = hops.at(-1) ?? incoming.get("x-real-ip")?.trim() ?? "";
  return /^[0-9a-fA-F.:]{2,45}$/.test(ip) ? ip : null;
}

/** The headers sent upstream: allowlisted ones, the visitor's IP and the console's Origin. */
export function forwardHeaders(incoming: Headers, env: Record<string, string | undefined> = process.env): Headers {
  const out = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = incoming.get(name);
    if (v) out.set(name, v);
  }
  const ip = visitorIP(incoming);
  if (ip) out.set("x-forwarded-for", ip);
  out.set("origin", env.ZOIKO_PUBLIC_AI_ORIGIN ?? DEFAULT_ORIGIN);
  return out;
}

/** CT-023: only /config and /menu (public, policy-versioned copy) may be cached; every other reply is no-store. */
export function responseHeaders(upstream: Headers, path = ""): Headers {
  const out = new Headers();
  const cacheable = path === "config" || path === "menu";
  for (const name of FORWARD_RESPONSE_HEADERS) {
    if (!cacheable && (name === "cache-control" || name === "etag")) continue;
    const v = upstream.get(name);
    if (v) out.set(name, v);
  }
  if (!cacheable) out.set("cache-control", "no-store");
  return out;
}

/**
 * SEC-T012: refuse cross-site callers. Browsers mark these with
 * Sec-Fetch-Site; when an Origin is present it must be this app's own.
 */
export function crossSite(incoming: Headers, url: string): boolean {
  if (incoming.get("sec-fetch-site") === "cross-site") return true;
  const origin = incoming.get("origin");
  if (!origin) return false;
  try {
    return origin !== new URL(url).origin;
  } catch {
    return true;
  }
}
