// Client for the backend's on-demand service launcher (servicectl).
//
// The backend is 86 Go services and a laptop should not run 86 of anything. The
// launcher keeps them stopped and brings up the handful a route actually reads,
// on navigation, then stops them again once nothing has asked for a while. The
// route-to-services map lives in the launcher, derived from THIS codebase's
// imports, so nothing here has to know which services a page needs.
//
// SERVER-ONLY. The launcher listens on loopback and is a control plane: it can
// start and stop processes. It must never be addressable from a browser, which
// is why there is no NEXT_PUBLIC_ variable here and nothing in this file is
// callable from a client component.

/**
 * Where the launcher listens. Loopback by default, matching servicectl's own
 * default address.
 */
const BASE = (process.env.ZOIKO_SERVICECTL_URL ?? "http://127.0.0.1:8079").replace(/\/$/, "");

/**
 * Whether to ask the launcher at all.
 *
 * Off unless explicitly enabled, because the launcher is a local development
 * convenience: a deployed console talks to services that are already running and
 * must not block a page render on a process manager that is not there.
 */
export const servicectlEnabled = process.env.ZOIKO_SERVICECTL === "true";

/**
 * How long a navigation may wait for its services.
 *
 * Deliberately larger than lib/api/config.ts's 1500ms request timeout: this
 * waits for a process to boot, that one waits for an already-running service to
 * answer. Keeping them equal would mean a cold page reliably timed out here and
 * then rendered empty panels anyway, which is the failure this whole mechanism
 * exists to avoid.
 *
 * Binaries are compiled on first use. Run `servicectl build` once and a cold
 * start is a few hundred milliseconds; skip it and the first visit to a page
 * pays for the compile.
 */
const ENSURE_TIMEOUT_MS = Number(process.env.ZOIKO_SERVICECTL_TIMEOUT_MS ?? 20000);

export type EnsureResult = {
  name: string;
  port: number;
  state: "stopped" | "building" | "starting" | "ready" | "failed";
  url: string;
  built?: boolean;
  started?: boolean;
  tookMs: number;
  error?: string;
  logTail?: string;
  adopted?: boolean;
  existing?: boolean;
};

export type EnsureResponse = {
  page: string;
  waited: boolean;
  ready: number;
  failed: number;
  unknown: string[] | null;
  services: EnsureResult[];
};

/**
 * Ask the launcher to bring up whatever the given console route reads, and wait
 * for it.
 *
 * NEVER THROWS, and never rejects a navigation. A missing or broken launcher
 * means the services are not managed here — which is exactly the situation in a
 * deployed environment — and the page must render regardless. Every failure
 * path returns null and the caller carries on; the panels then degrade to their
 * own empty states, which they already handle.
 */
export async function ensurePageServices(pathname: string): Promise<EnsureResponse | null> {
  if (!servicectlEnabled) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENSURE_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/v1/ensure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The launcher's own bound is set a little under ours so it answers with a
      // per-service verdict rather than being cut off mid-reply — a body naming
      // the service that failed is worth more than an abort.
      body: JSON.stringify({ page: pathname, wait: true, timeoutMs: ENSURE_TIMEOUT_MS - 1500 }),
      signal: controller.signal,
      cache: "no-store",
    });
    // 207 is expected and is not an error: some of the route's services came up
    // and some did not, and the body says which.
    if (res.status !== 200 && res.status !== 207) return null;
    return (await res.json()) as EnsureResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One line per route, for a server log. Kept here so both the middleware and any
 * page that wants to call the launcher directly report it identically.
 */
export function describeEnsure(pathname: string, r: EnsureResponse | null): string | null {
  if (!r || r.services.length === 0) return null;
  const failed = r.services.filter((s) => s.state !== "ready");
  if (failed.length === 0) {
    const slowest = Math.max(...r.services.map((s) => s.tookMs));
    return `servicectl ${pathname}: ${r.ready}/${r.services.length} ready (${slowest}ms)`;
  }
  return (
    `servicectl ${pathname}: ${r.ready}/${r.services.length} ready, ` +
    failed.map((s) => `${s.name} ${s.state}${s.error ? ` (${s.error})` : ""}`).join("; ")
  );
}
