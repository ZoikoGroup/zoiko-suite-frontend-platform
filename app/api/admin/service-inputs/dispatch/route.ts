import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { port, method = "POST", path, body, queryParams } = await req.json();

    if (!port || !path) {
      return NextResponse.json(
        { ok: false, status: 400, error: "Missing required parameters: port and path" },
        { status: 400 }
      );
    }

    let targetUrl = `http://127.0.0.1:${port}${path}`;
    if (queryParams && typeof queryParams === "object") {
      const entries = Object.entries(queryParams).filter(
        ([, v]) => v !== undefined && v !== null && v !== ""
      );
      if (entries.length > 0) {
        const qs = new URLSearchParams(
          entries.map(([k, v]) => [k, String(v)])
        ).toString();
        targetUrl += (targetUrl.includes("?") ? "&" : "?") + qs;
      }
    }

    const t0 = Date.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
      "X-Principal-Id": "33333333-3333-3333-3333-333333333333",
      "X-Legal-Entity-Id": "22222222-2222-2222-2222-222222222222",
    };

    let fetchRes: Response;
    try {
      fetchRes = await fetch(targetUrl, {
        method,
        headers,
        body: (method === "POST" || method === "PATCH" || method === "PUT") && body
          ? JSON.stringify(body)
          : undefined,
        signal: AbortSignal.timeout(6000),
      });
    } catch (fetchErr: unknown) {
      const err = fetchErr as Error;
      return NextResponse.json({
        ok: false,
        status: 0,
        ms: Date.now() - t0,
        data: null,
        error: `Could not reach service at http://localhost:${port}${path} (${err.message || "Connection refused / port closed"})`,
      });
    }

    const ms = Date.now() - t0;
    let responseData: unknown = null;
    const text = await fetchRes.text();
    try {
      responseData = text ? JSON.parse(text) : null;
    } catch {
      responseData = text;
    }

    return NextResponse.json({
      ok: fetchRes.ok,
      status: fetchRes.status,
      ms,
      data: responseData,
      error: !fetchRes.ok ? (typeof responseData === "object" && responseData !== null && "error" in responseData ? String((responseData as Record<string, unknown>).error) : `HTTP ${fetchRes.status}`) : undefined,
    });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json(
      { ok: false, status: 500, error: e.message || "Internal dispatch error" },
      { status: 500 }
    );
  }
}
