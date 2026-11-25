// GET /admin/governance/evidence-bundle — the tenant's evidence bundle, as the
// service exported it (every decision with its canonical form, every sealed
// package, every replay, and the verification result), passed through byte
// for byte so it can be re-verified offline.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { exportEvidenceBundle } from "@/lib/api/governance";

export async function GET() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) {
    return NextResponse.json({ error: "sign in again" }, { status: 401 });
  }
  const result = await exportEvidenceBundle(toIdentity(session));
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status ?? 502 });
  }
  return new NextResponse(result.body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${result.filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
