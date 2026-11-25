import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  decodeSession,
  remainingSessionSeconds,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/auth";
import { envelopeExpired, envelopeNeedsRenewal, renewSession } from "@/lib/oidc";
import { describeEnsure, ensurePageServices, servicectlEnabled } from "@/lib/servicectl";

export async function proxy(request: NextRequest) {
  // The console's own JSON routes answer 401 themselves; proxy only keeps their
  // envelope current and never redirects them.
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const rawSession = request.cookies.get(SESSION_COOKIE)?.value;
  const session = decodeSession(rawSession);

  if (!session) {
    if (isApi) return NextResponse.next();
    return toLogin(request, rawSession !== undefined);
  }

  // The envelope lives five minutes and the cookie eight hours. Renew it here,
  // before any Server Component or Server Action reads the cookie, so nothing
  // downstream is handed one that has lapsed. See lib/oidc.ts.
  const state = await envelopeState(session);

  if (state.kind === "ended") {
    if (isApi) {
      request.cookies.delete(SESSION_COOKIE);
      const response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
      response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
      return response;
    }
    return toLogin(request, true, "expired");
  }

  let response: NextResponse;
  if (state.kind === "renewed") {
    // Rewrite the request's Cookie header so this very render reads the new
    // envelope, and set it on the response so the browser keeps it.
    request.cookies.set(SESSION_COOKIE, state.cookie);
    response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
    response.cookies.set(SESSION_COOKIE, state.cookie, sessionCookieOptions(state.maxAge));
  } else {
    response = NextResponse.next();
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
  if (!isApi && servicectlEnabled && isDocumentNavigation(request)) {
    const result = await ensurePageServices(request.nextUrl.pathname);
    const line = describeEnsure(request.nextUrl.pathname, result);
    if (line) console.log(line);
  }

  return response;
}

type EnvelopeState =
  | { kind: "current" }
  | { kind: "renewed"; cookie: string; maxAge: number }
  | { kind: "ended" };

async function envelopeState(session: SessionPayload): Promise<EnvelopeState> {
  if (!envelopeNeedsRenewal(session)) return { kind: "current" };

  if (session.refreshToken) {
    const outcome = await renewSession(session);
    if (outcome.ok) {
      return { kind: "renewed", cookie: outcome.cookie, maxAge: remainingSessionSeconds(outcome.session) };
    }
    if (outcome.reason === "ended") return { kind: "ended" };
    // identity-context-svc did not answer. Let the request through: its calls
    // fail visibly as an outage, rather than signing the reader out over one.
    return { kind: "current" };
  }

  // No refresh token (a password sign-in): the envelope cannot be renewed, so
  // once it lapses the session is over. Ending it here sends the reader to
  // sign in again, instead of every panel failing with "the service no longer
  // accepts this session".
  return envelopeExpired(session) ? { kind: "ended" } : { kind: "current" };
}

function toLogin(request: NextRequest, clearCookie: boolean, reason?: "expired"): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  if (reason) loginUrl.searchParams.set("reason", reason);

  let response: NextResponse;
  // When an unauthenticated Server Action is called, a standard HTTP 307 redirect
  // causes Next.js's client-side serverActionReducer to receive HTML instead of
  // flight data and throw "An unexpected response was received from the server."
  // Returning x-action-redirect allows Next.js to handle the redirect cleanly.
  if (request.headers.get("next-action")) {
    const redirectPath = `${loginUrl.pathname}${loginUrl.search};replace`;
    response = new NextResponse(null, { status: 200 });
    response.headers.set("x-action-redirect", redirectPath);
  } else {
    response = NextResponse.redirect(loginUrl);
  }

  // A cookie that no longer opens a session is dropped, or /login (which skips
  // to /admin for a signed-in reader) and this redirect would bounce forever.
  if (clearCookie) response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
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
  matcher: ["/admin/:path*", "/api/v1/:path*", "/api/backend/:path*"],
};
