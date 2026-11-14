import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

// Identity headers a caller may not set: they are always taken from the session.
const IDENTITY_HEADERS = ["x-tenant-id", "x-principal-id", "x-legal-entity-id"];

export async function POST(req: NextRequest) {
  // Signed-in callers only, and they act as themselves: the console used to forward
  // whatever identity the page sent, which let any caller act as any principal.
  const session = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) {
    return NextResponse.json({ ok: false, status: 401, error: "Sign in to use the service console." }, { status: 401 });
  }

  try {
    const payload = await req.json();
    const { port, path = "/", method = "GET", headers: rawHeaders = {}, body: rawBody } = payload;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((rawHeaders ?? {}) as Record<string, unknown>)) {
      if (!IDENTITY_HEADERS.includes(k.toLowerCase()) && typeof v === "string") headers[k] = v;
    }
    headers["X-Tenant-Id"] = session.tenantId;
    headers["X-Principal-Id"] = session.principalId;
    if (session.legalEntityId) headers["X-Legal-Entity-Id"] = session.legalEntityId;

    // Tenant and legal entity in a body are the session's, never the page's.
    let body = rawBody;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const b = { ...(body as Record<string, unknown>) };
      if ("tenant_id" in b) b.tenant_id = session.tenantId;
      if ("legal_entity_id" in b) b.legal_entity_id = session.legalEntityId ?? null;
      body = b;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1000 || portNum > 65535) {
      return NextResponse.json({ ok: false, error: "Invalid port" }, { status: 400 });
    }

    const start = Date.now();
    let targetUrl = `http://127.0.0.1:${portNum}${path.startsWith("/") ? path : `/${path}`}`;

    const verb = method.toUpperCase();

    // If GET and body contains params, serialize to query string
    if (verb === "GET" && body) {
      let paramsObj: Record<string, unknown> | null = null;
      if (typeof body === "object") {
        paramsObj = body as Record<string, unknown>;
      } else if (typeof body === "string" && body.trim()) {
        try {
          paramsObj = JSON.parse(body);
        } catch {
          paramsObj = null;
        }
      }

      if (paramsObj && Object.keys(paramsObj).length > 0) {
        const qParams = new URLSearchParams();
        for (const [k, v] of Object.entries(paramsObj)) {
          if (v !== undefined && v !== null) {
            qParams.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
          }
        }
        const qs = qParams.toString();
        if (qs) {
          targetUrl += (targetUrl.includes("?") ? "&" : "?") + qs;
        }
      }
    }

    const fetchOptions: RequestInit = {
      method: verb,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...headers,
      },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    };

    if (verb !== "GET" && body !== undefined && body !== null) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const res = await fetch(targetUrl, fetchOptions);
    const ms = Date.now() - start;
    const serviceName = res.headers.get("x-service") || `service-${portNum}`;

    let data: unknown = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      data = await res.text();
    }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      ms,
      serviceName,
      port: portNum,
      targetUrl,
      data,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      status: 0,
      ms: 0,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
