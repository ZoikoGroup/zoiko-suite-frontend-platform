import { NextRequest, NextResponse } from "next/server";
import { serviceUrl, type ServiceName } from "@/lib/api/config";

const SERVICE_MAP: Record<string, ServiceName | "gateway"> = {
  ar: "accountsReceivable",
  audit: "auditEventStore",
  registry: "tenantRegistry",
  close: "financialClose",
  gateway: "gateway",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

async function handleProxy(request: NextRequest, pathSegments: string[]) {
  if (!pathSegments || pathSegments.length < 1) {
    return NextResponse.json({ error: "Missing service key" }, { status: 400 });
  }

  const [serviceKey, ...targetPath] = pathSegments;
  const service = SERVICE_MAP[serviceKey];

  if (!service) {
    return NextResponse.json(
      { error: `Unknown service key '${serviceKey}'. Valid keys: ${Object.keys(SERVICE_MAP).join(", ")}` },
      { status: 404 }
    );
  }

  const baseUrl = service === "gateway"
    ? (process.env.ZOIKO_GATEWAY_URL || "http://localhost:8000")
    : serviceUrl(service);

  if (!baseUrl) {
    return NextResponse.json(
      { error: `Unknown service key '${serviceKey}'. Valid keys: ${Object.keys(SERVICE_MAP).join(", ")}` },
      { status: 404 }
    );
  }

  const targetUrl = `${baseUrl.replace(/\/$/, "")}/${targetPath.join("/")}${request.nextUrl.search}`;
  const tenantID = request.headers.get("x-tenant-id") || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "tenant-zoiko-dev-01";

  try {
    const body = request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined;
    
    const backendRes = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        "X-Tenant-ID": tenantID,
        "X-Proxied-By": "NextJS-App-Router",
      },
      body,
      signal: AbortSignal.timeout(5000),
    });

    const responseData = await backendRes.text();
    return new NextResponse(responseData, {
      status: backendRes.status,
      headers: {
        "Content-Type": backendRes.headers.get("content-type") || "application/json",
        "X-Backend-Service": serviceKey,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Proxy request failed";
    return NextResponse.json(
      {
        error: `Failed to proxy to local backend service '${serviceKey}' at ${targetUrl}: ${message}`,
        serviceKey,
        targetUrl,
      },
      { status: 503 }
    );
  }
}
