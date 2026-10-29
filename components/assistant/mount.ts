// Where the ZoikoSuite Assistant may appear.
//
// ACTIVE paths render the widget in this app: the public /assistant page and
// the admin console (/admin and its pages, product owner decision 2026-10-28).
// On /admin it is the same anonymous public assistant: it refuses live
// status (an authenticated copilot is deferred, FR-16, OD-06). It stays anonymous: it calls /public-ai/v1/* with
// credentials "omit", never reads the console's session, cookies, dashboard
// state or DOM, and live platform or account questions are refused (X01).
// PREPARED paths are the public site's pages; they are listed for the public
// site to enable and are inactive here (this app has no such pages).

export const ACTIVE_PUBLIC_PATHS = ["/assistant", "/admin"];
export const PREPARED_PUBLIC_PATHS = ["/", "/pricing", "/platform", "/trust", "/support", "/demo", "/book-demo"];

/** page_context sent with each turn, per public path. */
const PAGE_CONTEXT: Record<string, string> = {
  "/": "home",
  "/pricing": "pricing",
  "/platform": "core_modules",
  "/demo": "demo",
  "/book-demo": "demo",
  "/support": "support",
};

export function isAssistantPath(pathname: string, active: string[] = ACTIVE_PUBLIC_PATHS): boolean {
  if (pathname.startsWith("/login")) return false; // never on the sign-in form
  return active.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export function pageContextFor(pathname: string): string {
  return PAGE_CONTEXT[pathname] ?? "other";
}
