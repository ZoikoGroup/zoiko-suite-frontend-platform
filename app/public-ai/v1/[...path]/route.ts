// Same-origin route for the ZoikoSuite Assistant: /public-ai/v1/* → public-ai-svc.
// Public and unauthenticated (proxy.ts guards only /admin); it reads no
// cookie or session and forwards none (see lib/api/public-ai-proxy.ts).

import { allowedPath, crossSite, forwardHeaders, responseHeaders, upstreamURL } from "@/lib/api/public-ai-proxy";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

async function pass(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const path = allowedPath((await ctx.params).path ?? []);
  if (!path) return problem(404, "Not found");
  if (crossSite(request.headers, request.url)) return problem(403, "Cross-site requests are not allowed");
  let body: string | undefined;
  if (request.method !== "GET") {
    body = await request.text();
    if (body.length > MAX_BODY_BYTES) return problem(413, "Request too large");
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
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
  } catch {
    return problem(503, "The assistant is unavailable");
  }
  return new Response(upstream.status === 204 || upstream.status === 304 ? null : await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders(upstream.headers, path),
  });
}

function problem(status: number, title: string): Response {
  return new Response(JSON.stringify({ type: "about:blank", title, status }), {
    status,
    headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
  });
}

export { pass as GET, pass as POST, pass as DELETE };
