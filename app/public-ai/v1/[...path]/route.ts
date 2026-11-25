// Same-origin route for the ZoikoSuite Assistant: /public-ai/v1/* → public-ai-svc.
// Public and unauthenticated (proxy.ts guards only /admin); it reads no
// cookie or session and forwards none (see lib/api/public-ai-proxy.ts).

import { allowedPath, crossSite, forwardHeaders, responseHeaders, upstreamURL, writeAllowed } from "@/lib/api/public-ai-proxy";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

async function pass(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const path = allowedPath((await ctx.params).path ?? []);
  if (!path) return problem(404, "not_found", "Not found");
  if (crossSite(request.headers, request.url)) return problem(403, "origin_denied", "Cross-site requests are not allowed");
  if (!writeAllowed(request.method, request.headers, request.url)) return problem(403, "origin_denied", "Origin not allowed");
  let body: string | undefined;
  if (request.method !== "GET") {
    body = await request.text();
    // The limit is in bytes on the wire, not UTF-16 code units.
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return problem(413, "payload_too_large", "Payload too large");
  }
  let upstream: Response;
  try {
    upstream = await fetch(upstreamURL(path), {
      method: request.method,
      headers: forwardHeaders(request.headers),
      body: body || undefined,
      cache: "no-store",
      // The visitor's Stop aborts this request; the abort reaches the
      // service, which cancels the model call (Doc 05 §12).
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(4_000)]),
    });
  } catch (err) {
    // Method and route pattern only: the path can carry a session id.
    console.error(`[assistant proxy] ${request.method} ${routePattern(path)} failed`, err instanceof Error ? err.name : "error");
    return problem(503, "service_unavailable", "The assistant is unavailable");
  }
  return new Response(upstream.status === 204 || upstream.status === 304 ? null : await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders(upstream.headers, path),
  });
}

/** The allowlisted route with identifiers replaced, safe to log. */
function routePattern(path: string): string {
  return path.replace(/^sessions\/[^/]+$/, "sessions/{session_id}").replace(/^turns\/[^/]+\/feedback$/, "turns/{turn_id}/feedback");
}

/** RFC 9457 problem in the service's Doc 05 §13 shape. */
function problem(status: number, code: string, title: string): Response {
  const requestId = crypto.randomUUID();
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title,
      status,
      instance: `/public-ai/errors/${requestId}`,
      code: `publicai.${code}`,
      request_id: requestId,
      retryable: status === 503,
    }),
    {
      status,
      headers: { "content-type": "application/problem+json", "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}

export { pass as GET, pass as POST, pass as DELETE };
