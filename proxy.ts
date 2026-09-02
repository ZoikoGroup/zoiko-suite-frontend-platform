import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { describeEnsure, ensurePageServices, servicectlEnabled } from "@/lib/servicectl";

export async function proxy(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Start the backend services this route reads, before it renders.
  //
  // This is the hook for the on-demand launcher: the backend is 86 Go services
  // and this is the one place that knows, for every /admin route, that a
  // navigation is about to happen. Ordering matters — it runs AFTER the session
  // check, so an unauthenticated request cannot make the launcher start
  // processes, and BEFORE the render, because a page whose services are still
  // booting renders empty panels and a manual reload is the only way back.
  //
  // Skipped for prefetches and RSC payload requests. Next prefetches admin links
  // on hover, and treating a hover as a visit would start half the estate while
  // the reader is still deciding where to click.
  if (servicectlEnabled && isDocumentNavigation(request)) {
    const result = await ensurePageServices(request.nextUrl.pathname);
    const line = describeEnsure(request.nextUrl.pathname, result);
    if (line) console.log(line);
  }

  return NextResponse.next();
}

/**
 * Whether this request is a person navigating to a page, as opposed to a
 * prefetch, an RSC payload fetch, or a Server Action POST.
 *
 * Header-based rather than method-based: a soft client-side navigation arrives
 * as a GET with `RSC: 1` and no Sec-Fetch-Mode of `navigate`, so checking the
 * method alone would count every panel refresh as a fresh visit.
 */
function isDocumentNavigation(request: NextRequest): boolean {
  const h = request.headers;
  if (h.get("next-router-prefetch") === "1" || h.get("purpose") === "prefetch") return false;
  if (h.get("sec-purpose")?.includes("prefetch")) return false;
  // An RSC request IS a real navigation when the router is fetching the page
  // payload, so it is allowed through; only prefetches are excluded above.
  if (request.method !== "GET") return false;
  return true;
}

export const config = {
  matcher: ["/admin/:path*"],
};
