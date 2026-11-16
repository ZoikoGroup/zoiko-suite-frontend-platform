import { NextRequest, NextResponse } from "next/server";
import { dispatchIdentity, dispatchPort } from "@/lib/dev-dispatch";

export async function GET(req: NextRequest) {
  const identity = dispatchIdentity(req);
  if (identity instanceof NextResponse) return identity;
  const searchParams = req.nextUrl.searchParams;
  const port = searchParams.get("port");

  if (!port) {
    return NextResponse.json({ ok: false, error: "Missing port parameter" }, { status: 400 });
  }

  const portNum = dispatchPort(port);
  if (portNum instanceof NextResponse) return portNum;

  const start = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${portNum}/readyz`, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    const ms = Date.now() - start;
    const serviceName = res.headers.get("x-service") || `service-${portNum}`;
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      ms,
      serviceName,
      port: portNum,
      data,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      status: 0,
      ms: Date.now() - start,
      port: portNum,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
