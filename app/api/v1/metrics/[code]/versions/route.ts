// GET /api/v1/metrics/[code]/versions
//
// Thin proxy from the browser to metric-registry-svc. The backend ships no
// CORS middleware, so the browser cannot reach it directly. This route handler
// runs server-side, reads the session cookie, forwards the call with the
// required ZS-ARCH-SVC-001 envelope headers, and streams the result back.
//
// Called by MetricCatalogPanel ("use client") when the user clicks History.

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listMetricVersions } from "@/lib/api/metric-registry";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;

  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listMetricVersions(code, identity);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status ?? 500 },
    );
  }

  return NextResponse.json(result.data);
}
